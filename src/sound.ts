// Short synthesized cues, no audio files. One idea shared by all: a glide and a bell sparkle.
// Browsers only allow sound after the person has interacted with the page, so the first click
// or key press unlocks the audio context.
import { store } from './store';

export type Cue = 'join' | 'wrap' | 'break';

let ctx: AudioContext | null = null;
const context = (): AudioContext | null => {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
};

export function unlockAudio(): void {
  const unlock = (): void => { void context()?.resume(); };
  for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlock, { once: true, capture: true });
}

interface NoteOpts { gain?: number; attack?: number; partials?: [number, number][]; glideFrom?: number }
const BELL: [number, number][] = [[1, 1], [2.76, 0.35], [5.4, 0.15]];
const GLIDE: [number, number][] = [[1, 1], [2, 0.3]];

function note(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, o: NoteOpts = {}): void {
  const { gain = 0.4, attack = 0.005, partials = [[1, 1]], glideFrom = 0 } = o;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  for (const [mult, amp] of partials) {
    const osc = c.createOscillator();
    const pg = c.createGain();
    if (glideFrom) {
      osc.frequency.setValueAtTime(glideFrom * mult, t);
      osc.frequency.exponentialRampToValueAtTime(freq * mult, t + Math.min(0.12, dur / 2));
    } else {
      osc.frequency.setValueAtTime(freq * mult, t);
    }
    pg.gain.value = amp;
    osc.connect(pg).connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

const F = { E4: 329.63, A4: 440, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5 };

type Voice = (c: AudioContext, out: AudioNode, t: number) => void;
const sweep = (c: AudioContext, out: AudioNode, t: number, from: number, to: number, dur: number, gain: number, attack = 0.005): void =>
  note(c, out, t, to, dur, { glideFrom: from, gain, attack, partials: GLIDE });
const spark = (c: AudioContext, out: AudioNode, t: number, f: number, dur: number, gain: number): void =>
  note(c, out, t, f, dur, { partials: BELL, gain });

export const VOICES: Record<Cue, Voice> = {
  // open sweep: glide up and a high sparkle
  join: (c, out, t) => { sweep(c, out, t, F.A4, F.A5, 0.6, 0.3); spark(c, out, t + 0.5, F.E6, 0.9, 0.22); },
  // stepped: three short glides climbing, then a sparkle
  wrap: (c, out, t) => {
    ([[F.C5, F.E5], [F.E5, F.G5], [F.G5, F.C6]] as const).forEach(([a, b], i) => sweep(c, out, t + i * 0.3, a, b, 0.25, 0.26));
    spark(c, out, t + 0.95, F.E6, 1.2, 0.22);
  },
  // settle: two overlapping glides down, each softer, landing on a warm low bell through a low-pass
  break: (c, out, t) => {
    const warm = c.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 2200;
    warm.connect(out);
    sweep(c, warm, t, F.G5, F.E5, 0.75, 0.22, 0.04);
    sweep(c, warm, t + 0.35, F.E5, F.C5, 0.8, 0.16, 0.04);
    note(c, warm, t + 0.85, F.C5, 3, { partials: BELL, gain: 0.22 });
    note(c, warm, t + 0.85, F.C5 / 2, 3.4, { partials: [[1, 1], [2, 0.2]], gain: 0.2, attack: 0.03 });
  },
};

export function playCue(cue: Cue, volume = 0.6): void {
  if (store.muted) return;
  const c = context();
  if (!c) return;
  void c.resume().then(() => {
    const master = c.createGain();
    master.gain.value = volume;
    master.connect(c.destination);
    VOICES[cue](c, master, c.currentTime + 0.03);
  }).catch(() => {});
}
