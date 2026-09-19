import { useEffect, useRef, useState } from 'react';
import { Circle, Download, Square, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isBlack, keyMap, pitches, recordingAudio, subscribeNotes } from '@/lib/music';
import { toast } from 'sonner';
import './visualizer.css';

type Trail = { id: string; pitch: number; start: number; end?: number };
export default function Visualizer({ onRecordingChange }: { onRecordingChange: (active: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const trails = useRef<Trail[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const url = useRef('');
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [video, setVideo] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [supported, setSupported] = useState(false);
  const notify = useRef(onRecordingChange); notify.current = onRecordingChange;
  useEffect(() => {
    mounted.current = true;
    setSupported(typeof MediaRecorder !== 'undefined' && typeof canvas.current?.captureStream === 'function' && ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].some(t => MediaRecorder.isTypeSupported(t)));
    const unsubscribe = subscribeNotes(e => {
      if (e.on) trails.current.push({id:e.id,pitch:e.pitch,start:performance.now()});
      else { const note=trails.current.find(n=>n.id===e.id); if(note)note.end=performance.now(); }
    });
    const c = canvas.current!;
    const g = c.getContext('2d')!;
    const pitches = Array.from({length:128},(_,i)=>i);
    const whites = pitches.filter(p=>!isBlack(p));
    const w = c.width / whites.length;
    let frame=0;
    const draw = () => {
      const now=performance.now(); const speed=.14; const top=128;
      g.fillStyle='#140e21'; g.fillRect(0,0,c.width,c.height);
      g.fillStyle='#c9aff5';g.font='bold 17px sans-serif';g.fillText('SPONMUSIC',24,32);
      g.fillStyle='#9b88b2';g.font='12px sans-serif';g.fillText('LIVE VISUALIZER  ·  FALLING NOTES',24,53);
      for(let i=0;i<=whites.length;i++){g.strokeStyle='#2c1e40';g.beginPath();g.moveTo(i*w,top);g.lineTo(i*w,c.height);g.stroke();}
      trails.current=trails.current.filter(n=>!n.end || (now-n.end)*speed<c.height-top);
      for(const n of trails.current){
        const black=isBlack(n.pitch);const index=whites.filter(p=>p<n.pitch).length;
        const x=(index-(black?.32:0))*w+2;const width=w*(black?.64:1)-4;
        const bottom=top+(now-n.start)*speed;const y=n.end?top+(now-n.end)*speed:top;
        g.fillStyle=black?'#d392f5':'#9171f6';g.shadowColor=g.fillStyle;g.shadowBlur=12;
        g.beginPath();g.roundRect(x,y,width,Math.max(9,Math.min(bottom,c.height+30)-y),5);g.fill();g.shadowBlur=0;
      }
      for(const black of [false,true]) for(const p of pitches.filter(p=>isBlack(p)===black)) {
        const index=whites.filter(v=>v<p).length;const x=(index-(black?.32:0))*w;
        const active=trails.current.some(n=>n.pitch===p&&!n.end);
        g.fillStyle=active?'#bd91ff':black?'#2d2040':'#e9dff4';
        g.fillRect(x+1,70,w*(black?.64:1)-2,black?34:56);
        const k=Object.entries(keyMap).find(([,v])=>v===p)?.[0];
        g.fillStyle=black?'#efe1ff':'#493460';g.font='10px sans-serif';
        if(k)g.fillText(k.toUpperCase(),x+5,black?92:119);
      }
      g.fillStyle='#bd8efa';g.fillRect(0,127,c.width,2);
      if(!trails.current.length){g.textAlign='center';g.fillStyle='#8d789f';g.font='16px sans-serif';g.fillText('Mainkan keyboard. Biarkan nadamu mengalir.',c.width/2,320);g.textAlign='left';}
      frame=requestAnimationFrame(draw);
    };
    draw();
    return()=>{mounted.current=false;unsubscribe();cancelAnimationFrame(frame);if(recorder.current?.state==='recording')recorder.current.stop();cleanup.current?.();cleanup.current=null;if(url.current)URL.revokeObjectURL(url.current);notify.current(false);};
  },[]);
  useEffect(()=>{
    if(!recording)return;
    const start=Date.now();
    const timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-start)/1000);setSeconds(elapsed);if(elapsed>=300&&recorder.current?.state==='recording'){recorder.current.stop();toast.info('Rekaman berhenti otomatis setelah 5 menit.');}},250);
    return()=>clearInterval(timer);
  },[recording]);
  const start = () => {
    if(!canvas.current || !supported)return;
    let capture: MediaStream | undefined;
    let audio: ReturnType<typeof recordingAudio> | undefined;
    try {
      audio=recordingAudio();capture=canvas.current.captureStream(30);
      const stream=new MediaStream([...capture.getVideoTracks(),...audio.stream.getAudioTracks()]);
      cleanup.current=()=>{capture?.getTracks().forEach(t=>t.stop());audio?.release();};
      const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))!;
      const r=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:4000000});recorder.current=r;
      const chunks:Blob[]=[];let failed=false;
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onerror=()=>{failed=true;toast.error('Rekaman gagal. Coba lagi di Chrome atau Edge.');if(r.state!=='inactive')r.stop();cleanup.current?.();cleanup.current=null;if(mounted.current){setRecording(false);notify.current(false);}};
      r.onstop=()=>{
        cleanup.current?.();cleanup.current=null;
        if(!mounted.current)return;
        setRecording(false);notify.current(false);
        if(!failed&&chunks.length){if(url.current)URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(new Blob(chunks,{type:mimeType}));setVideo(url.current);toast.success('Video siap diputar dan diunduh.');}
      };
      r.start(1000);setSeconds(0);setRecording(true);notify.current(true);
    }catch {cleanup.current?.();cleanup.current=null;capture?.getTracks().forEach(t=>t.stop());toast.error('Browser tidak dapat memulai rekaman WebM. Coba Chrome atau Edge.');}
  };
  return <section className="panel mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-violet-900/40">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="text-violet-400" size={17}/> Falling notes</h2><p className="mt-1 text-xs text-purple-300/80">Not turun saat dimainkan · tahan tuts untuk not panjang</p></div>
      <Button className={recording?'bg-rose-700 hover:bg-rose-600 rounded-lg':'primary-button'} disabled={!supported} onClick={()=>recording?recorder.current?.stop():start()}>{recording?<Square size={14}/>:<Circle size={14}/>} {recording?`Stop · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Rekam video'}</Button>
    </div>
    <canvas ref={canvas} width={1280} height={640} className="block w-full h-auto" aria-label="Visualisasi not piano turun"/>
    <div className="p-4 text-xs text-purple-200/75 space-y-2"><p>{supported?'Rekam canvas + suara piano langsung, tanpa mikrofon. WebM · 30 fps · maksimal 5 menit.':'Rekaman WebM tidak tersedia di browser ini. Gunakan Chrome atau Edge terbaru.'}</p><p>Mainkan piano di bawah, atau putar proyek. Tetap di tab ini selama merekam agar animasi lancar.</p></div>
    {video&&!recording&&<div className="border-t border-purple-900/40 p-4 space-y-3"><video controls src={video} className="w-full max-h-80 rounded-lg"/><a href={video} download="SPONMUSIC-visualizer.webm" className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"><Download size={15}/> Unduh video WebM</a></div>}
  </section>;
}
