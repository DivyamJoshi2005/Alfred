"""Hook Generation — Generate short attention-grabbing intro scripts for each clip."""

from typing import Any

from config import LLAMA_MODEL_PATH, LLAMA_CONTEXT_SIZE
from routers.ws import manager

# Reuse Llama instance from analyzer (set by analyzer.py)
_llm_instance = None

HOOK_SYSTEM_PROMPT = """You are a social media content expert who writes viral hooks.
Write a 1-2 sentence attention-grabbing hook for a short-form video clip.
The hook should:
- Create curiosity or urgency
- Be conversational and punchy
- Make viewers want to keep watching
- Be based on the actual content of the clip

Respond with ONLY the hook text, nothing else."""


async def generate_hooks(
    segments: list[dict[str, Any]],
    job_id: str,
) -> list[dict[str, Any]]:
    """Generate a hook intro script for each segment using Llama 3.2 1B.

    Reuses the model already loaded by the analyzer stage.
    """
    global _llm_instance

    await manager.send_progress(job_id, "generating_hooks", 0, "Generating hooks...")

    # Load model if not already loaded by analyzer
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
            f"Generating hook {i+1}/{total}..."
        )

        transcript_text = seg.get("transcript_text", "")
        if not transcript_text:
            continue

        user_prompt = f"""Here's the transcript of a video clip:

"{transcript_text}"

Write a 1-2 sentence viral hook to introduce this clip:"""

        if _llm_instance is not None:
            try:
                response = _llm_instance.create_chat_completion(
                    messages=[
                        {"role": "system", "content": HOOK_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=128,
                    top_p=0.9,
                )
                hook_text = response["choices"][0]["message"]["content"].strip()
                # Clean up: remove quotes if the model wrapped it
                hook_text = hook_text.strip('"\'')
                seg["hook_text"] = hook_text
            except Exception as e:
                print(f"[Hook] Failed to generate hook with LLM for segment {i+1}: {e}")
                seg["hook_text"] = _heuristic_hook(transcript_text)
        else:
            seg["hook_text"] = _heuristic_hook(transcript_text)

    # Free the model after hook generation
    _llm_instance = None

    await manager.send_progress(job_id, "generating_hooks", 100, "Hooks generated")
    return segments


def _heuristic_hook(text: str) -> str:
    """Generate a punchy intro hook from the first sentence or question in text."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    first_sentence = sentences[0] if sentences else text[:80]
    first_sentence = first_sentence.strip()

    if "?" in first_sentence:
        return f"Ever wondered this? {first_sentence}"
    if len(first_sentence) < 60:
        return f"Here is the truth: {first_sentence}"
    return f"Wait until you hear this: {first_sentence[:80]}..."
