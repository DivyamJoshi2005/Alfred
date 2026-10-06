"""Alfred Backend — OpenVoice v2 tone converter and voice cloning pipeline.

Extracts speaker embeddings from a ~10-second reference voice sample and applies
tone conversion over base TTS audio to mirror the user's vocal characteristics.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from config import FFMPEG_PATH, MODELS_DIR, TTS_SAMPLE_RATE, VOICE_SAMPLES_DIR

OPENVOICE_DIR = MODELS_DIR / "openvoice"


class VoiceCloner:
    """Extracts speaker embeddings and converts TTS audio into cloned user voice."""

    def __init__(self, checkpoints_dir: Path = OPENVOICE_DIR, samples_dir: Path = VOICE_SAMPLES_DIR):
        self.checkpoints_dir = checkpoints_dir
        self.samples_dir = samples_dir
        self.samples_dir.mkdir(parents=True, exist_ok=True)
        self.converter = None

    def is_model_downloaded(self) -> bool:
        """Check if OpenVoice checkpoint weights are downloaded."""
        converter_ckpt = self.checkpoints_dir / "converter" / "checkpoint.pth"
        return converter_ckpt.exists() or (self.checkpoints_dir / "model.onnx").exists()

    def extract_speaker_embedding(self, sample_audio_path: Path, sample_name: str = "my_voice") -> Path:
        """Process 10s voice sample and extract speaker embedding vector.

        Returns path to saved .npy embedding file.
        """
        sample_audio_path = Path(sample_audio_path)
        if not sample_audio_path.exists():
            raise FileNotFoundError(f"Voice sample audio not found: {sample_audio_path}")

        # Standardize sample to 24kHz mono WAV
        clean_sample = self.samples_dir / f"{sample_name}.wav"
        cmd = [
            FFMPEG_PATH,
            "-y",
            "-i", str(sample_audio_path),
            "-ar", str(TTS_SAMPLE_RATE),
            "-ac", "1",
            str(clean_sample),
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        embedding_path = self.samples_dir / f"{sample_name}_embedding.npy"

        # If OpenVoice model is present, run model embedding extractor
        if self.is_model_downloaded():
            try:
                embedding = self._extract_openvoice_embedding(clean_sample)
                np.save(str(embedding_path), embedding)
                return embedding_path
            except Exception as e:
                print(f"[VoiceCloner] OpenVoice model extraction failed ({e}), using acoustic profile")

        # Acoustic spectral profile fallback (spectral centroid, bandwidth, energy distribution)
        data, sr = sf.read(str(clean_sample))
        if data.ndim > 1:
            data = data.mean(axis=1)

        # Compute normalized FFT spectrum as reference profile
        fft_vals = np.abs(np.fft.rfft(data[: sr * 10]))
        profile = fft_vals[:512]
        if len(profile) < 512:
            profile = np.pad(profile, (0, 512 - len(profile)))
        profile = profile / (np.linalg.norm(profile) + 1e-8)

        np.save(str(embedding_path), profile)
        print(f"[VoiceCloner] Extracted speaker embedding profile to: {embedding_path}")
        return embedding_path

    def clone_voice(
        self,
        base_audio_path: Path,
        embedding_path: Path,
        output_path: Path,
    ) -> Path:
        """Apply speaker tone conversion to base synthesized audio."""
        base_audio_path = Path(base_audio_path)
        embedding_path = Path(embedding_path)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if not base_audio_path.exists():
            raise FileNotFoundError(f"Base audio file missing: {base_audio_path}")
        if not embedding_path.exists():
            # If embedding missing, copy base audio directly
            shutil.copy(str(base_audio_path), str(output_path))
            return output_path

        # If OpenVoice model downloaded, run neural tone converter
        if self.is_model_downloaded():
            try:
                return self._run_openvoice_tone_converter(base_audio_path, embedding_path, output_path)
            except Exception as e:
                print(f"[VoiceCloner] Neural tone converter failed ({e}), using timbre matching")

        # Acoustic timbre matching
        data, sr = sf.read(str(base_audio_path))
        ref_profile = np.load(str(embedding_path))

        # Mild frequency shaping to align with reference timbre
        fft_sig = np.fft.rfft(data)
        shaping = np.ones(len(fft_sig), dtype=np.float32)
        match_len = min(len(shaping), len(ref_profile))
        shaping[:match_len] = 0.8 + 0.4 * ref_profile[:match_len]

        cloned_data = np.fft.irfft(fft_sig * shaping, n=len(data))
        # Normalize
        cloned_data = np.clip(cloned_data, -1.0, 1.0)
        sf.write(str(output_path), cloned_data, sr, subtype="PCM_16")

        print(f"[VoiceCloner] Generated cloned speech audio at: {output_path}")
        return output_path

    def _extract_openvoice_embedding(self, audio_path: Path) -> np.ndarray:
        """Run OpenVoice se_extractor."""
        from openvoice import se_extractor
        se, _ = se_extractor.get_se(str(audio_path), tone_color_converter=self.converter, target_dir='processed')
        return se.cpu().numpy()

    def _run_openvoice_tone_converter(self, base_audio: Path, embedding: Path, out_path: Path) -> Path:
        """Run OpenVoice tone color converter."""
        # OpenVoice PyTorch execution
        import torch
        from openvoice.api import ToneColorConverter
        if self.converter is None:
            config_path = self.checkpoints_dir / "converter" / "config.json"
            ckpt_path = self.checkpoints_dir / "converter" / "checkpoint.pth"
            self.converter = ToneColorConverter(str(config_path), device="cpu")
            self.converter.load_ckpt(str(ckpt_path))

        target_se = torch.from_numpy(np.load(str(embedding)))
        source_se = torch.load(str(self.checkpoints_dir / "base_speakers" / "ses" / "en-default.pth"), map_location="cpu")
        self.converter.convert(
            audio_src_path=str(base_audio),
            src_se=source_se,
            tgt_se=target_se,
            output_path=str(out_path),
            message="@AlfredStudio",
        )
        return out_path

    def list_voice_samples(self) -> list[dict[str, Any]]:
        """List all stored reference voice samples and their embedding status."""
        results = []
        for wav_file in self.samples_dir.glob("*.wav"):
            name = wav_file.stem
            emb_file = self.samples_dir / f"{name}_embedding.npy"
            results.append({
                "name": name,
                "audio_path": str(wav_file),
                "has_embedding": emb_file.exists(),
                "embedding_path": str(emb_file) if emb_file.exists() else None,
            })
        return results
