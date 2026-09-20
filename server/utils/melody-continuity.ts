import { scoreLeadCandidates } from './melody-candidate-scoring';
type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
type Group={time:number;notes:Note[]};
const median=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)]??60;
function groups(notes:Note[]):Group[]{const result:Group[]=[];for(const n of [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){const last=result[result.length-1];if(last&&n.start-last.time<.04)last.notes.push(n);else result.push({time:n.start,notes:[n]});}return result;}
export function segmentMelodyPhrases(notes:Note[]):{start:number;end:number;notes:Note[]}[]{
 const g=groups(notes);if(!g.length)return [];const boundaries=[0];let phraseStart=g[0].time;
 for(let i=1;i<g.length;i++){
 const left=g.slice(Math.max(0,i-6),i),right=g.slice(i,i+6);const previous=g[i-1];
 const rest=g[i].time-Math.max(...previous.notes.map(n=>n.end));
 const centerChange=Math.abs(median(left.map(x=>median(x.notes.map(n=>n.pitch))))-median(right.map(x=>median(x.notes.map(n=>n.pitch)))));
 const longEnd=previous.notes.some(n=>n.end-n.start>=1.5&&Math.abs(n.end-g[i].time)<.4);
 const densityChange=left.length>2&&right.length>2&&Math.abs((left[left.length-1].time-left[0].time)-(right[right.length-1].time-right[0].time))>1.5;
 const nearBeat=Math.abs(g[i].time-Math.round(g[i].time))<.15;
 const reset=i>1&&i+1<g.length&&(median(g[i-1].notes.map(n=>n.pitch))-median(g[i-2].notes.map(n=>n.pitch)))*(median(g[i+1].notes.map(n=>n.pitch))-median(g[i].notes.map(n=>n.pitch)))<0;
 const evidence=Number(longEnd)+Number(densityChange)+Number(centerChange>=5)+Number(nearBeat&&reset);
 if(rest>=.75||(g[i].time-phraseStart>=4&&evidence>=2)){boundaries.push(i);phraseStart=g[i].time;}
 }
 return boundaries.map((start,j)=>{const chunk=g.slice(start,boundaries[j+1]??g.length);return {start:chunk[0].time,end:Math.max(...chunk.flatMap(x=>x.notes.map(n=>n.end))),notes:chunk.flatMap(x=>x.notes)};});
}
export function accompanimentPatternPenalty(history:Note[],candidate:Note,context:Note[]):number{
 const h=[...history.slice(-7),candidate];if(h.length<5)return 0;
 const spacing=h.slice(1).map((n,i)=>n.start-h[i].start);const avg=spacing.reduce((a,b)=>a+b,0)/spacing.length;
 const regular=spacing.filter(s=>Math.abs(s-avg)<Math.max(.06,avg*.18)).length/spacing.length;
 const alternating=h.slice(2).filter((n,i)=>n.pitch===h[i].pitch).length/(h.length-2);
 const classes=new Set(h.map(n=>n.pitch%12));const durations=h.map(n=>n.end-n.start);const uniform=durations.filter(d=>Math.abs(d-median(durations))<.15).length/h.length;
 const flatArc=Math.abs(h[h.length-1].pitch-h[0].pitch)<=4;
 const upper=context.filter(n=>n.start>=h[0].start&&n.start<=candidate.start+2&&n.pitch>median(h.map(x=>x.pitch))+4&&n.end-n.start>.25);
 const competing=new Set(upper.map(n=>n.pitch)).size>=3;
 if(regular<.7||classes.size>3||alternating<.5||!flatArc)return 0;
 // Repetition alone is never disqualifying. A coexisting moving voice and
 // duration regularity are required for a substantial ostinato penalty.
 return (competing?.65:.08)*regular*alternating*(uniform>.6?1.3:.6)*(median(h.map(n=>n.pitch))<65?1:.7);
}
export function refineMelody(notes:Note[],_scale:number[]):Note[]{
 const features=scoreLeadCandidates(notes);
 const leadScore=(n:Note)=>{const f=features.get(n)!;return (f.leadLikelihood-.4)*.8-f.accompanimentLikelihood*1.5;};
 type Path={score:number;line:Note[]};const output:Note[]=[];
 for(const phrase of segmentMelodyPhrases(notes)){
 const onset=groups(phrase.notes);let beam:Path[]=[{score:0,line:[]}];
 for(let i=0;i<onset.length;i++){
 const future=onset.slice(i+1,i+9);const next:Path[]=[];
 for(const path of beam){next.push(path);const last=path.line[path.line.length-1],before=path.line[path.line.length-2];
 for(const n of onset[i].notes){if(last&&n.start-last.start<.04)continue;
 const interval=last?n.pitch-last.pitch:0;const gap=last?n.start-last.end:0;
 const pattern=accompanimentPatternPenalty(path.line,n,phrase.notes);
 let projected=[{score:0,line:[...path.line.slice(-6),n],depth:0}];
 for(const f of future){const possibilities=[...projected];for(const p of projected){const tail=p.line[p.line.length-1];for(const candidate of f.notes){if(candidate.start<=tail.start||candidate.start-tail.end>1.5)continue;const leap=Math.abs(candidate.pitch-tail.pitch);possibilities.push({score:p.score+.16+Math.min(candidate.end-candidate.start,1)*.1+leadScore(candidate)*.6-Math.max(0,leap-5)*.04-accompanimentPatternPenalty(p.line,candidate,phrase.notes),line:[...p.line.slice(-7),candidate],depth:p.depth+1});}}projected=possibilities.sort((a,b)=>b.score-a.score).slice(0,8);}
 const support=projected[0];const lookahead=Math.min(.65,support.score*.4);
 const leapPenalty=Math.max(0,Math.abs(interval)-7)*.07+Math.max(0,Math.abs(interval)-12)*.15;
 const reversal=before&&interval*(last.pitch-before.pitch)<0&&Math.abs(interval)>9?.2:0;
 const continuation=last&&gap<.5&&Math.abs(interval)<=7?.13:0;
 const interruption=last&&last.end-n.start>.4&&last.confidence>n.confidence?.22:0;
 const local=median(path.line.slice(-5).map(x=>x.pitch));const register=last?Math.max(0,Math.abs(n.pitch-local)-10)*.035:0;
 const reward=.25*Math.min(n.end-n.start,2)+n.confidence*.28-.25+leadScore(n)+lookahead+continuation-pattern-leapPenalty*(support.depth>=3?.5:1)-reversal-register-interruption;
 next.push({score:path.score+reward,line:[...path.line,n]});
 }}
 const seen=new Set<string>();beam=next.sort((a,b)=>b.score-a.score).filter(p=>{const key=p.line.slice(-5).map(n=>`${n.start}:${n.pitch}`).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,40);
 }
 output.push(...beam[0].line);
 }
 return finishMelody(output,notes,_scale);
}
export function finishMelody(sequence:Note[],evidence:Note[],_scale:number[]):Note[]{
 // Identity guard: only source candidates survive. No synthesized pitches,
 // octave alternatives or gap-filling notes are introduced in this pass.
 const result=sequence.filter(n=>evidence.some(e=>e.pitch===n.pitch&&e.start===n.start)).map(n=>({...n})).sort((a,b)=>a.start-b.start);
 for(let i=0;i<result.length-1;i++)result[i].end=Math.min(result[i].end,result[i+1].start);
 return result.filter(n=>n.end>n.start);
}
