import { useEffect, useRef, useState } from 'react';
import { isBlack, keyMap, noteName, pitches, sound } from '@/lib/music';
import { Keyboard, Music2 } from 'lucide-react';

export default function Piano({ volume }: { volume: number }) {
  const [active, setActive] = useState<number[]>([]);
  const held = useRef(new Map<number, () => void>());
  const start = (pitch: number) => { if (held.current.has(pitch)) return; held.current.set(pitch, sound(pitch, volume)); setActive([...held.current.keys()]); };
  const stop = (pitch: number) => { held.current.get(pitch)?.(); held.current.delete(pitch); setActive([...held.current.keys()]); };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const pitch = keyMap[e.key.toLowerCase()];
      if (pitch !== undefined && !e.repeat) { e.preventDefault(); start(pitch); }
    };
    const up = (e: KeyboardEvent) => { const p = keyMap[e.key.toLowerCase()]; if (p !== undefined) stop(p); };
    const clear = () => { held.current.forEach(s => s()); held.current.clear(); setActive([]); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); clear(); };
  }, [volume]);
  const whites = pitches.filter(p => !isBlack(p));
  return <section className="panel piano-panel">
    <div className="section-heading"><div className="flex items-center gap-3"><Keyboard size={18} className="text-violet-400"/><h2>Live piano</h2><span className="tag">Grand Piano</span></div><span className="muted text-xs hidden sm:block">Keyboard kamu, instrumen kamu.</span></div>
    <div className="piano-scroll"><div className="piano-keys" style={{minWidth: 1000}}>
      {pitches.map(p => {
        const black = isBlack(p); const index = whites.filter(w => w < p).length;
        const key = Object.entries(keyMap).find(([,v]) => v === p)?.[0];
        return <button key={p} aria-label={`${noteName(p)}${key ? ` tombol ${key}` : ''}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start(p); }} onPointerUp={() => stop(p)} onPointerCancel={() => stop(p)} className={`piano-key ${black ? 'black-key' : 'white-key'} ${active.includes(p) ? 'pressed' : ''}`} style={{left: `${(index - (black ? .32 : 0)) / whites.length * 100}%`, width: `${(black ? .64 : 1) / whites.length * 100}%`}}>
          <span>{key?.toUpperCase()}</span>{!black && <small>{noteName(p)}</small>}
        </button>;
      })}
    </div></div>
    <div className="piano-caption"><span><span className="status-dot"/> Keyboard aktif</span><span className="hidden md:inline">Putih <b>ZXCVBNMQWERTYUIOP</b><i/> Hitam <b>ASDFGHJKL1234567890</b></span><Music2 size={14}/></div>
  </section>;
}
