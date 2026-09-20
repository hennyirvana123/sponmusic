import logging
import os
import subprocess
import tempfile
import threading
from contextlib import asynccontextmanager

import librosa
import numpy as np
import soundfile as sf
from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import Model
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from chunked import transcribe_chunks

logger = logging.getLogger('uvicorn.error')
model = None
lock = threading.Lock()

@asynccontextmanager
async def lifespan(app):
    global model
    try:
        model = Model(ICASSP_2022_MODEL_PATH)
        logger.info('Basic Pitch model loaded (inference not yet verified)')
    except Exception:
        logger.exception('Basic Pitch model startup failed')
        raise
    yield
    model = None

app = FastAPI(title='SPONMUSIC Basic Pitch', lifespan=lifespan)

@app.get('/health')
def health():
    if model is None:
        raise HTTPException(503, 'Model not loaded')
    return {'ready': True, 'engine': 'spotify-basic-pitch', 'task': 'transcription', 'busy': lock.locked()}

@app.post('/transcribe')
def transcribe(audio: UploadFile = File(...), task: str = Form('transcription')):
    acquired = False
    try:
        if task != 'transcription':
            raise HTTPException(400, 'Use task=transcription; arrangement runs in SPONMUSIC')
        if model is None:
            raise HTTPException(503, 'Model not loaded')
        acquired = lock.acquire(blocking=False)
        if not acquired:
            raise HTTPException(503, 'Model busy; retry later', headers={'Retry-After': '10'})
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'input.audio')
            size = 0
            signature = b''
            with open(path, 'wb') as target:
                while chunk := audio.file.read(65536):
                    if not signature:
                        signature = chunk[:12]
                    size += len(chunk)
                    if size > 20_000_000:
                        raise HTTPException(413, 'Audio exceeds 20 MB')
                    target.write(chunk)
            if not size:
                raise HTTPException(400, 'Empty audio')
            wav = signature[:4] == b'RIFF' and signature[8:12] == b'WAVE'
            mp3 = signature[:3] == b'ID3' or (len(signature) >= 2 and signature[0] == 255 and signature[1] & 224 == 224)
            if not (wav or mp3):
                raise HTTPException(415, 'Expected MP3 or WAV content')
            normalized = os.path.join(directory, 'input.wav')
            try:
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', path, '-t', '61', '-vn', '-ac', '1', '-ar', '22050', '-y', normalized], check=True, capture_output=True, timeout=30)
                samples, sr = sf.read(normalized, dtype='float32')
            except subprocess.TimeoutExpired:
                raise HTTPException(504, 'Audio decoding timed out')
            except (subprocess.CalledProcessError, RuntimeError):
                raise HTTPException(415, 'Audio could not be decoded')
            if len(samples) > sr * 60:
                raise HTTPException(413, 'Maximum duration is 60 seconds')
            if len(samples) < sr / 4 or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 0.0001:
                raise HTTPException(422, 'Audio is too short, silent or invalid')
            bpm = 120.0
            try:
                tempo, _ = librosa.beat.beat_track(y=samples, sr=sr)
                estimate = float(np.asarray(tempo).reshape(-1)[0])
                if np.isfinite(estimate) and estimate > 0:
                    bpm = estimate
            except Exception:
                logger.warning('Tempo estimation failed; using 120 BPM grid')
            bpm = max(40, min(240, bpm))
            try:
                midi = transcribe_chunks(samples, sr, model, directory, bpm)
            except RuntimeError as exc:
                raise HTTPException(500, str(exc))
            if not any(track.notes for track in midi.instruments):
                raise HTTPException(422, 'Basic Pitch detected no notes')
            output = os.path.join(directory, 'transcription.mid')
            midi.write(output)
            with open(output, 'rb') as source:
                data = source.read(2_000_001)
            if len(data) > 2_000_000:
                raise HTTPException(413, 'MIDI exceeds 2 MB')
            if not data.startswith(b'MThd'):
                raise HTTPException(500, 'Invalid MIDI output')
            return Response(data, media_type='audio/midi', headers={'X-Estimated-BPM': str(max(40, min(240, bpm))), 'Content-Disposition': 'attachment; filename="transcription.mid"', 'Cache-Control': 'no-store'})
    except HTTPException:
        raise
    except Exception:
        logger.exception('Transcription request failed')
        raise HTTPException(500, 'Audio processing failed; no MIDI generated')
    finally:
        audio.file.close()
        if acquired:
            lock.release()
