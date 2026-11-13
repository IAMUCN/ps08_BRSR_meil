import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { blocksSchema, type Block } from "@/lib/chat/blocks";
import { adminData, allowedUnits, chatConfig, dataLayer } from "@/lib/chat/data";
import { createModelCaller, PROVIDER_MESSAGES, ProviderError } from "@/lib/chat/nim";
import {
  answerQuestion,
  auditLookups,
  historyMessages,
  LIMITS,
  systemPrompt,
  type SavedToolCall,
} from "@/lib/chat/orchestrate";
import { ADMIN_TOOLS, runTool, toolSpecs, type OrgUnit, type ToolContext } from "@/lib/chat/tools";
import { db } from "@/lib/db";
import { bucket, count, exceeded, rateLimits } from "@/lib/security/rate-limit";
import { permissionProcedure, router } from "@/lib/trpc/init";

// The ESG data analyst (.grill/chat-analyst-decisions.md, deviations D34 and A32). A question is answered
// by a language model that may only ask for the approved read-only tools of lib/chat/tools.ts; identity and
// org scope come from the session and the database on every question, never from the browser or the model.
// Conversations are saved, private to their owner, for 90 days.

/** Using the chatbot is a permission an Admin grants per role (migration 0042, Roles & Permissions). */
export const CHAT_PERMISSION = "chat.use";
const chatProcedure = permissionProcedure(CHAT_PERMISSION);

export const RETENTION_DAYS = 90;
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 100;

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: Block[];
  createdAt: string;
  /** An earlier answer about an org unit the reader can no longer see: its content is withheld. */
  hidden: boolean;
};

export type ConversationSummary = { id: string; title: string; lastMessageAt: string };

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: unknown;
  tool_calls: SavedToolCall[] | null;
  org_unit_ids: string[];
  created_at: Date;
};

/** A saved message as its owner may see it now, whatever they could see when it was written. */
function view(row: MessageRow, units: OrgUnit[], isAdmin: boolean): ChatMessageView {
  const allowed = new Set(units.map((u) => u.id));
  // An answer made with an Admin-only lookup (people, who submitted what) is an Admin's to read.
  const hidden =
    row.org_unit_ids.some((id) => !allowed.has(id)) ||
    (!isAdmin && (row.tool_calls ?? []).some((c) => ADMIN_TOOLS.has(c.name)));
  const blocks = blocksSchema.safeParse(row.blocks ?? []);
  return {
    id: row.id,
    role: row.role,
    content: hidden ? "" : row.content,
    blocks: hidden || !blocks.success ? [] : blocks.data,
    createdAt: row.created_at.toISOString(),
    hidden,
  };
}

/** Today's date in India, where the reporting calendar is kept. */
const todayInIndia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const uuid = z.uuid();

// The page the person is on, by a fixed list — the browser's path only selects an entry, its text is never
// passed on. Longer paths first.
const PAGES: [string, string][] = [
  ["/admin/scope-1", "the Scope 1 dashboard"],
  ["/admin/scope-2", "the Scope 2 dashboard"],
  ["/admin/scope-3", "the Scope 3 dashboard"],
  ["/admin/submissions", "Submission Monitoring"],
  ["/admin/data-explorer", "the ESG Data Explorer"],
  ["/admin/validation-queue", "the Validation Queue"],
  ["/admin/approval-queue", "the Approval Queue"],
  ["/admin/conversion-factors", "the Conversion Factors page"],
  ["/admin/brsr-mapping", "the BRSR Mapping page"],
  ["/admin/disclosures", "the BRSR Disclosures page"],
  ["/admin/reports", "the Reports page"],
  ["/admin/reporting-periods", "the Reporting Periods page"],
  ["/admin/organization", "the Organization page"],
  ["/admin", "the Admin Control Tower"],
  ["/app/submissions", "My Submissions"],
  ["/app/approvals", "the Approvals page"],
  ["/app/upload", "the Upload page"],
  ["/app", "their dashboard"],
];
const pageName = (path: string | undefined) =>
  PAGES.find(([prefix]) => path === prefix || path?.startsWith(`${prefix}/`))?.[1];

export const chatRouter = router({
  /** The person's saved conversations, newest first. Conversations past retention are removed on the way. */
  conversations: chatProcedure.query(async ({ ctx }): Promise<ConversationSummary[]> => {
    const sql = db();
    // ponytail: purged when someone opens the chat, since the app has no scheduler; move to a scheduled job
    // at deployment if conversations must disappear on the day.
    await sql`
      delete from public.chat_conversations
      where last_message_at < now() - make_interval(days => ${RETENTION_DAYS})`;
    const rows = await sql<{ id: string; title: string; last_message_at: Date }[]>`
      select id, title, last_message_at from public.chat_conversations
      where user_id = ${ctx.session.userId} order by last_message_at desc limit ${MAX_CONVERSATIONS}`;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      lastMessageAt: r.last_message_at.toISOString(),
    }));
  }),

  conversation: chatProcedure
    .input(z.object({ id: uuid }))
    .query(async ({ ctx, input }): Promise<ChatMessageView[]> => {
      const sql = db();
      const [rows, units] = await Promise.all([
        sql<MessageRow[]>`
          select m.id, m.role, m.content, m.blocks, m.tool_calls, m.org_unit_ids, m.created_at
          from public.chat_messages m
          join public.chat_conversations c on c.id = m.conversation_id
          where c.id = ${input.id} and c.user_id = ${ctx.session.userId}
          order by m.created_at, m.role desc limit ${MAX_MESSAGES + 2}`,
        allowedUnits(ctx.session),
      ]);
      return rows.map((row) => view(row, units, ctx.session.isAdmin));
    }),

  send: chatProcedure
    .input(
      z.object({
        conversationId: uuid.optional(),
        message: z.string().trim().min(1).max(LIMITS.question),
        /** What the page the person is on shows. Used only if it is inside their scope. */
        page: z
          .object({
            orgUnitId: uuid.optional(),
            periodId: uuid.optional(),
            path: z.string().max(200).optional(),
          })
          .optional(),
      }),
    )
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ conversation: ConversationSummary; messages: ChatMessageView[] }> => {
        const config = chatConfig();
        if (!config) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: PROVIDER_MESSAGES.config });
        }
        const sql = db();
        const userId = ctx.session.userId;

        const limits = await rateLimits();
        const limiter = bucket("chat", userId);
        if (await exceeded(limiter, limits.chat_messages_per_user, limits.chat_window_minutes)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "That is a lot of questions in a short time. Try again in a few minutes.",
          });
        }
        await count(limiter);

        // --- The conversation: the person's own, with room left in it ----------------------------------
        let earlier: MessageRow[] = [];
        if (input.conversationId) {
          const [own] = await sql<{ messages: number }[]>`
            select (select count(*) from public.chat_messages where conversation_id = c.id)::int as messages
            from public.chat_conversations c where c.id = ${input.conversationId} and c.user_id = ${userId}`;
          if (!own) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
          if (own.messages >= MAX_MESSAGES) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This conversation is full. Start a new one to keep asking.",
            });
          }
          earlier = (
            await sql<MessageRow[]>`
              select id, role, content, blocks, tool_calls, org_unit_ids, created_at
              from public.chat_messages where conversation_id = ${input.conversationId}
              order by created_at desc, role limit ${LIMITS.history}`
          ).reverse();
        } else {
          const [{ n }] = await sql<{ n: number }[]>`
            select count(*)::int as n from public.chat_conversations where user_id = ${userId}`;
          if (n >= MAX_CONVERSATIONS) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `You have ${MAX_CONVERSATIONS} saved conversations. Delete one to start another.`,
            });
          }
        }

        // --- What the person may see, now ---------------------------------------------------------------
        const data = dataLayer(config.databaseUrl);
        const [units, periods] = await Promise.all([allowedUnits(ctx.session), data.periods()]);
        const isAdmin = ctx.session.isAdmin;
        const toolContext: ToolContext = {
          units,
          periods,
          today: todayInIndia(),
          data,
          // People and record-level detail are an Admin's; nobody else's question can reach them.
          admin: isAdmin ? adminData() : undefined,
        };
        const ids = new Set(units.map((u) => u.id));
        const system = systemPrompt({
          today: toolContext.today,
          ownUnits: units.filter((u) => !u.parentId || !ids.has(u.parentId)).map((u) => u.name),
          page: {
            orgUnit: units.find((u) => u.id === input.page?.orgUnitId)?.name,
            period: periods.find((p) => p.id === input.page?.periodId)?.label,
            name: pageName(input.page?.path),
          },
          isAdmin,
        });
        // Earlier answers the person can no longer see are not context either.
        const history = historyMessages(
          earlier
            .map((row) => ({ row, shown: view(row, units, isAdmin) }))
            .filter(({ shown }) => !shown.hidden)
            .map(({ row }) => ({
              role: row.role,
              content: row.content,
              toolCalls: row.tool_calls ?? undefined,
            })),
        );

        let answer;
        const requestId = crypto.randomUUID();
        try {
          answer = await answerQuestion({
            question: input.message,
            system,
            history,
            callModel: createModelCaller({
              config,
              tools: toolSpecs(isAdmin),
              requestId,
              orgUnitId: input.page?.orgUnitId,
              onFailure: (model, reason) => console.warn(`chat: ${model} failed (${reason})`),
              onProviderFallback: (from, to, reason) =>
                console.warn(`chat: provider fallback ${from} -> ${to} (${reason})`),
              onLog: (log) => console.info(`[chat-observability] ${JSON.stringify(log)}`),
            }),
            runTool: (name, rawArguments) =>
              runTool(name, rawArguments, toolContext, (error) =>
                console.error(
                  "chat: tool failed",
                  name,
                  error instanceof Error ? error.message : "",
                ),
              ),
          });
        } catch (error) {
          if (error instanceof ProviderError) {
            console.error(`chat: no answer (${error.kind})`, error.message, error.details);
            const trpcCode =
              error.kind === "busy" || error.kind === "rate_limit"
                ? "TOO_MANY_REQUESTS"
                : error.kind === "auth" || error.kind === "config"
                  ? "PRECONDITION_FAILED"
                  : error.kind === "timeout"
                    ? "TIMEOUT"
                    : "SERVICE_UNAVAILABLE";
            throw new TRPCError({ code: trpcCode, message: error.message });
          }
          console.error("chat: unhandled error in answerQuestion:", error);
          throw error;
        }

        // --- Saved together with its audit entry (who, when, which lookups — not the words) -------------
        return sql.begin(async (tx) => {
          const [conversation] = input.conversationId
            ? await tx<{ id: string; title: string; last_message_at: Date }[]>`
                update public.chat_conversations set last_message_at = now()
                where id = ${input.conversationId} returning id, title, last_message_at`
            : await tx<{ id: string; title: string; last_message_at: Date }[]>`
                insert into public.chat_conversations (user_id, title)
                values (${userId}, ${input.message.slice(0, 80)}) returning id, title, last_message_at`;
          const saved = await tx<MessageRow[]>`
            insert into public.chat_messages
              (conversation_id, role, content, blocks, tool_calls, org_unit_ids, model)
            values
              (${conversation.id}, 'user', ${input.message}, null, null, '{}', null),
              (${conversation.id}, 'assistant', ${answer.text}, ${tx.json(answer.blocks)},
               ${tx.json(answer.toolCalls as never)}, ${answer.orgUnitIds}, ${answer.model})
            returning id, role, content, blocks, tool_calls, org_unit_ids, created_at`;
          await writeAudit(tx, {
            eventType: "chat.question_answered",
            entityType: "chat_conversation",
            entityId: conversation.id,
            userId,
            newValue: {
              lookups: auditLookups(answer.toolCalls),
              org_unit_ids: answer.orgUnitIds,
              model: answer.model,
            },
          });
          return {
            conversation: {
              id: conversation.id,
              title: conversation.title,
              lastMessageAt: conversation.last_message_at.toISOString(),
            },
            // The question first, whatever order the rows came back in.
            messages: saved
              .sort((a, b) => (a.role === "user" ? -1 : b.role === "user" ? 1 : 0))
              .map((row) => view(row, units, isAdmin)),
          };
        });
      },
    ),

  /** Removes one of the person's own conversations for good. */
  delete: chatProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    const deleted = await db()`
      delete from public.chat_conversations
      where id = ${input.id} and user_id = ${ctx.session.userId} returning id`;
    if (deleted.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
    }
    return null;
  }),
});
