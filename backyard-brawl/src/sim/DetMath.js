// Deterministic math for the sim: the same bits in every JS engine.
//
// Why: ECMAScript leaves Math.sin / cos / atan2 / exp / pow / hypot
// "implementation-approximated". Node 22's V8 and Playwright's Chromium round
// 0.2-18 % of inputs differently in the last bit (scripts/realtime-check.mjs
// found it: a 1-ulp drift in a cat's position at step 88 grew into a different
// Big Tom dodge at step 8025, and seed 11 / hp 6 won in the browser but died in
// wave 8 in node). Everything here uses only + - * / and Math.sqrt, which IEEE
// 754 rounds exactly, so results are bit-identical everywhere.
//
// sin / cos / atan / exp are ports of the fdlibm kernels (k_sin.c, k_cos.c,
// s_atan.c, e_exp.c): within ~1 ulp of the true value for the ranges the sim
// uses (|x| < 1e6). No FMA: JS evaluates every operation separately.

const INV_PIO2 = 6.36619772367581382433e-01; // 2/pi
const PIO2_1 = 1.57079632673412561417e+00; // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11; // pi/2 - PIO2_1

const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

function kSin(x) {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + v * (S1 + z * r);
}

function kCos(x) {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  return 1 - (0.5 * z - z * r);
}

// Shared range reduction: x = n * pi/2 + r, |r| <= ~pi/4 (Cody-Waite, 2 parts;
// plenty for the sim's |x| < 1e6). Sets redN for the quadrant.
let redN = 0;
function reduce(x) {
  const n = Math.floor(x * INV_PIO2 + 0.5);
  redN = n;
  return (x - n * PIO2_1) - n * PIO2_1T;
}

export function sin(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kSin(x);
  const r = reduce(x);
  switch (redN & 3) {
    case 0: return kSin(r);
    case 1: return kCos(r);
    case 2: return -kSin(r);
    default: return -kCos(r);
  }
}

export function cos(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kCos(x);
  const r = reduce(x);
  switch (redN & 3) {
    case 0: return kCos(r);
    case 1: return -kSin(r);
    case 2: return -kCos(r);
    default: return kSin(r);
  }
}

const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01,
  -1.11111104054623557880e-01, 9.09088713343650656196e-02, -7.69187620504482999495e-02,
  6.66107313738753120669e-02, -5.83357013379057348645e-02, 4.97687799461593236017e-02,
  -3.65315727442169155270e-02, 1.62858201153657823623e-02,
];
const PI = 3.14159265358979311600e+00;
const PI_LO = 1.2246467991473531772e-16;
const HALF_PI = 1.57079632679489655800e+00;

export function atan(v) {
  if (v !== v) return NaN;
  const neg = v < 0;
  let x = neg ? -v : v;
  if (x >= 7.37869762948382064640e+19) return neg ? -HALF_PI : HALF_PI; // 2^66
  let id;
  if (x < 0.4375) {
    if (x < 1e-29) return v;
    id = -1;
  } else if (x < 1.1875) {
    if (x < 0.6875) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
  } else if (x < 2.4375) {
    id = 2; x = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3; x = -1 / x;
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    const r = x - x * (s1 + s2);
    return neg ? -r : r;
  }
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return neg ? -r : r;
}

export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (y === 0) {
    // keep Math.atan2's signed-zero results
    if (x > 0 || (x === 0 && 1 / x > 0)) return y;
    return 1 / y > 0 ? PI : -PI;
  }
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  const a = atan(Math.abs(y / x));
  if (x > 0) return y > 0 ? a : -a;
  const r = PI - (a - PI_LO);
  return y > 0 ? r : -r;
}

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01;
const P2 = -2.77777777770155933842e-03;
const P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06;
const P5 = 4.13813679705723846039e-08;

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.13) return 0;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  let y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  // y * 2^k by exact doubling / halving
  let n = k;
  while (n > 0) { y *= 2; n -= 1; }
  while (n < 0) { y *= 0.5; n += 1; }
  return y;
}

/** sqrt(x*x + y*y): IEEE-exact everywhere (Math.hypot is implementation-defined). */
export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}

/** level^1.5 for the XP curve without Math.pow (exact for perfect squares: 4^1.5 = 8). */
export function pow15(x) {
  return x * Math.sqrt(x);
}
