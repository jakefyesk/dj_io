# Build Spec: iO — DJ Persona Site

A single-page marketing site for the DJ persona **iO**. Dark, moody, tastefully modern. The hero is the centerpiece and must be treated as the highest-effort surface; the rest of the page should be quiet and let the hero breathe.

> This document is the source of truth. Build to it. Where it says "decision needed," stop and surface the question rather than guessing — except where a default is given, in which case use the default and flag it.

---

## 0. Inputs needed before / during build

These are the things only the human can supply. Wire up clean placeholders so the build isn't blocked, but flag each one.

1. **Logo asset** — ideally an SVG, plus a high-res transparent PNG (≥1024px, premultiplied alpha) for use as a WebGL texture. The PNG is what gets sampled by the water shader.
2. **Pulse / accent color** — the single brand accent that glows beneath the water. Default to a cool electric cyan-blue (`#3FC9FF` → fading to `#0A2540`) until told otherwise. This is a brand decision; treat the default as provisional.
3. **Event content for the carousel** — for each event: image (16:9 or 3:2), title, venue/city, date, optional link. Ship with 4–6 placeholders.
4. **Contact details** — email address + social handles/URLs (e.g. Instagram, SoundCloud, Spotify, Resident Advisor, Bandcamp). Use placeholders until provided.
5. **Deploy target** — default to a static build deployable to Vercel / Netlify / Cloudflare Pages. Confirm before adding any platform-specific config.

**Assumption to confirm:** the logo sits *beneath* the water and is gently refracted by it (i.e. it reads as "submerged"), per the brief ("water sitting on top of … the logo"). The spec is written for this. If the logo should instead float crisply *above* the water, that's a meaningful change — flag it.

---

## 1. Tech stack

- **Vite + TypeScript** — fast dev server, clean static output, no framework overhead needed for one page.
- **Three.js** — for the hero WebGL layer. Most documented path for a custom full-screen shader.
- **Embla Carousel** (`embla-carousel`) — headless, lightweight, gives full styling control for the "tasteful" requirement. Fallback: CSS scroll-snap if a dependency-free route is preferred.
- **No CSS framework.** Hand-author CSS (or a tiny token layer). Aesthetics are bespoke; utility classes get in the way here.
- Plain semantic HTML for structure; progressive enhancement so the page is legible even if WebGL fails.

Avoid: heavy animation libraries, page builders, anything that imposes a generic look.

---

## 2. Information architecture

One page, three stacked full-bleed sections, scroll-driven:

1. **Hero / masthead** — `100svh`, the iO mark + light pulse + water. (Section 3.)
2. **Events carousel** — horizontally scrolling highlights of past events. (Section 4.)
3. **Contact** — email + socials. (Section 5.)

A minimal fixed/again-on-scroll nav is optional and low priority; if included, keep it nearly invisible (small wordmark top-left, anchor links top-right, fades in after hero).

---

## 3. Hero section — the centerpiece

This is the part to get right. Everything else is supporting cast.

### 3.1 Visual layer stack (bottom → top)

1. **Background** — near-black, very subtle vertical gradient (slightly lighter at top to seat the overhead glow).
2. **Logo** — small, centered, treated as a texture so it can be refracted.
3. **Light pulse** — a soft ring/bloom of the accent color originating from *beneath* the logo, expanding outward and fading, on a slow loop.
4. **Water surface** — a full-section animated water shader sitting on top of everything below it. It refracts the pulse + logo, and catches a low white glow from above along the wave crests.

Critically: layers 2 and 3 are **not** separate DOM elements stacked under a canvas — they are composited *inside* the water shader so the water can actually refract them. See 3.3.

### 3.2 Recommended implementation: one full-screen fragment shader

Use a single Three.js full-screen quad (orthographic camera, plane filling the viewport) running one fragment shader. This is more robust and performant than render-to-texture juggling, and keeps the refraction physically coupled.

Uniforms:
- `uTime` (seconds)
- `uResolution` (vec2)
- `uLogoTex` (sampler2D — the transparent logo PNG)
- `uLogoRect` (vec4 — center xy + size, so the logo can be placed "tastefully small" in the middle and stay correctly aspected)
- `uPulseColor` (vec3)
- `uReducedMotion` (float 0/1)
- pointer position (vec2, optional — see 3.6)

### 3.3 Fragment shader logic (pseudocode — implement in GLSL)

```glsl
// 1. WATER HEIGHT FIELD
// Domain-warped fractal noise scrolling in two directions for natural,
// non-repeating motion. Combine 3–4 octaves. This gives "hyper realistic"
// organic waves cheaply. (Upgrade path: add 2–3 Gerstner waves on top for
// sharper directional crests if more realism is wanted.)
float h = waveHeight(uv, uTime);   // FBM + domain warp + directional scroll

// 2. SURFACE NORMAL via finite differences of the height field
vec3 normal = computeNormal(uv, uTime, eps);  // perturb uv by eps in x/y

// 3. REFRACTION of everything beneath the surface
// Offset the lookup of the "underwater" content by the surface normal.
vec2 refractOffset = normal.xy * uRefractStrength;
vec2 ruv = uv + refractOffset;

// underwater content = pulse (procedural) + logo (texture)
vec3 below = backgroundColor(uv);
below += pulse(ruv, uTime, uPulseColor);          // see 3.4
below = compositeLogo(below, uLogoTex, ruv, uLogoRect); // see 3.5

// 4. LOW WHITE GLOW FROM ABOVE — specular highlight on crests
// Top-down light. Highlight concentrates where the surface faces the light.
vec3  lightDir = normalize(vec3(0.0, 1.0, 0.6));  // from above, slightly toward viewer
float spec = pow(max(dot(normal, lightDir), 0.0), uShininess);
vec3  glow = vec3(1.0) * spec * uGlowStrength;     // soft white

// 5. FRESNEL rim to define wave outlines subtly
float fres = pow(1.0 - max(normal.z, 0.0), uFresnelPower);
glow += vec3(1.0) * fres * uFresnelStrength;

// 6. COMPOSITE
vec3 color = below + glow;        // additive glow on top of refracted content
color = tonemapAndClamp(color);   // keep it moody — never blown out
```

Tuning intent (these are knobs Claude Code should expose as constants/uniforms so they're easy to dial):
- `uRefractStrength` — small. The logo must stay legible; over-refraction ruins it. Keep refraction gentler over the logo region (e.g. attenuate `refractOffset` near `uLogoRect`) so the mark reads while still feeling submerged.
- `uShininess` / `uGlowStrength` — the white glow should be *low* and selective, kissing crests, not flooding the surface.
- Wave speed — slow and hypnotic, not choppy.

### 3.4 The pulse

- A radial pulse function centered just *below* the logo's center.
- An expanding soft ring (or stacked rings) using `smoothstep` bands on `distance(uv, center)` offset by `uTime`, plus a static soft central bloom so the logo always sits in a faint pool of light.
- Slow loop (suggest 4–7s per pulse), fading to nearly nothing at the outer edge so it dissolves into the dark rather than hitting a hard boundary.
- Color = `uPulseColor`. This is the only real chroma in the hero; everything else is near-monochrome.

### 3.5 Logo handling

- Sampled from `uLogoTex`, placed via `uLogoRect`, aspect-correct, "tastefully small" (target ~8–12% of the shorter viewport dimension — tune by eye).
- Lit faintly from the pulse beneath; gently refracted by the water above.
- **Legibility guardrail:** if refraction + waves make the mark hard to read at small size, reduce refraction strength over the logo and/or add a hair of contrast/clarity in its region. Tasteful and readable beats maximal effect.

### 3.6 Optional polish (only after core works)

- Subtle pointer parallax: nudge wave domain or light direction slightly toward the cursor. Keep it barely perceptible.
- A faint vignette to seat the composition in the dark.

### 3.7 Performance & accessibility (required, not optional)

- **Cap devicePixelRatio at ~2**, and consider rendering the water at 0.75–1.0× resolution upscaled — full-res FBM at retina is expensive.
- **`prefers-reduced-motion`**: freeze the water at a calm frame (or near-zero speed), stop the pulse loop (hold a static bloom). Wire `uReducedMotion`.
- **WebGL fallback**: if context creation fails, render a static dark hero — background gradient + a soft radial accent glow behind a crisp logo. The page must look intentional, not broken.
- **Mobile**: reduce octaves / resolution; verify thermals and battery aren't hammered. Test on a mid-range phone, not just desktop.
- Use `100svh` (not `100vh`) so mobile browser chrome doesn't clip the hero.
- Pause `requestAnimationFrame` when the hero scrolls out of view (IntersectionObserver).

---

## 4. Events carousel section

- Horizontal carousel of past-event cards, built with **Embla**.
- Each card: event image, title, venue/city, date; optional link. Dark cards, thin hairline borders or soft inner glow rather than heavy shadows.
- Motion: smooth momentum scrolling, snap to cards. Quiet enter animation (fade + slight rise) via IntersectionObserver — no bouncy easing.
- Controls: minimal. Prev/next as small ghost arrows and/or drag. Subtle progress indicator (thin line or small dots), not chunky pagination.
- Fully keyboard-accessible and swipeable on touch. Lazy-load images.
- Section heading: small, understated (e.g. a quiet label like "Selected sets" — final copy is the human's call).

---

## 5. Contact section

- Spare and centered. Email as the focal element (large-ish, elegant, `mailto:` link with a tasteful hover).
- Social links as a clean row of labeled text links or minimal monoline icons (no branded color blobs — keep them monochrome to fit the palette, lighting up to the accent on hover).
- Optional one-line tagline above. No contact form unless asked.

---

## 6. Global aesthetic system

- **Palette:** near-black base (`#06080B`–`#0B0E14` range), soft off-white text (`#E8ECF1`, never pure `#FFF` for body), single accent = the pulse color. That's it — restraint is the aesthetic.
- **Type:** one refined modern sans for everything; a clean grotesque/geometric face works (e.g. something in the Inter / Geist / Söhne family — pick one, don't mix many). Generous letter-spacing on small uppercase labels; tight, confident headings.
- **Space:** lean heavily on negative space and large section padding. Moody = empty + dark + one source of light.
- **Motion principles:** slow, eased, deliberate. Nothing bounces. Everything fades and drifts. Respect `prefers-reduced-motion` everywhere, not just the hero.
- **Texture:** optional faint film grain / noise overlay at very low opacity to kill banding in the dark gradients — helps a lot on dark sites. Keep it subtle.

---

## 7. Suggested repo structure

```
/
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ hero/
│  │  ├─ hero.ts            // Three.js setup, RAF loop, uniforms, IO pause
│  │  ├─ water.frag.glsl    // the shader from §3.3
│  │  ├─ water.vert.glsl
│  │  └─ fallback.ts        // static hero if WebGL unavailable
│  ├─ carousel/
│  │  └─ carousel.ts        // Embla init + a11y
│  ├─ contact/
│  ├─ styles/
│  │  ├─ tokens.css         // colors, type scale, spacing
│  │  └─ main.css
│  └─ assets/
│     ├─ logo.svg
│     ├─ logo.png           // texture for the shader
│     └─ events/
├─ public/
└─ vite.config.ts
```

---

## 8. Build order (milestones)

1. **Scaffold** — Vite + TS, tokens.css, semantic HTML for all three sections with placeholder content. Page scrolls and reads correctly with zero JS effects.
2. **Static fallback hero** — dark gradient + radial accent glow + crisp centered logo. This is also the WebGL fallback, so build it first.
3. **Water shader, isolated** — full-screen FBM water with normals + the overhead white specular/fresnel glow over a flat dark background. Get the waves looking *right* before adding anything beneath.
4. **Pulse** — add the procedural pulse beneath; confirm refraction couples it convincingly.
5. **Logo compositing + refraction** — drop the logo texture in, tune the legibility guardrail (§3.5).
6. **Perf + a11y pass** — DPR cap, resolution scaling, reduced-motion, IO pause, mobile test, fallback verification.
7. **Carousel** — Embla, cards, a11y, lazy-load.
8. **Contact** — email + socials, hovers.
9. **Polish** — grain overlay, optional pointer parallax, vignette, final motion tuning.
10. **Deploy** — static build to chosen host.

Do the hero (steps 2–6) to a high bar before moving on; it's the whole point of the site.

---

## 9. Definition of done

- Hero renders water that visibly refracts a glowing pulse and a submerged-but-legible logo, with a low white glow catching the wave crests from above.
- Holds a smooth frame rate on a mid-range laptop and a recent phone; `prefers-reduced-motion` and WebGL-failure paths both look intentional.
- Carousel scrolls smoothly, is keyboard- and touch-accessible, lazy-loads images.
- Contact email and socials work.
- The whole page feels dark, restrained, and modern — one accent color, lots of negative space, slow motion.
- Lighthouse: no major a11y violations; images lazy; no layout shift.

---

## 10. Key risks & tradeoffs to watch

- **Logo legibility vs. refraction** — the single biggest aesthetic tension. Err toward readable.
- **Performance of full-screen FBM** — resolution scaling and DPR cap are not optional. Profile early.
- **"Hyper realistic" expectations** — FBM gets you organic, beautiful water; true photoreal ocean (Gerstner + foam + caustics) is a rabbit hole. Start with FBM, add Gerstner crests only if needed. Don't over-engineer before reviewing.
- **Pulse color** — it's the only chroma; the wrong hue makes the whole site feel off. Confirm with the human before final polish.
