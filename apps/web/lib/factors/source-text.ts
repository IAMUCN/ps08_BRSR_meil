// Pure parts of reading a factor's source (feature_enhancement.md 6.1, 6.2): which links are official, which
// addresses are private, page text, the numbers on a page that look like factors, and Indian financial years.
// No network and no database here, so all of it is unit-tested (tests/factor-source.test.ts).

export type SourceHost = { host: string; publisher: string };
export type Reliability = "official" | "other" | "none";

/** The official-list entry a link's host falls under (the host itself or a parent domain), if any. */
export function officialHost(url: URL | string, hosts: SourceHost[]): SourceHost | null {
  let hostname: string;
  try {
    hostname = (typeof url === "string" ? new URL(url) : url).hostname
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    return null;
  }
  return (
    hosts.find((h) => {
      const host = h.host.toLowerCase();
      return hostname === host || hostname.endsWith(`.${host}`);
    }) ?? null
  );
}

/** How much a link can be trusted as a source: on the official list, some other https site, or no link. */
export function reliability(url: string | null | undefined, hosts: SourceHost[]): Reliability {
  if (!url) return "none";
  return officialHost(url, hosts) ? "official" : "other";
}

/** True for an address the server must never be sent to (loopback, private, link-local, reserved). */
export function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase();
  if (a.includes(":")) {
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      a === "::" ||
      a === "::1" ||
      /^f[cd]/.test(a) || // unique local fc00::/7
      /^fe[89ab]/.test(a) || // link-local fe80::/10
      a.startsWith("ff") || // multicast
      a.startsWith("64:ff9b:") || // NAT64
      a.startsWith("2001:db8") // documentation
    );
  }
  const parts = a.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return true;
  const [x, y] = parts;
  return (
    x === 0 ||
    x === 10 ||
    x === 127 ||
    (x === 100 && y >= 64 && y <= 127) ||
    (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 && y === 168) ||
    (x === 192 && y === 0) ||
    (x === 198 && (y === 18 || y === 19)) ||
    x >= 224
  );
}

/** A link a person typed, checked before anything is sent anywhere. */
export function checkLink(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That is not a web address." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only https:// links are accepted." };
  if (url.username || url.password)
    return { ok: false, reason: "A link with a user name or password in it is not accepted." };
  if (url.port && url.port !== "443")
    return { ok: false, reason: "Only the standard https port is accepted." };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":"))
    return { ok: false, reason: "Use the site's name, not a numeric address." };
  if (!host.includes(".")) return { ok: false, reason: "Use the site's full name." };
  return { ok: true, url };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  sup2: "²",
  sup3: "³",
  minus: "-",
};

/** Visible text of an HTML page: scripts, styles and tags removed, entities decoded, spaces collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/td|\/th)\b[^>]*>/gi, "$& \n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export type Candidate = {
  /** The number as a value (thousands separators removed). */
  value: number;
  /** The number exactly as printed. */
  printed: string;
  /** An emission unit printed next to it ("tCO2/MWh"), if any. */
  unit: string | null;
  /** The words around it, so the person can see what it is. */
  context: string;
  score: number;
};

const NUMBER =
  /(?<![\w.,\-/])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?![\d,]\d)(?!\d)/g;
const EMISSION_UNIT =
  /\b(?:k?g|t|mt|tonnes?)\s*(?:of\s*)?co\s*[2₂]\s*(?:e|-?eq\.?|equivalent)?\s*(?:\/|per)\s*(?:[a-z0-9³²-]+(?:\s*km)?)/i;

// The unit printed straight after the number ("0.727 tCO2/MWh") or straight before it ("tCO2/MWh: 0.727").
const UNIT_AFTER = new RegExp(String.raw`^\s*\(?\s*(${EMISSION_UNIT.source})`, "i");
const UNIT_BEFORE = new RegExp(String.raw`(${EMISSION_UNIT.source})\s*\)?\s*[:=]?\s*$`, "i");

/**
 * The numbers on a page that could be a factor, best first: a number near an emission unit ("kgCO2e/kWh") and
 * near the activity's own words scores highest; a year or a page number scores nothing and is left out. At most
 * 25. Nothing here decides the value — the person picks one or types their own.
 */
export function findCandidates(
  text: string,
  { metricUnit, keywords }: { metricUnit: string; keywords: string[] },
): Candidate[] {
  const words = keywords
    .flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/))
    .filter((w) => w.length >= 3 && !["the", "and", "for", "per"].includes(w));
  const unitWord = metricUnit.toLowerCase();
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const printed = match[1];
    const value = Number(printed.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 0) continue;
    const at = match.index ?? 0;
    const before = text.slice(Math.max(0, at - 90), at);
    const after = text.slice(at + printed.length, at + printed.length + 90);
    const near = `${before} ${after}`.toLowerCase();
    // A year ("2024", "2023-24") or a page number ("page 12", "12 of 60") is never a factor.
    if (/^(19|20)\d{2}$/.test(printed)) continue;
    if (/(page|of)\s*$/i.test(before) || /^\s*of\s+\d/i.test(after)) continue;
    let score = 0;
    // A unit counts only when it is printed right next to the number.
    const unit = after.match(UNIT_AFTER)?.[1] ?? before.match(UNIT_BEFORE)?.[1] ?? null;
    if (unit) score += 5;
    else if (/co\s*[2₂]/i.test(near)) score += 1;
    if (unitWord && new RegExp(`(?:/|per)\\s*${escape(unitWord)}\\b`, "i").test(near)) score += 2;
    score += Math.min(3, words.filter((w) => near.includes(w)).length);
    if (printed.includes(".")) score += 1;
    if (/^[\d,]+$/.test(printed)) score -= 3;
    if (score <= 0) continue;
    const context = `${before}${printed}${after}`.replace(/\s+/g, " ").trim();
    const key = `${printed}|${context.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      value,
      printed,
      unit: unit ? unit.replace(/\s+/g, "") : null,
      context: context.length > 200 ? `${context.slice(0, 200)}…` : context,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- Indian financial years (April to March) ----------------------------------------------------------------

/** "2025-26" for the year starting 1 April 2025. */
export function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** The financial year a date (YYYY-MM-DD) falls in, as its starting year. */
export function fyOf(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

/** Start and end dates of a financial year label, or null when the label is not one. */
export function fyRange(label: string): { from: string; to: string; start: number } | null {
  const m = label.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]);
  if ((start + 1) % 100 !== Number(m[2])) return null;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, start };
}

/** Output units a factor may give. A factor's later versions keep its first version's unit. */
export const OUTPUT_UNITS = ["kgCO2e", "tCO2e", "kgCO2", "tCO2"] as const;
