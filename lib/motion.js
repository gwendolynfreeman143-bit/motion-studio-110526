// Small helpers for writing render(t). Pure functions: same t in, same frame out.
(() => {
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

// Progress 0→1 of t across the window [start, start + dur].
const progress = (t, start, dur) => clamp((t - start) / dur);

// Map t from [t0, t1] onto [v0, v1] with an easing function.
const tween = (t, t0, t1, v0, v1, ease = (x) => x) =>
  v0 + (v1 - v0) * ease(progress(t, t0, t1 - t0));

const ease = {
  linear: (x) => x,
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
};

window.motion = { clamp, progress, tween, ease };
})();
