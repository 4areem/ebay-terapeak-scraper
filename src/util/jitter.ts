export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export function jitter(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return sleep(delay);
}
