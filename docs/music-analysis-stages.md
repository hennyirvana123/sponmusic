# Replacement analysis pipeline: staged implementation

## Current status
Stage 1 source-separation service source code exists; no build or real inference verification. SongAnalysis v1 interface exists. Neither is connected to the existing production upload/job flow. Existing Basic Pitch, heuristic melody, harmony, UI and two-track export are untouched.

## Stage gates
1. Demucs htdemucs: validate real vocal/instrumental WAVs, original retained, no silent/fake replacement. Independent async service under services/source-separation.
2. Dedicated vocal melody: evaluate an open-source F0/voicing model such as torchcrepe on the actual separated vocals. This is a candidate, NOT installed/integrated. Confirm license, version, runtime and note-segmentation accuracy. Never call pitch tracking alone an arrangement model. Preserve unvoiced rests and original pitch; fail if no reliable voiced content. Instrumental-only songs need an explicit alternate melody strategy, not silent full-mix fallback.
3. Harmony/beat/structure: select and verify independently. Harmony must analyze instrumental/original, not force melody notes into triads. Beat/downbeat confidence separate; time signature unknown when unsupported. Repeated sections can receive similarity groups; do not assert verse/chorus labels without evidence. No concrete chord/structure model is verified yet.
4. Arrange SongAnalysis into two piano tracks. Consume melody as primary source, chord intervals and real beat grid. Keep low-confidence material sparse; no invented analysis. Existing output names/API remain at migration time.
5. Connect the new pipeline only after real regression/listening tests. Do not replace working production while stages 2–4 are absent.

## Representation
server/utils/song-analysis.ts is the seconds-based intermediate contract. Unknown confidences are null, not fabricated high numbers. Contains melody, chords, beat/downbeat grid, key, section similarity/labels, rhythm energy, model provenance and timings. Runtime schema validation is required before wiring external service responses into production.

## Tests before migration
Use the same user-provided Let Her Go excerpt at every stage. Save original, stems, analysis and final MIDI on the development test setup. Compare vocal note timing/pitch against listening/reference annotations; inspect chord changes; listen to final piano blind for recognizability. Then verify existing Studio/Falling Notes/download. No audio fixture was available or executed here. Build/typecheck and Docker inference were not run.

## Hosting
Separate ML containers, no paid API dependency. Open-source weights do not guarantee free hosting; CPU Demucs can be slow and multi-GB memory/weights must be budgeted by measurement. If Blitz lacks resources, run separation on a user-owned suitable machine or stronger self-hosted development server. Do not silently run model work in Node or return dummy results.
