// SVG cover layout presets for the Cover Studio designer mode.

export type CoverFace = "front" | "back" | "spine";

export interface CoverDesignInput {
  face: CoverFace;
  layout: string;
  title: string;
  subtitle?: string;
  author: string;
  blurb?: string;
  accent: string;
  bg: string;
  ink: string;
}

export const COVER_LAYOUTS = [
  { id: "classic-serif", name: "Classic Serif" },
  { id: "minimal-sand", name: "Minimal Sand" },
  { id: "vintage-cloth", name: "Vintage Cloth" },
  { id: "modernist-block", name: "Modernist Block" },
  { id: "photo-overlay", name: "Photo Overlay" },
  { id: "two-tone", name: "Two-Tone" },
] as const;

export const COVER_PALETTES = [
  { id: "warm-sand", name: "Warm Sand", bg: "#3a2a1f", accent: "#c9b99a", ink: "#faf8f5" },
  { id: "ocean-deep", name: "Ocean Deep", bg: "#1a2a3a", accent: "#a8b8c8", ink: "#f0ebe3" },
  { id: "forest-moss", name: "Forest & Moss", bg: "#1a2a22", accent: "#a8c098", ink: "#f5f2ea" },
  { id: "ember", name: "Ember", bg: "#2a1818", accent: "#d4a574", ink: "#faf6ef" },
  { id: "noir-gold", name: "Noir & Gold", bg: "#0d0d0d", accent: "#c9a84c", ink: "#f0d78c" },
  { id: "paper-ink", name: "Paper & Ink", bg: "#f5f3ee", accent: "#0d0d0d", ink: "#0d0d0d" },
  {
    id: "midnight-indigo",
    name: "Midnight Indigo",
    bg: "#0a0a1a",
    accent: "#4f46e5",
    ink: "#e8eaff",
  },
  {
    id: "charcoal-ember",
    name: "Charcoal & Ember",
    bg: "#1a1a1a",
    accent: "#e85d3a",
    ink: "#f5f0e8",
  },
  {
    id: "terracotta-sage",
    name: "Terracotta & Sage",
    bg: "#c4654a",
    accent: "#4a6741",
    ink: "#faf6ef",
  },
  { id: "burnt-sienna", name: "Burnt Sienna", bg: "#6b3a2a", accent: "#e8c07a", ink: "#faf6ef" },
  { id: "arctic-frost", name: "Arctic Frost", bg: "#e8f0f8", accent: "#2e6b8a", ink: "#0c2340" },
  { id: "slate-steel", name: "Slate & Steel", bg: "#2d3748", accent: "#a0aec0", ink: "#f7fafc" },
  {
    id: "electric-coral",
    name: "Electric Coral",
    bg: "#574b90",
    accent: "#ff6b6b",
    ink: "#fff5f7",
  },
  { id: "neon-mint", name: "Neon Mint", bg: "#0d1b2a", accent: "#2dd4a8", ink: "#e8fff5" },
  { id: "sunset-blaze", name: "Sunset Blaze", bg: "#6c5ce7", accent: "#ff6b35", ink: "#fff5e0" },
  {
    id: "blush-lavender",
    name: "Blush & Lavender",
    bg: "#9b72cf",
    accent: "#f8e8ee",
    ink: "#2d1a3d",
  },
  { id: "sage-cream", name: "Sage & Cream", bg: "#7d9b76", accent: "#f5f0e8", ink: "#1f2a1f" },
  {
    id: "autumn-harvest",
    name: "Autumn Harvest",
    bg: "#5c2018",
    accent: "#e8b84a",
    ink: "#fdf6e3",
  },
  {
    id: "cherry-blossom",
    name: "Cherry Blossom",
    bg: "#fef0f5",
    accent: "#c45c7c",
    ink: "#3d1a28",
  },
  { id: "navy-trust", name: "Navy Trust", bg: "#0f1b3d", accent: "#3b6fa0", ink: "#e8edf3" },
  {
    id: "emerald-prestige",
    name: "Emerald Prestige",
    bg: "#064e3b",
    accent: "#c9a84c",
    ink: "#f5f0e0",
  },
  { id: "vapor-chrome", name: "Vapor Chrome", bg: "#c4b5fd", accent: "#67e8f9", ink: "#1a1a3a" },
] as const;

function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrap(text: string, perLine: number, maxLines = 4): string[] {
  const words = (text || "").split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perLine) {
      out.push(cur.trim());
      cur = w;
      if (out.length >= maxLines) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && out.length < maxLines) out.push(cur);
  return out;
}

/** Renders a 600×900 (front/back) or 120×900 (spine) SVG. */
export function renderCoverSvg(input: CoverDesignInput): string {
  const W = input.face === "spine" ? 120 : 600;
  const H = 900;
  const { layout, title, subtitle, author, blurb, accent, bg, ink } = input;
  const t = escapeXml(title);
  const st = escapeXml(subtitle || "");
  const au = escapeXml(author || "");
  const bl = escapeXml(blurb || "");

  if (input.face === "spine") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${ink}"
    font-family="Georgia, serif" font-size="34" font-weight="600"
    transform="rotate(-90 ${W / 2} ${H / 2})">${t}</text>
  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" fill="${accent}"
    font-family="Georgia, serif" font-size="14" font-weight="500"
    transform="rotate(-90 ${W / 2} ${H - 40})">${au}</text>
</svg>`;
  }

  if (input.face === "back") {
    const lines = wrap(bl, 48, 14);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.5"/>
  <text x="${W / 2}" y="120" text-anchor="middle" fill="${accent}" font-family="Georgia, serif" font-size="14" letter-spacing="3">${escapeXml((au || "").toUpperCase())}</text>
  <text x="${W / 2}" y="170" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="28" font-weight="600">${t}</text>
  <g font-family="Georgia, serif" font-size="16" fill="${ink}" opacity="0.9">
    ${lines.map((l, i) => `<text x="60" y="${230 + i * 28}">${l}</text>`).join("\n    ")}
  </g>
</svg>`;
  }

  // FRONT — choose layout
  const titleLines = wrap(t, 18, 3);
  switch (layout) {
    case "minimal-sand":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <line x1="80" y1="380" x2="${W - 80}" y2="380" stroke="${accent}" stroke-width="1"/>
  <line x1="80" y1="${H - 200}" x2="${W - 80}" y2="${H - 200}" stroke="${accent}" stroke-width="1"/>
  <text x="${W / 2}" y="430" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="48" font-weight="500">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 56}">${l}</tspan>`).join("")}
  </text>
  ${st ? `<text x="${W / 2}" y="${H - 240}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="18" font-style="italic" opacity="0.8">${st}</text>` : ""}
  <text x="${W / 2}" y="${H - 150}" text-anchor="middle" fill="${accent}" font-family="Georgia, serif" font-size="14" letter-spacing="4">${escapeXml((au || "").toUpperCase())}</text>
</svg>`;
    case "modernist-block":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="0" y="${H / 3}" width="${W}" height="${H / 3}" fill="${accent}"/>
  <text x="60" y="${H / 2 + 10}" fill="${bg}" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="900">
    ${titleLines.map((l, i) => `<tspan x="60" dy="${i === 0 ? 0 : 60}">${escapeXml((l || "").toUpperCase())}</tspan>`).join("")}
  </text>
  <text x="60" y="${H - 60}" fill="${ink}" font-family="Helvetica, Arial, sans-serif" font-size="18" letter-spacing="4">${escapeXml((au || "").toUpperCase())}</text>
</svg>`;
    case "vintage-cloth":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="cloth" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${bg}"/>
      <circle cx="1" cy="1" r="0.6" fill="${ink}" opacity="0.06"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#cloth)"/>
  <rect x="50" y="50" width="${W - 100}" height="${H - 100}" fill="none" stroke="${accent}" stroke-width="3"/>
  <rect x="64" y="64" width="${W - 128}" height="${H - 128}" fill="none" stroke="${accent}" stroke-width="1"/>
  <text x="${W / 2}" y="380" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="46" font-weight="600">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 56}">${l}</tspan>`).join("")}
  </text>
  <line x1="${W / 2 - 60}" y1="${H - 200}" x2="${W / 2 + 60}" y2="${H - 200}" stroke="${accent}" stroke-width="1"/>
  <text x="${W / 2}" y="${H - 160}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="20" font-style="italic">${au}</text>
</svg>`;
    case "photo-overlay":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.6"/>
      <stop offset="0.5" stop-color="${bg}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${bg}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${accent}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="${W / 2}" y="${H - 280}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="46" font-weight="600">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 56}">${l}</tspan>`).join("")}
  </text>
  ${st ? `<text x="${W / 2}" y="${H - 200}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="18" font-style="italic" opacity="0.85">${st}</text>` : ""}
  <text x="${W / 2}" y="${H - 100}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="16" letter-spacing="3">${escapeXml((au || "").toUpperCase())}</text>
</svg>`;
    case "two-tone":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H / 2}" fill="${bg}"/>
  <rect y="${H / 2}" width="${W}" height="${H / 2}" fill="${accent}"/>
  <text x="${W / 2}" y="${H / 2 - 60}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="48" font-weight="600">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 56}">${l}</tspan>`).join("")}
  </text>
  <text x="${W / 2}" y="${H / 2 + 100}" text-anchor="middle" fill="${bg}" font-family="Georgia, serif" font-size="22" font-style="italic">${au}</text>
</svg>`;
    case "classic-serif":
    default:
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0.4"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6"/>
  <text x="${W / 2}" y="420" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="50" font-weight="600">
    ${titleLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 58}">${l}</tspan>`).join("")}
  </text>
  ${st ? `<text x="${W / 2}" y="${H - 220}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="20" font-style="italic" opacity="0.85">${st}</text>` : ""}
  <line x1="${W / 2 - 50}" y1="${H - 170}" x2="${W / 2 + 50}" y2="${H - 170}" stroke="${accent}" stroke-width="1"/>
  <text x="${W / 2}" y="${H - 130}" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="18" letter-spacing="2">${au}</text>
</svg>`;
  }
}
