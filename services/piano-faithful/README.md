# Piano faithful CPU experiment

Independent service: existing Basic Pitch/full-mix code and endpoints are unchanged.

## Deployment

Build context services/piano-faithful; Dockerfile within that directory. One worker, CPU, PORT defaults to 8000. Set PIANO_FAITHFUL_URL on the SponMusic backend to this experiment service origin (not /transcribe). No change to BASIC_PITCH_URL or SOURCE_SEPARATION_URL.

Open /experiments/piano-faithful on SponMusic. Submit the same permitted 23-second piano excerpt. Download raw/cleaned MIDI and open the result in Studio using the provided button (zero pitch shift). Basic Pitch comparison remains at its existing endpoint/UI.

The adapter uses piano-transcription-inference==0.0.5 and upstream PianoTranscription(device='cpu', checkpoint_path=None), which delegates default checkpoint retrieval to upstream. Optional PIANO_AMT_CHECKPOINT points to an already provisioned checkpoint; no checkpoint URL/hash is fabricated. Upstream project: https://github.com/qiuqiangkong/piano_transcription_inference . Runtime internet and writable home are needed for automatic retrieval. A writable home/cache can be persisted if supported. Check the actual upstream cache location before mounting storage.

Pinned direct dependencies are a candidate compatibility set, NOT a fully resolved lockfile. No package installation, upstream source inspection, checkpoint download, Docker build, or inference was executable in the authoring session. In particular, availability of the pinned release and compatibility of its constructor/return/export contract still require external verification. Do not treat this as a verified deployable image until build and inference pass. Dependency/build conflicts must stop the experiment rather than modifying Basic Pitch production.

## Contract

POST /transcribe multipart audio plus task=piano_faithful returns 202 job_id. GET /transcribe/{job_id} polls queued/processing/completed/failed with diagnostics. GET /transcribe/{job_id}/download/raw or /cleaned returns the original model MIDI or validated copy. GET /health reports liveness and lazy model-load state, not inference quality.

Model load occurs on the first queued job, so failed checkpoint downloads appear as failed jobs. Lazy model import errors are classified as DEPENDENCY_IMPORT_FAILED; server traceback identifies the underlying exception. Missing core service dependencies can prevent service startup instead. Model notes/velocities/CC64 are preserved byte-for-byte. Cleanup is validation only; A and B intentionally identical at this stage. No quantization, velocity filtering, chord synthesis, or pianoArrangement call.

UI note import does not preserve velocity/CC64 in its project representation, and Studio playback does not apply them. Original downloaded MIDI retains them. Assess timing/pitch visually but assess pedal/dynamics in a MIDI player supporting CC64. This experiment does not claim to upgrade the Studio playback engine.

## Limits and tests

20 MB, .25–60 seconds; queue capacity 2, retained jobs 8; one inference at a time. Input/decoded audio removed after completion/failure; result expiry approximately 30 minutes. Restart loses results. A hung inference requires container termination; graceful shutdown waits for work. Browser wait deadline is one hour and does not terminate remote inference. Protect public deployments with gateway request/concurrency limits and appropriate access controls.

Docker includes py_compile and unittest contract checks (no dummy audio or synthetic model inference). These tests check route registration and lazy loading only, not model availability or transcription accuracy. No tests were run during authoring. Required acceptance: build/pip check, first real-audio model load/inference, note count/CC64 counts, raw=cleaned hash comparison, MIDI import, peak memory/CPU/latency, listening versus Basic Pitch baseline. No success or quality claim before those checks.
