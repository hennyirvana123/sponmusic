type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
const variants=(pitch:number)=>[-12,0,12].map(s=>pitch+s).filter(p=>p>=48&&p<=96);
const strong=(n:Note)=>n.confidence>=.7&&n.velocity>=.55&&n.end-n.start>=.45;
const pc=(n:number)=>(n%12+12)%12;
type Onset={t:number;notes:Note[]};
function registerAnchor(groups:Onset[],index:number,previous?:number):number{
 const window=groups.slice(index,index+4).filter(g=>g.t-groups[index].t<=3);
 const candidates=window.flatMap(g=>g.notes.filter(n=>n.confidence>=.4&&n.end-n.start>=.2));
 if(!candidates.length)return previous??groups[index].notes[0].pitch;
 const pitches=[...new Set(candidates.map(n=>n.pitch))];
 const score=(p:number)=>window.reduce((sum,g)=>sum+Math.min(16,...g.notes.map(n=>Math.abs(n.pitch-p)+(1-n.confidence)*2)),0)+(previous===undefined?0:Math.max(0,Math.abs(p-previous)-7)*.4);
 return pitches.sort((a,b)=>score(a)-score(b)||a-b)[0];
}

export function refineMelody(notes:Note[],scale:number[]):Note[]{
 type Tail={n:Note;prev:Tail|null};
 type Path={score:number;history:Note[];tail:Tail|null;anchor?:number;phraseCount:number;phraseIndex:number};
 const groups=new Map<number,Note[]>();
 for(const n of notes){if(n.pitch<48||n.confidence<.28)continue;const t=Math.round(n.start*8)/8;const list=groups.get(t)||[];list.push(n);groups.set(t,list);}
 const onsets=[...groups].sort((a,b)=>a[0]-b[0]).map(([t,g])=>({t,notes:g.sort((a,b)=>b.confidence-a.confidence).slice(0,5)}));
 let beam:Path[]=[{score:0,history:[],tail:null,phraseCount:0,phraseIndex:0}];
 for(let i=0;i<onsets.length;i++){
  const {t,notes:candidates}=onsets[i];
  const future=onsets.slice(i+1,i+4).filter(g=>g.t-t<=2);
  const next:Path[]=[];
  for(const path of beam){
   next.push(path); // Explicit rest/skip path, without a compulsory note reward.
   const last=path.history[path.history.length-1];const before=path.history[path.history.length-2];
   for(const n of candidates){
    if(last&&t-last.start<.22)continue;
    for(const pitch of variants(n.pitch)){
     const gap=last?t-last.end:4;const connected=!!last&&gap<1.5;
     const interval=last?pitch-last.pitch:0;const magnitude=Math.abs(interval);
     const recent=path.history.slice(-6);const median=recent.length?[...recent].sort((a,b)=>a.pitch-b.pitch)[Math.floor(recent.length/2)].pitch:pitch;
     let motif=0;
     if(last&&before){const rhythm=t-last.start;const priorInterval=last.pitch-before.pitch;
      for(let j=2;j<recent.length;j++){if(recent[j-1].pitch-recent[j-2].pitch===priorInterval&&recent[j].pitch-recent[j-1].pitch===interval&&Math.abs((recent[j].start-recent[j-1].start)-rhythm)<.2){motif=.2;break;}}
     }
     const newPhrase=!last||gap>=1.5;
     const anchor=newPhrase?registerAnchor(onsets,i,path.anchor):path.anchor!;
     const phraseIndex=newPhrase?i:path.phraseIndex;
     const early=i-phraseIndex<4;
     const support=future.filter(g=>g.notes.some(f=>strong(f)&&Math.abs(f.pitch-pitch)<=5)).length;
     const supported=strong(n)&&pitch===n.pitch&&(support>=2||motif>0);
     const jump=connected?(Math.max(0,magnitude-5)*.18+Math.max(0,magnitude-12)*.38)*(supported?.4:1):0;
     const reversal=connected&&before&&Math.sign(last.pitch-before.pitch)!==Math.sign(interval)&&magnitude>5&&Math.abs(last.pitch-before.pitch)>5?(supported?.08:.4):0;
     const local=connected?Math.max(0,Math.abs(pitch-median)-6)*.07:0;
     const register=local+Math.max(0,Math.abs(pitch-anchor)-5)*(early?.2:.11)*(supported?.4:1)+(early&&pitch>anchor+9&&support<2?.55:0);
     // Look ahead to three subsequent onset groups; only observed candidates contribute.
     let ahead=0;let weight=0;
     for(let k=0;k<future.length;k++){const w=1/(k+1);const fits=future[k].notes.map(f=>Math.max(...variants(f.pitch).map(p=>f.confidence*.3-Math.max(0,Math.abs(p-pitch)-5)*.04)));if(fits.length){ahead+=Math.max(-.2,...fits)*w;weight+=w;}}
     ahead=weight?ahead/weight:0;
     const length=n.end-n.start;const shiftPenalty=Math.abs(pitch-n.pitch)*.015;
     const reward=n.confidence*1.65+Math.min(length,2)*.3-.95-(length<.25?.4:0)-jump-reversal-register-shiftPenalty+motif+ahead;
     const selected={...n,pitch,start:t,end:t+Math.max(.125,Math.round(length*8)/8)};
     next.push({score:path.score+reward,history:[...recent,selected].slice(-10),tail:{n:selected,prev:path.tail},anchor:supported&&!early?anchor+(pitch-anchor)*.25:anchor,phraseCount:newPhrase?1:path.phraseCount+1,phraseIndex});
    }
   }
  }
  // Keep distinct recent paths so many variants of one phrase cannot crowd out rests.
  const seen=new Set<string>();beam=next.sort((a,b)=>b.score-a.score).filter(p=>{const key=p.history.slice(-4).map(n=>`${n.start}:${n.pitch}`).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,32);
 }
 const result:Note[]=[];for(let tail=beam[0]?.tail;tail;tail=tail.prev)result.push({...tail.n});result.reverse();
 return finishMelody(result,notes,scale);
}

export function finishMelody(sequence:Note[],evidence:Note[],scale:number[]):Note[]{
 const result=sequence.map(n=>({...n}));
 for(let i=1;i<result.length-1;i++){
  const a=result[i-1],n=result[i],b=result[i+1];
  if(n.start-a.end>1||b.start-n.end>1||strong(n))continue;
  const originalCost=Math.abs(n.pitch-a.pitch)+Math.abs(b.pitch-n.pitch);
  const options=variants(n.pitch).sort((x,y)=>(Math.abs(x-a.pitch)+Math.abs(b.pitch-x))-(Math.abs(y-a.pitch)+Math.abs(b.pitch-y)));
  if(originalCost>20&&options.length){const p=options[0];const cost=Math.abs(p-a.pitch)+Math.abs(b.pitch-p);if(cost+8<originalCost)n.pitch=p;}
  if(n.end-n.start<.25&&n.confidence<.45&&Math.abs(n.pitch-a.pitch)>9&&Math.abs(n.pitch-b.pitch)>9&&Math.abs(a.pitch-b.pitch)<=4){result.splice(i,1);i--;}
 }
 const out:Note[]=[];
 for(let i=0;i<result.length;i++){
  const a=result[i],b=result[i+1];if(b)a.end=Math.min(a.end,b.start);out.push(a);if(!b)continue;
  const gap=b.start-a.end;if(gap<=0||gap>.65||Math.abs(b.pitch-a.pitch)>7||a.confidence<.45||b.confidence<.45)continue;
  // Never bridge an actual silent interval: require transcription evidence in the gap.
  const observed=evidence.filter(n=>n.confidence>=.32&&n.start<b.start&&n.end>a.end&&n.pitch>=55);
  const sustain=observed.find(n=>pc(n.pitch)===pc(a.pitch)&&n.start<=a.end+.03&&n.end>=b.start-.03);
  if(gap<=.18&&sustain){a.end=b.start;continue;}
  if(gap<.25)continue;
  const bridges=observed.flatMap(n=>variants(n.pitch).map(p=>({...n,pitch:p}))).filter(n=>n.start>=a.end-.03&&n.start<=b.start-.22&&n.end>=a.end+.15&&Math.abs(n.pitch-a.pitch)<=4&&Math.abs(b.pitch-n.pitch)<=4&&scale.includes(pc(n.pitch)));
  bridges.sort((x,y)=>y.confidence-x.confidence||Math.abs(x.pitch-a.pitch)-Math.abs(y.pitch-a.pitch));
  const n=bridges[0];if(n){const start=Math.max(a.end,Math.round(n.start*8)/8);const end=Math.min(b.start,n.end);if(end-start>=.15)out.push({...n,start,end});}
 }
 // Preserve separate onsets, including repeated pitches; merge only evidence-backed gaps via duration above.
 return out.filter(n=>n.end>n.start);
}
