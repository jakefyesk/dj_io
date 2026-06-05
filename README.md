# iO — DJ persona site

Single-page marketing site for the DJ persona **iO**. Dark, moody, modern.
The hero is a full-screen WebGL water shader that refracts a glowing pulse and
a submerged-but-legible logo; below it sit an events carousel and contact.

Built per [io-website-plan.md](io-website-plan.md).

## Run

Requires Node 18+ (`nvm use --lts`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks, then outputs static site to dist/
npm run preview  # serve the production build
```

## Stack

- **Vite + TypeScript** — static output, no framework.
- **Three.js** — one full-screen fragment shader for the hero (orthographic
  quad). Logo + pulse are composited *inside* the shader so the water can
  physically refract them (`src/hero/water.frag.glsl`).
- **Embla Carousel** — the events strip.
- Hand-authored CSS, no framework. Tokens in `src/styles/tokens.css`.

## Tuning the hero

Shader knobs live as constants at the top of
[`src/hero/water.frag.glsl`](src/hero/water.frag.glsl) — `REFRACT_STRENGTH`,
`WAVE_SPEED`, `SHININESS`, `GLOW_STRENGTH`, fresnel, vignette, etc. Runtime
caps (DPR, render scale, logo size, mobile octave reduction) are at the top of
[`src/hero/hero.ts`](src/hero/hero.ts).

Accessibility/perf is wired: DPR capped at 2 + 0.85× render scale,
`prefers-reduced-motion` freezes the water on a calm frame and holds a static
bloom, the RAF loop pauses via IntersectionObserver when the hero scrolls out
of view (and on tab hide), and a static fallback hero shows if WebGL fails.

## Placeholders to replace (from plan §0)

These ship as flagged placeholders — swap in real values:

1. **Logo** — currently `src/assets/logo.png` (368×364). The plan asks for an
   SVG + a **≥1024px** transparent PNG for crisper shader sampling. **Flag:**
   the supplied PNG is below that target; a higher-res export will sharpen the
   submerged mark.
2. **Pulse / accent color** — provisional default `#3FC9FF → #0A2540`
   (`PULSE_COLOR`/`ACCENT_DEEP` in `hero.ts`, mirrored as `--c-accent` in
   `tokens.css`). **This is a brand decision — confirm before final polish.**
3. **Events** — placeholder cards + generated gradient images in
   `src/carousel/events.ts` and `src/assets/events/`.
4. **Contact** — placeholder email + social URLs in
   `src/contact/contact.ts` (and `index.html`).
5. **Deploy** — static `dist/`, host-agnostic (Vercel / Netlify / Cloudflare
   Pages). No platform config added; **confirm the target** before adding any.

## Flagged assumption

The logo reads as **submerged** — beneath the water and gently refracted, per
the brief. If it should instead float crisply *above* the water, that's a
meaningful change to the shader compositing — flag it and it'll be reworked.
