// Static fallback hero. The markup (dark gradient + radial accent glow +
// crisp centered logo) lives in index.html and is shown by default; the
// shader, once live, hides it via the `.is-webgl` class on the hero.
//
// This module's job is only to answer "can we run WebGL at all?" so the
// caller can decide whether to attempt the shader. If anything here or in
// hero.ts throws, the fallback simply remains visible — intentional, not
// broken.

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}
