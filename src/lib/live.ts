export let keyboardOctave = 0;
export function setKeyboardOctave(value: number) { keyboardOctave = value; }
export type LiveEvent = { pitch: number; on: boolean; time: number };
const listeners = new Set<(e: LiveEvent) => void>();
export function liveNote(pitch: number, on: boolean) { listeners.forEach(fn=>fn({pitch,on,time:performance.now()})); }
export function listenLive(fn: (e: LiveEvent)=>void) { listeners.add(fn);return ()=>{listeners.delete(fn);}; }
