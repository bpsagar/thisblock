// The words of a session: its labels, its lines, and the shared schedule's countdown.
import { sessionEndMs, type Kind } from './loop';
import { breakStartFor } from './plan';
import { fmtElapsed } from './format';

/** the shared schedule's countdown: focus to its break, a break to its end */
export function timerText(now: number, kind: Kind): string {
  const end = kind === 'break' ? sessionEndMs(now) : breakStartFor(null, now);
  return `${fmtElapsed(Math.ceil((end - now) / 1000) * 1000)} left`;
}

export const LABEL = { focus: 'focus', final: 'wrap up', break: 'break' } as const;

// One quiet line under the status says what to do. Mostly the same line, so it becomes familiar;
// about one block in five opens with a different one for its first minute.
export const USUAL: Record<Kind, string> = {
  focus: 'one thing. go.',
  final: 'leave it where you can find it.',
  break: 'the blocks are off duty. so are you.',
};
const RARE: Record<Kind, string[]> = {
  focus: [
    "the tab you're about to open can wait.",
    'your inbox survived without you before.',
    "nobody's watching. that's the point.",
    "if you're reading this, you're not working.",
  ],
  final: ['write the next step down. future you is forgetful.', 'save. then save again.', 'land the plane.'],
  break: ['stand up. the chair will wait.', 'water. not coffee. fine, coffee.', 'look at something far away. not a screen.'],
};
const RARE_MS = 60_000;

/** the line for this moment: the usual one, or now and then a surprise */
export function lineAt(now: number, kind: Kind, block: number, blockStart: number): string {
  const hash = Math.imul(block, 2654435761) >>> 0;
  if (hash % 5 === 0 && now - blockStart < RARE_MS) return RARE[kind][(hash >>> 8) % RARE[kind].length];
  return USUAL[kind];
}
