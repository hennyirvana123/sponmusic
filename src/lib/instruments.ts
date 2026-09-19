export const instruments = {
  piano: {name:'Piano', attack:.008, decay:1.5, sustain:.045, harmonics:[1,.25,.11]},
  guitar: {name:'Guitar', attack:.004, decay:.8, sustain:.008, harmonics:[1,.5,.28,.12,.06]},
  lyre: {name:'Lyre', attack:.006, decay:1.1, sustain:.012, harmonics:[1,.12,.34,.05,.1]},
  harp: {name:'Harp', attack:.012, decay:2.8, sustain:.015, harmonics:[1,.32,.16,.08,.04,.02]},
  violin: {name:'Violin', attack:.16, decay:.4, sustain:.13, harmonics:[1,.7,.5,.35,.25,.18,.12,.08]},
};
export type Instrument = keyof typeof instruments;
let selected: Instrument = 'piano';
export function setInstrument(value: Instrument) { selected = value; }
export function getInstrument() { return instruments[selected]; }
