import { Midi } from '@tonejs/midi';
import { refineMelody } from './melody-continuity';
export type Note = { pitch:number; start:number; end:number; velocity:number; confidence:number };
type Key = { root:number; minor:boolean; confidence:number; scale:number[] };
type Chord = { root:number; pcs:number[]; score:number };
type Bar = { start:number; end:number; chord:Chord|null };
const pc=(n:number)=>(n%12+12)%12;
const overlap=(n:Note,a:number,b:number)=>Math.max(0,Math.min(n.end,b)-Math.max(n.start,a));
const note=(pitch:number,start:number,end:number,velocity:number):Note=>({pitch,start,end,velocity,confidence:1});

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
export function generateChordCandidates(notes:Note[],melody:Note[],key:Key,start:number,end:number):Chord[]{
 const weights=Array(12).fill(0);let sum=0;for(const n of notes){const w=overlap(n,start,end)*n.confidence*n.velocity;weights[pc(n.pitch)]+=w;sum+=w;}if(sum<.12)return [];
 const candidates:Chord[]=[];for(let root=0;root<12;root++)for(const third of [3,4])for(const fifth of [7,6]){if(fifth===6&&third!==3)continue;const pcs=[root,pc(root+third),pc(root+fifth)];const outside=pcs.filter(p=>!key.scale.includes(p)).length;if(key.confidence>.04&&outside>0)continue;if(key.confidence<=.04&&fifth===6)continue;
 let score=pcs.reduce((s,p)=>s+weights[p],0)/sum-outside*.2;
 for(const n of melody){const duration=overlap(n,start,end);if(!duration)continue;const strong=Math.abs(n.start-Math.round(n.start/2)*2)<.13&&n.end-n.start>=.5;score+=(pcs.includes(pc(n.pitch))?.25:strong?-.55:-.03)*Math.min(duration,2);}
 const low=notes.filter(n=>n.pitch<55&&overlap(n,start,end)>0);score+=low.some(n=>pc(n.pitch)===root)?.2:0;candidates.push({root,pcs,score});}
 return candidates.sort((a,b)=>b.score-a.score).slice(0,8);
}
export function optimizeChordProgression(notes:Note[],melody:Note[],key:Key,total:number):Bar[]{
 const bars:Bar[]=[];type State={score:number;chord:Chord|null;prev:number};const layers:State[][]=[];
 for(let start=0;start<total;start+=4){const candidates=generateChordCandidates(notes,melody,key,start,Math.min(total,start+4));const choices:(Chord|null)[]=[null,...candidates];const previous=layers[layers.length-1];const layer=choices.map(chord=>{const emission=chord?chord.score:(candidates.length?.05:0);if(!previous)return {score:emission,chord,prev:-1};let best=-Infinity,index=0;previous.forEach((p,i)=>{let transition=0;if(p.chord&&chord){const movement=pc(chord.root-p.chord.root);transition=movement===0?.3:[5,7].includes(movement)?.2:-.15;transition+=p.chord.pcs.filter(x=>chord.pcs.includes(x)).length*.08;}const score=p.score+emission+transition;if(score>best){best=score;index=i;}});return {score:best,chord,prev:index};});layers.push(layer);bars.push({start,end:Math.min(total,start+4),chord:null});}
 let index=layers[layers.length-1].reduce((best,s,i,a)=>s.score>a[best].score?i:best,0);for(let i=layers.length-1;i>=0;i--){bars[i].chord=layers[i][index].chord;index=layers[i][index].prev;}return bars;
}
export function createVoicing(chord:Chord,previous:number[],ceiling:number):number[]{
 let best:number[]=[];let cost=Infinity;for(let low=43;low<=57;low++){if(!chord.pcs.includes(pc(low)))continue;const v=[low];for(let p=low+1;p<=low+12;p++)if(chord.pcs.includes(pc(p))&&!v.some(x=>pc(x)===pc(p)))v.push(p);if(v.length!==3||v[2]>=ceiling||v[2]>64)continue;const c=v.reduce((s,p,i)=>s+Math.abs(p-(previous[i]??[48,52,55][i])),0);if(c<cost){cost=c;best=v;}}return best;
}
export function generateBass(chord:Chord,start:number,end:number,voicing:number[],active:boolean):Note[]{
 if(!voicing.length)return [];let root=36+chord.root;while(root>voicing[0])root-=12;if(root<28)return [];const out=[note(root,start,Math.min(end,start+1),.5)];if(active&&end-start>2){const fifth=root+7;if(fifth<=voicing[0])out.push(note(fifth,start+2,Math.min(end,start+3),.45));else out.push(note(root,start+2,Math.min(end,start+3),.45));}return out;
}
export function generateAccompaniment(bars:Bar[],melody:Note[],bpm:number){const chords:Note[]=[];const bass:Note[]=[];let previous:number[]=[];
 for(const bar of bars){if(!bar.chord)continue;const phrase=melody.filter(n=>overlap(n,bar.start,bar.end)>0);const ceiling=phrase.reduce((v,n)=>Math.min(v,n.pitch),76)-2;const v=createVoicing(bar.chord,previous,ceiling);if(!v.length)continue;previous=v;const density=phrase.length;const sustained=density>=5||bpm>150;const quiet=density<=1;const pattern=sustained?'sustain':quiet?'broken':bar.start%8===0?'block':'alternate';
 if(pattern==='sustain'){for(const p of v)chords.push(note(p,bar.start,bar.end,.32));}
 else if(pattern==='block'){for(const time of [bar.start,bar.start+2])if(time<bar.end)for(const p of v)chords.push(note(p,time,Math.min(bar.end,time+1.8),.38));}
 else if(pattern==='broken'){const sequence=[0,1,2,1];for(let i=0;i<4;i++){const time=bar.start+i;if(time<bar.end)chords.push(note(v[sequence[i]],time,Math.min(bar.end,time+.85),.36));}}
 else{for(const time of [bar.start+1,bar.start+3])if(time<bar.end)for(const p of v)chords.push(note(p,time,Math.min(bar.end,time+.85),.38));}
 bass.push(...generateBass(bar.chord,bar.start,bar.end,v,pattern==='alternate'||pattern==='broken'));
 }return {chords,bass};}
export function validateArrangement(melody:Note[],chords:Note[],bass:Note[]):Note[][]{
 const result:Note[][]=[[],[],[]];const accepted:{n:Note;track:number}[]=[];
 // Melody has priority. Lower parts are omitted if they collide or exceed a hand span.
 for(const [track,notes] of [melody,chords,bass].entries())for(const n of [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
 if(!Number.isFinite(n.start)||!Number.isFinite(n.end)||n.start<0||n.end<=n.start||!Number.isInteger(n.pitch)||n.pitch<21||n.pitch>108)throw Error('Invalid arrangement note');
 const concurrent=accepted.filter(a=>overlap(a.n,n.start,n.end)>0);if(concurrent.some(a=>a.n.pitch===n.pitch))continue;
 const moments=[n.start,...concurrent.map(a=>Math.max(n.start,a.n.start))];let safe=true;for(const t of moments){const active=concurrent.filter(a=>a.n.start<=t&&a.n.end>t);if(active.length>=5){safe=false;break;}const left=[...(track>0?[n.pitch]:[]),...active.filter(a=>a.track>0).map(a=>a.n.pitch)];if(left.length&&Math.max(...left)-Math.min(...left)>12){safe=false;break;}if(track>0&&active.some(a=>a.track===0&&n.pitch>=a.n.pitch)){safe=false;break;}}
 if(safe){accepted.push({n,track});result[track].push(n);}
 }return result;
}
export function pianoArrangement(bytes:Uint8Array,estimatedBpm?:number):Uint8Array{
 const source=new Midi(bytes);const bpm=estimatedBpm??source.header.tempos[0]?.bpm??120;if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('Invalid tempo');
 const beat=60/bpm;const input=source.tracks.flatMap(t=>t.notes.map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:0})));
 if(!input.length||input.length>30000||input.some(n=>!Number.isFinite(n.start)||!Number.isFinite(n.end)||n.start<0||n.end<=n.start||n.end>1024||!Number.isFinite(n.velocity)||!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127))throw Error('Invalid or oversized transcription');
 const cleaned=cleanNotes(input);if(!cleaned.length)throw Error('No reliable notes after cleanup');const key=detectKey(cleaned);const melody=extractMelody(cleaned);if(!melody.length)throw Error('No reliable melody; arrangement not generated');
 const total=Math.max(...cleaned.map(n=>n.end));const bars=optimizeChordProgression(cleaned,melody,key,total);const {chords,bass}=generateAccompaniment(bars,melody,bpm);const tracks=validateArrangement(melody,chords,bass);
 const midi=new Midi();midi.header.setTempo(bpm);['Melody · right hand','Chord accompaniment','Bass · left hand'].forEach((name,i)=>{const track=midi.addTrack();track.name=name;track.instrument.number=0;for(const n of tracks[i])track.addNote({midi:n.pitch,time:n.start*beat,duration:(n.end-n.start)*beat,velocity:Math.max(.1,Math.min(.9,n.velocity))});});return midi.toArray();
}
