import Soundfont from 'soundfont-player';
import { getInstrument } from './instruments';
type Player = { play: (pitch: number, time: number) => { stop: (time?: number) => void } };
const players = new Map<string,Player>();
const loading = new Map<string,Promise<void>>();
export function loadGuitar(context: AudioContext, output: AudioNode, name='Guitar'): Promise<void> {
 const names:Record<string,string>={Guitar:'acoustic_guitar_nylon',Piano:'acoustic_grand_piano',Violin:'violin',Harp:'orchestral_harp'};
 if(players.has(name))return Promise.resolve();
 if(!loading.has(name))loading.set(name,Soundfont.instrument(context,names[name],{soundfont:'MusyngKite',destination:output,gain:name==='Guitar'?1.1:.65,release:.25}).then((p:Player)=>{players.set(name,p);}).catch((e:unknown)=>{loading.delete(name);throw e;}));
 return loading.get(name)!;
}
export function hasSample(name:string){return players.has(name);}
export function guitarVoice(context:AudioContext,pitch:number){return players.get(getInstrument().name)!.play(pitch,context.currentTime);}
