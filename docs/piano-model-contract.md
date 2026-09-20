# Basic Pitch integration — SPONMUSIC

## What is implemented
Audio upload → Nitro adapter → separate Spotify Basic Pitch service → actual transcription MIDI → SPONMUSIC rule-based arrangement engine → new piano MIDI → existing Studio, falling notes, playback and download.

No dummy notes, no paid API, no custom trained model. Basic Pitch provides transcription only. Melody selection, major/minor chord inference, bass patterns, quantization and compact voicings are deterministic heuristics, NOT a learned arrangement model. Complex mixes may produce inaccurate melody/harmony. This is not guaranteed professional two-hand sheet music.

## Service deployment
`services/basic-pitch/` contains a Dockerfile, Python dependency requirements and FastAPI application. Deploy this directory as the Docker build context on your own Python-capable server. Container listens on port 8000 with one worker. Model loads at startup; GET /health reports readiness. Build/dependency resolution and inference have NOT been executed in this environment. Validate on your target Linux server before use. Basic Pitch 0.4.0 is pinned; inspect upstream model/package licensing before distribution.

Set server environment `NITRO_PIANO_MODEL_URL` to the deployed service's full `/transcribe` endpoint via your deployment settings; then restart/redeploy Nitro. No URL is preconfigured. Keep the service private behind an authenticated gateway/network. Open-source software is free to use subject to its license; hosting still uses your own compute resources.

## API
GET /api/piano/status reports configuration only, not model health.
POST /api/piano/arrange accepts raw audio/mpeg or audio/wav, maximum 20 MB. No model configured: 503, no output. Model failure: 502. Success: new arrangement as audio/midi.

Adapter sends multipart POST to configured URL:
- audio: uploaded MP3/WAV
- task: transcription

Service returns Standard MIDI File bytes plus optional X-Estimated-BPM header (40–240). It runs Basic Pitch predict on decoded real waveform. Silence, decode failure, no notes and invalid sizes are rejected, not replaced with a melody. Librosa estimates tempo; when no tempo is detected the time grid uses 120 BPM, without inventing transcription notes.

Service limit: 60 seconds of audio, 20 MB, one inference at a time. Nitro timeout: 120 seconds. CPU inference may exceed this: use appropriately provisioned hardware or implement a durable queue later. Cancelling the browser request does not guarantee already-running Python inference stops. Uploaded temporary files are removed at request completion. No durable queue or result store.

## Arrangement engine
server/utils/piano-arrangement.ts validates transcription, quantizes to 1/16 grid, extracts monophonic upper melody with continuity scoring, infers per-bar major/minor chords from duration-weighted pitch classes, chooses compact inversions, and alternates bass with chord accompaniment. Output has three piano tracks. Melody is octave-folded into C4–C6; accompaniment uses lower registers. Rhythm uses a 4/4 grid. This intentionally simplifies the transcription rather than copying every instrument. Empty bars stay silent.

Studio opens AI output at original generated pitch (no +12 import shift). Download returns the newly arranged MIDI, not the raw Basic Pitch MIDI.

## Required verification on real server
1. Build container and wait for /health ready.
2. Upload a permitted short solo recording; verify actual model inference and MIDI output.
3. Try polyphonic audio and compare melody/chords manually.
4. Verify silence rejection, corrupt audio, >60 seconds, size limits, busy, timeout, and unreachable model.
5. Confirm MIDI has melody/chord/bass tracks, opens in Studio, plays, and produces falling notes.

Before public exposure add gateway authentication, upload/time limits and distributed abuse/concurrency controls. The single-process busy guard is not global protection. YouTube is not implemented.
