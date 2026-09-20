import pkg from '@tonejs/midi';
import { cleanNotes, detectKey, extractMelody, optimizeChordProgression, generateChordCandidates } from './piano-arrangement';
import { filterMelodyCandidates } from './melody-candidates';
const { Midi }=pkg;
const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export function arrangementDiagnostic(rawBytes:Uint8Array,finalBytes:Uint8Array){
 const raw=new Midi(rawBytes),final=new Midi(finalBytes);const bpm=final.header.tempos[0]?.bpm||120,beat=60/bpm;
 const rawNotes=raw.tracks.flatMap(t=>t.notes);const cleaned=cleanNotes(rawNotes.map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:0})));
 const key=detectKey(cleaned),selected=extractMelody(cleaned);const total=Math.max(0,...cleaned.map(n=>n.end));const progression=optimizeChordProgression(cleaned,selected,key,total);
 const melody=[...(final.tracks.find(t=>t.name==='Melody · right hand')?.notes||[])].sort((a,b)=>a.time-b.time);
 const accompaniment=final.tracks.find(t=>t.name==='Chord accompaniment')?.notes||[];
 const sequence=melody.map(n=>({pitch:n.midi,name:n.name,onsetSeconds:n.time,durationSeconds:n.duration,velocity:n.velocity}));
 const jumps=melody.slice(1).flatMap((n,i)=>Math.abs(n.midi-melody[i].midi)>=9?[{from:i,to:i+1,atSeconds:n.time,semitones:n.midi-melody[i].midi}]:[]);
 const gaps:{startSeconds:number;endSeconds:number;durationSeconds:number}[]=[];let end=0;
 for(const n of melody){if(n.time-end>=Math.max(.5,beat))gaps.push({startSeconds:end,endSeconds:n.time,durationSeconds:n.time-end});end=Math.max(end,n.time+n.duration);}if(raw.duration-end>=Math.max(.5,beat))gaps.push({startSeconds:end,endSeconds:raw.duration,durationSeconds:raw.duration-end});
 const chordName=(c:typeof progression[number]['chord'])=>{if(!c)return null;const ints=c.pcs.map(p=>(p-c.root+12)%12);return names[c.root]+(ints.includes(6)?'dim':ints.includes(3)?'m':'');};
 const melodyCandidates=filterMelodyCandidates(cleaned);
 const rejected=melodyCandidates.filter(c=>!melody.some(n=>n.midi===c.pitch&&Math.abs(n.time/beat-c.start)<.14));
 const rejectionReasons:Record<string,number>={};for(const c of rejected)for(const reason of c.rejectionReasons.length?c.rejectionReasons:['sequence-selection-or-articulation'])rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;
 const bars=progression.map((bar,i)=>{const candidates=generateChordCandidates(cleaned,selected,key,bar.start,bar.end).sort((a,b)=>b.score-a.score);const margin=candidates.length>1?candidates[0].score-candidates[1].score:null;
 const selectedChordRank=bar.chord?candidates.findIndex(c=>c.root===bar.chord!.root&&c.pcs.join(',')===bar.chord!.pcs.join(','))+1:null;
 const start=bar.start*beat,stop=bar.end*beat;const inBar=(n:{time:number;duration:number})=>n.time<stop&&n.time+n.duration>start;
 const m=melody.filter(inBar),a=accompaniment.filter(inBar);const conflicts=a.flatMap(n=>m.filter(x=>x.time<n.time+n.duration&&x.time+x.duration>n.time&&Math.abs(x.midi-n.midi)<=2).map(x=>({melodyPitch:x.midi,accompanimentPitch:n.midi,startSeconds:Math.max(x.time,n.time),endSeconds:Math.min(x.time+x.duration,n.time+n.duration)})));
 const all=[...m,...a];const times=[start,...all.map(n=>Math.max(start,n.time))];const peak=Math.max(0,...times.map(t=>all.filter(n=>n.time<=t&&n.time+n.duration>t).length));
 // Included in each ranked candidate for compatibility with the existing report shape.
 const rankedDetails={selectedChordRank,melodyCandidateCount:melodyCandidates.length,rejectedMelodyCount:rejected.length,rejectionReasons,finalMelodyPitchRange:melody.length?[Math.min(...melody.map(n=>n.midi)),Math.max(...melody.map(n=>n.midi))]:null};
 Object.assign(bar,rankedDetails);
 return {...rankedDetails,bar:i+1,startSeconds:start,endSeconds:stop,chord:chordName(bar.chord),root:bar.chord?names[bar.chord.root]:null,selectedScore:bar.chord?.score??null,topCandidateMargin:margin,weak:!bar.chord||bar.chord.score<.25,ambiguous:margin!==null&&margin<.15,alternatives:candidates.slice(0,3).map(c=>({chord:chordName(c),score:c.score})),conflicts,melodyOnsets:m.filter(n=>n.time>=start).length,accompanimentOnsets:a.filter(n=>n.time>=start).length,peakSimultaneous:peak,dense:peak>5||all.filter(n=>n.time>=start).length>16};});
 return {durationSeconds:final.duration,transcriptionDurationSeconds:raw.duration,bpm,totalTranscriptionNotes:rawNotes.length,melodyNotes:melody.length,accompanimentNotes:accompaniment.length,key:{name:names[key.root]+(key.minor?' minor':' major'),confidence:key.confidence},melodySequence:sequence,jumps,shortNotes:{thresholdSeconds:.08,transcription:rawNotes.filter(n=>n.duration<.08).map(n=>({pitch:n.midi,onsetSeconds:n.time,durationSeconds:n.duration})),finalMelody:sequence.filter(n=>n.durationSeconds<.08)},largeGaps:gaps,bars,diagnosis:{rootCause:'UNDETERMINED',candidates:[...(jumps.length||gaps.length?['B: melody extraction/continuity warrants comparison']:[]),...(bars.some(b=>b.weak||b.ambiguous)?['C: weak/ambiguous harmony evidence']:[]),...(bars.some(b=>b.conflicts.length||b.dense)?['D: accompaniment collision/density']:[])],limitations:'These flags do not prove errors. A requires reference audio/annotated melody; polyphonic transcription intervals cannot establish ground truth. Chord scores are heuristic, not probabilities. E cannot be concluded from flags alone. Short notes and rests may be intentional.'}};
}
