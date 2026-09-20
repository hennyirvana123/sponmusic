import { defineHandler } from 'nitro';
import { diagnosticModelUrl } from '../../../../utils/dev-diagnostic-connection';
export default defineHandler(async event=>{
 if(!import.meta.dev)return new Response(null,{status:404});
 const req=event.req;const path=new URL(req.url).pathname.split('/').pop()||'';
 // Custom header forces cross-origin browsers to preflight; no CORS permission is granted.
 if(req.headers.get('x-sponmusic-diagnostic')!=='1'||req.headers.get('sec-fetch-site')==='cross-site')return Response.json({message:'Diagnostic requires same-origin preview request'},{status:403});
 if(!/^(connection|submit|[a-f0-9]{32})$/.test(path))return Response.json({message:'Invalid path'},{status:400});
 try{
 const url=diagnosticModelUrl();
 if(path==='connection')return Response.json({configured:true,message:'Preview backend reachable. Model URL configured; connectivity not yet tested.'});
 const submit=path==='submit';if(req.method!==(submit?'POST':'GET'))return Response.json({message:'Method not allowed'},{status:405});
 let body:FormData|undefined;
 if(submit){if(!req.body)throw Error('Missing audio');const mime=req.headers.get('content-type')||'';if(!['audio/mpeg','audio/wav'].includes(mime))throw Error('Expected MP3/WAV');const reader=req.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000000)throw Error('Audio exceeds 20 MB');chunks.push(value);}}finally{await reader.cancel();}const audio=new Uint8Array(size);let offset=0;for(const chunk of chunks){audio.set(chunk,offset);offset+=chunk.length;}body=new FormData();body.append('audio',new Blob([audio],{type:mime}),mime==='audio/wav'?'audio.wav':'audio.mp3');body.append('task','transcription');}else url.pathname+='/'+path;
 const response=await fetch(url,{method:submit?'POST':'GET',body,redirect:'error',signal:AbortSignal.timeout(45000)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{return Response.json({message:'Basic Pitch returned non-JSON',upstreamStatus:response.status,detail:text.slice(0,4000)},{status:502});}
 if(!response.ok)return Response.json({message:'Basic Pitch request failed',upstreamStatus:response.status,detail:data},{status:response.status});
 return Response.json(data,{status:submit?202:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[DEV diagnostic connection]',e);return Response.json({message:e instanceof Error?e.message:'Preview backend error',stage:'preview-to-basic-pitch'},{status:502});}
});
