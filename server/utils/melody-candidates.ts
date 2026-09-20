type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
export type Candidate=Note&{registerCenter:number;spikePenalty:number;futureSupport:number};
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)/2)];};
export function filterMelodyCandidates(notes:Note[]):Candidate[]{
 const eligible=notes.filter(n=>n.pitch>=48&&n.confidence>=.28);
 const grouped=new Map<number,Note[]>();
 for(const n of eligible){const t=Math.round(n.start*8)/8;const group=grouped.get(t)||[];group.push(n);grouped.set(t,group);}
 const groups=[...grouped].sort((a,b)=>a[0]-b[0]);const output:Candidate[]=[];
 for(let i=0;i<groups.length;i++){
  const [time,group]=groups[i];
  const neighbors=groups.slice(Math.max(0,i-4),i+5).filter(([t])=>t!==time&&Math.abs(t-time)<=3);
  // One vote per onset prevents a dense chord or duplicated harmonics dominating the center.
  const centers=neighbors.map(([,g])=>median(g.map(n=>n.pitch)));
  const center=centers.length?median(centers):median(group.map(n=>n.pitch));
  const future=groups.slice(i+1,i+5).filter(([t])=>t-time<=3);
  const past=groups.slice(Math.max(0,i-4),i).filter(([t])=>time-t<=3);
  for(const n of group){
   let reachable=[n.pitch],support=0;
   for(const [,g] of future){const next=g.filter(f=>f.confidence>=.35&&f.end-f.start>=.15&&reachable.some(p=>Math.abs(f.pitch-p)<=7));if(!next.length)break;support++;reachable=next.map(f=>f.pitch);}
   const repeated=past.some(([,g])=>g.some(p=>Math.abs(p.pitch-n.pitch)<=2))&&future.some(([,g])=>g.some(p=>Math.abs(p.pitch-n.pitch)<=2));
   const immediateBefore=past[past.length-1]?.[1];const immediateAfter=future[0]?.[1];
   const lowerBefore=!immediateBefore||median(immediateBefore.map(p=>p.pitch))<=n.pitch-10;
   const lowerAfter=!!immediateAfter&&median(immediateAfter.map(p=>p.pitch))<=n.pitch-10;
   const isolated=n.pitch-center>=12&&lowerBefore&&lowerAfter&&support<2&&!repeated;
   const deviation=Math.abs(n.pitch-center);
   const supported=support>=2||repeated;
   const penalty=(Math.max(0,deviation-5)*.055+Math.max(0,deviation-11)*.13)*(supported?.15:1)+(isolated?2.5+(n.end-n.start<.35?.7:0):0);
   output.push({...n,registerCenter:center,spikePenalty:penalty,futureSupport:support});
  }
 }
 return output;
}
