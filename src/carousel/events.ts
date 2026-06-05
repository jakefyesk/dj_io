// Placeholder event content (plan §0.3 — ship 4–6 placeholders).
// Replace `image`, `title`, `venue`, `date`, and optional `link` with real
// data when supplied. Images are imported so Vite fingerprints them.

import imgWarehouse from "../assets/events/01-warehouse.svg";
import imgPier from "../assets/events/02-pier.svg";
import imgLoft from "../assets/events/03-loft.svg";
import imgAtrium from "../assets/events/04-atrium.svg";
import imgRooftop from "../assets/events/05-rooftop.svg";

export interface IoEvent {
  image: string;
  title: string;
  venue: string;
  date: string; // human-readable; freeform placeholder
  link?: string;
}

export const events: IoEvent[] = [
  {
    image: imgWarehouse,
    title: "Submerged",
    venue: "The Warehouse · Berlin",
    date: "Mar 2026",
    link: "#",
  },
  {
    image: imgPier,
    title: "Tidal",
    venue: "Pier 7 · Lisbon",
    date: "Feb 2026",
    link: "#",
  },
  {
    image: imgLoft,
    title: "After Hours",
    venue: "The Loft · London",
    date: "Jan 2026",
  },
  {
    image: imgAtrium,
    title: "Glasshouse",
    venue: "Atrium · Amsterdam",
    date: "Dec 2025",
    link: "#",
  },
  {
    image: imgRooftop,
    title: "Low Light",
    venue: "Rooftop · Barcelona",
    date: "Nov 2025",
  },
];
