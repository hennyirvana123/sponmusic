import { Midi } from '@tonejs/midi';
type Event = { pitch: number; start: number; end: number; velocity: number };
export function pianoArrangement(bytes: Uint8Array, estimatedBpm?: number): Uint8Array {
 const source = new Midi(bytes);
 const bpm = Math.max(40,Math.min(240,estimatedBpm || source.header.tempos[0]?.bpm || 120));
 const unit=60/bpm/4;
 const events:Event[]=source.tracks.flatMap(t=>t.notes.map(n=>({pitch:n.midi,start:Math.round(n.time/unit),end:Math.max(Math.round(n.time/unit)+1,Math.round((n.time+n.duration)/unit)),velocity:n.velocity})));
 if(!events.length || events.length>30000 || events.some(n=>!Number.isFinite(n.start)||!Number.isFinite(n.end)||n.end>4096||n.start<0||n.pitch<0||n.pitch>127)) throw Error('Transcription exceeds arrangement limits or contains no notes');
 const total=Math.max(...events.map(n=>n.end));
 const midi=new Midi();midi.header.setTempo(bpm);
 const melody=midi.addTrack();melody.name='Melody · right hand';
 const chords=midi.addTrack();chords.name='Chord accompaniment';
 const bass=midi.addTrack();bass.name='Bass · left hand';
 for(const t of [melody,chords,bass])t.instrument.number=0;
 const fold=(p:number,low:number,high:number)=>{while(p<low)p+=12;while(p>high)p-=12;return p;};
 const add=(track:ReturnType<Midi['addTrack']>,pitch:number,start:number,end:number,velocity:number)=>track.addNote({midi:pitch,time:start*unit,duration:(end-start)*unit,velocity});
 // Monophonic upper voice, weighted by confidence, register and melodic continuity.
 let previous=72;let held: {pitch:number;start:number;end:number;velocity:number}|undefined;
 const flush=()=>{if(held)add(melody,held.pitch,held.start,held.end,held.velocity);held=undefined;};
 for(let s=0;s<total;s++){
  const candidates=events.filter(n=>n.start<=s&&n.end>s);
  if(!candidates.length){flush();continue;}
  const best=candidates.reduce((a,b)=>{const score=(n:Event)=>n.velocity*12+Math.min(n.pitch,88)*.25-Math.abs(fold(n.pitch,60,84)-previous)*.3;return score(b)>score(a)?b:a;});
  const pitch=fold(best.pitch,60,84);previous=pitch;
  if(held?.pitch===pitch)held.end=s+1;else{flush();held={pitch,start:s,end:s+1,velocity:Math.max(.45,Math.min(.85,best.velocity))};}
 }
 flush();
 // Infer major/minor harmony from duration-weighted pitch classes, not fixed canned chords.
 let lastVoicing=[48,52,55];
 for(let bar=0;bar<total;bar+=16){
  const end=Math.min(total,bar+16);const weights=Array(12).fill(0) as number[];
  for(const n of events){const overlap=Math.min(n.end,end)-Math.max(n.start,bar);if(overlap>0)weights[n.pitch%12]+=overlap*Math.max(.1,n.velocity);}
  if(!weights.some(w=>w>0))continue;
  let bestScore=-Infinity;let root=0;let third=4;
  for(let r=0;r<12;r++)for(const t of [3,4]){const score=weights[r]+weights[(r+t)%12]+weights[(r+7)%12]-.35*weights.reduce((sum,w,i)=>sum+([r,(r+t)%12,(r+7)%12].includes(i)?0:w),0);if(score>bestScore){bestScore=score;root=r;third=t;}}
  const pcs=[root,(root+third)%12,(root+7)%12];let chosen=lastVoicing;let distance=Infinity;
  for(let low=48;low<=59;low++)if(pcs.includes(low%12)){
   const v=[low];for(let p=low+1;p<=low+12;p++)if(pcs.includes(p%12)&&!v.some(x=>x%12===p%12))v.push(p);
   if(v.length===3&&v[2]<=64){const d=v.reduce((sum,p,i)=>sum+Math.abs(p-lastVoicing[i]),0);if(d<distance){distance=d;chosen=v;}}
  }
  lastVoicing=chosen;
  // Alternate bass and a compact left-hand triad; no simultaneous wide LH stretches.
  add(bass,36+root,bar,Math.min(end,bar+4),.55);
  for(const beat of [4,12])if(bar+beat<end)for(const p of chosen)add(chords,p,bar+beat,Math.min(end,bar+beat+4),.42);
  if(bar+8<end)add(bass,36+(root+7)%12,bar+8,Math.min(end,bar+12),.5);
 }
 return midi.toArray();
}
