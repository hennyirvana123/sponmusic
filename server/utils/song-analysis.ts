// Versioned boundary for the new pipeline, not yet used by production MIDI generation.
export type Confidence = number | null;
export interface SongAnalysis {
 version: 1;
 duration: number;
 tempo: { bpm: number | null; confidence: Confidence; beats: number[]; downbeats: number[]; timeSignature: [number, number] | null };
 key: { tonic: number; mode: string; confidence: Confidence } | null;
 melody: { pitch: number; onset: number; duration: number; confidence: Confidence }[];
 chords: { root: number; quality: 'major'|'minor'|'diminished'|'sus2'|'sus4'|'dominant7'|'major7'|'minor7'|'unknown'; onset: number; duration: number; confidence: Confidence }[];
 sections: { onset: number; duration: number; similarityGroup: string; label: 'intro'|'verse'|'pre-chorus'|'chorus'|'bridge'|'outro'|'unknown'; confidence: Confidence }[];
 rhythm: { onset: number; energy: number; onsetDensity: number }[];
 warnings: string[];
 models: { stage: string; name: string; version: string; processingSeconds: number }[];
}
