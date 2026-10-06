"""Llama 3.2 1B segment identification — find top viral moments in a transcript."""

import json
from typing import Any

from config import LLAMA_MODEL_PATH, LLAMA_CONTEXT_SIZE, LLAMA_TEMPERATURE, LLAMA_MAX_TOKENS
from config import MIN_CLIP_DURATION, MAX_CLIP_DURATION, TARGET_CLIP_COUNT
from routers.ws import manager


SEGMENT_SYSTEM_PROMPT = """You are an expert content strategist who identifies viral-worthy segments from video transcripts.

Your task: Analyze the transcript and identify the {target_count} most engaging, viral-worthy segments.

Rules:
1. Each segment must be between {min_duration} and {max_duration} seconds long.
2. Select complete thoughts — never cut mid-sentence.
3. Prioritize: surprising facts, emotional moments, controversial takes, actionable advice, or humorous bits.
4. Return segments ordered by viral potential (best first).

The transcript has word-level timestamps. Use them to set precise start/end times that align with sentence boundaries.

Respond ONLY with valid JSON in this exact format:
```json
[
  {{
    "start_time": 45.2,
    "end_time": 78.5,
    "transcript_text": "The exact text from the transcript for this segment...",
    "rationale": "Brief reason why this segment is viral-worthy"
  }}
]
```"""

SEGMENT_USER_PROMPT = """Here is the transcript with timestamps:

{transcript}

Identify the top {target_count} most viral segments (each {min_duration}-{max_duration} seconds). Return ONLY valid JSON array."""


async def identify_segments(
    transcript_data: dict[str, Any],
    job_id: str,
) -> list[dict[str, Any]]:
    """Use Llama 3.2 1B to identify top viral segments from transcript.

    Args:
        transcript_data: Dict with full_text, segments, words
        job_id: For progress reporting

    Returns:
        List of segment dicts with start_time, end_time, transcript_text, rationale
    """
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

    # Format transcript with timestamps for the LLM
    formatted_transcript = _format_transcript_with_timestamps(transcript_data)

    system_prompt = SEGMENT_SYSTEM_PROMPT.format(
        target_count=TARGET_CLIP_COUNT,
        min_duration=MIN_CLIP_DURATION,
        max_duration=MAX_CLIP_DURATION,
    )

    user_prompt = SEGMENT_USER_PROMPT.format(
        transcript=formatted_transcript[:6000],  # Truncate to fit context
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

    # Snap segment boundaries to word timestamps
    segments = _snap_to_word_boundaries(segments, transcript_data["words"])

    # Validate and filter segments
    segments = _validate_segments(segments, transcript_data)

    await manager.send_progress(job_id, "analyzing", 100, f"Found {len(segments)} viral segments")

    # Keep model in memory for hook generation (will be used in next stage)
    # Store reference for hook_generator to reuse
    import pipeline.hook_generator as hg
    hg._llm_instance = llm

    return segments


def _format_transcript_with_timestamps(data: dict) -> str:
    """Format transcript segments with timestamps for LLM context."""
    lines = []
    for seg in data["segments"]:
        start = _format_time(seg["start"])
        end = _format_time(seg["end"])
        lines.append(f"[{start} - {end}] {seg['text']}")
    return "\n".join(lines)


def _format_time(seconds: float) -> str:
    """Format seconds as MM:SS."""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def _parse_segments_json(raw: str) -> list[dict]:
    """Extract and parse JSON array from LLM output."""
    # Try to find JSON array in the output
    raw = raw.strip()

    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try extracting from code block
    if "```" in raw:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass

    # Try finding the array in the text
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse segments JSON from LLM output: {raw[:200]}")


def _snap_to_word_boundaries(
    segments: list[dict],
    words: list[dict],
) -> list[dict]:
    """Snap segment start/end times to nearest word boundaries for clean cuts."""
    if not words:
        return segments

    snapped = []
    for seg in segments:
        target_start = seg["start_time"]
        target_end = seg["end_time"]

        # Find nearest word boundary for start (prefer the word that starts just before)
        best_start = target_start
        for w in words:
            if abs(w["start"] - target_start) < abs(best_start - target_start):
                best_start = w["start"]
            if w["start"] > target_start + 2:
                break

        # Find nearest word boundary for end (prefer the word that ends just after)
        best_end = target_end
        for w in reversed(words):
            if abs(w["end"] - target_end) < abs(best_end - target_end):
                best_end = w["end"]
            if w["end"] < target_end - 2:
                break

        seg["start_time"] = round(best_start, 3)
        seg["end_time"] = round(best_end, 3)
        snapped.append(seg)

    return snapped


def _validate_segments(segments: list[dict], transcript_data: dict) -> list[dict]:
    """Filter and validate segments against constraints."""
    valid = []
    for seg in segments:
        duration = seg["end_time"] - seg["start_time"]
        if MIN_CLIP_DURATION <= duration <= MAX_CLIP_DURATION:
            valid.append(seg)
        elif duration > MAX_CLIP_DURATION:
            # Truncate to max duration
            seg["end_time"] = seg["start_time"] + MAX_CLIP_DURATION
            valid.append(seg)

    # Limit to target count
    return valid[:TARGET_CLIP_COUNT]


def _heuristic_identify_segments(transcript_data: dict) -> list[dict]:
    """Fallback segment selector that detects peak energy, questions, and high-density thoughts.
    Falls back to uniform time-split per PRD 10.1 if speech segments are sparse or empty.
    """
    segments = transcript_data.get("segments", [])
    if not segments:
        # Uniform time-split fallback (PRD 10.1)
        return [{
            "start_time": 0.0,
            "end_time": 20.0,
            "duration": 20.0,
            "transcript_text": transcript_data.get("full_text") or "Featured highlight moment",
            "score": 1.0,
            "rationale": "Uniform time-split highlight fallback (ambient / visual moment)",
        }]

    KEYWORD_BOOSTS = {
        "secret", "never", "best", "biggest", "mistake", "always",
        "why", "how", "what", "because", "important", "shocking",
        "truth", "key", "number", "first", "million", "dollar",
    }

    candidates = []
    n = len(segments)

    # Slide a multi-sentence window
    for i in range(n):
        cur_text = []
        start_t = segments[i]["start"]
        for j in range(i, n):
            seg = segments[j]
            cur_text.append(seg["text"].strip())
            duration = seg["end"] - start_t

            if MIN_CLIP_DURATION <= duration <= MAX_CLIP_DURATION:
                full_slice = " ".join(cur_text)
                words = full_slice.split()
                # Score components
                density = len(words) / max(1.0, duration)  # words per second
                kw_score = sum(1.5 for w in words if w.lower().strip(".,!?:;\"'") in KEYWORD_BOOSTS)
                punc_score = full_slice.count("?") * 2.0 + full_slice.count("!") * 1.5
                total_score = density + kw_score + punc_score

                candidates.append({
                    "start_time": start_t,
                    "end_time": seg["end"],
                    "duration": duration,
                    "transcript_text": full_slice,
                    "score": total_score,
                    "rationale": f"High engagement segment (speech density: {density:.1f} w/s, keyword hook score: {kw_score:.1f})",
                })
            elif duration > MAX_CLIP_DURATION:
                break

    if not candidates:
        # Emergency slice of the first available chunk or uniform split
        if segments:
            end_t = min(segments[-1]["end"], segments[0]["start"] + 30.0)
            return [{
                "start_time": segments[0]["start"],
                "end_time": end_t,
                "duration": end_t - segments[0]["start"],
                "transcript_text": " ".join(s["text"] for s in segments if s["start"] < end_t),
                "rationale": "Introductory highlight segment",
            }]
        return [{
            "start_time": 0.0,
            "end_time": 20.0,
            "duration": 20.0,
            "transcript_text": transcript_data.get("full_text") or "Featured highlight moment",
            "rationale": "Uniform time-split highlight fallback",
        }]

    # Sort candidates by score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    # Pick non-overlapping top clips
    chosen = []
    for cand in candidates:
        # Check overlap
        overlap = False
        for c in chosen:
            if not (cand["end_time"] <= c["start_time"] or cand["start_time"] >= c["end_time"]):
                overlap = True
                break
        if not overlap:
            chosen.append(cand)
            if len(chosen) >= TARGET_CLIP_COUNT:
                break

    # Snap to words if available
    if transcript_data.get("words"):
        chosen = _snap_to_word_boundaries(chosen, transcript_data["words"])

    return chosen
