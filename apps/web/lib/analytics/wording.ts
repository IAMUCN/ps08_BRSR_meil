// AI wording of a suggestion (owner's choice, 2026-11-09: "Rules plus AI wording"; A47). The rules in
// recommend.ts choose the suggestion and its figures; the AI service only rewrites it in plain words, on
// request. What it may see: the suggestion's title, finding, reasons and actions, the figures, the activity
// and period names. Not the org unit's name, people or documents. The reply is refused when it carries a
// number that is not in what it was given, or is empty, too long, or not prose; the fixed wording is then shown.
// No server imports, so the check is unit-tested.
import type { ChatMessage } from "../chat/nim.ts";
import type { Recommendation } from "./recommend.ts";

export const SYSTEM_PROMPT = [
  "You rewrite one emissions-reduction suggestion for a manager at an Indian infrastructure company.",
  "Write 3 to 5 plain sentences: what the data shows, why it matters, and the first two or three steps to take.",
  "Use only the facts and figures given. Do not add numbers, targets, costs, savings, dates or names.",
  "It is a suggestion for people to decide on, not a decision: do not say anything has been changed.",
  "No headings, no lists, no markdown.",
].join(" ");

export function wordingMessages(rec: Recommendation): ChatMessage[] {
  const facts = {
    title: rec.title,
    finding: rec.reason,
    whyItMatters: rec.why,
    actions: rec.actions,
    usualPolicy: rec.policy,
    caveats: rec.caveats,
  };
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(facts) },
  ];
}

/** Every number written in the text, as a value ("1,234.5" → 1234.5; "38%" → 38). */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((s) => Number(s.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

export type WordingCheck = { ok: true; text: string } | { ok: false; reason: string };

/** Accepts the model's reply only when every number in it was in the input. */
export function checkWording(reply: string | null, rec: Recommendation): WordingCheck {
  const text = (reply ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 40) return { ok: false, reason: "empty" };
  if (text.length > 1500) return { ok: false, reason: "too long" };
  if (/^#|\n-|\*\*|```/.test(reply ?? "")) return { ok: false, reason: "not prose" };
  const input = String(wordingMessages(rec)[1].content);
  const close = (a: number, n: number) =>
    Math.abs(a - n) < 1e-9 || Math.abs(a - n) <= Math.abs(a) * 0.006;
  // Every number must be one it was given; a figure with a unit must be one it was given with that unit.
  const allowed = numbersIn(input);
  if (numbersIn(text).some((n) => !allowed.some((a) => close(a, n))))
    return { ok: false, reason: "new figures" };
  const given = quantitiesIn(input);
  for (const q of quantitiesIn(text))
    if (!given.some((g) => g.unit === q.unit && close(g.value, q.value)))
      return { ok: false, reason: "new figures" };
  return { ok: true, text };
}

/** Numbers written with a unit: tonnes ("12 tCO2e", "12 tonnes"), percent, or "times". */
export function quantitiesIn(text: string): { value: number; unit: "t" | "%" | "x" }[] {
  const out: { value: number; unit: "t" | "%" | "x" }[] = [];
  const re =
    /(\d[\d,]*(?:\.\d+)?)\s*(tco2e|tonnes?|t(?![a-z])|%|percent|per cent|times|x(?![a-z]))/gi;
  for (const m of text.matchAll(re)) {
    const u = m[2].toLowerCase();
    out.push({
      value: Number(m[1].replace(/,/g, "")),
      unit: u.startsWith("t") && u !== "times" ? "t" : u === "times" || u === "x" ? "x" : "%",
    });
  }
  return out;
}
