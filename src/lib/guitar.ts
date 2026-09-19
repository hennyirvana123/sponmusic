// A damped delay-line string: the initial pick noise becomes a pitched vibration.
export function guitarVoice(context: AudioContext, pitch: number, output: AudioNode) {
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const period = Math.max(2, Math.round(context.sampleRate / frequency - .5));
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 5), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const string = new Float32Array(period);
  let mean = 0;
  for (let i = 0; i < period; i++) { string[i] = Math.random() * 2 - 1; mean += string[i]; }
  mean /= period;
  for (let i = 0; i < period; i++) string[i] -= mean;
  const damping = Math.exp(-1 / (frequency * 2.5));
  for (let i = 0; i < samples.length; i++) {
    const index = i % period;
    const value = string[index];
    string[index] = damping * .5 * (value + string[(index + 1) % period]);
    samples[i] = value * Math.min(1, i / (context.sampleRate * .002));
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const body = context.createBiquadFilter();
  body.type = 'peaking'; body.frequency.value = 220; body.Q.value = .8; body.gain.value = 3;
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowpass'; warmth.frequency.value = Math.min(8500, context.sampleRate * .4); warmth.Q.value = .5;
  source.connect(body); body.connect(warmth); warmth.connect(output);
  source.onended = () => { source.disconnect(); body.disconnect(); warmth.disconnect(); };
  source.start();
  return source;
}
