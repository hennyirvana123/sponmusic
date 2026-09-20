# Stage 1 — source separation (not connected to production)

Demucs 4.0.1 / htdemucs performs actual learned source separation. No EQ stems or fabricated audio. Model weights download at startup; network access and disk cache required. Model output has no calibrated confidence: API reports null.

Docker build context: services/source-separation. The Dockerfile uses Python 3.10 and supplies uvicorn startup on PORT (default 8000), one worker. SEPARATION_DEVICE defaults to cpu. CUDA requires a compatible GPU host/container runtime; this image does not provision a GPU. Do not assume small/free Blitz instances have sufficient RAM or inference time. Dependencies/image have NOT been built or tested here.

Use service /docs for independent testing:
1. GET /health, confirm weights loaded (not proof of inference).
2. POST /separate with multipart field audio: permitted MP3/WAV, <=20 MB and 60 seconds. Decode validation runs inside job.
3. Poll GET /separate/{job_id} until completed or failed.
4. Download /separate/{job_id}/vocals, /instrumental and /original. Listen to both stems and compare alignment/duration. Original is decoded stereo WAV, not altered by separation. Instrumental sums the model's non-vocal stems. No pitch/time shift is applied.

Limits: four queued jobs, twelve retained jobs, one active inference. Files expire ~30 minutes after completion. RAM queue and temporary disk only. Restart loses jobs. Graceful shutdown waits for pending inference; forced platform termination is needed for hung inference and may leave temp files until container replacement. Add gateway access, request-size and abuse protection before any public exposure. Multipart parser may spool input before application limit checks. Do not point existing Basic Pitch URL at this service: contract is different.

Let Her Go validation: upload the exact same permitted test excerpt. Compare vocals with original for missed syllables, instrument leakage, and octave/pitch artifacts; compare instrumental for harmonic content and alignment. Do not continue to claim melody accuracy from health or numerical statistics alone.

Next gate: successful real deployment/test on separate development hardware, then a dedicated melody service. Production SPONMUSIC remains unchanged.

## Stage 1 Verification

`verify.py` is an independent Python verifier. Its arguments are `--url` (running service origin), `--audio` (existing user-supplied MP3/WAV), `--output` (download directory), and optional `--timeout` (polling deadline, default 1800 seconds). Run it with a Python runtime containing numpy and soundfile, with ffprobe available on PATH; those dependencies are already in the service Docker environment. For container-based verification, mount the script and input/output directories into an instance of the built service image and select Python with verify.py as its entrypoint. Use the reachable service origin, not the verifier container's localhost unless sharing its network.

The verifier checks health and diagnostics, submits multipart audio, polls one job, downloads all three WAVs, inspects decoded samples, duration/sample-rate/channel alignment, SHA-256 and duplicate decoded audio. Output is one JSON report on stdout and exit status 0 only for verified output. Downloaded files remain under output/job_id for listening; server expiry does not delete these copies.

Missing audio reports TEST_AUDIO_MISSING before network or inference. Missing model reports MODEL_LOAD_FAILED through diagnostics. Caught memory allocation exceptions report RESOURCE_FAILURE. An unreachable/OOM-killed container cannot report its cause: verifier returns SERVICE_UNREACHABLE rather than falsely asserting resource failure. Check container termination/OOM logs separately. Timeouts do not prove CPU/RAM exhaustion. Hardware utilization is not measured.

Diagnostics never exposes environment values, credentials or filesystem locations. SHA differences are not mathematical proof of source separation: actual model invocation is established by source inspection plus reported provenance, and sonic quality needs listening. The verifier rejects silent stems for review even though truly instrumental input may legitimately have no vocals. No test audio is bundled, and no verification run has been performed in this environment.
