# Piano faithful CPU experiment

Independent service: existing Basic Pitch/full-mix code and endpoints are unchanged.

## Deployment

Build context: services/piano-faithful  
Dockerfile: Dockerfile within that directory  
One worker, CPU, PORT defaults to 8000.

Set `PIANO_FAITHFUL_URL` on the SponMusic backend to this experiment service origin (not `/transcribe`).

Open `/experiments/piano-faithful` on SponMusic.

Submit the same permitted 23-second piano excerpt and compare the result with Basic Pitch.

## Model

This experiment uses:

`piano-transcription-inference==0.0.5`

The upstream `PianoTranscription` model is used directly on CPU.

No Demucs, pYIN, chord generation, piano arrangement, quantization, velocity filtering, or aggressive MIDI cleanup is applied.

The model's MIDI output is preserved as faithfully as possible.

## Contract

POST `/transcribe`

Multipart upload:

- `audio`
- `task=piano_faithful`

Returns a `job_id`.

GET `/transcribe/{job_id}`

Polls the job status.

GET `/transcribe/{job_id}/download/raw`

Downloads the raw model MIDI.

GET `/transcribe/{job_id}/download/cleaned`

Downloads the validated copy.

GET `/health`

Reports service health and whether the model has been loaded.

## Limits

- Maximum upload: 20 MB
- Audio duration: 0.25–60 seconds
- Queue capacity: 2
- Maximum retained jobs: 8
- CPU inference
- One inference worker

Results expire after approximately 30 minutes.

## Important

This is an experimental transcription service.

The service must be successfully built and tested with real audio before being considered reliable.

No fallback MIDI is generated if the model fails.

Existing Basic Pitch and source-separation services are not modified by this experiment.

## Upstream project

https://github.com/qiuqiangkong/piano_transcription_inference
