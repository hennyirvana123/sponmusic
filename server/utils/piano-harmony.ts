type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
type Key={root:number;minor:boolean;confidence:number;scale:number[]};
type Chord={root:number;pcs:number[];score:number};
type Bar={start:number;end:number;chord:Chord|null};
const pc=(p:number)=>(p%12+12)%12;
const overlap=(n:Note,a:number,b:number)=>Math.max(0,Math.min(n.end,b)-Math.max(n.start,a));
const same=(a:Chord,b:Chord)=>a.root===b.root&&a.pcs.join(',')===b.pcs.join(',');
const make=(pitch:number,start:number,end:number,velocity:number):Note=>({pitch,start,end,velocity,confidence:1});
export function generateChordCandidates(notes:Note[],melody:Note[],key:Key,start:number,end:number):Chord[]{
 const weights=Array(12).fill(0),low=Array(12).fill(0);let total=0;
 for(const n of notes){const w=overlap(n,start,end)*n.velocity*n.confidence;weights[pc(n.pitch)]+=w;total+=w;if(n.pitch<55)low[pc(n.pitch)]+=w;}
 if(total<.15)return [];
 const degrees=key.minor?[[0,3,7],[2,3,6],[3,4,7],[5,3,7],[7,3,7],[7,4,7],[8,4,7],[10,4,7]]:[[0,4,7],[2,3,7],[4,3,7],[5,4,7],[7,4,7],[9,3,7]];
 const candidates:Chord[]=[];
 for(const [degree,third,fifth] of degrees){if(key.confidence<.04&&fifth===6)continue;const root=pc(key.root+degree),pcs=[root,pc(root+third),pc(root+fifth)];
 let score=pcs.reduce((s,p)=>s+weights[p],0)/total;
 let compatibility=0,mass=0;
 for(const n of melody){const duration=overlap(n,start,end);if(!duration)continue;const strong=Math.abs(n.start/2-Math.round(n.start/2))<.065&&n.end-n.start>=.5;const w=Math.min(duration,2)*(strong?3:.25);mass+=w;compatibility+=w*(pcs.includes(pc(n.pitch))?1:strong?-1.5:-.1);}
 score+=mass?compatibility/mass*.9:0;score+=low[root]/total*.35;
 score+=degree===0?.12:[5,7].includes(degree)?.06:0;
 if(key.confidence<.04&&![0,5,7].includes(degree))score-=.2;
 candidates.push({root,pcs,score});}
 return candidates;
}
export function optimizeChordProgression(notes:Note[],melody:Note[],key:Key,total:number):Bar[]{
 type State={score:number;chord:Chord|null;prev:number};const layers:State[][]=[];const bars:Bar[]=[];
 for(let start=0;start<total;start+=4){const end=Math.min(start+4,total);const choices:(Chord|null)[]=[null,...generateChordCandidates(notes,melody,key,start,end)];const prev=layers[layers.length-1];
 const layer=choices.map(chord=>{const emission=chord?chord.score:0;if(!prev)return {score:emission,chord,prev:-1};let best=-Infinity,index=0;
 prev.forEach((p,i)=>{let transition=0;if(p.chord&&chord){const movement=pc(chord.root-p.chord.root);transition=same(p.chord,chord)?.42:([5,7].includes(movement)?-.12:-.4);if(!same(p.chord,chord))transition+=p.chord.pcs.filter(x=>chord.pcs.includes(x)).length*.07;}else if(!!p.chord!==!!chord)transition=-.08;const score=p.score+emission+transition;if(score>best){best=score;index=i;}});return {score:best,chord,prev:index};});
 layers.push(layer);bars.push({start,end,chord:null});}
 if(!layers.length)return [];let index=layers[layers.length-1].reduce((b,s,i,a)=>s.score>a[b].score?i:b,0);for(let i=layers.length-1;i>=0;i--){bars[i].chord=layers[i][index].chord;index=layers[i][index].prev;}return bars;
}
export function createVoicing(chord:Chord,previous:number[],ceiling:number):number[]{
 let best:number[]=[];let cost=Infinity;
 // Search inversions and octave placements before dropping tones; prefer common tones.
 for(let low=45;low<=60;low++){if(!chord.pcs.includes(pc(low)))continue;const triad=[low];for(let p=low+1;p<=low+12;p++)if(chord.pcs.includes(pc(p))&&!triad.some(x=>pc(x)===pc(p)))triad.push(p);
 const v=triad.filter(p=>p<ceiling&&p<=69);if(v.length<2||v[v.length-1]-v[0]>12)continue;
 const score=v.reduce((s,p,i)=>s+Math.abs(p-(previous[i]??[48,52,55][i]))-(previous.includes(p)?2:0),0)+(3-v.length)*5+Math.max(0,48-low)*.5;
 if(score<cost){cost=score;best=v;}}
 return best;
}
export function generateAccompaniment(bars:Bar[],melody:Note[],bpm:number){
 const chords:Note[]=[];let previous:number[]=[];
 for(let i=0;i<bars.length;i++){const bar=bars[i];if(!bar.chord)continue;
 const phrase=melody.filter(n=>overlap(n,bar.start,bar.end)>0);if(!phrase.length)continue;
 const first=phrase[0],last=phrase[phrase.length-1];const before=melody.filter(n=>n.end<=first.start).pop();const after=melody.find(n=>n.start>=last.end);
 const beginning=!before||first.start-before.end>=1;const ending=!after||after.start-last.end>=1;
 const ceiling=Math.min(...phrase.map(n=>n.pitch))-3;const v=createVoicing(bar.chord,previous,ceiling);if(!v.length)continue;previous=v;
 const dense=phrase.length>=5||bpm>=145;
 const pattern=ending||dense||beginning?'sustain':phrase.length<=2&&bpm<=110?'broken':'half';
 const start=Math.max(bar.start,first.start);const end=Math.min(bar.end,last.end+.25);if(end-start<.25)continue;
 if(pattern==='sustain'){for(const p of v)chords.push(make(p,start,end,.28));}
 else if(pattern==='broken'){for(const [j,t] of [start,start+2].entries())if(t<end)chords.push(make(v[j%v.length],t,Math.min(end,t+1.3),.3));}
 else{for(const t of [start,start+2])if(t<end)for(const p of v.slice(0,2))chords.push(make(p,t,Math.min(end,t+1.7),.3));}
 }
 return {chords};
}
export function controlDensity(melody:Note[],chords:Note[]){
 const output:Note[]=[];const counts=new Map<number,number>();
 for(const n of [...chords].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
 const bar=Math.floor(n.start/4);if((counts.get(bar)||0)>=4)continue;
 if(melody.some(m=>overlap(m,n.start,n.end)>0&&n.pitch>=m.pitch-3))continue;
 if(output.some(x=>x.pitch===n.pitch&&overlap(x,n.start,n.end)>0))continue;
 output.push(n);counts.set(bar,(counts.get(bar)||0)+1);}
 return {chords:output};
}
