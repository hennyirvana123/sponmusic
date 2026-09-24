import logging
import os
import time
from pathlib import Path

log = logging.getLogger('uvicorn.error')


class Transcriber:
    def __init__(self):
        self.model = None
        self.device = os.environ.get('MT3_DEVICE', 'cpu').lower()
        if self.device not in ('cpu', 'cuda'):
            raise ValueError('MT3_DEVICE must be cpu or cuda')
        if self.device == 'cuda':
            import torch
            if not torch.cuda.is_available():
                log.warning('CUDA requested but unavailable; using CPU')
                self.device = 'cpu'

    def process(self, source, output, stage):
        started = time.monotonic()
        stage('loading_audio', 10)
        cache = Path(os.environ.setdefault('MT3_CHECKPOINT_DIR', '/models/mt3'))
        cache.mkdir(parents=True, exist_ok=True)
        from mt3_infer import load_model
        from mt3_infer.utils.audio import load_audio
        import mido

        audio, sr = load_audio(str(source))
        # MT3-Infer audio loader returns sample-major mono audio.
        if not isinstance(sr, (int, float)) or sr <= 0 or getattr(audio, 'ndim', 0) != 1 or len(audio) == 0:
            raise ValueError('Expected nonempty mono audio and a positive sample rate from load_audio')
        duration = len(audio) / sr
        log.info('input duration=%.3f sample_rate=%s model=yourmt3 device=%s', duration, sr, self.device)
        stage('loading_model', 20)
        if self.model is None:
            self.model = load_model('yourmt3', device=self.device)
            log.info('YourMT3 model loaded device=%s', self.device)
        stage('transcribing', 50)
        log.info('YourMT3 transcription started')
        midi = self.model.transcribe(audio, sr=sr)
        log.info('YourMT3 transcription finished')
        stage('saving_midi', 90)
        midi.save(str(output))
        # Parse only for statistics; never rewrite the model output.
        parsed = mido.MidiFile(str(output))
        tracks = len(parsed.tracks)
        notes = sum(msg.type == 'note_on' and msg.velocity > 0 for track in parsed.tracks for msg in track)
        elapsed = time.monotonic() - started
        log.info('MIDI tracks=%d notes=%d processing_seconds=%.3f', tracks, notes, elapsed)
        return {'duration': duration, 'sample_rate': sr, 'midi_track_count': tracks,
                'note_count': notes, 'processing_time': elapsed}
