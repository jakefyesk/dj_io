import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector4,
  WebGLRenderer,
  SRGBColorSpace,
  LinearFilter,
  ClampToEdgeWrapping,
  Color,
} from "three";

import vertexShader from "./water.vert.glsl";
import fragmentShader from "./water.frag.glsl";
import { isWebGLAvailable } from "./fallback";
import logoUrl from "../assets/logo.png";

// Brand accent (provisional default — see plan §0.2). Kept in sync with
// --c-accent / --c-accent-deep in tokens.css.
const PULSE_COLOR = "#d9243a";
const ACCENT_DEEP = "#240507";

// Logo sizing: "tastefully small" — target ~10% of the shorter viewport
// dimension. Half-size in UV is computed per-resize from the texture aspect.
const LOGO_FRACTION = 0.1; // of min(viewport w, h), as a height
const DPR_CAP = 2;
const RENDER_SCALE = 0.85; // render water below native res, upscale (perf)
const MOBILE_MAX = 820; // px width treated as "mobile" -> fewer octaves

export interface Hero {
  destroy(): void;
}

/**
 * Mounts the WebGL water hero onto the given canvas. Returns null if WebGL
 * is unavailable or setup fails — in which case the static fallback (already
 * in the DOM) stays visible.
 */
export function mountHero(
  canvas: HTMLCanvasElement,
  heroEl: HTMLElement
): Hero | null {
  if (!isWebGLAvailable()) return null;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }

  renderer.setClearColor(new Color("#06080b"), 1);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Placeholder 1x1 texture until the logo loads, so the first frames are
  // valid. The real logo swaps in on load.
  const placeholder = new Texture();
  placeholder.needsUpdate = true;

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uLogoTex: { value: placeholder as Texture },
    uLogoRect: { value: new Vector4(0.5, 0.52, 0.05, 0.05) },
    uPulseColor: { value: new Color(PULSE_COLOR) },
    uAccentDeep: { value: new Color(ACCENT_DEEP) },
    uPointer: { value: new Vector2(0, 0) },
    uReducedMotion: { value: reducedMotion ? 1 : 0 },
    uQuality: { value: window.innerWidth > MOBILE_MAX ? 1 : 0 },
  };

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(quad);

  // Logo aspect (w/h); default square until the texture loads.
  let logoAspect = 1;

  new TextureLoader().load(logoUrl, (tex) => {
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    // Disable Three's implicit flip; the shader flips Y itself so the
    // mark reads upright regardless of renderer defaults.
    tex.flipY = false;
    if (tex.image && tex.image.width) {
      logoAspect = tex.image.width / tex.image.height;
    }
    uniforms.uLogoTex.value = tex;
    layoutLogo();
  });

  // --- Layout -------------------------------------------------------
  function layoutLogo() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const minDim = Math.min(w, h);
    // half-height in UV space
    const halfH = (LOGO_FRACTION * minDim) / h / 2;
    const halfW = (halfH * h * logoAspect) / w;
    uniforms.uLogoRect.value.set(0.5, 0.52, halfW, halfH);
  }

  function resize() {
    const w = heroEl.clientWidth;
    const h = heroEl.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * RENDER_SCALE;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    uniforms.uResolution.value.set(w * dpr, h * dpr);
    uniforms.uQuality.value = window.innerWidth > MOBILE_MAX ? 1 : 0;
    layoutLogo();
  }

  // --- Pointer parallax (barely perceptible) ------------------------
  const pointerTarget = new Vector2(0, 0);
  function onPointer(e: PointerEvent) {
    if (reducedMotion) return;
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    pointerTarget.set(x, y);
  }

  // --- RAF loop, paused when hero is out of view --------------------
  let raf = 0;
  let running = false;
  let startTime = performance.now();
  let lastTime = startTime;

  function frame(now: number) {
    if (!running) return;
    const elapsed = (now - startTime) / 1000;
    uniforms.uTime.value = elapsed;

    // ease pointer toward target
    const k = Math.min((now - lastTime) / 1000, 0.05) * 3;
    uniforms.uPointer.value.lerp(pointerTarget, k);
    lastTime = now;

    renderer.render(scene, camera);

    // When reduced motion is on, render a single calm frame and stop.
    if (reducedMotion) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    // keep the clock continuous across pauses
    startTime = performance.now() - uniforms.uTime.value * 1000;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Pause RAF when the hero scrolls out of view.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) start();
        else stop();
      }
    },
    { threshold: 0.01 }
  );
  io.observe(heroEl);

  // Pause when the tab is hidden.
  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  const ro = new ResizeObserver(() => {
    resize();
    if (reducedMotion && !running) {
      // re-render the static frame at the new size
      renderer.render(scene, camera);
    }
  });
  ro.observe(heroEl);

  // --- Wire it up ---------------------------------------------------
  resize();
  heroEl.classList.add("is-webgl");
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  start();

  return {
    destroy() {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      quad.geometry.dispose();
      material.dispose();
      placeholder.dispose();
      (uniforms.uLogoTex.value as Texture)?.dispose?.();
      renderer.dispose();
    },
  };
}
