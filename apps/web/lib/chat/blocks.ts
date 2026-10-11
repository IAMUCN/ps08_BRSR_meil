// What an answer is made of besides the model's wording (.grill/chat-analyst-decisions.md). The server
// builds every block from tool results; the model never writes one, so no figure, table or chart can come
// from it. Validated before an answer is stored or returned, and rendered as text and SVG only.
import { z } from "zod";

const text = (max: number) => z.string().max(max);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stats"),
    items: z
      .array(
        z.object({ label: text(80), value: text(40), unit: text(20), sub: text(120).optional() }),
      )
      .max(6),
  }),
  z.object({
    type: z.literal("table"),
    title: text(120),
    columns: z.array(text(60)).max(8),
    rows: z.array(z.array(text(200)).max(8)).max(50),
  }),
  z.object({
    type: z.literal("chart"),
    kind: z.enum(["bar", "line"]),
    title: text(120),
    unit: text(20),
    points: z.array(z.object({ label: text(60), value: z.number().finite().nullable() })).max(36),
  }),
  z.object({ type: z.literal("note"), tone: z.enum(["info", "warning"]), text: text(600) }),
  /** The org unit, period and record statuses an answer covers. */
  z.object({ type: z.literal("source"), text: text(600) }),
]);

export type Block = z.infer<typeof blockSchema>;

export const MAX_BLOCKS = 12;
export const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS);

/** Figures as the rest of the app prints them: Indian grouping, at most two decimals. */
export const formatNumber = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
