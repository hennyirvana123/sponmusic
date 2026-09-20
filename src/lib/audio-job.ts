const KEY='sponmusic-active-audio-job';
export function activeAudioJob(){try{const id=localStorage.getItem(KEY);return id&&/^[a-f0-9]{32}$/.test(id)?id:null;}catch{return null;}}
function clear(id:string){try{if(localStorage.getItem(KEY)===id)localStorage.removeItem(KEY);}catch{}}
class RequestError extends Error {constructor(message:string,public status=0,public malformed=false){super(message);}}
function wait(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{const done=()=>{signal.removeEventListener('abort',cancel);resolve();};const timer=setTimeout(done,ms);const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('Aborted','AbortError'));};signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});}
async function request(url:string,signal:AbortSignal,init:RequestInit={},binary=false){
 const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),55000);const cancel=()=>timeout.abort();signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 try{const r=await fetch(url,{...init,signal:timeout.signal});if(binary&&r.ok)return await r.blob();let data;try{data=await r.json();}catch{throw new RequestError(`Respons server bukan JSON (HTTP ${r.status}).`,r.status,true);}if(!r.ok)throw new RequestError(data.message||`HTTP ${r.status}`,r.status);return data;
 }catch(e){if(signal.aborted)throw new DOMException('Aborted','AbortError');if(e instanceof RequestError)throw e;throw new RequestError('Koneksi terputus atau timeout.');}finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
export async function audioJob(file:File|null,signal:AbortSignal,status:(message:string)=>void):Promise<Blob>{
 let id=activeAudioJob();
 if(!id){if(!file)throw Error('Tidak ada job aktif.');const job=await request('/api/piano/jobs/submit',signal,{method:'POST',headers:{'Content-Type':/\.wav$/i.test(file.name)?'audio/wav':'audio/mpeg'},body:file});if(!/^[a-f0-9]{32}$/.test(job.job_id))throw Error('Respons upload tidak berisi job_id valid.');id=job.job_id;try{localStorage.setItem(KEY,id!);}catch{status('Storage tidak tersedia; recovery setelah refresh tidak dapat dijamin.');}}
 const jobId=id!;let failures=0;let downloading=false;const deadline=Date.now()+30*60*1000;
 while(Date.now()<deadline){
 let data;
 try{
 if(downloading){const blob=await request(`/api/piano/jobs/${jobId}/download`,signal,{},true) as Blob;const header=new Uint8Array(await blob.slice(0,4).arrayBuffer());if(new TextDecoder().decode(header)!=='MThd')throw new RequestError('Respons download bukan MIDI.',502);clear(jobId);return blob;}
 data=await request(`/api/piano/jobs/${jobId}`,signal);
 if(data.job_id!==jobId||!['queued','processing','completed','failed'].includes(data.status))throw new RequestError('Status job tidak valid.',502);
 failures=0;
 }catch(e){if(signal.aborted)throw e;if(e instanceof RequestError&&e.status===404&&!e.malformed){clear(jobId);throw Error('Job tidak ditemukan, kedaluwarsa, atau hilang setelah restart.');}
 const retry=e instanceof RequestError&&(e.malformed||[0,429,500,502,503,504].includes(e.status));
 if(!retry||++failures>6)throw Error(`${e instanceof Error?e.message:'Koneksi gagal'} Job tetap tersimpan. Buka kembali halaman untuk melanjutkan.`);
 status(`Koneksi terganggu; mencoba job yang sama (${failures}/6)…`);await wait(Math.min(15000,2000*2**(failures-1)),signal);continue;}
 if(downloading)continue;
 status(`Status: ${data.status}`);
 if(data.status==='failed'){clear(jobId);throw Error(typeof data.error==='string'?data.error:'Transkripsi gagal');}
 if(data.status==='completed'){downloading=true;continue;}
 await wait(3000,signal);
 }throw Error('Batas menunggu tercapai. Job tetap tersimpan; buka kembali halaman untuk melanjutkan.');
}
