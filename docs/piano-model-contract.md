# AI Piano Arrangement — external model contract

No transcription model is bundled or connected. No paid provider is used. The adapter does not fabricate MIDI.

## Browser API
- GET /api/piano/status: configured, status, message, maxBytes, formats. Configured does not mean healthy.
- POST /api/piano/arrange: raw MP3 or WAV body; Content-Type audio/mpeg or audio/wav. Max 20 MB, checked while streaming. Basic signature validation is not full decoding; the external model must decode and validate duration/content.
- Success: binary Standard MIDI File, audio/midi, max 2 MB.
- Errors: JSON {message, code}; 400 missing audio, 403 origin, 413 size, 415 format, 429 busy, 503 MODEL_NOT_CONFIGURED, 502 model failure/timeout.

## External adapter
Configure NITRO_PIANO_MODEL_URL in the server deployment environment to the full POST endpoint of your separately deployed open-source model. Redeploy/restart server after configuration. No browser-provided endpoint URLs accepted. Redirects disabled. Keep the model endpoint private to your infrastructure.

SPONMUSIC sends multipart/form-data:
- audio: MP3/WAV file (generic name)
- task: piano-arrangement

The service must perform real transcription/arrangement and return MIDI bytes (MThd header), with piano tracks, original pitches, and tempo metadata. Return non-2xx when unavailable/failed. Changing task semantics or provider protocol belongs in server/utils/piano-model.ts. SPONMUSIC cannot infer whether a model performs transcription only or true arrangement: document your model's actual capabilities.

## Lifecycle and limits
Synchronous request, 120-second model timeout; no database, job polling or durable uploads. Audio buffered in memory, not written to disk by this backend. One request per server process; not a distributed rate limit. Results live in browser memory until opened in studio or downloaded. Cancel aborts the browser request; external service must implement disconnect cancellation to stop compute. Uploaded audio is sent to external model only when configured. Model storage policies are separate.

Before public deployment add authentication/abuse protection at gateway, request timeouts, a global concurrency quota, and reverse-proxy upload size limits. Large/slow models need a durable job queue and status/result endpoints in a later phase. Do not expose this unauthenticated foundation to unrestricted expensive workloads.

## Manual checks
1. With no model configured, upload valid MP3/WAV: expect 503 and explicit unavailable message, no MIDI.
2. Invalid file signature or >20 MB: reject without invoking model.
3. Connect actual model: response MIDI opens studio without the regular +12 import transpose; preview audio, piano roll and falling notes use existing studio.
4. Verify download, cancel, model failure, malformed MIDI and timeout.

YouTube support is intentionally absent. No model training or billing integration is implemented.
