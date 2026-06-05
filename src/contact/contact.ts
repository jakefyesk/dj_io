// Contact wiring (plan §5). Content is placeholder until supplied (§0.4):
// email + social handles. Centralised here so real values drop into one
// place. Socials are monochrome text links that light to the accent on
// hover (styled in main.css).

interface Social {
  key: string;
  label: string;
  url: string;
}

const EMAIL = "bookings@io.example";

const SOCIALS: Social[] = [
  { key: "instagram", label: "Instagram", url: "https://instagram.com/" },
  { key: "soundcloud", label: "SoundCloud", url: "https://soundcloud.com/" },
  { key: "spotify", label: "Spotify", url: "https://open.spotify.com/" },
  { key: "ra", label: "Resident Advisor", url: "https://ra.co/" },
  { key: "bandcamp", label: "Bandcamp", url: "https://bandcamp.com/" },
];

export function initContact(): void {
  const email = document.getElementById("contact-email") as HTMLAnchorElement | null;
  if (email) {
    email.href = `mailto:${EMAIL}`;
    email.textContent = EMAIL;
  }

  for (const s of SOCIALS) {
    const a = document.querySelector<HTMLAnchorElement>(
      `.contact__socials a[data-social="${s.key}"]`
    );
    if (a) a.href = s.url;
  }

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
}
