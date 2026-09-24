# AI Transcribe V2 (experimental)

Independent YourMT3 via MT3-Infer service. V1, /ai-arrangement, piano-faithful, source separation, frontend and production proxy are untouched. No frontend integration. Model output is saved directly: no quantization, filtering, merging, transposition, arrangement or velocity changes. Mido parses the saved MIDI for counts only.

## Verification status

Implementation follows the public API supplied by the user. Authoring environment cannot install Python packages, access upstream documentation or execute Docker/tests. Actual installed MT3-Infer/Torch versions, Python patch version, dependency compatibility, audio-loader shape, checkpoint availability and inference are NOT verified. Dependencies are intentionally not assigned invented version pins. Capture resolved versions and pin them after a successful external build. No dependency error has been observed because installation has not run.

Docker build explicitly checks pip dependencies, imports the supplied MT3-Infer public API, prints MT3-Infer/Torch versions, compiles source and runs contract tests. It does not call load_model or download weights. A failing import/install must stop the build; do not replace the model.

## Local setup (Python 3.11)

From repository root:

```sh
python3.11 -m venv .venv-mt3
. .venv-mt3/bin/activate
pip install -r services/ai-transcribe-v2/requirements.txt
export MT3_DEVICE=cpu
export MT3_CHECKPOINT_DIR="$HOME/.cache/sponmusic-mt3"
python -m uvicorn app:app --app-dir services/ai-transcribe-v2 --host 0.0.0.0 --port 8000 --workers 1
```

Install FFmpeg on the host. On Windows activate the virtual environment and set these variables using the equivalent shell syntax. CPU is default. MT3_DEVICE=cuda requests CUDA and falls back to CPU only when CUDA is unavailable; an invalid device fails startup.

## Docker

From repository root:

```sh
docker build -t sponmusic-ai-transcribe-v2 -f services/ai-transcribe-v2/Dockerfile services/ai-transcribe-v2
docker run --rm --name ai-transcribe-v2 -p 8000:8000 -e MT3_DEVICE=cpu -e MT3_CHECKPOINT_DIR=/models/mt3 -v sponmusic-mt3-models:/models/mt3 sponmusic-ai-transcribe-v2
```

Python image: 3.11-slim-bookworm (patch not pinned). Model checkpoints download automatically on first use using MT3-Infer. MT3_CHECKPOINT_DIR defaults to /models/mt3. The container runs non-root: bind-mounted directories must be writable by worker. Weights must not be committed. Runtime network is needed for first-use downloads; persisted cache can avoid repeated downloads. CPU inference can be significantly slower than GPU.

## HTTP

```sh
curl http://localhost:8000/health
curl -X POST http://localhost:8000/transcribe -F 'file=@/path/to/audio.wav'
curl http://localhost:8000/jobs/JOB_ID
curl -o yourmt3-raw.mid http://localhost:8000/jobs/JOB_ID/midi
```

Extensions: mp3, wav, m4a, flac, ogg. Extension validation is not decode validation: malformed content becomes a failed job. Upload field is file. Upload limit 100 MB. Accepted jobs return 202 immediately after upload, not after inference. Progress numbers are stage markers only: queued=0, loading_audio=10, loading_model=20, transcribing=50, saving_midi=90, completed=100. They are not measured inference percentages. Failed jobs retain last reached stage/progress; tracebacks appear in server logs and public errors expose stage/type without filesystem/secret details.

One active job, four queued jobs, twelve retained jobs. Inputs are deleted after success/failure. Raw MIDI remains downloadable for approximately 30 minutes, then expires. Restart loses jobs. No second model/fake MIDI fallback. Health liveness does not imply loaded model or successful inference.

Long audio uses jobs but is still loaded by the upstream loader; memory limits and model segmentation must be tested on real audio. No invented custom chunking. Inference has no forced timeout; graceful shutdown waits for running work and a stuck native call may require container termination. Configure gateway upload/concurrency/access limits before exposing publicly. Multipart parsing may spool before application size validation.

## Contract tests

```sh
cd services/ai-transcribe-v2
python -m unittest test_contract
```

httpx is used by FastAPI TestClient; mido is used for read-only MIDI statistics and a clearly isolated test fixture. Tests inject a model-free adapter: their tiny MIDI is solely a transport fixture, never a real transcription or a production fallback. No real audio/model is used. Tests check health, validation, jobs, missing IDs, download, route isolation, and production-tree immutability during test execution when that tree is available. They cannot prove a Git diff is production-free; review changed paths separately. Docker omits production files, so that filesystem check is skipped there.

Real acceptance still requires first checkpoint load, real audio inference, output tracks/notes/programs inspection, memory/latency measurement and listening. No quality or runtime success claim is made.
