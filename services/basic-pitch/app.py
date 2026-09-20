import os
import tempfile
import threading
from contextlib import asynccontextmanager

import librosa
import numpy as np
from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import Model, predict
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

model = None
lock = threading.Lock()

@asynccontextmanager
async def lifespan(app):
    global model
    model = Model(ICASSP_2022_MODEL_PATH)
    yield

app = FastAPI(lifespan=lifespan)

@app.get('/health')
def health():
    return {'ready': model is not None, 'engine': 'spotify-basic-pitch', 'task': 'transcription'}

@app.post('/transcribe')
def transcribe(audio: UploadFile = File(...), task: str = Form('transcription')):
    if task != 'transcription':
        raise HTTPException(400, 'Only transcription is supported here; arrangement runs in SPONMUSIC.')
    if model is None or not lock.acquire(blocking=False):
        raise HTTPException(503, 'Model not ready or busy')
    try:
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'input.audio')
            size = 0
            with open(path, 'wb') as target:
                while chunk := audio.file.read(65536):
                    size += len(chunk)
                    if size > 20_000_000:
                        raise HTTPException(413, 'Maximum upload is 20 MB')
                    target.write(chunk)
            if not size:
                raise HTTPException(400, 'Empty audio')
            try:
                samples, sr = librosa.load(path, sr=22050, mono=True, duration=61)
            except Exception:
                raise HTTPException(415, 'Audio could not be decoded')
            if len(samples) > sr * 60:
                raise HTTPException(413, 'Maximum audio duration is 60 seconds for this synchronous service')
            if len(samples) < sr / 4 or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 0.0001:
                raise HTTPException(422, 'Audio is empty, silent or invalid')
            # Model inference on the actual uploaded waveform; no generated/demo notes.
            import soundfile as sf
            normalized = os.path.join(directory, 'input.wav')
            sf.write(normalized, samples, sr)
            _, midi, events = predict(normalized, model)
            if not events:
                raise HTTPException(422, 'Basic Pitch detected no notes')
            tempo, _ = librosa.beat.beat_track(y=samples, sr=sr)
            bpm = float(np.asarray(tempo).reshape(-1)[0])
            if not np.isfinite(bpm) or bpm <= 0:
                bpm = 120.0
            output = os.path.join(directory, 'transcription.mid')
            midi.write(output)
            with open(output, 'rb') as source:
                data = source.read(2_000_001)
            if len(data) > 2_000_000:
                raise HTTPException(413, 'MIDI exceeds 2 MB')
            return Response(data, media_type='audio/midi', headers={'X-Estimated-BPM': str(max(40, min(240, bpm)))})
    finally:
        audio.file.close()
        lock.release()
