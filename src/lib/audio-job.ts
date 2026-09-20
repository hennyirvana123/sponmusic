export async function audioJob(file:File,signal:AbortSignal,status:(message:string)=>void):Promise<Blob>{
 const check=async(r:Response)=>{const data=await r.json();if(!r.ok)throw Error(data.message||'Job gagal');return data;};
 const job=await check(await fetch('/api/piano/jobs/submit',{method:'POST',headers:{'Content-Type':/\.wav$/i.test(file.name)?'audio/wav':'audio/mpeg'},body:file,signal}));
 const deadline=Date.now()+30*60*1000;
 while(Date.now()<deadline){
 const data=await check(await fetch(`/api/piano/jobs/${job.job_id}`,{signal}));status(`Status: ${data.status}`);
 if(data.status==='failed')throw Error(data.error||'Transkripsi gagal');
 if(data.status==='completed'){const response=await fetch(`/api/piano/jobs/${job.job_id}/download`,{signal});if(!response.ok){await check(response);throw Error('Download gagal');}return response.blob();}
 await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},3000);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
 }throw Error('Batas menunggu 30 menit tercapai.');
}
