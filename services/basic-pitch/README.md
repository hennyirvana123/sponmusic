# Basic Pitch service for Render

Status: code audited, but Docker build, Python dependency resolution, model startup and inference have NOT been executed in this environment. Health success proves model loading, not transcription quality. No dummy MIDI, paid API or YouTube.

## Local Docker
From this directory, build image `sponmusic-basic-pitch` with Docker build context `.`. Run the image with container port 8000 published on local port 8000. The Dockerfile supplies the startup command; no start-command override is needed.

## Render (dashboard)
1. Create a Web Service from this repository, runtime Docker.
2. Set Root Directory to `services/basic-pitch`, Dockerfile Path to `./Dockerfile`, Docker Build Context to `.` if shown.
3. Set Health Check Path to `/health`. Do not override the Docker command.
4. Render supplies PORT; the process binds 0.0.0.0:$PORT. Default outside Render is 8000.
5. Check build logs for pip check, then startup/model-loading logs. TensorFlow dependencies/model memory can exceed small instance limits; no free-tier capacity guarantee. No service has been purchased or deployed by this change.
6. On the SPONMUSIC deployment, set NITRO_PIANO_MODEL_URL to your service's full HTTPS `/transcribe` URL, then redeploy that backend. This variable belongs to SPONMUSIC, NOT the Python service.

## Environment
PORT: optional locally (8000 default), injected by Render. Python/log/cache variables have safe Docker defaults. No API keys required. NUMBA_CACHE_DIR=/tmp/numba is writable for the non-root process.

## Endpoints
GET /health: ready, engine, task, busy. 503 if model unavailable; startup failure prevents serving.
POST /transcribe: multipart file field `audio`, form `task=transcription`. MP3/WAV max 20 MB and 60 s. Response audio/midi bytes, X-Estimated-BPM header. OpenAPI UI /docs and schema /openapi.json.

## Real audio test without terminal
Open `/docs`, expand POST /transcribe, choose Try it out, select a short permitted non-silent MP3 or WAV, set task=transcription, Execute. Expect 200 audio/midi and download the binary response. Repeat for WAV/MP3; inspect resulting MIDI in SPONMUSIC. Test silence (422), bad content (415), oversize/duration (413), unknown task (400), model busy (503). Inference errors return 500 without generated replacement notes. Decoder timeout returns 504.

This endpoint is transcription only. When invoked through SPONMUSIC, Nitro applies the piano arrangement engine to this MIDI, then returns the new arrangement. Direct service output is raw transcription.

## Operational limits
One worker, one inference at a time, four concurrent connections. FFmpeg decoding timeout 30 s; inference has no forced timeout. Nitro times out after 120 s but Python may continue until inference completes. Files are deleted on completion; multipart upload is parsed/spooled before endpoint validation. Put request size/rate/time limits and access protection at your gateway before public use. This code is not an authenticated public upload service. No persistent disk needed. Keep logs free of uploaded audio or sensitive metadata.

Dependencies: Basic Pitch brings its inference runtimes and MIDI dependencies transitively. Python 3.10 Linux image, libsndfile1, FFmpeg and libgomp1 included. Actual wheel compatibility remains unverified; pip check deliberately fails build on metadata conflicts. Ranged dependencies are not a reproducible lockfile: freeze a tested build after successful real inference.
