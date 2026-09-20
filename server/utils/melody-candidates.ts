type Note={pitch:number;start:number;end:number;velocity:number;confidence:number};
export type Candidate=Note&{registerCenter:number;spikePenalty:number;futureSupport:number;repeated:boolean;nextPitch:number};
const median=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)/2)];
export function filterMelodyCandidates(notes:Note[]):Candidate[]{
 const groups=new Map<number,Note[]>();
 for(const n of notes){if(n.pitch<48||n.pitch>96||n.end<=n.start)continue;const t=Math.round(n.start*8)/8;groups.set(t,[...(groups.get(t)||[]),n]);}
 const onsets=[...groups].sort((a,b)=>a[0]-b[0]);const result:Candidate[]=[];
 for(let i=0;i<onsets.length;i++){
 const center=median(onsets.slice(Math.max(0,i-4),i+5).map(([,g])=>median(g.map(n=>n.pitch))));
 const past=onsets.slice(Math.max(0,i-6),i);const future=onsets.slice(i+1,i+7);
 for(const n of onsets[i][1]){
 let support=0,reachable=[n.pitch];
 for(const [t,g] of future){if(t-n.end>4)break;const next=g.filter(f=>f.confidence>=.3&&reachable.some(p=>Math.abs(p-f.pitch)<=7));if(!next.length)break;support++;reachable=next.map(f=>f.pitch);}
 const repeated=past.some(([,g])=>g.some(x=>x.pitch===n.pitch))&&future.some(([,g])=>g.some(x=>x.pitch===n.pitch));
 const nextGroup=future.find(([,g])=>g.some(f=>f.confidence>=.35));
 const nextPitch=nextGroup?[...nextGroup[1]].sort((a,b)=>(Math.abs(a.pitch-center)+(1-a.confidence)*2)-(Math.abs(b.pitch-center)+(1-b.confidence)*2))[0].pitch:n.pitch;
 const prior=past.length?median(past[past.length-1][1].map(x=>x.pitch)):center;
 const distance=Math.abs(n.pitch-center);const isolated=distance>9&&Math.abs(n.pitch-prior)>12&&Math.abs(n.pitch-nextPitch)>12&&support===0&&!repeated;
 const relief=support>=2||repeated?.2:1;
 const penalty=(Math.max(0,distance-5)*.04+Math.max(0,distance-9)*.17)*relief+(isolated?3+(n.end-n.start<.35?1:0):0);
 result.push({...n,registerCenter:center,spikePenalty:penalty,futureSupport:support,repeated,nextPitch});
 }}return result;
}
