"""Hook Generation — Generate short attention-grabbing intro scripts for each clip.

Improvements over v1:
  - LLM prompt includes retention_score, visual_score, audio_score context
  - Explicit negative examples in system prompt (no more "Ready?", "What's going on y'all?")
  - Classifies hook type: Curiosity Gap / Before-After / Emotional Moment / Controversial Take / Concrete Result
  - Heuristic fallback is smarter: extracts the strongest sentence, not just the first one
"""

import re
from typing import Any

from config import LLAMA_MODEL_PATH, LLAMA_CONTEXT_SIZE
from routers.ws import manager

# Reuse Llama instance from analyzer (set by analyzer.py)
_llm_instance = None

HOOK_SYSTEM_PROMPT = """You are a short-form video content expert who writes viral openers for TikTok and Instagram Reels.

Write a 1-2 sentence hook that makes someone STOP scrolling and watch this clip.

Good hooks:
- Reference the ACTUAL content (not generic teasers)
- Create genuine curiosity or emotional pull
- Use natural, human speech — not AI jargon
- Are specific: include numbers, names, places, or outcomes when available

Hook types you can use:
1. Curiosity Gap: "I had no idea this would happen when we..."
2. Controversial Take: "Everyone told me not to do this, but..."
3. Emotional Moment: "This was the moment everything changed."
4. Concrete Result: "We saved $X / cut time by X% / went from X to Y"
5. Pattern Interrupt: "Stop. Watch this before you make the same mistake."

BAD hooks (never write these):
- "Ready?" / "Are you ready?"
- "What's going on everyone?" / "Hey guys!"
- Generic: "You won't believe what happened!" without any specifics
- Meaningless questions: "How do we feel about this?"
- Filler openers: "So..." / "Um..." / "Okay so..."

Respond with ONLY the hook text, nothing else. No quotes. No labels."""


def _build_hook_user_prompt(seg: dict) -> str:
    """Build a rich user prompt including multimodal scores alongside transcript."""
    transcript = seg.get("transcript_text", "").strip()
    retention = seg.get("retention_score", "")
    visual = seg.get("visual_score", "")
    audio = seg.get("audio_score", "")
    hook_s = seg.get("hook_score", "")
    rationale = seg.get("rationale", "")
    visual_proof = seg.get("visual_hook_rationale", "")

    context_lines = [f'Transcript: "{transcript}"']
    if retention:
        context_lines.append(f"Retention signal: {retention}/100")
    if hook_s:
        context_lines.append(f"First-3-second interrupt: {hook_s}/100")
    if visual:
        context_lines.append(f"Visual dynamism: {visual}%")
    if audio:
        context_lines.append(f"Audio energy: {audio}%")
    if rationale:
        context_lines.append(f"Why this segment was picked: {rationale}")
    if visual_proof:
        context_lines.append(f"Visual proof: {visual_proof}")

    return "\n".join(context_lines) + "\n\nWrite a viral hook for this clip:"


async def generate_hooks(
    segments: list[dict[str, Any]],
    job_id: str,
) -> list[dict[str, Any]]:
    """Generate a hook intro script for each segment using Llama 3.2 1B."""
    global _llm_instance

    await manager.send_progress(job_id, "generating_hooks", 0, "Generating hooks...")

    if _llm_instance is None and LLAMA_MODEL_PATH.exists():
        try:
            from llama_cpp import Llama
            _llm_instance = Llama(
                model_path=str(LLAMA_MODEL_PATH),
                n_ctx=LLAMA_CONTEXT_SIZE,
                n_threads=4,
                verbose=False,
            )
        except Exception as e:
            print(f"[Hook] Llama load failed ({e}), falling back to heuristic hooks")
            _llm_instance = None

    total = len(segments)
    for i, seg in enumerate(segments):
        progress = int((i / total) * 100) if total > 0 else 100
        await manager.send_progress(
            job_id, "generating_hooks", progress,
            f"Generating hook {i+1}/{total}...",
        )

        transcript_text = seg.get("transcript_text", "")
        if not transcript_text:
            seg["hook_text"] = _heuristic_hook(seg)
            continue

        if _llm_instance is not None:
            try:
                user_prompt = _build_hook_user_prompt(seg)
                response = _llm_instance.create_chat_completion(
                    messages=[
                        {"role": "system", "content": HOOK_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.72,
                    max_tokens=120,
                    top_p=0.9,
                )
                hook_text = response["choices"][0]["message"]["content"].strip().strip('"\'')
                # Reject known bad outputs and fall back
                if _is_bad_hook(hook_text):
                    hook_text = _heuristic_hook(seg)
                seg["hook_text"] = hook_text
            except Exception as e:
                print(f"[Hook] LLM failed for segment {i+1}: {e}")
                seg["hook_text"] = _heuristic_hook(seg)
        else:
            seg["hook_text"] = _heuristic_hook(seg)

    _llm_instance = None
    await manager.send_progress(job_id, "generating_hooks", 100, "Hooks generated")
    return segments


# ---------------------------------------------------------------------------
# Quality gate for LLM output
# ---------------------------------------------------------------------------

BAD_HOOK_PATTERNS = [
    r"^(ready|are you ready|y.all ready)[?!.]?$",
    r"^(hey|hi|hello|what.s (up|going on)|how (are|is|we))",
    r"^(so[,.]?\s|um[,.]?\s|uh[,.]?\s|okay[,.]?\s|alright[,.]?\s)",
    r"^(welcome back|good (morning|evening|afternoon))",
    r"^(like and subscribe|don.t forget to|smash that)",
    r"^you won.t believe (this|what)!?$",   # generic without specifics
    r"^(watch|see) (this|what happens)!?$",
    r"^(we.re|we are) the best[?!.]?$",
    r"^(any(one)? (will|would) have|got the preview)[?!.]?",
    r"^(check this out|look at this)[?!.]?$",
    r"^how (we|do we|you) feel about[?!.]?",
    r"^(can you believe|do you know)( (this|it))?[?!.]?$",
]


def _is_bad_hook(text: str) -> bool:
    low = text.lower().strip()
    if len(low) < 8:
        return True
    for pattern in BAD_HOOK_PATTERNS:
        if re.search(pattern, low, re.IGNORECASE):
            return True
    return False


# ---------------------------------------------------------------------------
# Heuristic hook generator (no LLM required)
# ---------------------------------------------------------------------------

# Sentence-level ranking signals
_HIGH_VALUE_SIGNALS = [
    "never", "always", "stop", "wait", "mistake", "truth", "secret",
    "wrong", "actually", "turns out", "almost", "nearly", "saved",
    "changed", "destroyed", "failed", "broke", "best", "worst",
    "million", "billion", "thousand", "dollar", "$", "%", "percent",
    "can't believe", "you won't", "unbelievable", "insane", "unreal",
    "incredible", "life-changing", "mind-blowing", "blew my",
    "i had no idea", "nobody told", "no one told",
]

_FILLER_STARTERS = {
    "so", "um", "uh", "well", "okay", "alright", "hey", "hi", "hello",
    "ready", "what's up", "what's going on", "how are you", "how's it going",
    "good morning", "good evening", "good afternoon", "welcome back",
    "today", "in this video", "in today's video", "coming up",
}


def _sentence_signal_score(s: str) -> float:
    """Score a single sentence for hook potential."""
    low = s.lower()
    score = 0.0

    # Check filler opener → hard penalty
    first_word = low.split()[0].rstrip(".,!?") if low.split() else ""
    if first_word in _FILLER_STARTERS:
        score -= 20.0
    # Filler multi-word
    for fs in _FILLER_STARTERS:
        if " " in fs and low.startswith(fs):
            score -= 20.0
            break

    for sig in _HIGH_VALUE_SIGNALS:
        if sig in low:
            score += 3.0

    if "?" in s:
        score += 2.0
    if "!" in s:
        score += 1.5
    if re.search(r"\$[\d,]+|\d+[\.,]?\d*\s*(million|billion|thousand|percent|%)", low):
        score += 5.0

    # Prefer medium-length sentences (8-25 words)
    wc = len(s.split())
    if wc < 5:
        score -= 5.0
    elif 8 <= wc <= 25:
        score += 2.0

    return score


def _heuristic_hook(seg: dict) -> str:
    """Generate a punchy hook from the best sentence in the transcript.

    Strategy:
    1. Split transcript into sentences
    2. Score each for hook potential
    3. Pick the highest-scoring sentence that is not a filler opener
    4. Clean it up and return
    """
    text = seg.get("transcript_text", "").strip()
    if not text:
        return "This moment will catch you off guard."

    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    if not sentences:
        sentences = [text]

    # Score all sentences
    scored = [(s, _sentence_signal_score(s)) for s in sentences]
    scored.sort(key=lambda x: x[1], reverse=True)

    # Pick best non-empty sentence
    target = ""
    for s, score in scored:
        if len(s.split()) >= 5 and score >= -5.0:
            target = s
            break

    if not target:
        # Absolute fallback: pick the longest sentence
        target = max(sentences, key=lambda s: len(s.split()))

    # Strip common filler prefixes
    filler_rx = [
        r'^(oh my god|oh my gosh|omg|holy cow|wow)[,!.]?\s*',
        r'^(guys|hey guys|y\'all|everyone)[,!.]?\s*(so|and|but)?\s*',
        r'^(so|well|and so|and|now|you know|actually|like|i mean|in fact|but|um|uh|okay|alright)[,.]?\s+',
        r'^(let me (say|tell you|show you|explain|start by saying))\s+',
        r'^(as you can see|as i mentioned|like i said)\s*,?\s*',
    ]
    for _ in range(2):  # Run twice to handle stacked prefixes like "Oh my god. Guys, so..."
        for rx in filler_rx:
            target = re.sub(rx, '', target, flags=re.IGNORECASE).strip()

    if not target:
        target = sentences[0]

    # Capitalise first letter
    if target:
        target = target[0].upper() + target[1:]

    # Ensure terminal punctuation
    if not re.search(r'[.!?]$', target):
        target += "." if not any(sig in target.lower() for sig in ["?", "!"]) else ""

    # Trim to 25 words max (hooks must be punchy)
    words = target.split()
    if len(words) > 25:
        # Find a natural clause break
        clauses = re.split(r'[,;:—]+', target)
        first_clause = clauses[0].strip()
        if 8 <= len(first_clause.split()) <= 25:
            target = first_clause
            if not re.search(r'[.!?]$', target):
                target += "."
        else:
            target = " ".join(words[:20]).rstrip(",.;:-") + "."

    return target
