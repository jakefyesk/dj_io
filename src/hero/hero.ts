import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  SRGBColorSpace,
  LinearFilter,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  RGBAFormat,
} from "three";

import vertexShader from "./water.vert.glsl";
import fragmentShader from "./water.frag.glsl";
import { isWebGLAvailable } from "./fallback";
import logoUrl from "../assets/logo.png";

// Brand accent (provisional default — see plan §0.2). Kept in sync with
// --c-accent / --c-accent-deep in tokens.css.
const PULSE_COLOR = "#d9243a";
const ACCENT_DEEP = "#240507";

// Logo sizing: as a fraction of the shorter viewport dimension (height).
// Half-size in UV is computed per-resize from the texture aspect.
const LOGO_FRACTION = 0.16; // of min(viewport w, h), as a height
const DPR_CAP = 2;
const RENDER_SCALE = 0.85; // render water below native res, upscale (perf)
// The water shader is fragment-bound (normals sample the height field 4x per
// pixel, plus the ripple loop), so phones win most from drawing fewer pixels.
// Tighter caps here roughly halve fragment work vs. the desktop path; the
// surface is soft enough that the lower resolution is imperceptible.
const MOBILE_DPR_CAP = 1.5;
const MOBILE_RENDER_SCALE = 0.72;
const MOBILE_MAX = 820; // px width below which the mobile resolution caps apply

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

  // Touch devices (coarse pointer) get the cheaper shader path regardless of
  // width — this catches landscape phones whose width exceeds MOBILE_MAX but
  // whose GPUs still need the lighter load. canHover gates the logo "emerge"
  // affordance, which only makes sense with a real hovering cursor; on touch
  // the tap-ripple is the interaction instead.
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const canHover = window.matchMedia(
    "(hover: hover) and (pointer: fine)"
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

  // Placeholder 1x1 transparent texture until the logo loads, so the first
  // frames sample a valid texture. The real logo swaps in on load.
  const placeholder = new DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    RGBAFormat
  );
  placeholder.needsUpdate = true;

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uLogoTex: { value: placeholder as Texture },
    uLogoRect: { value: new Vector4(0.5, 0.52, 0.05, 0.05) },
    uPulseColor: { value: new Color(PULSE_COLOR) },
    uAccentDeep: { value: new Color(ACCENT_DEEP) },
    uLogoEmerge: { value: 0 }, // eases to 1 while the cursor is over the logo
    // Click ripples: ring buffer of (uv.x, uv.y, startTime). Inactive slots
    // start long-expired so they contribute nothing.
    uRipples: {
      value: [
        new Vector3(0, 0, -1000),
        new Vector3(0, 0, -1000),
        new Vector3(0, 0, -1000),
        new Vector3(0, 0, -1000),
      ],
    },
    uReducedMotion: { value: reducedMotion ? 1 : 0 },
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

  // Treat coarse-pointer devices (phones/tablets, including landscape phones
  // wider than MOBILE_MAX) as mobile so they get the cheaper, lower-resolution
  // path. Re-evaluated on resize so orientation changes are picked up.
  function isMobile() {
    return coarsePointer || window.innerWidth <= MOBILE_MAX;
  }

  function resize() {
    const w = heroEl.clientWidth;
    const h = heroEl.clientHeight;
    const mobile = isMobile();
    const cap = mobile ? MOBILE_DPR_CAP : DPR_CAP;
    const scale = mobile ? MOBILE_RENDER_SCALE : RENDER_SCALE;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * scale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    uniforms.uResolution.value.set(w * dpr, h * dpr);
    layoutLogo();
  }

  // --- Click ripples ------------------------------------------------
  // Each click drops one expanding ring into a small ring buffer; the
  // shader animates and fades it from its recorded start time.
  const ripples = uniforms.uRipples.value;
  let nextRipple = 0;

  function onPointerDown(e: PointerEvent) {
    if (reducedMotion) return; // a ripple is motion; honor reduced-motion
    const rect = heroEl.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = 1 - (e.clientY - rect.top) / rect.height; // y up to match uv
    ripples[nextRipple].set(u, v, uniforms.uTime.value);
    nextRipple = (nextRipple + 1) % ripples.length;
    start(); // ensure the loop is running to animate it out
  }

  // --- Logo hover -> emerge -----------------------------------------
  // While the cursor is over the logo, the mark slowly rises out of the
  // water (shader uLogoEmerge); it re-submerges when the cursor leaves.
  const LOGO_HIT = 1.7; // hit radius in logo-rect units (a bit generous)
  let emergeTarget = 0;

  function onPointerMove(e: PointerEvent) {
    const rect = heroEl.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = 1 - (e.clientY - rect.top) / rect.height;
    const r = uniforms.uLogoRect.value; // (cx, cy, halfW, halfH) in uv
    const dx = (u - r.x) / r.z;
    const dy = (v - r.y) / r.w;
    emergeTarget = dx * dx + dy * dy < LOGO_HIT * LOGO_HIT ? 1 : 0;
  }

  function onPointerLeave() {
    emergeTarget = 0; // re-submerge when the cursor leaves the hero
  }

  // --- RAF loop, paused when hero is out of view --------------------
  let raf = 0;
  let running = false;
  let startTime = performance.now();
  let lastNow = startTime;

  function frame(now: number) {
    if (!running) return;
    uniforms.uTime.value = (now - startTime) / 1000;

    // Slowly ease the logo emergence toward its target (~0.6s time constant).
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    const ke = 1 - Math.exp(-dt / 0.6);
    uniforms.uLogoEmerge.value +=
      (emergeTarget - uniforms.uLogoEmerge.value) * ke;

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
    lastNow = performance.now();
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
  heroEl.addEventListener("pointerdown", onPointerDown, { passive: true });
  if (!reducedMotion && canHover) {
    // Logo emerge is a slow hover affordance: skip it under reduced-motion and
    // on touch devices (where there's no hover and the tap-ripple stands in).
    heroEl.addEventListener("pointermove", onPointerMove, { passive: true });
    heroEl.addEventListener("pointerleave", onPointerLeave, { passive: true });
  }
  document.addEventListener("visibilitychange", onVisibility);
  start();

  return {
    destroy() {
      stop();
      io.disconnect();
      ro.disconnect();
      heroEl.removeEventListener("pointerdown", onPointerDown);
      heroEl.removeEventListener("pointermove", onPointerMove);
      heroEl.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      quad.geometry.dispose();
      material.dispose();
      placeholder.dispose();
      (uniforms.uLogoTex.value as Texture)?.dispose?.();
      renderer.dispose();
    },
  };
}
