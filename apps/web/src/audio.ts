/**
 * Plays one clip at a time through a single audio element. Reusing the
 * element matters on phones: once a tap has started it, later clips may
 * play without a fresh tap.
 */
const element = typeof Audio === "undefined" ? undefined : new Audio();

export function playClip(url: string): void {
  if (!element) return;
  element.pause();
  if (element.src !== new URL(url, window.location.href).href) element.src = url;
  element.currentTime = 0;
  // Browsers reject play() when no tap preceded it; the learner can tap Listen.
  element.play().catch(() => undefined);
}
