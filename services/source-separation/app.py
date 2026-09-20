import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from contextlib import asynccontextmanager, suppress

import numpy as np
import soundfile as sf
import torch
from demucs.pretrained import get_model
from demucs.apply import apply_model
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

log = logging.getLogger('uvicorn.error')
jobs = {}
queue = asyncio.Queue(maxsize=4)
model = None
busy = False
model_error = None


def separate(job):
    folder = job['folder']
    original = os.path.join(folder, 'original.wav')
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', os.path.join(folder, 'upload'), '-t', '61', '-ac', '2', '-ar', str(model.samplerate), '-y', original], check=True, timeout=30, capture_output=True)
    audio, rate = sf.read(original, dtype='float32', always_2d=True)
    if len(audio) > rate * 60 or len(audio) < rate // 4:
        raise ValueError('Audio must be between 0.25 and 60 seconds')
    if not np.isfinite(audio).all() or np.max(np.abs(audio)) < .0001:
        raise ValueError('Silent or invalid audio')
    waveform = torch.from_numpy(audio.T.copy())
    reference = waveform.mean(0)
    mean, std = reference.mean(), reference.std()
    if std < 1e-6:
        raise ValueError('Insufficient audio variation')
    device = os.environ.get('SEPARATION_DEVICE', 'cpu')
    with torch.inference_mode():
        estimates = apply_model(model, ((waveform-mean)/std)[None], device=device, split=True, overlap=.25, shifts=0, progress=False)[0].cpu()
    estimates = estimates * std + mean
    vocal_index = model.sources.index('vocals')
    vocals = estimates[vocal_index]
    instrumental = torch.stack([estimates[i] for i in range(len(model.sources)) if i != vocal_index]).sum(0)
    # Float WAV preserves common gain and alignment without separately normalizing stems.
    for name, stem in [('vocals', vocals), ('instrumental', instrumental)]:
        if not torch.isfinite(stem).all():
            raise ValueError('Model produced non-finite audio')
        sf.write(os.path.join(folder, name+'.wav'), stem.T.numpy(), rate, subtype='FLOAT')
    os.remove(os.path.join(folder, 'upload'))
    return {'duration': len(audio)/rate, 'sample_rate': rate, 'model': 'htdemucs', 'package': 'demucs 4.0.1', 'confidence': None, 'warnings': ['Separation quality requires listening; no calibrated confidence available']}


async def worker():
    global busy
    while True:
        job = await queue.get()
        busy = True
        job['status'] = 'processing'
        started = time.monotonic()
        try:
            job['analysis'] = await asyncio.to_thread(separate, job)
            job['status'] = 'completed'
        except Exception as exc:
            log.exception('Source separation failed')
            resource = isinstance(exc, (MemoryError, torch.cuda.OutOfMemoryError))
            job.update(status='failed', error_code='RESOURCE_FAILURE' if resource else 'SEPARATION_FAILED', error='Memory allocation failed' if resource else 'Source separation/decode failed; see server logs for exception details. No stems returned.')
            shutil.rmtree(job['folder'], ignore_errors=True)
        finally:
            job['processing_seconds'] = time.monotonic()-started
            job['finished'] = time.monotonic()
            busy = False
            queue.task_done()


async def cleanup():
    while True:
        await asyncio.sleep(60)
        for key, job in list(jobs.items()):
            if job.get('finished') and time.monotonic()-job['finished'] > 1800:
                shutil.rmtree(job['folder'], ignore_errors=True)
                jobs.pop(key, None)


@asynccontextmanager
async def lifespan(app):
    global model, model_error
    try:
        model = await asyncio.to_thread(get_model, 'htdemucs')
        model.eval()
        model_error = None
    except Exception as exc:
        model = None
        model_error = 'RESOURCE_FAILURE' if isinstance(exc, (MemoryError, torch.cuda.OutOfMemoryError)) else 'MODEL_LOAD_FAILED'
        log.exception('Demucs model load failed')
    task = asyncio.create_task(worker())
    cleaner = asyncio.create_task(cleanup())
    try:
        yield
    finally:
        # Wait for active inference before deleting its working files.
        await queue.join()
        task.cancel()
        cleaner.cancel()
        for t in (task, cleaner):
            with suppress(asyncio.CancelledError):
                await t
        for job in jobs.values():
            shutil.rmtree(job['folder'], ignore_errors=True)
        jobs.clear()

app = FastAPI(title='SPONMUSIC source separation', lifespan=lifespan)

@app.get('/health')
async def health():
    return {'ready': model is not None, 'busy': busy, 'model': 'htdemucs'}

@app.get('/diagnostics')
async def diagnostics():
    from importlib.metadata import version
    return {'engine': 'demucs', 'model': 'htdemucs', 'version': version('demucs'),
            'busy': busy, 'modelAvailable': model is not None, 'errorCode': model_error,
            'sources': list(model.sources) if model is not None else [],
            'limits': {'maxBytes': 20_000_000, 'maxSeconds': 60, 'queueSize': 4},
            'instrumentalMethod': 'sum-of-non-vocal-model-stems'}

@app.post('/separate', status_code=202)
async def submit(audio: UploadFile = File(...)):
    folder = None
    try:
        if model is None:
            raise HTTPException(503, model_error or 'MODEL_LOAD_FAILED')
        if queue.full() or len(jobs) >= 12:
            raise HTTPException(429, 'Separation capacity reached')
        folder = tempfile.mkdtemp(prefix='sponmusic-stems-')
        size = 0
        with open(os.path.join(folder, 'upload'), 'wb') as f:
            while chunk := await audio.read(65536):
                size += len(chunk)
                if size > 20_000_000:
                    raise HTTPException(413, 'Maximum 20 MB')
                f.write(chunk)
        if not size:
            raise HTTPException(400, 'Empty audio')
        if queue.full() or len(jobs) >= 12:
            raise HTTPException(429, 'Separation capacity reached')
        key = uuid.uuid4().hex
        job = {'job_id': key, 'status': 'queued', 'folder': folder}
        jobs[key] = job
        queue.put_nowait(job)
        folder = None
        return {'job_id': key, 'status': 'queued'}
    finally:
        await audio.close()
        if folder:
            shutil.rmtree(folder, ignore_errors=True)

@app.get('/separate/{job_id}')
async def status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, 'Job unavailable or expired')
    return {k: v for k, v in job.items() if k not in ('folder', 'finished')}

@app.get('/separate/{job_id}/{stem}')
async def download(job_id: str, stem: str):
    if stem not in ('vocals', 'instrumental', 'original'):
        raise HTTPException(404, 'Unknown stem')
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, 'Job unavailable or expired')
    if job['status'] != 'completed':
        raise HTTPException(409, 'Separation not completed')
    return FileResponse(os.path.join(job['folder'], stem+'.wav'), media_type='audio/wav', filename=stem+'.wav')
