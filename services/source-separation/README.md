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
