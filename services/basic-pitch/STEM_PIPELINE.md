# CPU stem-aware transcription

Source changes only; Docker build, remote health, inference, resource use and listening have NOT been verified in this session.

## Deployment

Rebuild the Basic Pitch service using its Dockerfile. Keep BASIC_PITCH_URL pointing to that service. Set SOURCE_SEPARATION_URL on the Basic Pitch service to the actual separate Demucs service origin assigned by the deployment platform, WITHOUT /separate or /diagnostics. The actual hostname is not yet known. https://spontion.blitz.cloud/ is the main SponMusic application, NOT the Demucs service; do not use it here. Do not set this variable on the browser. Leaving it unset preserves full-mix transcription. When configured, separation failures are reported, not silently replaced by full-mix transcription.

### HTTP contract (verified against source, not runtime)

- GET /health: liveness and model readiness.
- GET /diagnostics: client requires engine=demucs, model=htdemucs and modelAvailable=true before upload.
- POST /separate: multipart/form-data with file field audio; MP3/WAV, maximum 20 MB, decoded duration 0.25–60 seconds. Returns HTTP 202 JSON with job_id and status=queued, not audio or a download URL.
- GET /separate/{job_id}: poll queued/processing/completed/failed.
- GET /separate/{job_id}/{stem}: download audio/wav after completion; stem is vocals, instrumental or original.
- GET /separate/{job_id}/download/{stem}: equivalent download alias.

The Basic Pitch client sends its decoded WAV using the audio multipart field, then polls and downloads vocals/instrumental using the first download route above. It never requests the base homepage. No API authentication is implemented by either service or this client. If a deployment gateway requires authentication, the current client cannot access it without a separate integration change. Prefer private service networking where supported; do not expose an unprotected inference endpoint publicly without gateway limits.

No new Python packages. CPU pYIN uses existing librosa; Demucs runs in the separate existing service. Single transcription worker processes queued jobs sequentially. Do not run multiple Uvicorn workers with the in-memory queue.

## Processing

Validate/decode <=60 seconds, estimate tempo, submit WAV to Demucs, poll up to 1800 seconds, download and decode vocals/instrumental, check duration alignment. Analyze instrumental with existing chunked Basic Pitch and postprocessing. Analyze vocals with pYIN in eight-second ownership windows with one-second context, voiced-probability threshold .65, RMS gate, minimum note duration .09 seconds. Vocal probability is a voicing estimate, not calibrated transcription confidence.

MIDI contains named vocal, instrumental harmony, and low-register candidate tracks, all program 0. Bass candidates are instrumental notes below MIDI 48, NOT an independently isolated bass stem. Arrangement uses the named vocal track as melody when present, and instrumental evidence for chord selection. Without vocal notes it uses existing instrumental melody selection. Existing hand-span/density validation remains. No forced pitch correction or fabricated melody.

## Model choice

- Basic Pitch: already deployed, small polyphonic model; retained for separated instrumental audio rather than claiming full-mix robustness.
- pYIN: CPU probabilistic monophonic F0 tracking, suited to isolated vocals, not a replacement polyphonic neural model. Can struggle with backing vocals, breaths, vibrato and leakage.
- CREPE/torchcrepe: plausible isolated-vocal alternative, but adds model/runtime cost; not benchmarked here.
- MT3/YourMT3: multi-instrument research models, potentially more appropriate to full mixes; checkpoint/runtime integration and CPU latency/memory must be measured before adopting for a 10–14 GB deployment. No claim they fit this host.
- Piano-specific transcription models: appropriate to solo piano, not automatically suitable to vocal pop mixes.

## Compatibility and known limits

No frontend files or API paths changed. Async /api/piano/jobs flow remains suitable for longer inference. The existing synchronous Download Transcribed MIDI request has a frontend timeout of 125 seconds and server timeout of 120 seconds: long CPU jobs can still time out there. This change does NOT claim to solve that limitation without changing its client request flow. Its button is retained.

No runtime improvement guarantee. Required acceptance: externally build; check both service readiness; test permitted real audio; confirm valid MIDI parse/import; compare melody note accuracy, bass/chord evidence and listening against baseline. Measure peak RAM separately for both services. Public separation service needs gateway limits. Queue data and results expire after about 30 minutes and disappear on restart.
