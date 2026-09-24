import asyncio
import logging
import shutil
import tempfile
import time
import uuid
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from transcriber import Transcriber

log = logging.getLogger('uvicorn.error')
MAX_BYTES = 100_000_000
EXTENSIONS = {'.mp3', '.wav', '.m4a', '.flac', '.ogg'}


def create_app(transcriber=None):
    engine = transcriber if transcriber is not None else Transcriber()
    jobs = {}
    queue = asyncio.Queue(maxsize=4)
    accepting = False

    async def worker():
        while True:
            job = await queue.get()
            job['status'] = 'processing'
            def stage(name, progress):
                job.update(stage=name, progress=progress)
                log.info('job=%s stage=%s', job['job_id'], name)
            try:
                job['statistics'] = await asyncio.to_thread(engine.process, job['input'], job['output'], stage)
                job.update(status='completed', stage='completed', progress=100)
            except Exception as exc:
                failed_stage = job['stage']
                job.update(status='failed', error={'code': 'TRANSCRIPTION_FAILED', 'stage': failed_stage,
                                                  'type': type(exc).__name__,
                                                  'message': 'See service logs for the underlying exception; no fallback output.'})
                log.exception('job=%s failed stage=%s', job['job_id'], failed_stage)
                with suppress(FileNotFoundError):
                    job['output'].unlink()
            finally:
                with suppress(FileNotFoundError):
                    job['input'].unlink()
                job['finished'] = time.monotonic()
                queue.task_done()

    async def cleanup():
        while True:
            await asyncio.sleep(60)
            for key, job in list(jobs.items()):
                if job.get('finished') is not None and time.monotonic() - job['finished'] > 1800:
                    shutil.rmtree(job['directory'], ignore_errors=True)
                    jobs.pop(key, None)

    @asynccontextmanager
    async def lifespan(app):
        nonlocal accepting
        accepting = True
        task, cleaner = asyncio.create_task(worker()), asyncio.create_task(cleanup())
        try:
            yield
        finally:
            accepting = False
            await queue.join()
            task.cancel()
            cleaner.cancel()
            for pending in (task, cleaner):
                with suppress(asyncio.CancelledError):
                    await pending
            for job in jobs.values():
                shutil.rmtree(job['directory'], ignore_errors=True)
            jobs.clear()

    app = FastAPI(title='AI Transcribe V2 · YourMT3 experiment', lifespan=lifespan)

    @app.get('/health')
    async def health():
        return {'alive': True, 'engine': 'mt3-infer', 'model': 'yourmt3',
                'model_loaded': engine.model is not None, 'device': engine.device}

    @app.post('/transcribe', status_code=202)
    async def transcribe(file: UploadFile = File(...)):
        directory = None
        try:
            filename = (file.filename or '').replace('\\', '/').split('/')[-1]
            extension = Path(filename).suffix.lower()
            if extension not in EXTENSIONS:
                raise HTTPException(415, 'Supported extensions: mp3, wav, m4a, flac, ogg')
            if not accepting or queue.full() or len(jobs) >= 12:
                raise HTTPException(429, 'Job capacity reached')
            directory = Path(tempfile.mkdtemp(prefix='mt3-v2-'))
            source = directory / ('input' + extension)
            size = 0
            with source.open('wb') as target:
                while chunk := await file.read(65536):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, 'Maximum upload size is 100 MB')
                    target.write(chunk)
            if not size:
                raise HTTPException(400, 'Empty file')
            if queue.full() or len(jobs) >= 12:
                raise HTTPException(429, 'Job capacity reached')
            key = uuid.uuid4().hex
            job = {'job_id': key, 'status': 'queued', 'stage': 'queued', 'progress': 0,
                   'error': None, 'statistics': None, 'directory': directory,
                   'input': source, 'output': directory / 'output.mid'}
            jobs[key] = job
            queue.put_nowait(job)
            log.info('job=%s input_filename=%r bytes=%d', key, filename[:200], size)
            directory = None
            return {'job_id': key, 'status': 'queued', 'progress': 0, 'error': None}
        finally:
            await file.close()
            if directory is not None:
                shutil.rmtree(directory, ignore_errors=True)

    def find(job_id):
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(404, 'Job missing, expired or lost after restart')
        return job

    @app.get('/jobs/{job_id}')
    async def status(job_id: str):
        job = find(job_id)
        return {key: job[key] for key in ('job_id', 'status', 'stage', 'progress', 'error', 'statistics')}

    @app.get('/jobs/{job_id}/midi')
    async def download(job_id: str):
        job = find(job_id)
        if job['status'] != 'completed':
            raise HTTPException(409, 'MIDI is not ready')
        return FileResponse(job['output'], media_type='audio/midi', filename='yourmt3-raw.mid',
                            headers={'Cache-Control': 'no-store'})

    return app


app = create_app()
