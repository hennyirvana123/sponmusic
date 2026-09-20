# Async contract (supersedes synchronous README/API descriptions)

POST /transcribe now returns HTTP 202 JSON {job_id,status:queued}, NOT MIDI. Same multipart audio/task fields. Size and signature checked before enqueue; decoding, silence and duration checks run in background and report failed status. Limit 20 MB / 60 seconds unchanged.
GET /transcribe/{id}: queued, processing, completed with relative download_url, or failed with error.
GET /transcribe/{id}/download: MIDI only after completion; otherwise 409; unknown/expired 404. Filename transcription.mid, audio/midi, X-Estimated-BPM preserved.
GET /health: same shape, busy reflects active job. /docs documents new endpoints.

One asyncio worker invokes the unchanged chunked.py through a background thread. No parallel inference. Queue: 8 pending, total retained jobs: 64, overload: 429. Input/temp files deleted after worker completion/failure. Successful MIDI stays in RAM, never partial; jobs expire 30 minutes after completion/failure, reaped every minute. Active/queued jobs do not expire while processing. Restart loses jobs, and forced termination may leave temporary disk files until container replacement. Graceful shutdown waits for active inference; no hard inference timeout.

Docker remains one uvicorn worker, 0.0.0.0 and PORT. Added pipeline.py to image. No Redis/database/provider or deployment action. Use single instance; multiple replicas cannot share job IDs. Upload can still hit gateway limits; inference no longer holds upload HTTP open. Multipart spools before validation; gateway abuse protection still recommended.

SPONMUSIC now uses /api/piano/jobs/submit, /api/piano/jobs/{id}, /api/piano/jobs/{id}/download proxies. Browser polls every 3 seconds, shows status, downloads only after completed. Each proxy request has a 45-second timeout; no server request polls/waits for inference. Download applies existing SPONMUSIC arrangement engine. Cancel stops browser polling, not server work. Refresh loses browser job state. Legacy synchronous /api/piano/arrange is not used by the UI and is not compatible with this new service contract; clients must migrate.

NITRO_PIANO_MODEL_URL remains the full service /transcribe URL (base domain also accepted by new proxy). Neither service deployed nor real inference tested here.

Tests: test_jobs.py uses unittest/TestClient with injected test processor to cover health, queue, busy, status, success download, failure and unknown ID. requirements-test.txt includes httpx. These are API lifecycle tests, not real inference tests. The test-only MIDI fixture never enters production. Tests not executed in this environment. Verify deployed service separately with permitted 8/30/60-second audio and inspect complete MIDI.
