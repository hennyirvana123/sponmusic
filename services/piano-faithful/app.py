import asyncio
import logging
import os
import shutil
import tempfile
import time
import uuid
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from piano_amt import PianoAMT

log = logging.getLogger("uvicorn.error")


def create_app(adapter=None):
    adapter = adapter or PianoAMT()
    jobs = {}
    queue = asyncio.Queue(maxsize=2)
    accepting = False

    async def worker():
        while True:
            job = await queue.get()
            job["status"] = "processing"
            try:
                await asyncio.to_thread(
                    adapter.process,
                    job["source"],
                    job["directory"],
                    job["diagnostics"],
                )
                job["status"] = "completed"
            except Exception:
                job["status"] = "failed"
                stage = job["diagnostics"].get("error_stage", "inference")
                job["error"] = {
                    "code": {
                        "model_load": "MODEL_LOAD_FAILED",
                        "decode": "AUDIO_DECODE_FAILED",
                        "dependency_import": "DEPENDENCY_IMPORT_FAILED",
                        "midi_validation": "MIDI_VALIDATION_FAILED",
                    }.get(stage, "INFERENCE_FAILED"),
                    "stage": stage,
                    "message": "Experiment failed; inspect server logs for the underlying exception. No fallback MIDI.",
                }
                log.exception(
                    "piano faithful job=%s failed stage=%s",
                    job["job_id"],
                    stage,
                )
                shutil.rmtree(job["directory"], ignore_errors=True)
            finally:
                for name in ("input.audio", "decoded.wav"):
                    with suppress(FileNotFoundError):
                        os.remove(os.path.join(job["directory"], name))

                job["finished"] = time.monotonic()
                queue.task_done()

    async def cleanup():
        while True:
            await asyncio.sleep(60)

            for key, job in list(jobs.items()):
                if (
                    time.monotonic()
                    - job.get("finished", time.monotonic())
                    > 1800
                ):
                    shutil.rmtree(job["directory"], ignore_errors=True)
                    jobs.pop(key, None)

    @asynccontextmanager
    async def lifespan(app):
        nonlocal accepting

        accepting = True
        task = asyncio.create_task(worker())
        cleaner = asyncio.create_task(cleanup())

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
                shutil.rmtree(job["directory"], ignore_errors=True)

    app = FastAPI(
        title="SPONMUSIC piano faithful experiment",
        lifespan=lifespan,
    )

    @app.get("/health")
    def health():
        return {
            "alive": True,
            "accepting_jobs": accepting,
            "model_loaded": adapter.model is not None,
            "engine": "piano_transcription_inference",
            "device": "cpu",
            "experimental": True,
        }

    @app.post("/transcribe", status_code=202)
    async def submit(
        audio: UploadFile = File(...),
        task: str = Form("piano_faithful"),
    ):
        directory = None

        try:
            if task != "piano_faithful":
                raise HTTPException(
                    400,
                    "Only task=piano_faithful is supported",
                )

            if not accepting or queue.full() or len(jobs) >= 8:
                raise HTTPException(
                    429,
                    "Experiment capacity reached",
                )

            directory = tempfile.mkdtemp(
                prefix="piano-faithful-"
            )

            source = os.path.join(
                directory,
                "input.audio",
            )

            size = 0
            signature = b""

            with open(source, "wb") as output:
                while chunk := await audio.read(65536):
                    if not signature:
                        signature = chunk[:12]

                    size += len(chunk)

                    if size > 20_000_000:
                        raise HTTPException(
                            413,
                            "Maximum 20 MB",
                        )

                    output.write(chunk)

            wav = (
                signature[:4] == b"RIFF"
                and signature[8:12] == b"WAVE"
            )

            mp3 = (
                signature[:3] == b"ID3"
                or (
                    len(signature) > 1
                    and signature[0] == 255
                    and signature[1] & 224 == 224
                )
            )

            if not size or not (wav or mp3):
                raise HTTPException(
                    415,
                    "Expected MP3/WAV",
                )

            if queue.full() or len(jobs) >= 8:
                raise HTTPException(
                    429,
                    "Experiment capacity reached",
                )

            key = uuid.uuid4().hex

            jobs[key] = {
                "job_id": key,
                "status": "queued",
                "source": source,
                "directory": directory,
                "diagnostics": {
                    "stage": "queued",
                    "input_duration_seconds": None,
                    "inference_duration_seconds": None,
                    "output_note_count": None,
                    "pedal_event_count": None,
                    "error_stage": None,
                },
            }

            queue.put_nowait(jobs[key])
            directory = None

            return {
                "job_id": key,
                "status": "queued",
                "task": task,
            }

        finally:
            await audio.close()

            if directory:
                shutil.rmtree(
                    directory,
                    ignore_errors=True,
                )

    def find(key):
        if key not in jobs:
            raise HTTPException(
                404,
                "Job missing, expired or lost after restart",
            )

        return jobs[key]

    @app.get("/transcribe/{job_id}")
    def status(job_id: str):
        job = find(job_id)

        return {
            key: value
            for key, value in job.items()
            if key not in (
                "directory",
                "source",
                "finished",
            )
        }

    @app.get(
        "/transcribe/{job_id}/download/{variant}"
    )
    def download(
        job_id: str,
        variant: str,
    ):
        if variant not in ("raw", "cleaned"):
            raise HTTPException(
                404,
                "Use raw or cleaned",
            )

        job = find(job_id)

        if job["status"] != "completed":
            raise HTTPException(
                409,
                "Job not completed",
            )

        return FileResponse(
            os.path.join(
                job["directory"],
                variant + ".mid",
            ),
            media_type="audio/midi",
            filename="piano-faithful-" + variant + ".mid",
            headers={
                "Cache-Control": "no-store"
            },
        )

    return app


app = create_app()
