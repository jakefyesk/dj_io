import EmblaCarousel, { type EmblaCarouselType } from "embla-carousel";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { events, type IoEvent } from "./events";

// Builds a card's markup. Images are lazy (loading="lazy") and fade in on
// load via the .is-loaded class (wired below).
function cardHtml(ev: IoEvent): string {
  const titleInner = ev.link
    ? `<a href="${ev.link}" rel="noopener">${ev.title}</a>`
    : ev.title;
  return `
    <li class="embla__slide">
      <article class="card">
        <div class="card__media">
          <img loading="lazy" decoding="async" width="1280" height="720"
               src="${ev.image}" alt="${ev.title} — ${ev.venue}" />
        </div>
        <div class="card__body">
          <h3 class="card__title">${titleInner}</h3>
          <div class="card__meta">
            <span>${ev.venue}</span>
            <span>${ev.date}</span>
          </div>
        </div>
      </article>
    </li>`;
}

export function initCarousel(): EmblaCarouselType | null {
  const root = document.getElementById("embla");
  const viewport = document.getElementById("embla-viewport");
  const container = document.getElementById("embla-container");
  if (!root || !viewport || !container) return null;

  // Render cards.
  container.innerHTML = events.map(cardHtml).join("");

  // Fade images in once decoded.
  container.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const reveal = () => img.classList.add("is-loaded");
    if (img.complete) reveal();
    else img.addEventListener("load", reveal, { once: true });
  });

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const embla = EmblaCarousel(
    viewport,
    {
      loop: false,
      align: "start",
      dragFree: false,
      containScroll: "trimSnaps",
      duration: reducedMotion ? 0 : 26, // momentum feel; instant if reduced
      skipSnaps: false,
    },
    // Smooth trackpad horizontal scrolling. Responds to the dominant wheel
    // axis, so a sideways trackpad swipe drives the carousel while a vertical
    // wheel still scrolls the page; snaps to a slide when the gesture settles.
    [WheelGesturesPlugin()]
  );

  // --- Controls -----------------------------------------------------
  const prev = document.getElementById("embla-prev") as HTMLButtonElement | null;
  const next = document.getElementById("embla-next") as HTMLButtonElement | null;
  const progress = document.getElementById("embla-progress");

  function updateButtons() {
    if (prev) prev.disabled = !embla.canScrollPrev();
    if (next) next.disabled = !embla.canScrollNext();
  }

  function updateProgress() {
    if (!progress) return;
    const p = Math.max(0, Math.min(1, embla.scrollProgress()));
    // bar is 30% wide; travel the remaining 70% of the track
    progress.style.transform = `translateX(${p * 233}%)`;
  }

  prev?.addEventListener("click", () => embla.scrollPrev());
  next?.addEventListener("click", () => embla.scrollNext());

  embla.on("select", updateButtons);
  embla.on("scroll", updateProgress);
  embla.on("reInit", () => {
    updateButtons();
    updateProgress();
  });

  // --- Keyboard a11y: arrow keys scroll when the carousel is focused -
  viewport.setAttribute("tabindex", "0");
  viewport.setAttribute("role", "region");
  viewport.setAttribute("aria-label", "Events carousel");
  viewport.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      embla.scrollPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      embla.scrollNext();
    }
  });

  updateButtons();
  updateProgress();
  return embla;
}
