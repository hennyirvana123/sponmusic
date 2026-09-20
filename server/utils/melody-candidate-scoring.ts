type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
export type LeadFeatures={leadLikelihood:number;accompanimentLikelihood:number;regularity:number;cycle:number;durationUniformity:number;multiBarRepetition:number;contour:number;voiceCompetition:number;relativeRegister:number};
const median=(a:number[])=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]??0;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function profile(notes:Note[]){
 const sorted=[...notes].sort((a,b)=>a.start-b.start);const line:Note[]=[];
 for(const n of sorted){if(!line.length||n.start-line[line.length-1].start>.05)line.push(n);}
 const gaps=line.slice(1).map((n,i)=>n.start-line[i].start),spacing=median(gaps);
 const regularity=gaps.length>=4?gaps.filter(g=>Math.abs(g-spacing)<Math.max(.05,spacing*.18)).length/gaps.length:0;
 let cycle=0;for(const lag of [2,3,4]){if(line.length<lag*2)continue;cycle=Math.max(cycle,line.slice(lag).filter((n,i)=>n.pitch%12===line[i].pitch%12).length/(line.length-lag));}
 const durations=line.map(n=>n.end-n.start),d=median(durations);const uniform=durations.length?durations.filter(x=>Math.abs(x-d)<Math.max(.08,d*.2)).length/durations.length:0;
 const intervals=line.slice(1).map((n,i)=>n.pitch-line[i].pitch);const steps=intervals.filter(x=>Math.abs(x)>0&&Math.abs(x)<=5).length/Math.max(1,intervals.length);
 const movement=new Set(line.map(n=>n.pitch)).size;const contour=clamp(steps*.7+Math.min(1,movement/5)*.3-cycle*.3);
 return {line,regularity,cycle,uniform,contour};
}
export function scoreLeadCandidates(notes:Note[]):Map<Note,LeadFeatures>{
 const result=new Map<Note,LeadFeatures>();const sorted=[...notes].sort((a,b)=>a.start-b.start);
 let first=0,last=0;
 for(const n of sorted){while(first<sorted.length&&sorted[first].start<n.start-8)first++;while(last<sorted.length&&sorted[last].start<=n.start+8)last++;
 const window=sorted.slice(first,last);const near=window.filter(x=>Math.abs(x.start-n.start)<=4);
 const own=profile(window.filter(x=>Math.abs(x.pitch-n.pitch)<=7));
 const upper=profile(near.filter(x=>x.pitch>n.pitch+4&&x.pitch<=n.pitch+21));
 const lower=profile(near.filter(x=>x.pitch<n.pitch-4&&x.pitch>=n.pitch-21));
 const rivals=[upper,lower].filter(p=>p.line.length>=3);
 const competitor=Math.max(0,...rivals.map(p=>p.contour*(1-p.regularity*p.cycle*.7)));
 const repeatedAcross=window.filter(x=>x!==n&&x.pitch%12===n.pitch%12&&Math.abs(x.start-n.start)>=3.5&&Math.abs((x.start-n.start)/4-Math.round((x.start-n.start)/4))<.07).length;
 const multi=clamp(repeatedAcross/3);
 const classes=new Set(own.line.map(x=>x.pitch%12)).size;const clustered=classes<=4?1:.5;
 const relative=near.length?clamp((n.pitch-median(near.map(x=>x.pitch))+12)/24):.5;
 // Repetition must combine with regular timing and another clue. No pitch cutoff.
 const accompaniment=clamp(own.regularity*own.cycle*(.25*own.uniform+.2*multi+.15*clustered+.4*competitor)*(1-own.contour*.35));
 const neighbors=near.filter(x=>x!==n&&Math.abs(x.pitch-n.pitch)<=5&&Math.abs(x.start-n.start)<1.5);
 const continuity=clamp(neighbors.length/4);
 const duration=n.end-n.start;const expressive=clamp(duration/1.5)*(1-own.regularity*own.cycle);
 const lowerOstinato=lower.regularity*lower.cycle;
 const upperEvidence=upper.contour*(1-upper.regularity*upper.cycle);
 const lead=clamp(.2+.26*own.contour+.22*continuity+.14*expressive+.08*n.confidence+.14*lowerOstinato-accompaniment*.6-upperEvidence*accompaniment*.15);
 result.set(n,{leadLikelihood:lead,accompanimentLikelihood:accompaniment,regularity:own.regularity,cycle:own.cycle,durationUniformity:own.uniform,multiBarRepetition:multi,contour:own.contour,voiceCompetition:competitor,relativeRegister:relative});
 }return result;
}
