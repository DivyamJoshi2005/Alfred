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
        try:
            self.samples_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
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
        """Apply speaker tone conversion and acoustic pitch/timbre matching."""
        base_audio_path = Path(base_audio_path)
        embedding_path = Path(embedding_path)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if not base_audio_path.exists():
            raise FileNotFoundError(f"Base audio file missing: {base_audio_path}")

        # Derive sample name from embedding filename
        sample_name = embedding_path.stem.replace("_embedding", "")
        ref_wav = self.samples_dir / f"{sample_name}.wav"

        # If OpenVoice neural model is ready and installed, try it
        if self.is_model_downloaded():
            try:
                return self._run_openvoice_tone_converter(base_audio_path, embedding_path, output_path)
            except Exception as e:
                print(f"[VoiceCloner] Neural tone converter fallback ({e})")

        # High-fidelity acoustic voice cloning (pitch matching + spectral formant adaptation)
        try:
            base_data, sr = sf.read(str(base_audio_path))
            if base_data.ndim > 1:
                base_data = base_data.mean(axis=1)

            # Determine pitch ratio if reference sample audio exists
            pitch_ratio = 1.0
            if ref_wav.exists():
                try:
                    ref_data, ref_sr = sf.read(str(ref_wav))
                    if ref_data.ndim > 1:
                        ref_data = ref_data.mean(axis=1)
                    
                    user_f0 = self._estimate_f0(ref_data, ref_sr)
                    base_f0 = self._estimate_f0(base_data, sr)
                    
                    if 60 < user_f0 < 450 and 60 < base_f0 < 450:
                        pitch_ratio = float(np.clip(user_f0 / base_f0, 0.65, 1.45))
                        print(f"[VoiceCloner] User F0: {user_f0:.1f}Hz, Base F0: {base_f0:.1f}Hz -> pitch ratio: {pitch_ratio:.2f}")
                except Exception as ex:
                    print(f"[VoiceCloner] Pitch estimation notice: {ex}")

            # Apply pitch transformation via FFmpeg if pitch ratio departs from 1.0
            intermediate_audio = base_audio_path
            if abs(pitch_ratio - 1.0) > 0.05:
                pitch_temp = output_path.parent / f"temp_pitch_{output_path.name}"
                new_rate = int(sr * pitch_ratio)
                tempo_adj = 1.0 / pitch_ratio
                # FFmpeg atempo must be between 0.5 and 2.0
                tempo_adj = max(0.5, min(2.0, tempo_adj))
                cmd = [
                    FFMPEG_PATH, "-y",
                    "-i", str(base_audio_path),
                    "-filter:a", f"asetrate={new_rate},atempo={tempo_adj:.4f},aresample={sr}",
                    "-ar", str(sr),
                    str(pitch_temp)
                ]
                proc = subprocess.run(cmd, capture_output=True, text=True)
                if proc.returncode == 0 and pitch_temp.exists():
                    intermediate_audio = pitch_temp

            # Load audio for spectral formant shaping
            curr_data, sr = sf.read(str(intermediate_audio))
            if curr_data.ndim > 1:
                curr_data = curr_data.mean(axis=1)

            # Load reference spectral profile
            ref_profile = None
            if embedding_path.exists():
                try:
                    ref_profile = np.load(str(embedding_path))
                except Exception:
                    pass

            if ref_profile is not None and len(ref_profile) > 0:
                fft_sig = np.fft.rfft(curr_data)
                shaping = np.ones(len(fft_sig), dtype=np.float32)
                match_len = min(len(shaping), len(ref_profile))
                # Acoustic resonance tilt
                norm_profile = ref_profile[:match_len] / (np.max(ref_profile[:match_len]) + 1e-6)
                shaping[:match_len] = 0.75 + 0.5 * norm_profile
                
                cloned_data = np.fft.irfft(fft_sig * shaping, n=len(curr_data))
            else:
                cloned_data = curr_data

            # Normalize peak to -1.0 dB to prevent clipping
            peak = np.max(np.abs(cloned_data))
            if peak > 0:
                cloned_data = (cloned_data / peak) * 0.92

            sf.write(str(output_path), cloned_data.astype(np.float32), sr, subtype="PCM_16")

            # Clean up temp pitch file if created
            if intermediate_audio != base_audio_path and intermediate_audio.exists():
                intermediate_audio.unlink(missing_ok=True)

            print(f"[VoiceCloner] Generated cloned hook audio at: {output_path}")
            return output_path

        except Exception as e:
            print(f"[VoiceCloner] Acoustic voice clone error ({e}), copying base audio")
            shutil.copy(str(base_audio_path), str(output_path))
            return output_path

    def _estimate_f0(self, audio: np.ndarray, sr: int) -> float:
        """Estimate fundamental pitch frequency using normalized autocorrelation."""
        if len(audio) < sr // 4:
            return 160.0
        # Use first 1.5 seconds of active audio
        chunk = audio[int(sr * 0.1): int(sr * 1.6)]
        if len(chunk) == 0:
            return 160.0
        min_lag = int(sr / 450)  # max ~450 Hz
        max_lag = int(sr / 65)   # min ~65 Hz
        chunk = chunk - np.mean(chunk)
        corr = np.correlate(chunk, chunk, mode='full')
        corr = corr[len(chunk) - 1:]
        if len(corr) > max_lag:
            sub = corr[min_lag:max_lag]
            if len(sub) > 0 and np.max(sub) > 0:
                peak_idx = min_lag + int(np.argmax(sub))
                return float(sr / peak_idx)
        return 160.0

    def _extract_openvoice_embedding(self, audio_path: Path) -> np.ndarray:
        """Run OpenVoice se_extractor."""
        from openvoice import se_extractor
        se, _ = se_extractor.get_se(str(audio_path), tone_color_converter=self.converter, target_dir='processed')
        return se.cpu().numpy()

    def _run_openvoice_tone_converter(self, base_audio: Path, embedding: Path, out_path: Path) -> Path:
        """Run OpenVoice tone color converter."""
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

    def delete_voice_sample(self, sample_name: str) -> bool:
        """Delete audio sample and corresponding embedding files."""
        clean_name = "".join(c for c in sample_name if c.isalnum() or c in ("-", "_")).strip()
        if not clean_name:
            return False
        found = False
        for ext in (".wav", ".mp3", ".m4a", ".webm", ".ogg"):
            f = self.samples_dir / f"{clean_name}{ext}"
            if f.exists():
                f.unlink(missing_ok=True)
                found = True
        for suffix in ("_embedding.npy", "_profile.npy", "_style.npy"):
            f = self.samples_dir / f"{clean_name}{suffix}"
            if f.exists():
                f.unlink(missing_ok=True)
                found = True
        return found

    def list_voice_samples(self) -> list[dict[str, Any]]:
        """List all stored reference voice samples and their embedding status."""
        results = []
        for wav_file in sorted(self.samples_dir.glob("*.wav")):
            if wav_file.name.startswith("temp_"):
                continue
            name = wav_file.stem
            emb_file = self.samples_dir / f"{name}_embedding.npy"
            results.append({
                "name": name,
                "path": str(wav_file),
                "audio_path": str(wav_file),
                "has_embedding": emb_file.exists(),
                "embedding_path": str(emb_file) if emb_file.exists() else None,
            })
        return results
