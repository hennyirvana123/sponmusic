import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
export default function AudioDiagnostic(){
 const [file,setFile]=useState<File|null>(null),[report,setReport]=useState<Record<string,unknown>|null>(null),[status,setStatus]=useState('Select MP3/WAV, up to 20 MB / 60 seconds.'),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[copyStatus,setCopyStatus]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const run=async()=>{
 if(!file||busy)return;
 const c=new AbortController();controller.current=c;setBusy(true);setReport(null);setCopyStatus('');
 const json=async(url:string,options:RequestInit={})=>{
 const method=options.method||'GET';let r:Response;
 try{r=await fetch(url,{...options,signal:c.signal});}catch(e){throw Error(`${method} ${url}: ${c.signal.aborted?'Cancelled':e instanceof Error?e.message:String(e)}`);}
 const text=await r.text();let data;
 try{data=JSON.parse(text);}catch{throw Error(`${method} ${url}: HTTP ${r.status}; non-JSON response: ${text.slice(0,8000)||'(empty)'}`);}
 if(!r.ok)throw Error(`${method} ${url}: HTTP ${r.status}; ${JSON.stringify(data).slice(0,8000)}`);
 if(!data||typeof data!=='object')throw Error(`Invalid response from ${url}`);return data;
 };
 try{
 setStatus('Uploading audio…');
 const job=await json('/api/piano/jobs/submit',{method:'POST',headers:{'Content-Type':/\.wav$/i.test(file.name)?'audio/wav':'audio/mpeg'},body:file});
 if(!/^[a-f0-9]{32}$/.test(job.job_id))throw Error('Invalid job ID');
 const deadline=Date.now()+1800000;
 while(Date.now()<deadline){
 const state=await json(`/api/piano/jobs/${job.job_id}`);setStatus(`${job.job_id}: ${state.status}`);
 if(state.status==='failed')throw Error(state.error||'Transcription failed');
 if(state.status==='completed'){
 setStatus('Analyzing transcription and arrangement…');
 const data=await json(`/api/dev/audio-diagnostic/${job.job_id}?detail=1`);
 setReport({testFile:file.name,jobId:job.job_id,...data});setStatus('Diagnostic complete. Results are heuristic, not a verified root cause.');return;
 }
 if(!['queued','processing'].includes(state.status))throw Error('Unexpected job status');
 await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);c.signal.removeEventListener('abort',cancel);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{c.signal.removeEventListener('abort',cancel);resolve();},3000);c.signal.addEventListener('abort',cancel,{once:true});if(c.signal.aborted)cancel();});
 }throw Error('30-minute waiting limit reached.');
 }catch(e){setStatus(e instanceof Error?e.message:'Diagnostic failed');}finally{setBusy(false);}
 };
 const text=report?JSON.stringify(report,null,2):'';
 return <main className="!max-w-5xl space-y-5"><Link to="/" className="text-violet-300">← SPONMUSIC</Link><h1>Analyze Arrangement (DEV)</h1><p className="text-purple-200">Upload the test recording. This uses the existing async transcription service and current arrangement engine. No demo results.</p><input aria-label="Diagnostic audio" type="file" accept=".mp3,.wav" disabled={busy} onChange={e=>{setReport(null);setCopyStatus('');const f=e.target.files?.[0];if(f&&/\.(mp3|wav)$/i.test(f.name)&&f.size<=20000000)setFile(f);else{setFile(null);setStatus('Choose MP3/WAV, maximum 20 MB.');}}}/><label className="flex gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I have permission to process this recording and send it to the configured backend/model.</label><div className="flex gap-3"><Button className="primary-button" disabled={!file||!consent||busy} onClick={run}>Run diagnostic</Button>{busy&&<Button className="soft-button" onClick={()=>controller.current?.abort()}>Stop waiting</Button>}</div><p role="status" className="whitespace-pre-wrap break-words">{status}</p>{report&&<section className="space-y-3"><Button className="soft-button" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopyStatus('JSON copied.');}catch{setCopyStatus('Clipboard unavailable. Select and copy the JSON below manually.');}}}>Copy JSON</Button><span role="status" className="ml-3 text-sm">{copyStatus}</span><pre className="max-h-[65vh] overflow-auto rounded-xl border border-violet-800 bg-violet-950/40 p-4 text-xs text-purple-100" tabIndex={0}>{text}</pre></section>}</main>;
}
