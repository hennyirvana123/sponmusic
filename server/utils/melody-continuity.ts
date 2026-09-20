import { filterMelodyCandidates, type Candidate } from './melody-candidates';
type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
type Diagnostic={previousPitch:number|null;interval:number;localRegister:number;jumpPenalty:number;spikePenalty:number;continuityScore:number;futureSupport:number};
type Selected=Candidate&{diagnostic?:Diagnostic};
type Tail={n:Selected;prev:Tail|null};
type Path={score:number;history:Selected[];tail:Tail|null;anchor:number|null;phraseIndex:number};
const pc=(n:number)=>(n%12+12)%12;
export function refineMelody(notes:Note[],scale:number[]):Note[]{
 const candidates=filterMelodyCandidates(notes);const grouped=new Map<number,Candidate[]>();
 for(const n of candidates){const t=Math.round(n.start*8)/8;grouped.set(t,[...(grouped.get(t)||[]),n]);}
 const onsets=[...grouped].sort((a,b)=>a[0]-b[0]);let beam:Path[]=[{score:0,history:[],tail:null,anchor:null,phraseIndex:0}];
 for(let i=0;i<onsets.length;i++){
 const [t,group]=onsets[i];const future=onsets.slice(i+1,i+7);const next:Path[]=[];
 for(const path of beam){next.push(path);const last=path.history[path.history.length-1],before=path.history[path.history.length-2];
 // Candidate pruning depends on each path, not velocity or highest pitch.
 const choices=[...group].sort((a,b)=>{const cost=(n:Candidate)=>n.spikePenalty+Math.abs(n.pitch-(last?.pitch??n.registerCenter))*.08-n.futureSupport*.12;return cost(a)-cost(b);}).slice(0,12);
 for(const n of choices){if(last&&t-last.start<.15)continue;
 const newPhrase=!last||t-last.end>=1.5;const phraseIndex=newPhrase?i:path.phraseIndex;const early=i-phraseIndex<8;
 const anchor=newPhrase?n.registerCenter:path.anchor!;const interval=last?n.pitch-last.pitch:0;
 let motif=n.repeated?.15:0;
 if(last&&before){const prevInterval=last.pitch-before.pitch;for(let j=2;j<path.history.length;j++){const h=path.history;if(h[j-1].pitch-h[j-2].pitch===prevInterval&&h[j].pitch-h[j-1].pitch===interval&&Math.abs((h[j].start-h[j-1].start)-(t-last.start))<.2){motif=.3;break;}}}
 const supported=n.futureSupport>=2||motif>=.15;const relief=supported?.25:1;
 const jumpPenalty=((!newPhrase?Math.max(0,Math.abs(interval)-7)*.12+Math.max(0,Math.abs(interval)-12)*.3:0)+Math.max(0,Math.abs(n.pitch-n.nextPitch)-12)*.18)*relief*(early?1.3:1);
 const reverse=last&&before&&!newPhrase&&interval*(last.pitch-before.pitch)<0&&Math.abs(interval)>7&&Math.abs(last.pitch-before.pitch)>7?.3*relief:0;
 const localPenalty=(Math.max(0,Math.abs(n.pitch-n.registerCenter)-5)*.055+Math.max(0,Math.abs(n.pitch-n.registerCenter)-9)*.12+Math.max(0,Math.abs(n.pitch-anchor)-7)*.07)*relief*(early?1.4:1);
 const octaveSwitch=last&&pc(last.pitch)===pc(n.pitch)&&Math.abs(interval)>=12&&!supported?.65:0;
 let lookahead=0;
 for(let k=0;k<future.length;k++){const fit=Math.min(...future[k][1].map(f=>Math.abs(f.pitch-n.pitch)+f.spikePenalty*4));lookahead+=Math.max(-.15,.16-fit*.02)/(k+1);}
 const continuityScore=motif+lookahead-jumpPenalty-reverse-localPenalty-octaveSwitch;
 const duration=n.end-n.start;const reward=.6*Math.min(duration,1.5)+n.confidence*.55-.48-(duration<.15?.25:0)+continuityScore-n.spikePenalty;
 // Exact observed pitch only. Other octaves compete only if present at this onset.
 const selected:Selected={...n,start:t,end:Math.max(t+.0625,Math.round(n.end*16)/16),diagnostic:{previousPitch:last?.pitch??null,interval,localRegister:n.registerCenter,jumpPenalty,spikePenalty:n.spikePenalty,continuityScore,futureSupport:n.futureSupport}};
 next.push({score:path.score+reward,history:[...path.history.slice(-11),selected],tail:{n:selected,prev:path.tail},anchor:supported&&!early?anchor+(n.pitch-anchor)*.2:anchor,phraseIndex});
 }}
 const seen=new Set<string>();beam=next.sort((a,b)=>b.score-a.score).filter(p=>{const key=`${p.phraseIndex}:${p.anchor?.toFixed(1)}:`+p.history.slice(-4).map(n=>`${n.start}:${n.pitch}`).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,32);
 }
 const selected:Selected[]=[];for(let tail=beam[0]?.tail;tail;tail=tail.prev)selected.push({...tail.n});selected.reverse();
 const final=finishMelody(selected,candidates,scale);
 if(process.env.NODE_ENV==='development'&&process.env.SPONMUSIC_MELODY_DEBUG==='1'){
 console.debug('[melody-v2.5]',{inputNotes:notes.length,candidates:candidates.length,penalized:candidates.filter(n=>n.spikePenalty>=2).length,finalNotes:final.length});
 final.forEach((n,i)=>{const evidence=candidates.find(c=>c.pitch===n.pitch&&Math.abs(c.start-n.start)<.13);console.debug('[melody-v2.5 note]',{pitch:n.pitch,previousPitch:i?final[i-1].pitch:null,interval:i?n.pitch-final[i-1].pitch:0,localRegister:evidence?.registerCenter,jumpPenalty:(n as Selected).diagnostic?.jumpPenalty??null,spikePenalty:evidence?.spikePenalty,continuityScore:(n as Selected).diagnostic?.continuityScore??null,futureSupport:evidence?.futureSupport});});}
 return final;
}
export function finishMelody(sequence:Note[],evidence:Note[],scale:number[]):Note[]{
 const candidates=filterMelodyCandidates(evidence);const result=sequence.map(n=>({...n}));
 for(let i=1;i<result.length-1;i++){
 const a=result[i-1],n=result[i],b=result[i+1];if(n.start-a.end>1.5||b.start-n.end>1.5)continue;
 const source=candidates.find(c=>c.pitch===n.pitch&&Math.abs(c.start-n.start)<.13);if(source&&(source.futureSupport>=2||source.repeated))continue;
 if(Math.abs(n.pitch-a.pitch)<=12||Math.abs(n.pitch-b.pitch)<=12||Math.abs(a.pitch-b.pitch)>7)continue;
 const alternatives=candidates.filter(c=>Math.abs(c.start-n.start)<.065&&c.spikePenalty<2&&Math.abs(c.pitch-a.pitch)<=7&&Math.abs(c.pitch-b.pitch)<=7).sort((x,y)=>(Math.abs(x.pitch-a.pitch)+Math.abs(b.pitch-x.pitch))-(Math.abs(y.pitch-a.pitch)+Math.abs(b.pitch-y.pitch)));
 if(alternatives.length){const replacement=alternatives[0];result[i]={...replacement,start:n.start,end:Math.min(b.start,replacement.end)};}else{result.splice(i,1);i--;}
 }
 const out:Note[]=[];
 for(let i=0;i<result.length;i++){
 const a=result[i],b=result[i+1];if(b)a.end=Math.min(a.end,b.start);if(a.end<=a.start)continue;out.push(a);if(!b)continue;
 const gap=b.start-a.end;if(gap<=0||gap>.65||Math.abs(a.pitch-b.pitch)>7)continue;
 const observed=candidates.filter(c=>c.spikePenalty<2&&c.start<b.start&&c.end>a.end);
 const sustain=observed.find(c=>c.pitch===a.pitch&&c.start<=a.end+.02&&c.end>=b.start);if(gap<=.18&&sustain){a.end=b.start;continue;}
 const bridge=observed.filter(c=>c.start>=a.end&&c.end<=b.start&&c.end-c.start>=.15&&Math.abs(c.pitch-a.pitch)<=4&&Math.abs(c.pitch-b.pitch)<=4&&scale.includes(pc(c.pitch))).sort((x,y)=>x.spikePenalty-y.spikePenalty||Math.abs(x.pitch-a.pitch)-Math.abs(y.pitch-a.pitch))[0];
 if(bridge)out.push({...bridge});
 }
 return out.filter(n=>n.end>n.start);
}
