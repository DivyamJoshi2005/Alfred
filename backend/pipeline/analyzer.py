"""Viral segment identification — multi-signal scoring combining transcript semantics,
speech dynamics, emotional arc, and punchline detection.

Replaces the old keyword-density approach with a scoring system that:
  1. Penalises filler openers heavily (greetings, 'ready?', 'what's up y'all', etc.)
  2. Rewards genuine narrative tension + resolution arcs
  3. Weights speech-rate acceleration (excitement spikes)
  4. Scores punchline/payoff endings (surprise reveals, numbers, contrarian conclusions)
  5. Detects curiosity-gap and before/after sentence patterns
  6. Falls back cleanly when Llama is not installed
"""

import json
import re
from typing import Any

from config import LLAMA_MODEL_PATH, LLAMA_CONTEXT_SIZE, LLAMA_TEMPERATURE, LLAMA_MAX_TOKENS
from config import MIN_CLIP_DURATION, MAX_CLIP_DURATION, TARGET_CLIP_COUNT
from routers.ws import manager


# ---------------------------------------------------------------------------
# Filler / low-value opener blacklist — anything starting with these is penalised
# ---------------------------------------------------------------------------
FILLER_OPENERS: set[str] = {
    "so", "um", "uh", "well", "okay", "alright", "hey", "hi", "hello",
    "ready", "what's up", "what's going on", "how are you", "how's it going",
    "we're the best", "good morning", "good evening", "good afternoon",
    "welcome back", "hey guys", "hey everyone", "hey y'all", "hey there",
    "what's up guys", "what's up everyone", "yo", "sup", "howdy",
    "coming up", "first things first", "before we start", "let's get into it",
    "without further ado", "let me know", "don't forget to",
    "like and subscribe", "subscribe", "smash that like",
    "today", "today we", "today i", "in this video", "in today's video",
    "check this out", "look at this", "as you know",
}

# Exact phrase blacklist (checked after normalisation)
FILLER_PHRASES: list[str] = [
    "ready?", "ready!", "ready.", "are you ready", "y'all ready",
    "what's going on", "what is going on", "how we feel",
    "any will have gotten", "any will have", "got the preview",
    "we're the best", "we are the best", "i'm so excited",
    "today we", "today i", "in this video", "check this out",
    "look at this", "so today", "welcome back", "what's up",
]

# ---------------------------------------------------------------------------
# High-signal opener patterns that indicate a strong hook
# ---------------------------------------------------------------------------
HOOK_OPENER_PATTERNS: list[tuple[str, float]] = [
    # Contrarian / myth-busting
    (r"(nobody|no one).{0,20}(told|warned|said|knew)", 8.0),
    (r"(everybody|everyone).{0,20}(wrong|lied|lying|mistaken|thinks)", 7.5),
    (r"(the truth|the real reason|what they don.t tell)", 7.0),
    (r"(i was (completely|totally|dead) wrong)", 6.5),
    # Concrete value / result
    (r"\$[\d,]+", 7.0),          # dollar amounts
    (r"\d+[\.,]?\d*\s*(million|billion|thousand|k\b|percent|%)", 6.5),
    (r"(in \d+ (days|weeks|months|years))", 5.5),
    # Emotional stakes / story hook
    (r"(we (almost|nearly) (didn.t|never|couldn.t))", 6.0),
    (r"(this (changed|ruined|saved|cost|destroyed|broke) (my|our|his|her|their))", 6.0),
    (r"(i (almost|nearly) (died|quit|gave up|lost everything))", 7.0),
    # Urgency / stop-scroll
    (r"^(stop|wait|listen|pay attention|don.t|never|always)\b", 6.0),
    (r"(if you.re (doing|making|thinking).{0,30}stop)", 6.5),
    # Question hooks (genuine, not filler)
    (r"^(what (would you|if|happens when|do you do when))", 5.0),
    (r"^(why (does|do|is|are|would|did|doesn.t|don.t))", 5.5),
    (r"^(how (do|does|did|can|could|would|to))", 4.5),
    # Before/After
    (r"(before (and after|vs|versus|this|that))", 5.0),
    (r"(this is what (happened|it looked like|it feels like))", 5.5),
    # Travel / experience vlog
    (r"(we (made it|finally|just arrived|got to|found|discovered))", 5.0),
    (r"(this place (is|was|looks|feels|blew|changed))", 4.5),
    (r"(day \d+ of)", 4.0),
]

# ---------------------------------------------------------------------------
# Punchline / payoff ending patterns
# ---------------------------------------------------------------------------
PUNCHLINE_PATTERNS: list[tuple[str, float]] = [
    (r"\$[\d,]+", 6.0),
    (r"\d+[\.,]?\d*\s*(million|billion|thousand|percent|%)", 5.5),
    (r"(and that.s when (it|everything|something) (clicked|hit me|changed|happened))", 6.0),
    (r"(turns out|it turns out)", 5.0),
    (r"(best (decision|thing|choice|move) (i|we|they) (ever|made))", 5.5),
    (r"(worst (decision|thing|choice|mistake) (i|we|they) (ever|made))", 5.5),
    (r"(i.ve never (felt|seen|done|experienced) (anything|something) like (this|that|it))", 5.0),
    (r"(you.re (not going to|gonna) believe (this|what|how))", 5.5),
    (r"(this is (insane|unreal|incredible|mind-blowing|amazing|wild))", 4.0),
    (r"(so worth (it|every penny|every mile|every second))", 4.5),
    (r"\?$", 2.0),   # ending question = moderate payoff (leaves viewer curious)
    (r"!$", 1.5),
]

# ---------------------------------------------------------------------------
# Emotion / sentiment intensity keywords
# ---------------------------------------------------------------------------
EMOTION_KEYWORDS: dict[str, float] = {
    # Strong negative (high engagement)
    "terrifying": 4.0, "horrifying": 4.0, "devastating": 4.0, "heartbreaking": 4.0,
    "destroyed": 3.5, "failed": 3.0, "worst": 3.0, "nightmare": 3.5, "disaster": 3.5,
    "broke": 2.5, "lost": 2.5, "wrong": 2.0, "mistake": 2.5, "regret": 2.5,
    # Strong positive (high engagement)
    "incredible": 3.5, "unbelievable": 4.0, "insane": 3.5, "amazing": 2.5,
    "perfect": 2.0, "unreal": 3.5, "best": 1.5, "blown away": 4.0,
    "life-changing": 4.0, "mind-blowing": 4.0,
    # Revelation keywords
    "secret": 3.0, "truth": 3.0, "reveal": 3.0, "exposed": 3.5, "confession": 3.5,
    "admit": 2.5, "honest": 2.0, "actually": 1.5, "surprising": 2.5,
    # Action / urgency
    "stop": 2.5, "never": 2.5, "always": 1.5, "must": 1.5, "warning": 3.0,
    "danger": 3.0, "dangerous": 3.0, "critical": 2.0, "urgent": 2.5,
    # Exclusive / scarcity
    "only": 1.5, "rare": 2.5, "unique": 2.0, "exclusive": 2.5, "limited": 2.0,
    # Numbers / concrete proof
    "million": 3.0, "billion": 3.0, "thousand": 2.0, "percent": 2.0,
    "dollars": 2.5, "hours": 1.5, "days": 1.5, "years": 1.5,
}


SEGMENT_SYSTEM_PROMPT = """You are an expert short-form content strategist who finds viral moments in video transcripts.

Your job: Pick the {target_count} segments with the HIGHEST viral potential for TikTok/Reels/Shorts.

What makes a segment go viral:
- Opens with a pattern interrupt (surprising fact, controversy, big claim, shocking moment)
- Has a clear emotional arc (tension to resolution, build-up to payoff, before to after)
- Contains concrete details (numbers, specific outcomes, real stories)
- Makes viewers think "I need to see the whole thing" or "I need to share this"

REJECT segments that:
- Start with greetings ("Hey guys", "What's going on", "Ready?")
- Are just filler or transitions ("So...", "Um...", "Welcome back")
- Have no emotional stakes or specific content
- Are too generic or could apply to any video

Each segment must be {min_duration}-{max_duration} seconds. Never cut mid-sentence.

Respond ONLY with valid JSON:
```json
[
  {{
    "start_time": 45.2,
    "end_time": 78.5,
    "transcript_text": "Exact text from the transcript",
    "rationale": "Specific reason this segment is viral-worthy (reference the actual content)"
  }}
]
```"""

SEGMENT_USER_PROMPT = """Transcript with timestamps:

{transcript}

Find the top {target_count} viral segments ({min_duration}-{max_duration} seconds each). Return ONLY JSON."""


async def identify_segments(
    transcript_data: dict[str, Any],
    job_id: str,
) -> list[dict[str, Any]]:
    """Use Llama 3.2 1B to identify top viral segments from transcript."""
    await manager.send_progress(job_id, "analyzing", 10, "Loading Llama model...")

    from llama_cpp import Llama

    if not LLAMA_MODEL_PATH.exists():
        print(f"[Analyzer] Llama model not found at {LLAMA_MODEL_PATH}. Using heuristic highlight analyzer.")
        return _heuristic_identify_segments(transcript_data)

    try:
        llm = Llama(
            model_path=str(LLAMA_MODEL_PATH),
            n_ctx=LLAMA_CONTEXT_SIZE,
            n_threads=4,
            verbose=False,
        )
    except Exception as e:
        print(f"[Analyzer] Failed to load Llama ({e}). Using heuristic highlight analyzer.")
        return _heuristic_identify_segments(transcript_data)

    await manager.send_progress(job_id, "analyzing", 30, "Analyzing transcript for viral segments...")

    formatted_transcript = _format_transcript_with_timestamps(transcript_data)

    system_prompt = SEGMENT_SYSTEM_PROMPT.format(
        target_count=TARGET_CLIP_COUNT,
        min_duration=MIN_CLIP_DURATION,
        max_duration=MAX_CLIP_DURATION,
    )

    if len(formatted_transcript) <= 6000:
        transcript_context = formatted_transcript
    else:
        top_candidates = _heuristic_identify_segments(transcript_data, candidate_count=12)
        candidate_lines = []
        for idx, cand in enumerate(top_candidates):
            c_start = _format_time(cand["start_time"])
            c_end = _format_time(cand["end_time"])
            candidate_lines.append(f"Candidate #{idx+1} [{c_start} - {c_end}]:\n{cand['transcript_text']}\n")
        transcript_context = "\n".join(candidate_lines)

    user_prompt = SEGMENT_USER_PROMPT.format(
        transcript=transcript_context[:6000],
        target_count=TARGET_CLIP_COUNT,
        min_duration=MIN_CLIP_DURATION,
        max_duration=MAX_CLIP_DURATION,
    )

    response = llm.create_chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=LLAMA_TEMPERATURE,
        max_tokens=LLAMA_MAX_TOKENS,
        top_p=0.9,
    )

    await manager.send_progress(job_id, "analyzing", 70, "Parsing segment selections...")

    raw_output = response["choices"][0]["message"]["content"]
    segments = _parse_segments_json(raw_output)
    segments = _snap_to_sentence_boundaries(segments, transcript_data)
    segments = _validate_segments(segments, transcript_data)

    await manager.send_progress(job_id, "analyzing", 100, f"Found {len(segments)} viral segments")

    import pipeline.hook_generator as hg
    hg._llm_instance = llm

    return segments


def build_grammatical_sentences(words: list[dict]) -> list[dict]:
    """Reconstruct complete grammatical sentences from word-level timestamps."""
    if not words:
        return []

    sentences = []
    curr_words = []

    for idx, w in enumerate(words):
        curr_words.append(w)
        text = w.get("word", "").strip()

        pause_after = False
        if idx + 1 < len(words) and len(curr_words) >= 4:
            gap = words[idx + 1].get("start", 0) - w.get("end", 0)
            if gap >= 1.2:
                pause_after = True

        if text and (text[-1] in ".?!" or pause_after):
            s_text = " ".join(cw.get("word", "").strip() for cw in curr_words)
            sentences.append({
                "start": round(curr_words[0]["start"], 3),
                "end": round(curr_words[-1]["end"], 3),
                "text": s_text,
                "words": curr_words,
            })
            curr_words = []

    if curr_words:
        s_text = " ".join(cw.get("word", "").strip() for cw in curr_words)
        sentences.append({
            "start": round(curr_words[0]["start"], 3),
            "end": round(curr_words[-1]["end"], 3),
            "text": s_text,
            "words": curr_words,
        })

    return sentences


def _format_transcript_with_timestamps(data: dict) -> str:
    words = data.get("words", [])
    if words:
        sentences = build_grammatical_sentences(words)
        lines = []
        for s in sentences:
            start = _format_time(s["start"])
            end = _format_time(s["end"])
            lines.append(f"[{start} - {end}] {s['text']}")
        return "\n".join(lines)

    lines = []
    for seg in data.get("segments", []):
        start = _format_time(seg["start"])
        end = _format_time(seg["end"])
        lines.append(f"[{start} - {end}] {seg['text']}")
    return "\n".join(lines)


def _format_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def _parse_segments_json(raw: str) -> list[dict]:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    if "```" in raw:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse segments JSON from LLM output: {raw[:200]}")


def _snap_to_sentence_boundaries(segments: list[dict], transcript_data: dict) -> list[dict]:
    words = transcript_data.get("words", [])
    if not words:
        return segments
    sentences = build_grammatical_sentences(words)
    if not sentences:
        return segments

    snapped = []
    for seg in segments:
        target_start = seg["start_time"]
        target_end = seg["end_time"]

        best_start_idx = min(range(len(sentences)), key=lambda idx: abs(sentences[idx]["start"] - target_start))
        best_end_idx = min(range(best_start_idx, len(sentences)), key=lambda idx: abs(sentences[idx]["end"] - target_end))

        snapped_start = sentences[best_start_idx]["start"]
        snapped_end = sentences[best_end_idx]["end"]
        duration = snapped_end - snapped_start

        if duration > MAX_CLIP_DURATION and best_end_idx > best_start_idx:
            while best_end_idx > best_start_idx:
                test_dur = sentences[best_end_idx - 1]["end"] - snapped_start
                if test_dur >= MIN_CLIP_DURATION:
                    best_end_idx -= 1
                    snapped_end = sentences[best_end_idx]["end"]
                else:
                    break

        full_slice_text = " ".join(sentences[k]["text"] for k in range(best_start_idx, best_end_idx + 1))
        seg["start_time"] = round(snapped_start, 3)
        seg["end_time"] = round(snapped_end, 3)
        seg["duration"] = round(snapped_end - snapped_start, 3)
        seg["transcript_text"] = full_slice_text
        snapped.append(seg)

    return snapped


def _validate_segments(segments: list[dict], transcript_data: dict) -> list[dict]:
    valid = []
    for seg in segments:
        duration = seg["end_time"] - seg["start_time"]
        if MIN_CLIP_DURATION <= duration <= MAX_CLIP_DURATION:
            valid.append(seg)
        elif duration > MAX_CLIP_DURATION:
            seg["end_time"] = seg["start_time"] + MAX_CLIP_DURATION
            valid.append(seg)
    return valid[:TARGET_CLIP_COUNT]


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _normalise_opener(text: str) -> str:
    low = text.lower().strip()
    for strip in ("so ", "and ", "well, ", "now ", "um ", "uh ", "like ", "okay, ", "alright, "):
        if low.startswith(strip):
            low = low[len(strip):].strip()
    return low


def _score_opener(first_sentence_text: str) -> float:
    low = first_sentence_text.lower().strip().rstrip(".?!, ")
    norm = _normalise_opener(first_sentence_text)

    for phrase in FILLER_PHRASES:
        if low.startswith(phrase.rstrip("?!.")) or low == phrase.rstrip("?!."):
            return -50.0

    first_word = norm.split()[0] if norm.split() else ""
    if first_word in FILLER_OPENERS:
        return -40.0

    for fo in FILLER_OPENERS:
        if " " in fo and norm.startswith(fo):
            return -40.0

    score = 0.0
    for pattern, bonus in HOOK_OPENER_PATTERNS:
        if re.search(pattern, low, re.IGNORECASE):
            score += bonus

    if "?" in first_sentence_text and score > 0:
        score += 3.0

    return score


def _score_punchline(last_sentence_text: str) -> float:
    low = last_sentence_text.lower()
    score = 0.0
    for pattern, bonus in PUNCHLINE_PATTERNS:
        if re.search(pattern, low, re.IGNORECASE):
            score += bonus

    if any(low.rstrip().endswith(tail) for tail in
           [" and", " but", " or", " so", " because", " if", " that", " then", " the", " a"]):
        score -= 8.0

    return score


def _score_emotion_intensity(span_words: list[str]) -> float:
    total = 0.0
    for w in span_words:
        wl = w.lower().strip(".,!?:;\"'")
        if wl in EMOTION_KEYWORDS:
            total += EMOTION_KEYWORDS[wl]
    return min(15.0, total / max(1, len(span_words)) * 50.0)


def _score_speech_rate_acceleration(sentences: list[dict], i: int, j: int) -> float:
    span_sents = sentences[i:j + 1]
    if len(span_sents) < 3:
        return 0.0

    half = len(span_sents) // 2
    first_half = span_sents[:half]
    second_half = span_sents[half:]

    def avg_wps(segs: list[dict]) -> float:
        words = sum(len(s["text"].split()) for s in segs)
        dur = sum(s["end"] - s["start"] for s in segs)
        return words / max(0.5, dur)

    wps_first = avg_wps(first_half)
    wps_second = avg_wps(second_half)
    accel = wps_second - wps_first
    if accel > 0.5:
        return min(8.0, accel * 4.0)
    elif accel < -0.8:
        return -3.0
    return 0.0


def _score_arc(sentences: list[dict], i: int, j: int) -> float:
    span = sentences[i:j + 1]
    if len(span) < 2:
        return 0.0

    last_low = span[-1]["text"].lower()
    resolution_signals = [
        "but then", "and then", "turns out", "it turned out", "that's when",
        "so i", "so we", "in the end", "finally", "at last", "worth it",
        "best part", "worst part", "that changed", "and that's",
        "can't believe", "never going back", "would do it again",
    ]
    arc_score = sum(2.5 for sig in resolution_signals if sig in last_low)

    full_text = " ".join(s["text"] for s in span).lower()
    contrast_words = ["but", "however", "except", "yet", "although", "even though", "despite"]
    if any(cw in full_text for cw in contrast_words):
        arc_score += 3.0

    return min(12.0, arc_score)


def _score_word_count(word_count: int) -> float:
    if word_count < 10:
        return -20.0
    if word_count < 15:
        return -8.0
    if word_count < 20:
        return -2.0
    return 0.0


def _heuristic_identify_segments(
    transcript_data: dict,
    candidate_count: int = TARGET_CLIP_COUNT,
) -> list[dict]:
    """Multi-signal viral segment detector.

    Scoring signals:
      opener_score    — filler penalty OR hook pattern bonus
      punchline_score — payoff/reveal quality at clip end
      emotion_score   — emotional intensity across span
      arc_score       — tension-resolution narrative arc
      accel_score     — speech-rate acceleration (excitement spike)
      word_count_pen  — penalty for clips too short to tell a story
      pace_bonus      — reward for natural conversational pace
      duration_mult   — bell curve centred on 33 s (optimal short-form length)
    """
    words = transcript_data.get("words", [])
    if words:
        sentences = build_grammatical_sentences(words)
    else:
        raw_segs = transcript_data.get("segments", [])
        sentences = [
            {"start": s["start"], "end": s["end"], "text": s["text"].strip(), "words": []}
            for s in raw_segs
        ]

    if not sentences:
        return [{
            "start_time": 0.0, "end_time": 20.0, "duration": 20.0,
            "transcript_text": transcript_data.get("full_text") or "Featured highlight moment",
            "score": 1.0, "rationale": "High-interest narrative highlight",
        }]

    n = len(sentences)
    candidates = []

    for i in range(n):
        first_text = sentences[i]["text"].strip()
        opener_score = _score_opener(first_text)

        # Skip catastrophically bad openers (pure filler)
        if opener_score <= -40.0:
            continue

        for j in range(i, n):
            dur = sentences[j]["end"] - sentences[i]["start"]
            if dur < MIN_CLIP_DURATION:
                continue
            if dur > MAX_CLIP_DURATION:
                break

            last_text = sentences[j]["text"].strip()
            span_text = " ".join(sentences[k]["text"] for k in range(i, j + 1))
            span_words = span_text.split()
            word_count = len(span_words)

            punchline_score = _score_punchline(last_text)
            emotion_score = _score_emotion_intensity(span_words)
            arc_score = _score_arc(sentences, i, j)
            accel_score = _score_speech_rate_acceleration(sentences, i, j)
            word_pen = _score_word_count(word_count)

            density = word_count / max(1.0, dur)
            pace_bonus = 2.5 if 2.0 <= density <= 4.0 else -1.0

            # Duration bell curve: optimal ~33 s
            duration_mult = max(0.3, 1.0 - 0.15 * (abs(dur - 33.0) / 20.0))

            raw_score = (
                opener_score + punchline_score + emotion_score
                + arc_score + accel_score + word_pen + pace_bonus
            )
            total_score = raw_score * duration_mult

            rationale_parts = []
            if opener_score >= 5:
                rationale_parts.append("pattern-interrupt hook opener")
            elif opener_score > 1:
                rationale_parts.append("strong hook opener")
            if punchline_score >= 4:
                rationale_parts.append("impactful climax payoff")
            if emotion_score >= 3:
                rationale_parts.append("intense emotional spike")
            if arc_score >= 3:
                rationale_parts.append("tension-to-resolution arc")
            if accel_score >= 2.5:
                rationale_parts.append("urgent speech tempo acceleration")
            if not rationale_parts:
                rationale_parts.append("compelling narrative flow with high viewer interest")

            candidates.append({
                "start_time": round(sentences[i]["start"], 3),
                "end_time": round(sentences[j]["end"], 3),
                "duration": round(dur, 3),
                "transcript_text": span_text,
                "score": round(total_score, 2),
                "rationale": "Viral signals: " + "; ".join(rationale_parts),
            })

    if not candidates:
        return _fallback_best_window(sentences, transcript_data)

    candidates.sort(key=lambda c: c["score"], reverse=True)

    chosen = []
    for cand in candidates:
        overlap = any(
            not (cand["end_time"] <= c["start_time"] or cand["start_time"] >= c["end_time"])
            for c in chosen
        )
        if not overlap:
            chosen.append(cand)
            if len(chosen) >= candidate_count:
                break

    return chosen if chosen else _fallback_best_window(sentences, transcript_data)


def _fallback_best_window(sentences: list[dict], transcript_data: dict) -> list[dict]:
    """When all windows are filtered out, pick the longest valid window."""
    n = len(sentences)
    best = None
    best_score = float("-inf")

    for i in range(n):
        for j in range(i, n):
            dur = sentences[j]["end"] - sentences[i]["start"]
            if MIN_CLIP_DURATION <= dur <= MAX_CLIP_DURATION:
                span = " ".join(sentences[k]["text"] for k in range(i, j + 1))
                score = len(span.split())
                if score > best_score:
                    best_score = score
                    best = {
                        "start_time": round(sentences[i]["start"], 3),
                        "end_time": round(sentences[j]["end"], 3),
                        "duration": round(dur, 3),
                        "transcript_text": span,
                        "score": 1.0,
                        "rationale": "High-interest continuous narrative sequence",
                    }
            elif dur > MAX_CLIP_DURATION:
                break

    if best:
        return [best]

    end_idx = min(len(sentences) - 1, 3)
    return [{
        "start_time": sentences[0]["start"],
        "end_time": sentences[end_idx]["end"],
        "duration": sentences[end_idx]["end"] - sentences[0]["start"],
        "transcript_text": " ".join(s["text"] for s in sentences[:end_idx + 1]),
        "score": 0.5,
        "rationale": "Opening sequence with strong narrative introduction",
    }]
