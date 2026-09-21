import logging
import os
import subprocess
import time

import mido
import numpy as np
import soundfile as sf

log = logging.getLogger("uvicorn.error")


class PianoAMT:
    def __init__(self):
        self.model = None

    def process(self, source, directory, report):
        stage = "dependency_import"
        try:
            from piano_transcription_inference import PianoTranscription, sample_rate

            stage = "decode"
            decoded = os.path.join(directory, "decoded.wav")
            report.update(stage=stage)

            subprocess.run(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-i",
                    source,
                    "-t",
                    "61",
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    str(sample_rate),
                    "-y",
                    decoded,
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )

            audio, rate = sf.read(decoded, dtype="float32")
            duration = len(audio) / rate

            if duration < 0.25 or duration > 60 or not np.isfinite(audio).all():
                raise ValueError(
                    "Input must be valid audio between 0.25 and 60 seconds"
                )

            report["input_duration_seconds"] = duration
            log.info("piano faithful input duration %.3fs", duration)

            stage = "model_load"
            report["stage"] = stage

            if self.model is None:
                self.model = PianoTranscription(
                    device="cpu",
                    checkpoint_path=os.environ.get("PIANO_AMT_CHECKPOINT") or None,
                )
                log.info("piano faithful model loaded device=cpu")

            stage = "inference"
            report["stage"] = stage

            raw = os.path.join(directory, "raw.mid")
            started = time.monotonic()

            log.info("piano faithful CPU inference started")
            self.model.transcribe(audio, raw)

            report["inference_duration_seconds"] = time.monotonic() - started

            log.info(
                "piano faithful inference finished %.3fs",
                report["inference_duration_seconds"],
            )

            stage = "midi_validation"
            report["stage"] = stage

            midi = mido.MidiFile(raw)

            notes = sum(
                msg.type == "note_on" and msg.velocity > 0
                for track in midi.tracks
                for msg in track
            )

            pedals = sum(
                msg.type == "control_change" and msg.control == 64
                for track in midi.tracks
                for msg in track
            )

            if not notes:
                raise ValueError("Model returned no notes")

            for track in midi.tracks:
                if any(msg.time < 0 for msg in track):
                    raise ValueError("Invalid MIDI delta timing")

            with open(raw, "rb") as file:
                data = file.read(2_000_001)

            if len(data) > 2_000_000 or not data.startswith(b"MThd"):
                raise ValueError("Invalid or oversized MIDI")

            with open(os.path.join(directory, "cleaned.mid"), "wb") as file:
                file.write(data)

            report.update(
                stage="completed",
                output_note_count=notes,
                pedal_event_count=pedals,
                cleanup="validation_only_byte_identical",
            )

            log.info(
                "piano faithful output notes=%d pedal_events=%d",
                notes,
                pedals,
            )

        except Exception:
            report.update(stage="failed", error_stage=stage)
            log.exception("piano faithful failed stage=%s", stage)
            raise
