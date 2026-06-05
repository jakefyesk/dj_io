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
    image: imgRooftop,
    title: "Marshall Gala 2025",
    venue: "Rooftop · Philadelphia, PA",
    date: "Oct 2025",
  },
  {
    image: imgPier,
    title: "Hot Singles Party",
    venue: "Washington, DC",
    date: "2025",
  },
  {
    image: imgAtrium,
    title: "Marshall Gala 2024",
    venue: "Rooftop · Philadelphia, PA",
    date: "Oct 2024",
  },
  {
    image: imgWarehouse,
    title: "Marshall Gala 2023",
    venue: "Rooftop · Philadelphia, PA",
    date: "Oct 2023",
  },
  {
    image: imgLoft,
    title: "My Bedroom",
    venue: "My Bedroom",
    date: "2013 – Present",
  },
];
