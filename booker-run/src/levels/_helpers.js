// Shared helpers for authoring level data. Pure functions, no game imports.

/** Three bones on an arc over x. The middle one sits at `top` px above the ground. */
export function arc(x, top, spread = 28, drop = 12) {
  return [
    { x: x - spread, h: top - drop },
    { x, h: top },
    { x: x + spread, h: top - drop },
  ];
}

/** A short row of bones at running height. */
export function row(x, count = 3, step = 22, h = 12) {
  return Array.from({ length: count }, (_, i) => ({ x: x + i * step, h }));
}
