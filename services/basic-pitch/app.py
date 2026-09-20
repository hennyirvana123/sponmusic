import asyncio
import logging
import os
import shutil
import tempfile
import time
import uuid
import threading
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

logger = logging.getLogger('uvicorn.error')

def create_app(loader=None, processor=None):
    if loader is None:
        def loader():
            from basic_pitch import ICASSP_2022_MODEL_PATH
            from basic_pitch.inference import Model
            return Model(ICASSP_2022_MODEL_PATH)
    if processor is None:
        from pipeline import process
        processor = process
    jobs = {}
    queue = asyncio.Queue(maxsize=8)
    state = {'model': None, 'busy': False, 'stopping': False}

    async def inference(job):
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        def deliver(result, error):
            if not future.done():
                if error is not None:
                    future.set_exception(error)
                else:
                    future.set_result(result)
        def run():
            result, error = None, None
            try:
                result = processor(job['path'], job['directory'], state['model'])
            except Exception as exc:
                error = exc
            finally:
                shutil.rmtree(job['directory'], ignore_errors=True)
            try:
                loop.call_soon_threadsafe(deliver, result, error)
            except RuntimeError:
                pass
        threading.Thread(target=run, daemon=True, name='basic-pitch-inference').start()
        return await future

    async def worker():
        while True:
            job = await queue.get()
            if job is None:
                queue.task_done()
                return
            job['status'] = 'processing'
            state['busy'] = True
            try:
                data, bpm = await inference(job)
                job.update(status='completed', data=data, bpm=bpm)
            except asyncio.CancelledError:
                job.update(status='failed', error='Service shutting down; inference interrupted')
                raise
            except Exception as exc:
                logger.exception('Transcription job failed')
                job.update(status='failed', error=str(exc) if isinstance(exc, (ValueError, RuntimeError)) else 'Audio processing failed; no MIDI generated')
            finally:
                shutil.rmtree(job['directory'], ignore_errors=True)
                job['finished'] = time.monotonic()
                state['busy'] = False
                queue.task_done()

    async def reap():
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            for key, job in list(jobs.items()):
                if job.get('finished') and now - job['finished'] > 1800:
                    del jobs[key]

    @asynccontextmanager
    async def lifespan(app):
        state['model'] = await asyncio.to_thread(loader)
        task = asyncio.create_task(worker())
        cleaner = asyncio.create_task(reap())
        try:
            yield
        finally:
            state['stopping'] = True
            cleaner.cancel()
            with suppress(asyncio.CancelledError):
                await cleaner
            while not queue.empty():
                job = queue.get_nowait()
                if job is not None:
                    shutil.rmtree(job['directory'], ignore_errors=True)
                queue.task_done()
            queue.put_nowait(None)
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=20)
            except asyncio.TimeoutError:
                logger.warning('Shutdown grace expired; abandoning daemon inference thread')
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            finally:
                for job in jobs.values():
                    shutil.rmtree(job['directory'], ignore_errors=True)
                jobs.clear()

    app = FastAPI(title='SPONMUSIC async Basic Pitch', lifespan=lifespan)

    @app.get('/health')
    async def health():
        if state['model'] is None:
            raise HTTPException(503, 'Model not loaded')
        return {'ready': True, 'engine': 'spotify-basic-pitch', 'task': 'transcription', 'busy': state['busy']}

    @app.post('/transcribe', status_code=202, summary='Queue transcription; returns JSON, not MIDI')
    async def transcribe(audio: UploadFile = File(...), task: str = Form('transcription')):
        directory = None
        try:
            if task != 'transcription':
                raise HTTPException(400, 'Use task=transcription')
            if state['model'] is None or state['stopping']:
                raise HTTPException(503, 'Model not loaded or service shutting down')
            if queue.full() or len(jobs) >= 64:
                raise HTTPException(429, 'Job capacity reached; retry later')
            directory = tempfile.mkdtemp(prefix='basic-pitch-')
            path = os.path.join(directory, 'input.audio')
            size = 0
            signature = b''
            with open(path, 'wb') as f:
                while chunk := await audio.read(65536):
                    if not signature:
                        signature = chunk[:12]
                    size += len(chunk)
                    if size > 20_000_000:
                        raise HTTPException(413, 'Audio exceeds 20 MB')
                    f.write(chunk)
            if not size:
                raise HTTPException(400, 'Empty audio')
            wav = signature[:4] == b'RIFF' and signature[8:12] == b'WAVE'
            mp3 = signature[:3] == b'ID3' or (len(signature) >= 2 and signature[0] == 255 and signature[1] & 224 == 224)
            if not (wav or mp3):
                raise HTTPException(415, 'Expected MP3/WAV')
            if queue.full() or len(jobs) >= 64:
                raise HTTPException(429, 'Job capacity reached; retry later')
            key = uuid.uuid4().hex
            job = {'job_id': key, 'status': 'queued', 'directory': directory, 'path': path}
            jobs[key] = job
            queue.put_nowait(job)
            directory = None
            return {'job_id': key, 'status': 'queued'}
        finally:
            await audio.close()
            if directory:
                shutil.rmtree(directory, ignore_errors=True)

    def find(key):
        job = jobs.get(key)
        if not job:
            raise HTTPException(404, 'Job not found, expired, or lost after restart')
        return job

    @app.get('/transcribe/{job_id}')
    async def status(job_id: str):
        job = find(job_id)
        result = {'job_id': job_id, 'status': job['status']}
        if job['status'] == 'completed':
            result['download_url'] = f'/transcribe/{job_id}/download'
        if job['status'] == 'failed':
            result['error'] = job['error']
        return result

    @app.get('/transcribe/{job_id}/download')
    async def download(job_id: str):
        job = find(job_id)
        if job['status'] != 'completed':
            raise HTTPException(409, 'Job has not completed successfully')
        return Response(job['data'], media_type='audio/midi', headers={'Content-Disposition': 'attachment; filename="transcription.mid"', 'X-Estimated-BPM': str(job['bpm']), 'Cache-Control': 'no-store'})
    return app

app = create_app()
