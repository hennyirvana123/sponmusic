import pkg from '@tonejs/midi';
import { refineMelody } from './melody-continuity';
import { optimizeChordProgression, generateAccompaniment, controlDensity } from './piano-harmony';
const { Midi } = pkg;
export { generateChordCandidates, optimizeChordProgression, createVoicing, generateAccompaniment } from './piano-harmony';
export type Note = { pitch:number; start:number; end:number; velocity:number; confidence:number };
type Key = { root:number; minor:boolean; confidence:number; scale:number[] };
const pc=(n:number)=>(n%12+12)%12;
const overlap=(n:Note,a:number,b:number)=>Math.max(0,Math.min(n.end,b)-Math.max(n.start,a));

export function cleanNotes(input:Note[]):Note[]{
 const sorted=input.filter(n=>n.end-n.start>=.08&&n.velocity>=.08).sort((a,b)=>a.pitch-b.pitch||a.start-b.start);
 const merged:Note[]=[];
 for(const n of sorted){const last=merged[merged.length-1];if(last&&last.pitch===n.pitch&&Math.abs(last.start-n.start)<.12){last.end=Math.max(last.end,n.end);last.velocity=Math.max(last.velocity,n.velocity);}else{if(last&&last.pitch===n.pitch&&last.end>n.start)last.end=n.start;merged.push({...n});}}
 const byPitch=new Map<number,Note[]>();for(const n of merged){const list=byPitch.get(n.pitch)||[];list.push(n);byPitch.set(n.pitch,list);}
 return merged.map(n=>{const continuity=[-2,-1,0,1,2].some(d=>(byPitch.get(n.pitch+d)||[]).some(x=>x!==n&&Math.abs(x.start-n.end)<.6));return {...n,confidence:.5*n.velocity+.3*Math.min(1,(n.end-n.start)/.75)+(continuity?.2:0)};}).filter(n=>n.end>n.start&&(n.end-n.start>=.2||n.confidence>=.5)).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
export function detectKey(notes:Note[]):Key{
 const histogram=Array(12).fill(0);for(const n of notes)histogram[pc(n.pitch)]+=Math.min(4,n.end-n.start)*n.velocity*n.confidence;
 const profiles=[[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17]];
 const scores: {root:number;minor:boolean;score:number}[]=[];
 for(let root=0;root<12;root++)for(let mode=0;mode<2;mode++){const p=profiles[mode];const mean=p.reduce((a,b)=>a+b)/12;const norm=Math.sqrt(p.reduce((a,b)=>a+(b-mean)**2,0));scores.push({root,minor:!!mode,score:histogram.reduce((s,w,i)=>s+w*(p[pc(i-root)]-mean)/norm,0)});}
 scores.sort((a,b)=>b.score-a.score);const best=scores[0];const confidence=Math.max(0,(best.score-scores[1].score)/(Math.abs(best.score)||1));return {...best,confidence,scale:(best.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11]).map(n=>pc(n+best.root))};
}
export function extractMelody(notes:Note[]):Note[]{
 return refineMelody(notes,detectKey(notes).scale);
}
export function validateArrangement(melody:Note[],chords:Note[]):Note[][]{
 const sparse=controlDensity(melody,chords);
 const result:Note[][]=[[],[]];const accepted:{n:Note;track:number}[]=[];
 // Melody has priority. Lower parts are omitted if they collide or exceed a hand span.
 for(const [track,notes] of [melody,sparse.chords].entries())for(const n of [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
 if(!Number.isFinite(n.start)||!Number.isFinite(n.end)||n.start<0||n.end<=n.start||!Number.isInteger(n.pitch)||n.pitch<21||n.pitch>108)throw Error('Invalid arrangement note');
 const concurrent=accepted.filter(a=>overlap(a.n,n.start,n.end)>0);if(track>0&&concurrent.some(a=>a.n.pitch===n.pitch))continue;
 const moments=[n.start,...concurrent.map(a=>Math.max(n.start,a.n.start))];let safe=true;for(const t of moments){const active=concurrent.filter(a=>a.n.start<=t&&a.n.end>t);if(active.length>=5){safe=false;break;}const left=[...(track>0?[n.pitch]:[]),...active.filter(a=>a.track>0).map(a=>a.n.pitch)];if(left.length&&Math.max(...left)-Math.min(...left)>12){safe=false;break;}if(track>0&&active.some(a=>a.track===0&&n.pitch>=a.n.pitch)){safe=false;break;}}
 if(track===0||safe){accepted.push({n,track});result[track].push(n);}
 }return result;
}
export function pianoArrangement(bytes:Uint8Array,estimatedBpm?:number):Uint8Array{
 const source=new Midi(bytes);const bpm=estimatedBpm??source.header.tempos[0]?.bpm??120;if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('Invalid tempo');
 const beat=60/bpm;const input=source.tracks.flatMap(t=>t.notes.map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:0})));
 if(!input.length||input.length>30000||input.some(n=>!Number.isFinite(n.start)||!Number.isFinite(n.end)||n.start<0||n.end<=n.start||n.end>1024||!Number.isFinite(n.velocity)||!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127))throw Error('Invalid or oversized transcription');
 const cleaned=cleanNotes(input);if(!cleaned.length)throw Error('No reliable notes after cleanup');const key=detectKey(cleaned);const melody=extractMelody(cleaned);if(!melody.length)throw Error('No reliable melody; arrangement not generated');
 const total=Math.max(...cleaned.map(n=>n.end));const bars=optimizeChordProgression(cleaned,melody,key,total);const {chords}=generateAccompaniment(bars,melody,bpm);const tracks=validateArrangement(melody,chords);
 const midi=new Midi();midi.header.setTempo(bpm);['Melody · right hand','Chord accompaniment'].forEach((name,i)=>{const track=midi.addTrack();track.name=name;track.instrument.number=0;for(const n of tracks[i])track.addNote({midi:n.pitch,time:n.start*beat,duration:(n.end-n.start)*beat,velocity:Math.max(.1,Math.min(.9,n.velocity))});});return midi.toArray();
}
