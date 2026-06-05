import "./styles/main.css";

import { mountHero } from "./hero/hero";
import { initCarousel } from "./carousel/carousel";
import { initContact } from "./contact/contact";

// ------------------------------------------------------------------ //
// Quiet reveal-on-scroll for [.reveal] elements (fade + slight rise).
// Respects prefers-reduced-motion via the CSS (transition removed there).
// ------------------------------------------------------------------ //
function initReveals(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((el) => io.observe(el));
}

// ------------------------------------------------------------------ //
// Nav — fades in once the hero is mostly scrolled past.
// ------------------------------------------------------------------ //
function initNav(): void {
  const nav = document.getElementById("nav");
  const hero = document.getElementById("hero");
  if (!nav || !hero) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        nav.classList.toggle("is-shown", !entry.isIntersecting);
      }
    },
    { threshold: 0.35 }
  );
  io.observe(hero);
}

// ------------------------------------------------------------------ //
function boot(): void {
  const canvas = document.getElementById("hero-canvas") as HTMLCanvasElement | null;
  const hero = document.getElementById("hero");
  if (canvas && hero) {
    try {
      mountHero(canvas, hero); // null -> static fallback stays visible
    } catch (err) {
      // Any failure leaves the static fallback in place (intentional).
      console.warn("Hero shader unavailable, using static fallback.", err);
    }
  }

  initReveals();
  initNav();
  initCarousel();
  initContact();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
