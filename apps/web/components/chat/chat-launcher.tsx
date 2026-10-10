"use client";

import {
  History,
  Loader2,
  MessageSquarePlus,
  SendHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ChatBlocks } from "@/components/chat/chat-blocks";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteConversationAction,
  listConversationsAction,
  loadConversationAction,
  sendChatMessageAction,
} from "@/lib/chat/actions";
import type { ChatMessageView, ConversationSummary } from "@/lib/trpc/routers/chat";

const MAX_QUESTION = 2000;

const EXAMPLES = [
  "What are the total Scope 1 and Scope 2 emissions this financial year?",
  "Compare electricity consumption between this month and the previous month.",
  "Show the monthly diesel consumption trend for the current financial year.",
  "Which projects have the highest electricity consumption this financial year?",
  "Which reporting periods have missing or unapproved data?",
  "Explain how the grid electricity emissions were calculated last month.",
];

const uuid = (value: string | null) =>
  value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;

/**
 * The ESG data analyst (.grill/chat-analyst-decisions.md, A32): a button in the top bar and a floating one
 * at the bottom right, both opening the same side panel. The panel only shows what the server returns —
 * the model's wording as plain text and the blocks the server built from the records.
 */
export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [draft, setDraft] = useState("");
  /** The question being answered, shown until its answer arrives. */
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; question?: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, error]);

  const refreshConversations = useCallback(async () => {
    const result = await listConversationsAction();
    if (result.ok) setConversations(result.data);
  }, []);

  const startNew = () => {
    setConversationId(undefined);
    setMessages([]);
    setError(null);
    setShowHistory(false);
    input.current?.focus();
  };

  const openConversation = async (id: string) => {
    setShowHistory(false);
    setError(null);
    const result = await loadConversationAction(id);
    if (!result.ok) return setError({ message: result.error });
    setConversationId(id);
    setMessages(result.data);
  };

  const remove = async (id: string) => {
    const result = await deleteConversationAction(id);
    if (!result.ok) return setError({ message: result.error });
    if (id === conversationId) startNew();
    await refreshConversations();
  };

  const ask = async (question: string) => {
    const message = question.trim();
    if (!message || pending) return;
    setDraft("");
    setError(null);
    setPending(message);
    // What the page shows, for "this project"; the server uses it only if it is inside the person's scope.
    const params = new URLSearchParams(window.location.search);
    const result = await sendChatMessageAction({
      conversationId,
      message,
      page: { orgUnitId: uuid(params.get("org")), periodId: uuid(params.get("period")) },
    });
    setPending(null);
    if (!result.ok) return setError({ message: result.error, question: message });
    setConversationId(result.data.conversation.id);
    setMessages((current) => [...current, ...result.data.messages]);
    setConversations(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Sparkles aria-hidden />
        <span className="sr-only sm:not-sr-only">Ask</span>
      </Button>
      {open ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="fixed right-4 bottom-4 z-40 inline-flex size-12 items-center justify-center rounded-full border bg-card text-primary-text shadow-lg transition-transform outline-none hover:scale-105 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:right-6 md:bottom-6"
        >
          <Sparkles className="size-5" aria-hidden />
          <span className="sr-only">Ask the ESG data analyst</span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[480px] max-w-full gap-0">
          <SheetHeader className="border-b">
            <SheetTitle>ESG data analyst</SheetTitle>
            <SheetDescription>
              Ask about the ESG data you can see. Figures come from the records; an AI model writes
              the wording. It cannot change anything.
            </SheetDescription>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={startNew}>
                <MessageSquarePlus aria-hidden />
                New conversation
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={showHistory}
                onClick={() => {
                  setShowHistory((value) => !value);
                  if (!showHistory) void refreshConversations();
                }}
              >
                <History aria-hidden />
                Saved
              </Button>
            </div>
          </SheetHeader>

          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs leading-5 text-muted-foreground">
                Only you can see your conversations. They are kept for 90 days after their last
                message.
              </p>
              {conversations === null ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
              ) : conversations.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No saved conversations yet.</p>
              ) : (
                <ul className="mt-3 divide-y rounded-md border">
                  {conversations.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void openConversation(c.id)}
                        className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="block truncate text-sm">{c.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(c.lastMessageAt).toLocaleString("en-IN")}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (window.confirm("Delete this conversation for good?"))
                            void remove(c.id);
                        }}
                      >
                        <Trash2 aria-hidden />
                        <span className="sr-only">Delete conversation: {c.title}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4" role="log" aria-live="polite">
              {messages.length === 0 && !pending ? (
                <div>
                  <p className="text-sm leading-5">
                    Ask a question about consumption, emissions, trends or data completeness for the
                    parts of the organisation you can see. For example:
                  </p>
                  <ul className="mt-3 space-y-2">
                    {EXAMPLES.map((example) => (
                      <li key={example}>
                        <button
                          type="button"
                          onClick={() => void ask(example)}
                          className="w-full rounded-md border bg-card px-3 py-2 text-left text-sm leading-5 outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {example}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ol className="space-y-4">
                {messages.map((message) => (
                  <li key={message.id}>
                    <Message message={message} />
                  </li>
                ))}
                {pending ? (
                  <>
                    <li>
                      <Bubble mine>{pending}</Bubble>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Looking up the records…
                    </li>
                  </>
                ) : null}
              </ol>
              {error ? (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-status-error px-3 py-2 text-sm text-status-error"
                >
                  <p>{error.message}</p>
                  {error.question ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void ask(error.question!)}
                    >
                      Try again
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div ref={end} />
            </div>
          )}

          <form onSubmit={submit} className="border-t p-4">
            <label htmlFor="chat-question" className="sr-only">
              Your question
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="chat-question"
                ref={input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                maxLength={MAX_QUESTION}
                rows={2}
                placeholder="Ask about your ESG data…"
                className="min-h-10 flex-1 resize-none rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!draft.trim() || pending !== null}
              >
                <SendHorizontal aria-hidden />
                Send
              </Button>
            </div>
            <p className="mt-2 text-xs leading-4 text-muted-foreground">
              Enter sends, Shift + Enter adds a line. Questions and the figures they need are sent
              to the AI service.
            </p>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Bubble({ mine = false, children }: { mine?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={
        mine
          ? "ml-8 rounded-md bg-muted px-3 py-2 text-sm leading-5 whitespace-pre-wrap"
          : "text-sm leading-6 whitespace-pre-wrap"
      }
    >
      {children}
    </p>
  );
}

function Message({ message }: { message: ChatMessageView }) {
  if (message.role === "user") return <Bubble mine>{message.content}</Bubble>;
  if (message.hidden) {
    return (
      <p className="rounded-md border px-3 py-2 text-xs leading-5 text-muted-foreground">
        This earlier answer is about a part of the organisation that is no longer in your scope, so
        it is not shown.
      </p>
    );
  }
  return (
    <article>
      <Bubble>{message.content}</Bubble>
      {message.blocks.length ? <ChatBlocks blocks={message.blocks} /> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        As of {new Date(message.createdAt).toLocaleString("en-IN")}. Figures are as they stood then.
      </p>
    </article>
  );
}
