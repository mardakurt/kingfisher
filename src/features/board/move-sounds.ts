'use client';

/**
 * Move sounds, made rather than shipped.
 *
 * A short knock for a move, a heavier one for a capture, and the knock with a
 * small tone above it for a check — synthesised with Web Audio from noise
 * and a sine, so there is no audio file to license, download or cache, and
 * nothing to fail to load. Off unless the person turns it on: Kingfisher is a
 * research tool, and a sound nobody asked for in a library is a fault.
 *
 * Played when the board steps forward by one move — a move played, → pressed,
 * or the replay — and never for a jump, a step back or a document opened, so
 * clicking a move twenty plies away does not sound like a game.
 */

import { useEffect } from 'react';

import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';

export type MoveSound = 'move' | 'capture' | 'check';

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  const Context =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) return null;
  try {
    context = new Context();
  } catch {
    return null;
  }
  return context;
}

/** A tenth of a second of white noise, made once and reused. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.1), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

/** A filtered burst of noise and a low sine: the wooden knock. */
function knock(ctx: AudioContext, at: number, centre: number, decay: number, level: number): void {
  const burst = ctx.createBufferSource();
  burst.buffer = noiseBuffer(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = centre;
  band.Q.value = 1.4;
  const body = ctx.createGain();
  body.gain.setValueAtTime(0.0001, at);
  body.gain.exponentialRampToValueAtTime(level, at + 0.003);
  body.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  burst.connect(band).connect(body).connect(ctx.destination);
  burst.start(at);
  burst.stop(at + decay + 0.02);

  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(190, at);
  thud.frequency.exponentialRampToValueAtTime(110, at + decay);
  const low = ctx.createGain();
  low.gain.setValueAtTime(0.0001, at);
  low.gain.exponentialRampToValueAtTime(level * 0.5, at + 0.004);
  low.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  thud.connect(low).connect(ctx.destination);
  thud.start(at);
  thud.stop(at + decay + 0.02);
}

export function playMoveSound(kind: MoveSound): void {
  const ctx = audio();
  if (!ctx) return;
  // A context created before any gesture starts suspended; a move is one.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const at = ctx.currentTime + 0.005;
  if (kind === 'capture') {
    knock(ctx, at, 1100, 0.12, 0.5);
    knock(ctx, at + 0.018, 1600, 0.07, 0.25);
    return;
  }
  knock(ctx, at, 1700, 0.07, 0.35);
  if (kind === 'check') {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 880;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0.0001, at + 0.03);
    level.gain.exponentialRampToValueAtTime(0.08, at + 0.04);
    level.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    tone.connect(level).connect(ctx.destination);
    tone.start(at + 0.03);
    tone.stop(at + 0.18);
  }
}

/** What a move sounds like: a check over a capture over a quiet move. */
export function soundOf(san: string, captured: boolean): MoveSound {
  if (/[+#]$/.test(san)) return 'check';
  return captured ? 'capture' : 'move';
}

/**
 * Sounds a step forward of the analysis cursor, while the setting is on.
 * Mounted once, with the shell.
 */
export function useMoveSounds(): void {
  const enabled = usePreferences((state) => state.moveSounds);
  useEffect(() => {
    if (!enabled) return;
    let previous = useAnalysis.getState();
    return useAnalysis.subscribe((state) => {
      const before = previous;
      previous = state;
      if (state.currentId === before.currentId) return;
      const node = state.tree.nodes[state.currentId];
      // One move forward from where the cursor was, in the same document.
      if (!node?.move || node.parentId !== before.currentId) return;
      if (state.tree.rootId !== before.tree.rootId) return;
      playMoveSound(soundOf(node.move.san, node.move.captured !== undefined));
    });
  }, [enabled]);
}
