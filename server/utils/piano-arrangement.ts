import pkg from '@tonejs/midi';
import { refineMelody } from './melody-continuity';
import { generateChordCandidates } from './piano-harmony';
const { Midi } = pkg;
export { generateChordCandidates, createVoicing, generateAccompaniment } from './piano-harmony';
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
 // Penalize a recurring lower ostinato only when an upper moving voice coexists.
 const contextual=notes.map(n=>{
  const window=notes.filter(x=>Math.abs(x.start-n.start)<=4);
  const repeats=window.filter(x=>x.pitch===n.pitch).sort((a,b)=>a.start-b.start);
  const spacings=repeats.slice(1).map((x,i)=>x.start-repeats[i].start);
  const regular=spacings.length>=3&&Math.max(...spacings)-Math.min(...spacings)<.2;
  const upper=window.filter(x=>x.pitch>=n.pitch+5&&x.pitch<=n.pitch+19&&x.end-x.start>=.3);
  const moving=new Set(upper.map(x=>x.pitch)).size>=3;
  const penalty=n.pitch<60&&regular&&moving?.2:0;
  return {...n,confidence:Math.max(.1,n.confidence-penalty)};
 });
 const selected=refineMelody(contextual,detectKey(notes).scale);
 // Recover source articulation after path selection: do not turn repeated attacks
 // into sustained notes or impose a new rhythmic grid on the song's lead voice.
 const lead:Note[]=[];
 const used=new Set<Note>();
 for(const n of selected){
  const source=notes.filter(x=>x.pitch===n.pitch&&!used.has(x)&&Math.abs(x.start-n.start)<=.14)
   .sort((a,b)=>Math.abs(a.start-n.start)-Math.abs(b.start-n.start))[0];
  if(source){used.add(source);lead.push({...source});}
 }
 lead.sort((a,b)=>a.start-b.start);
 for(let i=0;i<lead.length-1;i++)lead[i].end=Math.min(lead[i].end,lead[i+1].start);
 return lead.filter(n=>n.end>n.start);
}

export function optimizeChordProgression(notes:Note[],melody:Note[],key:Key,total:number){
 type Chord=ReturnType<typeof generateChordCandidates>[number];
 type State={chord:Chord|null;score:number;prev:number};
 const layers:State[][]=[];const bars:{start:number;end:number;chord:Chord|null}[]=[];
 for(let start=0;start<total;start+=4){
  const end=Math.min(total,start+4);const candidates=generateChordCandidates(notes,melody,key,start,end).sort((a,b)=>b.score-a.score);
  // Evidence gate: sequence context cannot rescue a candidate > .3 below the best fit.
  const eligible=candidates.filter(c=>c.score>=candidates[0].score-.3);
  const choices:(Chord|null)[]=eligible.length?eligible:[null];const previous=layers[layers.length-1];
  const phraseBreak=!melody.some(n=>n.start<start&&n.end>start-.5);
  const layer=choices.map(chord=>{const emission=chord?.score??0;let score=emission,prev=-1;
   if(previous){score=-Infinity;previous.forEach((p,i)=>{let transition=0;if(p.chord&&chord){const shared=p.chord.pcs.filter(x=>chord.pcs.includes(x)).length;const same=p.chord.root===chord.root&&shared===3;transition=(same?.05:shared*.01-.03)*(phraseBreak?.5:1);}const candidate=p.score+emission+transition;if(candidate>score){score=candidate;prev=i;}});}
   return {chord,score,prev};});
  layers.push(layer);bars.push({start,end,chord:null});
 }
 if(!layers.length)return bars;let index=layers[layers.length-1].reduce((b,s,i,a)=>s.score>a[b].score?i:b,0);
 for(let i=layers.length-1;i>=0;i--){bars[i].chord=layers[i][index].chord;index=layers[i][index].prev;}return bars;
}

function balladAccompaniment(bars:ReturnType<typeof optimizeChordProgression>,melody:Note[],bpm:number):Note[]{
 const output:Note[]=[];let previous:number[]=[];
 for(const bar of bars){
  if(!bar.chord)continue;
  const lead=melody.filter(n=>overlap(n,bar.start,bar.end)>0);if(!lead.length)continue;
  // Weakly supported harmony stays silent instead of filling space with a guess.
  if(bar.chord.score<.25)continue;
  const first=Math.max(bar.start,lead[0].start),end=Math.min(bar.end,lead[lead.length-1].end);
  if(end-first<.5)continue;
  const floor=Math.min(...lead.map(n=>n.pitch));
  const options:number[][]=[];
  for(let low=40;low<=59;low++){
   if(!bar.chord.pcs.includes(pc(low)))continue;
   const pitches:number[]=[];
   for(let p=low;p<=low+12;p++)if(bar.chord.pcs.includes(pc(p))&&p<floor-3&&!pitches.some(x=>pc(x)===pc(p)))pitches.push(p);
   if(pitches.length>=2)options.push(pitches);
  }
  const cost=(v:number[])=>v.reduce((sum,p,i)=>sum+Math.abs(p-(previous[i]??[48,52,55][i]))-(previous.includes(p)?1.5:0),0)+(3-v.length)*3;
  options.sort((a,b)=>cost(a)-cost(b));const voice=options[0];if(!voice)continue;previous=voice;
  const put=(pitch:number,start:number,stop:number,velocity:number)=>{if(stop-start>=.12)output.push({pitch,start,end:stop,velocity,confidence:1});};
  const next=melody.find(n=>n.start>=end);const ending=!next||next.start-end>=.75;
  const dense=lead.length>=5||bpm>135;
  if(dense||ending){
   // A quiet held dyad supports a busy lead or resolves a phrase.
   for(const p of voice.slice(0,2))put(p,first,end,.27);
  }else{
   // A quiet, measured broken chord when the lead leaves room; no invented pitches.
   const longLead=lead.some(n=>n.end-n.start>=1.5);
   const spacing=longLead&&bpm<=120?.75:1;
   const pattern=voice.length===3?[0,1,2,1]:[0,1,0,1];
   for(let i=0;i<pattern.length;i++){const onset=first+i*spacing;if(onset>=end)break;
    put(voice[pattern[i]],onset,Math.min(end,onset+spacing*.85),i===0?.34:.29);
   }
  }
  // Optional right-hand harmony only beneath a long, consonant melody tone.
  for(const m of lead){
   if(m.end-m.start<2||!bar.chord.pcs.includes(pc(m.pitch)))continue;
   const tone=[m.pitch-3,m.pitch-4,m.pitch-5,m.pitch-7].find(p=>p>voice[voice.length-1]+2&&bar.chord!.pcs.includes(pc(p)));
   if(tone!==undefined){put(tone,Math.max(first,m.start),Math.min(end,m.end),.24);break;}
  }
 }
 return output;
}
export function validateArrangement(melody:Note[],chords:Note[]):Note[][]{
 const counts=new Map<number,number>();
 const sparse={chords:chords.filter(n=>{const bar=Math.floor(n.start/4);const density=melody.filter(m=>m.start>=bar*4&&m.start<(bar+1)*4).length;const limit=density>=5?4:8;if((counts.get(bar)||0)>=limit)return false;if(melody.some(m=>overlap(m,n.start,n.end)>0&&n.pitch>=m.pitch-2))return false;counts.set(bar,(counts.get(bar)||0)+1);return true;})};
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
 const cleaned=cleanNotes(input);if(!cleaned.length)throw Error('No reliable notes after cleanup');const key=detectKey(cleaned);
 const vocal=source.tracks.filter(t=>t.name==='Separated vocal melody').flatMap(t=>t.notes.map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:1})));
 const melody=vocal.length?cleanNotes(vocal):extractMelody(cleaned);if(!melody.length)throw Error('No reliable melody; arrangement not generated');
 const instrumental=source.tracks.filter(t=>t.name.startsWith('Separated instrumental')).flatMap(t=>t.notes.map(n=>({pitch:n.midi,start:n.time/beat,end:(n.time+n.duration)/beat,velocity:n.velocity,confidence:0})));
 const harmony=instrumental.length?cleanNotes(instrumental):cleaned;
 const total=Math.max(...cleaned.map(n=>n.end));const bars=optimizeChordProgression(harmony,melody,key,total);const chords=balladAccompaniment(bars,melody,bpm);const tracks=validateArrangement(melody,chords);
 const midi=new Midi();midi.header.setTempo(bpm);['Melody · right hand','Chord accompaniment'].forEach((name,i)=>{const track=midi.addTrack();track.name=name;track.instrument.number=0;for(const n of tracks[i])track.addNote({midi:n.pitch,time:n.start*beat,duration:(n.end-n.start)*beat,velocity:Math.max(.1,Math.min(.9,i===0?Math.max(.58,n.velocity):n.velocity))});});return midi.toArray();
}
