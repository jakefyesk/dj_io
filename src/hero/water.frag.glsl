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
uniform vec2  uPointer;        // -1..1, parallax (0,0 when unused)
uniform float uReducedMotion;  // 1.0 = freeze motion
uniform float uQuality;        // 1.0 desktop, 0.0 mobile (fewer octaves)

// --- Tuning knobs (dial these) -------------------------------------
const float WAVE_SCALE      = 3.2;    // spatial frequency of the swell
const float WAVE_SPEED      = 0.16;   // slow + hypnotic
const float WARP_STRENGTH   = 0.42;   // domain-warp amount -> organic, non-repeating
const float REFRACT_STRENGTH= 0.030;  // small: logo must stay legible
const float NORMAL_EPS      = 0.0016; // finite-difference step for normals
const float NORMAL_Z        = 0.85;   // surface "stiffness" -> flatter normals
const float SHININESS       = 60.0;   // tight specular -> kisses crests only
const float GLOW_STRENGTH    = 0.55;  // low overhead white glow
const float FRESNEL_POWER    = 4.0;
const float FRESNEL_STRENGTH = 0.10;
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
// Water height field: domain-warped FBM scrolling in two directions. //
float waveHeight(vec2 p, float t) {
  float octaves = mix(3.0, 5.0, uQuality);
  vec2 dir1 = vec2(0.12, 0.08);
  vec2 dir2 = vec2(-0.09, 0.11);

  // Domain warp: distort the sample coordinates by another FBM field
  // for natural, non-tiling motion.
  vec2 q = vec2(
    fbm(p * WAVE_SCALE + dir1 * t, octaves),
    fbm(p * WAVE_SCALE + dir2 * t + 5.2, octaves)
  );
  float h = fbm(p * WAVE_SCALE + WARP_STRENGTH * q + dir2 * t, octaves);
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

  // Subtle pointer parallax: nudge the wave domain toward the cursor.
  vec2 parallax = uPointer * 0.012;
  vec2 p = aspectUv(uv) + parallax;

  // 1-2. height + normal
  vec3 normal = computeNormal(p, t);

  // 3. refraction — offset the underwater lookup by the surface normal.
  // Attenuate refraction over the logo region so the mark stays legible.
  vec2 toLogo = (uv - uLogoRect.xy) / max(uLogoRect.zw, vec2(1e-4));
  float logoMask = smoothstep(1.6, 0.4, length(toLogo)); // 1 near logo
  float refractAtten = mix(1.0, 0.25, logoMask);
  vec2 refractOffset = normal.xy * REFRACT_STRENGTH * refractAtten;
  vec2 ruv = uv + refractOffset;
  vec2 rp = aspectUv(ruv) + parallax;

  // underwater content = background + pulse + logo
  vec3 below = backgroundColor(ruv);
  below += pulse(rp, t);

  vec4 logo = sampleLogo(ruv);
  // tint logo subtly toward accent + lift with the pulse light beneath
  float litFromPulse = exp(-pow(length(aspectUv(ruv) - aspectUv(uLogoRect.xy)), 2.0) * 9.0);
  vec3 logoCol = mix(vec3(0.86, 0.92, 0.98), uPulseColor, 0.18 * litFromPulse);
  // add a hair of clarity/contrast in the logo region (legibility guard)
  logoCol += uPulseColor * 0.12 * litFromPulse;
  below = mix(below, logoCol, logo.a);

  // 4. overhead white glow — specular highlight on crests.
  vec3 lightDir = normalize(vec3(0.0, 1.0, 0.6) + vec3(uPointer * 0.15, 0.0));
  float spec = pow(max(dot(normal, lightDir), 0.0), SHININESS);
  vec3 glow = vec3(1.0) * spec * GLOW_STRENGTH;

  // 5. fresnel rim — subtle wave outlines.
  float fres = pow(1.0 - max(normal.z, 0.0), FRESNEL_POWER);
  glow += vec3(0.9, 0.95, 1.0) * fres * FRESNEL_STRENGTH;

  // 6. composite + tone
  vec3 color = below + glow;

  // faint vignette to seat the composition in the dark
  float vig = 1.0 - VIGNETTE_STRENGTH * dot(uv - 0.5, uv - 0.5) * 2.2;
  color *= clamp(vig, 0.0, 1.0);

  // moody tonemap — soft shoulder, never blown out
  color = color / (color + vec3(0.85));
  color = pow(color, vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
