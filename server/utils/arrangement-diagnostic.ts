import pkg from '@tonejs/midi';
import { cleanNotes, detectKey, extractMelody, optimizeChordProgression } from './piano-arrangement';
import { segmentMelodyPhrases, accompanimentPatternPenalty } from './melody-continuity';
const {Midi}=pkg;
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export function arrangementDiagnostic(rawBytes:Uint8Array,finalBytes:Uint8Array){
 const raw=new Midi(rawBytes),final=new Midi(finalBytes);const bpm=final.header.tempos[0]?.bpm||120,beat=60/bpm;
 const cleaned=cleanNotes(raw.tracks.flatMap(t=>t.notes).map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:0})));
 const key=detectKey(cleaned),selected=extractMelody(cleaned);const bars=optimizeChordProgression(cleaned,selected,key,Math.max(0,...cleaned.map(n=>n.end)));
 const melody=final.tracks.find(t=>t.name==='Melody · right hand')?.notes||[],chords=final.tracks.find(t=>t.name==='Chord accompaniment')?.notes||[];
 const notes=melody.map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:cleaned.find(c=>c.pitch===n.midi&&Math.abs(c.start-n.time/beat)<.03)?.confidence??0})).sort((a,b)=>a.start-b.start);
 const phrases=segmentMelodyPhrases(notes);
 return {phraseCount:phrases.length,selectedMelodyNoteCount:notes.length,finalMelodyPitchRange:notes.length?[Math.min(...notes.map(n=>n.pitch)),Math.max(...notes.map(n=>n.pitch))]:null,
 largeJumpCount:notes.slice(1).filter((n,i)=>Math.abs(n.pitch-notes[i].pitch)>=9).length,shortNoteCount:melody.filter(n=>n.duration<.08).length,
 accompanimentPatternPenaltyCount:notes.filter((n,i)=>accompanimentPatternPenalty(notes.slice(Math.max(0,i-7),i),n,cleaned)>.2).length,
 melodyAccompanimentConflictCount:chords.filter(c=>melody.some(m=>m.time<c.time+c.duration&&c.time<m.time+m.duration&&Math.abs(m.midi-c.midi)<=2)).length,
 averageSelectedCandidateConfidence:notes.length?notes.reduce((s,n)=>s+n.confidence,0)/notes.length:0,first20SelectedMelodyPitches:notes.slice(0,20).map(n=>n.pitch),
 phrases:phrases.map(p=>({startSeconds:p.start*beat,endSeconds:p.end*beat,noteCount:p.notes.length,representativeNotes:Array.from({length:Math.min(10,p.notes.length)},(_,i)=>p.notes[Math.floor(i*(p.notes.length-1)/Math.max(1,Math.min(10,p.notes.length)-1))]).map(n=>({pitch:n.pitch,startSeconds:n.start*beat,durationSeconds:(n.end-n.start)*beat}))})),
 selectedChordProgression:bars.map((b,i)=>({bar:i+1,chord:b.chord?names[b.chord.root]+(b.chord.pcs.includes((b.chord.root+3)%12)?'m':''):null})),
 caveat:'Phrase boundaries and accompaniment flags are heuristics, not verified vocal annotations. Confidence is not a calibrated probability. No ground-truth song recognition was performed.'};
}
