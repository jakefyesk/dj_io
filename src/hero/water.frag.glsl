// ===================================================================
// iO hero — single full-screen water shader.
//
// The pulse and the logo are composited *inside* this shader, beneath
// the water surface, so the water can physically refract them. Layer
// order (bottom -> top): background gradient -> pulse -> logo ->
// [refracted by] water surface -> overhead white glow -> fresnel rim.
// ===================================================================
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;     // pixels
uniform sampler2D uLogoTex;    // transparent logo PNG (premultiplied-safe)
uniform vec4  uLogoRect;       // xy = center (uv), zw = half-size (uv)
uniform vec3  uPulseColor;     // the single chroma
uniform vec3  uAccentDeep;     // pulse falloff color
uniform float uLogoEmerge;     // 0 submerged -> 1 risen above the water
uniform float uReducedMotion;  // 1.0 = freeze motion

// Click ripples: each is (uv.x, uv.y, startTime). Inactive slots use a very
// negative startTime so they read as long-expired and contribute nothing.
#define RIPPLE_COUNT 4
uniform vec3 uRipples[RIPPLE_COUNT];

// --- Tuning knobs (dial these) -------------------------------------
const float WAVE_SCALE      = 3.2;    // spatial frequency of the swell
const float WAVE_SPEED      = 0.22;   // slow + hypnotic
const float WARP_STRENGTH   = 0.52;   // domain-warp amount -> organic, non-repeating
const float WAVE_SWIRL      = 0.72;   // churn in place (vs. sliding drift)
const float REFRACT_STRENGTH= 0.030;  // small: logo must stay legible
const float NORMAL_EPS      = 0.0016; // finite-difference step for normals
const float NORMAL_Z        = 0.85;   // surface "stiffness" -> flatter normals
const float SHININESS       = 60.0;   // tight specular -> kisses crests only
const float GLOW_STRENGTH    = 0.55;  // low overhead white glow
const float FRESNEL_POWER    = 4.0;
const float FRESNEL_STRENGTH = 0.10;
// Click ripple — a single expanding, fading ring per click. Slow + long-lived
// so it reads as a heavy disturbance settling, not a light splash.
const float RIPPLE_LIFE      = 2.6;    // seconds before it fully fades
const float RIPPLE_SPEED     = 0.30;   // outward expansion speed (aspect/s)
const float RIPPLE_TIGHT     = 90.0;   // wavefront width (smaller = wider ring)
const float RIPPLE_AMP       = 0.20;   // disturbance height (vs. swell ~0..1)
const float RIPPLE_SPREAD    = 1.4;    // amplitude falloff as it expands
// Logo emerge
const float LOGO_SHADOW      = 0.55;   // drop-shadow strength when risen
const float VIGNETTE_STRENGTH= 0.42;

// ------------------------------------------------------------------ //
// Aspect-correct coordinates so waves & circles aren't stretched.
vec2 aspectUv(vec2 uv) {
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / uResolution.y;
  return p;
}

// ------------------------------------------------------------------ //
// Hash / value noise (cheap, smooth) ------------------------------- //
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian motion — octaves of value noise.
float fbm(vec2 p, float octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    sum += amp * vnoise(p * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

// ------------------------------------------------------------------ //
// Water height field: domain-warped FBM that churns *in place*.
// Time enters as orbiting offsets (cos/sin) rather than a linear scroll,
// so the warp field swirls and evolves instead of translating the whole
// surface across the screen (which reads as "sliding"). A whisper of
// residual drift keeps it from looking perfectly stationary.
float waveHeight(vec2 p, float t) {
  // Octave count and the warp passes below define the wave *shape*, so they're
  // fixed across all screen sizes — varying them by width made the swell scale
  // jump visibly at the mobile breakpoint. Mobile performance is handled by
  // rendering at a lower resolution (see hero.ts), which softens detail without
  // changing how big the waves are.
  float octaves = 5.0;
  vec2 sp = p * WAVE_SCALE;

  // Two slow, out-of-phase orbits advect the warp field. Because they loop
  // rather than accumulate, the net translation stays ~zero -> churn.
  vec2 orbit1 = vec2(cos(t * 1.10), sin(t * 0.90)) * WAVE_SWIRL;
  vec2 orbit2 = vec2(sin(t * 0.80), cos(t * 1.05)) * WAVE_SWIRL;

  // First warp field (the large swell), swirling in place.
  vec2 warp = vec2(
    fbm(sp + orbit1, octaves),
    fbm(sp + orbit2 + 5.2, octaves)
  );

  // Feed the warp back into itself for a second, turbulent pass -> more
  // evolving crest detail. Done on every device so the wave shape is identical
  // regardless of screen width.
  warp = vec2(
    fbm(sp + WARP_STRENGTH * warp + orbit2 * 0.6, octaves),
    fbm(sp + WARP_STRENGTH * warp + orbit1 * 0.6 + 2.8, octaves)
  );

  vec2 drift = vec2(0.018, 0.012) * t;     // whisper of directional flow
  float h = fbm(sp + WARP_STRENGTH * warp + drift, octaves);

  // Click ripples — each click spawns one ring that expands and fades.
  // Summed into the height field so normals (and thus refraction, specular,
  // fresnel) all respond. Branchless so it stays cheap when idle.
  for (int i = 0; i < RIPPLE_COUNT; i++) {
    vec2 rc = aspectUv(uRipples[i].xy);
    float age = uTime - uRipples[i].z;
    float gate = step(0.0, age) * step(age, RIPPLE_LIFE);
    float radius = age * RIPPLE_SPEED;
    float front = length(p - rc) - radius;          // signed dist to wavefront
    // single ripple: a derivative-of-gaussian wavelet (one crest + trough),
    // normalized to ~unit peak -> no repeated concentric rings.
    float ring = -front * sqrt(2.0 * RIPPLE_TIGHT) * exp(0.5 - front * front * RIPPLE_TIGHT);
    float life = 1.0 - age / RIPPLE_LIFE;           // temporal fade
    float spread = 1.0 / (1.0 + radius * RIPPLE_SPREAD); // energy spreads out
    h += ring * life * life * spread * RIPPLE_AMP * gate;
  }
  return h;
}

// Surface normal from finite differences of the height field.
vec3 computeNormal(vec2 p, float t) {
  float hx1 = waveHeight(p + vec2(NORMAL_EPS, 0.0), t);
  float hx2 = waveHeight(p - vec2(NORMAL_EPS, 0.0), t);
  float hy1 = waveHeight(p + vec2(0.0, NORMAL_EPS), t);
  float hy2 = waveHeight(p - vec2(0.0, NORMAL_EPS), t);
  vec3 n = normalize(vec3(
    (hx2 - hx1) / (2.0 * NORMAL_EPS),
    (hy2 - hy1) / (2.0 * NORMAL_EPS),
    NORMAL_Z
  ));
  return n;
}

// ------------------------------------------------------------------ //
// Background — near-black with a subtle vertical gradient (lighter at
// top to seat the overhead glow).
vec3 backgroundColor(vec2 uv) {
  vec3 top = vec3(0.039, 0.055, 0.082);   // ~#0a0e15
  vec3 bot = vec3(0.024, 0.031, 0.043);   // ~#06080b
  return mix(bot, top, smoothstep(0.0, 1.0, uv.y));
}

// ------------------------------------------------------------------ //
// The pulse — an expanding soft ring + a static central bloom, just
// below the logo's center. Loops slowly, dissolving to nothing.
vec3 pulse(vec2 p, float t) {
  // center: logo center, nudged slightly downward.
  vec2 center = aspectUv(uLogoRect.xy + vec2(0.0, -0.04));
  float d = length(p - center);

  // Static central bloom so the logo always sits in a pool of light.
  float bloom = exp(-d * d * 9.0) * 0.9;

  // Expanding rings.
  float period = 5.5;                       // 4-7s per pulse
  float phase = (uReducedMotion > 0.5) ? 0.35 : fract(t / period);
  float radius = phase * 0.9;               // expands outward
  float ring = smoothstep(0.05, 0.0, abs(d - radius));
  float ringFade = (1.0 - phase);           // fade as it grows
  ring *= ringFade * ringFade * 0.6;

  // a second, trailing ring for depth
  float phase2 = fract(phase + 0.5);
  float radius2 = phase2 * 0.9;
  float ring2 = smoothstep(0.06, 0.0, abs(d - radius2));
  ring2 *= (1.0 - phase2) * (1.0 - phase2) * 0.35;

  float intensity = bloom + ring + ring2;

  // Color: bright accent at the core fading toward the deep accent.
  vec3 col = mix(uAccentDeep, uPulseColor, clamp(intensity, 0.0, 1.0));
  return col * intensity;
}

// ------------------------------------------------------------------ //
// Logo compositing — sample the texture inside uLogoRect, aspect-
// correct. Returned alpha lets the caller blend over the pulse.
vec4 sampleLogo(vec2 uv) {
  vec2 rel = (uv - uLogoRect.xy) / uLogoRect.zw; // -1..1 within rect
  vec2 logoUv = rel * 0.5 + 0.5;
  if (any(lessThan(logoUv, vec2(0.0))) || any(greaterThan(logoUv, vec2(1.0)))) {
    return vec4(0.0);
  }
  // flip Y to match image orientation
  return texture2D(uLogoTex, vec2(logoUv.x, 1.0 - logoUv.y));
}

// ------------------------------------------------------------------ //
void main() {
  vec2 uv = vUv;
  float t = uReducedMotion > 0.5 ? 12.0 : uTime * WAVE_SPEED + 12.0;

  vec2 p = aspectUv(uv);

  // 1-2. height + normal
  vec3 normal = computeNormal(p, t);

  float emerge = uLogoEmerge; // 0 submerged -> 1 risen

  // 3. refraction — offset the underwater lookup by the surface normal.
  // Attenuate refraction over the logo region so the mark stays legible, and
  // drop it to ~0 as the logo emerges so it reads crisp above the water.
  vec2 toLogo = (uv - uLogoRect.xy) / max(uLogoRect.zw, vec2(1e-4));
  float logoMask = smoothstep(1.6, 0.4, length(toLogo)); // 1 near logo
  float refractAtten = mix(1.0, mix(0.25, 0.0, emerge), logoMask);
  vec2 refractOffset = normal.xy * REFRACT_STRENGTH * refractAtten;
  vec2 ruv = uv + refractOffset;
  vec2 rp = aspectUv(ruv);

  // underwater content = background + pulse
  vec3 below = backgroundColor(ruv);
  below += pulse(rp, t);

  // Logo sample position: wavy/refracted when submerged, stable when risen.
  // A small upward lift as it emerges sells the "rising out" motion.
  vec2 logoUv = mix(ruv, uv + vec2(0.0, 0.018 * emerge), emerge);
  vec4 logo = sampleLogo(logoUv);
  float litFromPulse = exp(-pow(length(aspectUv(logoUv) - aspectUv(uLogoRect.xy)), 2.0) * 9.0);
  // submerged: dim, pulse-tinted. risen: brighter, crisper, cooler white.
  vec3 logoSub = mix(vec3(0.86, 0.92, 0.98), uPulseColor, 0.18 * litFromPulse)
               + uPulseColor * 0.12 * litFromPulse;
  vec3 logoUp  = mix(vec3(0.95, 0.98, 1.0), uPulseColor, 0.08 * litFromPulse)
               + vec3(0.06);
  vec3 logoCol = mix(logoSub, logoUp, emerge);

  // Composite under the water (so the glow sits on it) while submerged.
  below = mix(below, logoCol, logo.a * (1.0 - emerge));

  // 4. overhead white glow — specular highlight on crests.
  vec3 lightDir = normalize(vec3(0.0, 1.0, 0.6));
  float spec = pow(max(dot(normal, lightDir), 0.0), SHININESS);
  vec3 glow = vec3(1.0) * spec * GLOW_STRENGTH;

  // 5. fresnel rim — subtle wave outlines.
  float fres = pow(1.0 - max(normal.z, 0.0), FRESNEL_POWER);
  glow += vec3(0.9, 0.95, 1.0) * fres * FRESNEL_STRENGTH;

  // 6. composite + tone
  vec3 color = below + glow;

  // Drop shadow on the water beneath the risen logo (light is from above, so
  // the shadow falls below) -> reads as the mark sitting above the surface.
  // Masked by (1 - logo.a) so it only darkens the water, never the mark.
  if (emerge > 0.001) {
    float sh = sampleLogo(uv + vec2(0.004, 0.020)).a
             + sampleLogo(uv + vec2(-0.004, 0.026)).a
             + sampleLogo(uv + vec2(0.0, 0.032)).a;
    color *= 1.0 - LOGO_SHADOW * (sh * 0.3333) * emerge * (1.0 - logo.a);
  }

  // As the logo emerges, paint it back *over* the water — keeping the overhead
  // glow on it so it stays lit (no darkening) and sits on top of the surface.
  color = mix(color, logoCol + glow, logo.a * emerge);

  // faint vignette to seat the composition in the dark
  float vig = 1.0 - VIGNETTE_STRENGTH * dot(uv - 0.5, uv - 0.5) * 2.2;
  color *= clamp(vig, 0.0, 1.0);

  // moody tonemap — soft shoulder, never blown out
  color = color / (color + vec3(0.85));
  color = pow(color, vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
