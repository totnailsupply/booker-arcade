// =============================================================================
// GLGuard: two WebGL workarounds for Phaser 4.2.1's multi-texture batching.
//
// 1. Texture-id compare (the "half Soba" cut in software GL).
//    Phaser's batch shader picks the sampler with an exact float compare on an
//    interpolated varying: `if (outTexDatum == 3.0) ... else return vec4(0)`.
//    Every vertex of a quad carries the same id, but SwiftShader interpolates it
//    as (id*b0 + id*b1 + id*b2) / (b0 + b1 + b2), which is exact for ids 0, 1, 2
//    and 4 and can be off by one ulp for 3, 5, 6, 7, ... on rotated or scaled
//    quads. Those fragments fall through to vec4(0) and vanish: Soba (who leans
//    and squashes every frame) lost part of her sprite on up to ~45% of frames
//    whenever her texture landed on such a unit. Real GPUs interpolate a
//    constant exactly, so it never shows there.
//    Fix: every shader program's fragment source is rewritten to compare the
//    rounded id, floor(outTexDatum + 0.5). Mitigation on top: software
//    renderers (SwiftShader, llvmpipe, ...) get maxTextures = 1, which removes
//    the compare from the shader altogether (and the per-count variants below).
//
// 2. Shader warm-up (first-use hitches).
//    Phaser compiles one program per "textures in this batch" count (1..16) on
//    first use, and ANGLE builds the GPU pipeline on the first draw with it, so
//    the first frame that batches e.g. 11 textures stalls 80-150 ms in software
//    GL. warmShaders() draws one batch per count (normal and ADD blend) behind
//    the boot screen, so the climb never compiles anything.
//
// Debug URL flags: ?gltex=N forces maxTextures (0 = all units, Phaser's
// default), ?glfix=0 skips the shader rewrite, ?glwarm=0 skips the warm-up.
// window.__GL_GUARD__ reports what was applied.
// =============================================================================

import Phaser from 'phaser';

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render driver|mesa offscreen/i;

function urlFlags() {
  try {
    const p = new URLSearchParams(window.location.search);
    const n = parseInt(p.get('gltex'), 10);
    return {
      gltex: Number.isFinite(n) && n >= 0 ? n : null,
      glfix: p.get('glfix') !== '0',
      glwarm: p.get('glwarm') !== '0',
    };
  } catch {
    return { gltex: null, glfix: true, glwarm: true };
  }
}

/** The unmasked renderer string of a throwaway WebGL context ('' if unknown). */
function probeRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

const guard = {
  renderer: '',
  software: false,
  maxTextures: -1,
  shaderFix: false,
  fixedPrograms: 0,
  warmed: 0,
};

/** Round the interpolated texture id before Phaser's exact compares. */
function fixFragmentSource(src) {
  if (!src.includes('outTexDatum ==')) return src;
  guard.fixedPrograms += 1; // stays 0 if a Phaser update renames the varying (the fix would be a no-op)
  return src
    .replace(/outTexDatum == /g, 'floor(outTexDatum + 0.5) == ')
    .replace('float texId = outTexDatum;', 'float texId = floor(outTexDatum + 0.5);');
}

function installShaderFix() {
  const R = Phaser.Renderer?.WebGL?.WebGLRenderer;
  if (!R || !R.prototype.createProgram) return false;
  if (R.prototype.createProgram.sobaTexIdFix) return true;
  const original = R.prototype.createProgram;
  const patched = function createProgram(vertexShader, fragmentShader) {
    return original.call(this, vertexShader, fixFragmentSource(fragmentShader));
  };
  patched.sobaTexIdFix = true;
  R.prototype.createProgram = patched;
  return true;
}

/**
 * Call once before `new Phaser.Game(config)`. Returns the render config
 * overrides to merge into config.render.
 */
export function prepareGL() {
  const flags = urlFlags();
  guard.renderer = probeRenderer();
  guard.software = SOFTWARE_GL.test(guard.renderer);
  guard.shaderFix = flags.glfix ? installShaderFix() : false;
  const overrides = {};
  if (flags.gltex !== null) overrides.maxTextures = flags.gltex === 0 ? -1 : flags.gltex;
  else if (guard.software) overrides.maxTextures = 1;
  guard.maxTextures = overrides.maxTextures ?? -1;
  guard.warm = flags.glwarm;
  if (typeof window !== 'undefined') window.__GL_GUARD__ = guard;
  return overrides;
}

/**
 * Draw one quad batch per texture count (1..maxTextures) in normal and ADD
 * blend, so every shader variant and GPU pipeline exists before play.
 * Call from a scene's create(); `done` runs after the warm-up frame rendered.
 * The quads sit outside the camera view (still submitted, never seen).
 */
export function warmShaders(scene, done) {
  const renderer = scene.sys.game.renderer;
  const max = renderer?.maxTextures || 0;
  if (!guard.warm || !renderer?.gl || max < 1) {
    done();
    return;
  }
  const keys = scene.textures.getTextureKeys().filter(k => scene.textures.get(k).frameTotal > 0);
  if (!keys.length) {
    done();
    return;
  }
  const objects = [];
  const off = -4096; // off-screen, so nothing shows
  for (const blend of [Phaser.BlendModes.NORMAL, Phaser.BlendModes.ADD]) {
    for (let count = 1; count <= max; count++) {
      for (let i = 0; i < count; i++) {
        objects.push(scene.add.image(off, off, keys[i % keys.length]).setBlendMode(blend));
      }
      // A Graphics draw ends the quad batch, so each group is its own batch
      objects.push(scene.add.graphics().fillStyle(0, 1).fillRect(off, off, 1, 1));
    }
  }
  guard.warmed = max;
  scene.sys.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
    for (const o of objects) o.destroy();
    done();
  });
}
