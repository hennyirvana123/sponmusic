import { useEffect, useRef, useState } from 'react';
import { AudioLines, Blocks, ChevronDown, CircleHelp, Download, Eraser, FolderOpen, Headphones, Keyboard, LayoutGrid, Music2, Pause, Pencil, Play, Plus, Repeat2, Save, SlidersHorizontal, Sparkles, Square, Upload, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import Piano from '@/components/Piano';
import PianoRoll from '@/components/PianoRoll';
import Visualizer from '@/components/Visualizer';
import TempoInput from '@/components/TempoInput';
import { demo, Project, sound, silence, setVolume, validProject, projectSteps } from '@/lib/music';
import { readMidi, MidiImport } from '@/lib/import-midi';
import MidiTrackPicker from '@/components/MidiTrackPicker';
import StudioExtras from '@/components/StudioExtras';

function initial(): Project { try { const p = JSON.parse(localStorage.getItem('sponmusic-current') || 'null'); if (validProject(p)) return p; } catch {} return demo; }
export default function Index() {
  const [midiImport,setMidiImport]=useState<MidiImport|null>(null);
  const [midiSource,setMidiSource]=useState<MidiImport|null>(()=>{try{const data=JSON.parse(localStorage.getItem('sponmusic-midi-source')||'null');if(data&&Array.isArray(data.tracks)&&data.tracks.every((t:any)=>typeof t.id==='number'&&typeof t.name==='string'&&Array.isArray(t.notes)&&validProject({name:data.name,bpm:data.bpm,notes:t.notes})))return data;}catch{}return null;});
  useEffect(()=>{try{localStorage.setItem('sponmusic-midi-source',JSON.stringify(midiSource));}catch{toast.error('Sumber MIDI tidak dapat disimpan: penyimpanan penuh.');}},[midiSource]);
  const [mode, setMode] = useState<'studio'|'visualizer'>('studio');
  const [recording, setRecording] = useState(false);
  const [project, setProject] = useState<Project>(initial);
  const currentNoteIds = new Set(project.notes.map(n=>n.id));
  const selectedTrackIds = midiSource?.tracks.filter(t=>t.notes.some(n=>currentNoteIds.has(n.id))).map(t=>t.id) ?? [];
  const canReselect = !!midiSource && selectedTrackIds.length > 0;
  const [playing,setPlaying] = useState(false);
  const [step,setStep] = useState(0);
  const [loop,setLoop] = useState(true);
  const [volume,updateVolume] = useState(.65);
  const [length,setLength] = useState(4);
  const [erase,setErase] = useState(false);
  const [modal,setModal] = useState<'projects'|'help'|null>(null);
  const [saved,setSaved] = useState<Project[]>(() => {try { const p=JSON.parse(localStorage.getItem('sponmusic-projects')||'[]'); return Array.isArray(p)?p.filter(validProject):[]; } catch {return [];} });
  const [stored,setStored] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const current = useRef({project,loop,volume}); current.current={project,loop,volume};
  useEffect(() => {try {localStorage.setItem('sponmusic-current',JSON.stringify(project));setStored(true);} catch {setStored(false);} },[project]);
  useEffect(() => { setVolume(volume); }, [volume]);
  const cursor=useRef(0);
  const [seekVersion,setSeekVersion]=useState(0);
  useEffect(() => {
    if (!playing) return;
    let position=cursor.current; let last=performance.now(); let timer: ReturnType<typeof setTimeout>; let cancelled=false;
    let triggered=new Set<string>();
    const tick=() => {
      if(cancelled) return;
      const {project:p,loop:l,volume:v}=current.current;
      const now=performance.now();position+=(now-last)/1000*p.bpm/15;last=now;
      if(position>=projectSteps(p.notes)) { if(l) {position=0;triggered=new Set();silence();} else {setPlaying(false);setStep(0);return;} }
      cursor.current=position;setStep(Math.floor(position));
      p.notes.filter(n=>n.step<=position&&!triggered.has(n.id)).forEach(n=>{triggered.add(n.id);const remaining=n.step+n.length-position;if(remaining>0)sound(n.pitch,v,remaining*15/p.bpm);});
      timer=setTimeout(tick,10);
    };
    tick(); return ()=> {cancelled=true;clearTimeout(timer);silence();};
  },[playing,seekVersion]);
  const stop=()=>{cursor.current=0;setPlaying(false);setStep(0);silence();};
  const save=()=>{const next=[project,...saved.filter(p=>p.name!==project.name)].slice(0,30);try{localStorage.setItem('sponmusic-projects',JSON.stringify(next));setSaved(next);toast.success('Proyek tersimpan di browser');}catch{toast.error('Penyimpanan browser penuh atau tidak tersedia');}};
  const exportProject=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${project.name || 'SPONMUSIC'}.sponmusic.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast.success('File proyek diekspor');};
  const loadFile=async(f?:File)=>{if(!f)return;try{if(f.size>2000000)throw Error('File maksimal 2 MB.');if(/\.(mid|midi)$/i.test(f.name)){const data=await readMidi(f);stop();setMidiImport(data);}else{const p=JSON.parse(await f.text());if(!validProject(p))throw Error('File proyek tidak valid.');stop();setProject(p);setLoop(false);toast.success('Proyek berhasil diimpor');}}catch(e){toast.error(e instanceof Error?e.message:'Impor gagal. Gunakan MIDI atau JSON SPONMUSIC.');}if(file.current)file.current.value='';};
  return <div className={`studio-shell ${mode==='visualizer'?'visualizer-mode':''}`}>
    {midiImport&&<MidiTrackPicker data={midiImport} initialIds={midiImport===midiSource?selectedTrackIds:undefined} onClose={()=>setMidiImport(null)} onImport={p=>{stop();setProject(midiImport===midiSource?{...p,name:project.name,bpm:project.bpm}:p);setMidiSource(midiImport);setLoop(false);setMidiImport(null);toast.success('Pilihan track diterapkan.');}}/>}
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-icon"><AudioLines size={25}/></span><span>SPON<span className="brand-light">MUSIC</span><small>YOUR IDEAS. YOUR SOUND.</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <button className="nav-item selected" onClick={()=>setModal(null)}><LayoutGrid size={18}/> Studio <span className="nav-dot"/></button>
      <button className="nav-item" onClick={()=>setModal('projects')}><FolderOpen size={18}/> Proyek saya <span className="count">{saved.length}</span></button>
      <button className="nav-item" onClick={()=>setModal('help')}><Keyboard size={18}/> Panduan keyboard</button>
      <div className="sidebar-divider"/><div className="workspace-label">INSTRUMEN</div>
      <div className="instrument-item"><span className="instrument-icon"><Music2 size={18}/></span><div>Grand Piano<small>Acoustic · Keys</small></div><span className="status-dot"/></div>
      <div className="creative-card"><div className="mini-art"><div/><div/><div/><div/><div/><div/><div/><div/></div><Sparkles size={17}/><h3>Mulai dari satu nada.</h3><p>Ide kecil hari ini, melodi<br/>besar esok hari.</p><button onClick={()=>{stop();setProject({...demo,notes:demo.notes.map(n=>({...n,id:crypto.randomUUID()}))});toast.success('Melodi inspirasi dimuat');}}>Coba melodi inspirasi <span>↗</span></button></div>
      <div className="sidebar-bottom"><span className="profile">S</span><div>My workspace<small>Local studio <span>•</span> Tanpa akun</small></div><SlidersHorizontal size={16}/></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><Blocks size={16}/><span>Workspace</span><span>/</span><strong>Studio</strong></div><div className="flex items-center gap-3"><span className="local-badge"><span className="status-dot"/> Semua tersimpan lokal</span><button className="icon-button" aria-label="Bantuan" onClick={()=>setModal('help')}><CircleHelp size={18}/></button><span className="profile small">S</span></div></header>
      <main>
        <div className="welcome"><div><div className="eyebrow"><span/> YOUR PERSONAL MUSIC SPACE</div><h1>Beri suara pada idemu<span>.</span></h1><p>Mainkan, susun, dan ciptakan melodi. Semua dari keyboard kamu.</p></div><div className="flex gap-2"><Button variant="outline" className="soft-button" onClick={()=>file.current?.click()}><Upload size={15}/> Impor</Button><Button className="primary-button" onClick={()=>{stop();setProject({name:'Untitled melody',bpm:120,notes:[]});}}><Plus size={17}/> Proyek baru</Button></div></div>
        <section className="panel project-panel"><div className="project-title"><span className="project-art"><AudioLines size={27}/></span><div><input aria-label="Nama proyek" maxLength={100} value={project.name} onChange={e=>setProject({...project,name:e.target.value})}/><p><span className="status-dot"/>{stored?'Tersimpan otomatis':'Penyimpanan tidak tersedia'}<span className="separator">•</span> Proyek lokal</p></div></div><div className="project-actions"><Button variant="ghost" className="save-button" onClick={save}><Save size={16}/><span>Simpan proyek</span></Button><Button variant="outline" className="soft-button" onClick={exportProject}><Download size={15}/> Ekspor <ChevronDown size={13}/></Button></div></section>
        <section className="panel editor-panel">
          <div className="transport"><div className="transport-controls"><button className={`play-button ${playing?'is-playing':''}`} aria-label={playing?'Jeda':'Putar'} onClick={()=>setPlaying(!playing)}>{playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button><button className="icon-button" aria-label="Stop" onClick={stop}><Square size={15} fill="currentColor"/></button><button className={`icon-button ${loop?'active-tool':''}`} aria-label="Ulangi loop" aria-pressed={loop} onClick={()=>setLoop(!loop)}><Repeat2 size={19}/></button><div className="control-divider"/><div className="tempo"><TempoInput value={project.bpm} onChange={bpm=>setProject(p=>({...p,bpm}))}/><span>BPM</span></div><div className="control-divider"/><div className="time-display">{String(Math.floor(step/16)+1).padStart(2,'0')}<span>:</span>{String(Math.floor(step%16/4)+1).padStart(2,'0')}<span>:</span>{String(step%4).padStart(2,'0')}<small>BAR <span>BEAT</span> STEP</small></div></div><div className="transport-right"><span className="time-signature">4 / 4</span><span className="tag">4 bars</span><div className="volume"><Volume2 size={17}/><input aria-label="Volume" type="range" min={0} max={1} step={.01} value={volume} onChange={e=>updateVolume(Number(e.target.value))}/></div></div></div>
          <div className="roll-toolbar"><div className="flex items-center gap-3"><span className="roll-title"><Music2 size={17}/> Piano roll</span><span className="muted">/</span><span className="text-xs muted">Grand Piano</span></div><div className="flex items-center gap-2"><div className="tool-toggle"><button aria-label="Gambar not" className={!erase?'chosen':''} onClick={()=>setErase(false)}><Pencil size={14}/></button><button aria-label="Hapus not" className={erase?'chosen':''} onClick={()=>setErase(true)}><Eraser size={15}/></button></div><span className="text-xs muted hidden sm:block">Durasi</span><select aria-label="Durasi not" value={length} onChange={e=>setLength(Number(e.target.value))}><option value={1}>1/16 note</option><option value={2}>1/8 note</option><option value={4}>1/4 note</option><option value={8}>1/2 note</option><option value={16}>1 bar</option></select></div></div>
          <PianoRoll notes={project.notes} step={step} playing={playing} length={length} erase={erase} onChange={notes=>setProject(p=>({...p,notes}))} preview={p=>sound(p,volume,.45)}/>
          <div className="editor-footer"><span><span className="violet-dot"/>{project.notes.length} notes <span className="separator">•</span> C3 – G♯6</span><span>Klik untuk menambah · Klik not untuk menghapus · Seret tepi untuk durasi</span><span>1/16 grid</span></div>
        </section>
        <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Mode studio">
          <Button variant="outline" className={mode==='studio'?'primary-button':'soft-button'} disabled={recording} onClick={()=>setMode('studio')}>Studio · Piano roll</Button>
          <Button variant="outline" className={mode==='visualizer'?'primary-button':'soft-button'} onClick={()=>setMode('visualizer')}>Visualizer · Not turun</Button>
          {canReselect&&<Button variant="outline" className="soft-button sm:ml-auto" disabled={recording} title="Pilih ulang track MIDI. Mengganti pilihan memuat ulang not sumber dan menggantikan edit piano roll. Tersedia selama sesi ini." onClick={()=>{stop();setMidiImport(midiSource);}}><SlidersHorizontal size={14}/> Track MIDI <span className="rounded bg-violet-500/20 px-1.5 text-violet-200">{selectedTrackIds.length}</span></Button>}
          {recording&&<span className="text-xs text-rose-300">Hentikan rekaman sebelum pindah mode.</span>}
        </div>
        {mode==='visualizer'&&<Visualizer onRecordingChange={setRecording}/>}
        <StudioExtras project={project} onProject={setProject} step={step} onStop={stop} onSeek={s=>{cursor.current=s;setStep(s);setSeekVersion(v=>v+1);}}/>
        <Piano volume={volume}/>
        <div className="bottom-note"><span><Headphones size={15}/> Pakai headphone untuk pengalaman terbaik.</span><span>Dibuat untuk ide yang belum terdengar. <span className="text-violet-400">SPONMUSIC</span></span></div>
        <p className="mt-3 text-xs text-purple-300">Impor .mid / .midi atau JSON · {projectSteps(project.notes)/16} bar · Semua track MIDI digabung sebagai piano. Posisi not mempertahankan timing MIDI; tampilan grid memakai 4/4.</p>
      </main>
    </div>
    <input className="hidden" type="file" accept=".mid,.midi,.json,audio/midi,audio/x-midi,application/json" ref={file} onChange={e=>void loadFile(e.target.files?.[0])}/>
    <Dialog open={modal!==null} onOpenChange={v=>{if(!v)setModal(null);}}><DialogContent className="studio-dialog"><DialogHeader><DialogTitle>{modal==='projects'?'Proyek saya':'Keyboard jadi pianomu'}</DialogTitle></DialogHeader>{modal==='projects'?<div className="space-y-3">{saved.length===0?<p className="muted py-6">Belum ada proyek. Klik “Simpan proyek” untuk menyimpan melodi pertama kamu.</p>:saved.map((p,i)=><button key={i} className="saved-project" onClick={()=>{stop();setProject(p);setModal(null);}}><span className="project-art"><Music2/></span><span><b>{p.name}</b><small>{p.notes.length} notes · {p.bpm} BPM</small></span><Play size={16}/></button>)}</div>:<div className="help-content"><p>Mainkan piano dengan keyboard atau klik/sentuh tuts. Beberapa tombol bisa dimainkan bersamaan untuk chord.</p><h3>Tuts putih</h3><code>ZXCVBNMQWERTYUIOP</code><h3>Tuts hitam</h3><code>DFG1234567890</code><p>Tiga belas tuts hitam pertama memakai tombol DFG1234567890 dari kiri ke kanan. Tuts tambahan tanpa label keyboard bisa dimainkan lewat klik atau sentuh.</p><h3>Buat melodi di piano roll</h3><p>Klik grid untuk menambah not. Klik not untuk menghapusnya; seret ujung kanan not untuk mengatur panjangnya. Gulir untuk menemukan nada lainnya. Atur BPM, lalu tekan Play. Loop mengulang 4 bar.</p><p>Proyek aktif disimpan otomatis di browser ini. Simpan proyek untuk menambahkannya ke daftar, atau ekspor JSON sebagai cadangan. File proyek tidak berisi rekaman audio.</p></div>}</DialogContent></Dialog>
  </div>;
}
