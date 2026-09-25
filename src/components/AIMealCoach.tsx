import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFoods, useKids, usePlan } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFoodLadder } from "@/hooks/useFoodLadder";
import { useCoachActions } from "@/hooks/useCoachActions";
import { logger } from "@/lib/logger";
import { toISODate } from "@/lib/date-utils";
import { isOfflineFailure } from "@/lib/networkFailure";
import { AI_COACH_CLIENT_HEADERS } from "@/lib/aiCoachClient";
import { AI_COACH_DISCLAIMER, CRISIS_HELP_LINE, detectRedFlags } from "@/lib/aiSafety";
import { buildCoachContext, coachAllergenLines, composeModelTurn, redactKidNames } from "@/lib/coachContext";
import type { CoachContext } from "@/lib/coachContext";
import type { LadderRowLike } from "@/lib/ladderOverview";
import type { CoachAction } from "@/lib/coachReply";
import { ChatComposer, type ChatComposerHandle } from "@/components/aiCoach/ChatComposer";
import { ConversationList, type CoachConversation, type ConversationListStatus } from "@/components/aiCoach/ConversationList";
import { DaySeparator, MessageBubble, TypingIndicator, type CoachMessage } from "@/components/aiCoach/MessageBubble";
import { localDayKey } from "@/components/aiCoach/coachThreadFormat";
import { CoachKidHeader } from "@/components/aiCoach/CoachKidHeader";
import { ReplySafetyNotice } from "@/components/aiCoach/ReplySafetyNotice";
import { CoachActionChips } from "@/components/aiCoach/CoachActionChips";
import { EscalationCard } from "@/components/aiCoach/EscalationCard";
import type { Json } from "@/integrations/supabase/types";
import "@/i18n/appLocale";

/** Turns of earlier conversation sent with each question. */
export const COACH_HISTORY_TURNS = 20;
const TITLE_MAX = 50;
const DEFAULT_TITLE = "New Conversation";
/** Auto-scroll only when the reader is already this close to the bottom. */
const STICK_TO_BOTTOM_PX = 80;

type SendFailure = "offline" | "busy" | "limit" | "generic";

class CoachSendError extends Error {
  constructor(public readonly kind: SendFailure) {
    super(kind);
    this.name = "CoachSendError";
  }
}

interface ConversationRow {
  id: string;
  conversation_title: string | null;
  kid_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_archived: boolean | null;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string | null;
}

interface CoachInvokeResult {
  message?: string;
  model?: string;
  usage?: { totalTokens?: number };
  error?: string;
  code?: string;
}

function toConversation(row: ConversationRow): CoachConversation {
  const now = new Date().toISOString();
  return {
    id: row.id,
    conversation_title: row.conversation_title || DEFAULT_TITLE,
    kid_id: row.kid_id ?? null,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? row.created_at ?? now,
    is_archived: row.is_archived ?? false,
  };
}

function toMessage(row: MessageRow): CoachMessage {
  const role = row.role === "user" || row.role === "assistant" ? row.role : "system";
  return { id: row.id, role, content: row.content, created_at: row.created_at ?? new Date().toISOString() };
}

function titleFrom(text: string): string {
  return text.slice(0, TITLE_MAX);
}

/**
 * What went wrong, in terms the parent can act on. The raw error never reaches
 * the screen: it can carry provider names, stack details or the server's
 * `details` field.
 */
async function classifySendError(error: unknown): Promise<SendFailure> {
  if (error instanceof CoachSendError) return error.kind;
  if (isOfflineFailure(error)) return "offline";
  if (typeof error === "object" && error !== null) {
    const e = error as { name?: string; context?: unknown };
    if (e.name === "FunctionsFetchError") return isOfflineFailure(e.context) ? "offline" : "generic";
    if (e.name === "FunctionsHttpError") {
      const ctx = e.context as { status?: number; clone?: () => { json: () => Promise<unknown> } } | undefined;
      const status = typeof ctx?.status === "number" ? ctx.status : 0;
      if (status === 429) return "busy";
      if (status === 402 || status === 403) return "limit";
      try {
        const body = ctx?.clone ? await ctx.clone().json() : null;
        const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
        if (code === "ai_coach_limit") return "limit";
        // The server could not check the plan and failed closed (503). Not a
        // used-up quota: say so, and let the user try again shortly.
        if (code === "ai_coach_limit_unavailable") return "busy";
      } catch {
        // Body was not JSON; fall through.
      }
    }
  }
  return "generic";
}

function toLadderRowLike(row: {
  id: string;
  kidId: string;
  foodId: string;
  status: string;
  currentRung: string;
  consecutiveSuccesses: number;
  consecutiveHolds: number;
  nextDueOn: string | null;
}): LadderRowLike {
  return {
    id: row.id,
    kid_id: row.kidId,
    food_id: row.foodId,
    status: row.status,
    current_rung: row.currentRung,
    consecutive_successes: row.consecutiveSuccesses,
    consecutive_holds: row.consecutiveHolds,
    next_due_on: row.nextDueOn,
  };
}

export interface AIMealCoachProps {
  /** The daily quota is used up: sending is off, past advice stays readable. */
  exhausted?: boolean;
  onLimitReached?: () => void;
}

export function AIMealCoach({ exhausted = false, onLimitReached }: AIMealCoachProps) {
  const { t, i18n } = useTranslation();
  const { activeKidId, kids } = useKids();
  const { userId } = useAuth();
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [listStatus, setListStatus] = useState<ConversationListStatus>("loading");
  const [listReload, setListReload] = useState(0);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadReload, setLoadReload] = useState(0);
  const [sending, setSending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Refs read after an await, where state from the render that started the
  // send may be stale.
  const activeConversationRef = useRef<string | null>(null);
  /** Bumped on every thread switch; a send only writes UI while it matches. */
  const threadTokenRef = useRef(0);
  const messagesRef = useRef<CoachMessage[]>([]);
  messagesRef.current = messages;
  const conversationsRef = useRef<CoachConversation[]>([]);
  conversationsRef.current = conversations;
  const sendingRef = useRef(false);
  const creatingRef = useRef(false);
  /** A conversation whose messages this component already holds; skip its load. */
  const skipLoadRef = useRef<string | null>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const activeConv = conversations.find((c) => c.id === activeConversation) ?? null;
  const pinnedKidId = activeConv?.kid_id ?? activeKidId ?? null;
  const threadKid = kids.find((k) => k.id === pinnedKidId);
  const kidMissing = Boolean(activeConv?.kid_id) && !threadKid;
  const aboutOtherKid = Boolean(threadKid && activeKidId && threadKid.id !== activeKidId);

  const ladder = useFoodLadder(threadKid?.id);
  const today = toISODate(new Date());
  const { ctx } = useMemo((): { ctx: CoachContext | null; refMap: Map<string, string> } => {
    if (!threadKid) return { ctx: null, refMap: new Map() };
    return buildCoachContext({
      kid: threadKid,
      foods,
      planEntries,
      ladderRows: ladder.rows.map(toLadderRowLike),
      today,
    });
  }, [threadKid, foods, planEntries, ladder.rows, today]);

  // A thread whose kid was deleted gets no chips: there is no one to check them against.
  const coachActions = useCoachActions({
    kid: threadKid ?? null,
    foods,
    planEntries,
    ladderRows: ladder.rows,
    addFoodToLadder: ladder.addFoodToLadder,
  });
  const { actionsFor, run: runAction, pending: actionsPending, done: actionsDone } = coachActions;
  const handleRunAction = useCallback((a: CoachAction) => void runAction(a), [runAction]);

  const kidNames = useMemo(() => Object.fromEntries(kids.map((k) => [k.id, k.name])), [kids]);

  const resetToDraft = useCallback(() => {
    threadTokenRef.current += 1;
    activeConversationRef.current = null;
    skipLoadRef.current = null;
    nearBottomRef.current = true;
    setActiveConversation(null);
    setMessages([]);
    setLoading(false);
    setLoadError(false);
    setPendingId(null);
    setSheetOpen(false);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setSheetOpen(false);
    if (id === activeConversationRef.current) return;
    threadTokenRef.current += 1;
    activeConversationRef.current = id;
    skipLoadRef.current = null;
    nearBottomRef.current = true;
    setMessages([]);
    setLoading(true);
    setLoadError(false);
    setPendingId(null);
    setActiveConversation(id);
  }, []);

  // Conversation list. Reloads when the signed-in user changes, and resets the
  // thread so one account never sees another's open conversation.
  const listUserRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (listUserRef.current !== userId) {
      listUserRef.current = userId;
      resetToDraft();
      setConversations([]);
    }
    if (!userId) {
      setListStatus("ready");
      return;
    }
    let ignore = false;
    setListStatus("loading");
    (async () => {
      const { data, error } = await supabase
        .from("ai_coach_conversations")
        .select("id, conversation_title, kid_id, updated_at, created_at, is_archived")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (ignore) return;
      if (error) {
        logger.error("Error loading conversations:", error);
        setListStatus("error");
        return;
      }
      setConversations((data ?? []).map((row) => toConversation(row as ConversationRow)));
      setListStatus("ready");
    })();
    return () => {
      ignore = true;
    };
    // listReload is the Retry button.
  }, [userId, listReload, resetToDraft]);

  // Messages for the selected thread.
  useEffect(() => {
    if (!activeConversation) return;
    if (skipLoadRef.current === activeConversation) {
      skipLoadRef.current = null;
      return;
    }
    let ignore = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      const { data, error } = await supabase
        .from("ai_coach_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeConversation)
        .order("created_at", { ascending: true });
      if (ignore) return;
      if (error) {
        logger.error("Error loading messages:", error);
        setLoadError(true);
        setLoading(false);
        return;
      }
      setMessages((data ?? []).map((row) => toMessage(row as MessageRow)));
      setLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [activeConversation, loadReload]);

  // Follow new messages only when the reader is already at the bottom, so
  // scrolling up to reread advice is not yanked away by a reply.
  const viewport = useCallback(
    () => scrollRootRef.current?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]") ?? null,
    []
  );
  useEffect(() => {
    const el = viewport();
    if (!el) return;
    const onScroll = () => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [viewport]);
  useLayoutEffect(() => {
    const el = viewport();
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingId, viewport]);

  const sendMessage = useCallback(
    async (raw: string, retryOf?: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current || creatingRef.current) return;
      if (exhausted) return;
      sendingRef.current = true;

      const token = threadTokenRef.current;
      let convId = activeConversationRef.current;
      const isCurrent = () => threadTokenRef.current === token;
      const startedAsDraft = convId === null;
      const kidAtSend = threadKid;
      const ctxAtSend = ctx;
      const history = messagesRef.current.filter(
        (m) => (m.role === "user" || m.role === "assistant") && !m.status && !m.id.startsWith("temp-")
      );

      const tempId = `temp-${Date.now()}`;
      const tempMessage: CoachMessage = { id: tempId, role: "user", content: text, created_at: new Date().toISOString() };
      nearBottomRef.current = true;
      setSending(true);
      setPendingId(tempId);
      setMessages((prev) => [...prev.filter((m) => m.id !== retryOf), tempMessage]);

      let createdConvId: string | null = null;
      let savedUserId: string | null = null;
      try {
        if (!convId) {
          if (!userId) throw new CoachSendError("generic");
          creatingRef.current = true;
          const { data: conv, error: convError } = await supabase
            .from("ai_coach_conversations")
            .insert([{ user_id: userId, kid_id: kidAtSend?.id ?? null, conversation_title: titleFrom(text) }])
            .select("id, conversation_title, kid_id, updated_at, created_at, is_archived")
            .single();
          if (convError || !conv) throw convError ?? new CoachSendError("generic");
          convId = conv.id;
          createdConvId = conv.id;
          const created = toConversation(conv as ConversationRow);
          setConversations((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        }

        const { data: savedUser, error: userError } = await supabase
          .from("ai_coach_messages")
          .insert([{ conversation_id: convId, role: "user", content: text }])
          .select("id, role, content, created_at")
          .single();
        if (userError || !savedUser) throw userError ?? new CoachSendError("generic");
        savedUserId = savedUser.id;
        composerRef.current?.clearIfUnchanged(text);

        // What leaves the device: no names, at most the last 20 turns, and the
        // family data only on the final turn.
        const outbound = [
          ...history.slice(-COACH_HISTORY_TURNS).map((m) => ({
            role: m.role,
            content: redactKidNames(m.content, kids),
          })),
          { role: "user" as const, content: composeModelTurn(redactKidNames(text, kids), ctxAtSend) },
        ];
        const kidContext = ctxAtSend
          ? {
              age: ctxAtSend.ageMonths != null && ctxAtSend.ageMonths >= 36 ? Math.floor(ctxAtSend.ageMonths / 12) : null,
              allergens: coachAllergenLines(ctxAtSend),
              safeFoodsCount: ctxAtSend.safeFoods.length,
              tryBiteFoodsCount: ctxAtSend.ladder.length,
            }
          : null;

        const startTime = Date.now();
        // The client header opts this call into the server-side daily limit
        // (402 ai_coach_limit when today's questions are used up).
        const { data: invokeData, error: aiError } = await supabase.functions.invoke("ai-coach-chat", {
          body: { messages: outbound, kidContext, maxTokens: 2000 },
          headers: { ...AI_COACH_CLIENT_HEADERS },
        });
        const result = (invokeData ?? null) as CoachInvokeResult | null;
        logger.debug("[AI Coach] reply", { status: aiError ? "error" : "ok", model: result?.model ?? null });

        if (aiError) throw aiError;
        if (result?.code === "ai_coach_limit") throw new CoachSendError("limit");
        if (!result || result.error || !result.message) throw new CoachSendError("generic");

        const { data: savedAI, error: aiInsertError } = await supabase
          .from("ai_coach_messages")
          .insert([
            {
              conversation_id: convId,
              role: "assistant",
              content: result.message,
              context_snapshot: (ctxAtSend ? { v: 1, sent: ctxAtSend } : { v: 1, sent: null }) as unknown as Json,
              model_used: result.model ?? null,
              tokens_used: result.usage?.totalTokens ?? 0,
              response_time_ms: Date.now() - startTime,
            },
          ])
          .select("id, role, content, created_at")
          .single();
        if (aiInsertError || !savedAI) throw aiInsertError ?? new CoachSendError("generic");

        // Always touch the conversation so updated_at moves (the trigger sets
        // it) and the thread rises to the top. Title and kid only when needed.
        const existing = conversationsRef.current.find((c) => c.id === convId);
        const patch: { updated_at: string; conversation_title?: string; kid_id?: string } = {
          updated_at: new Date().toISOString(),
        };
        if (!existing || existing.conversation_title === DEFAULT_TITLE) patch.conversation_title = titleFrom(text);
        if (existing && !existing.kid_id && kidAtSend) patch.kid_id = kidAtSend.id;
        const { error: convUpdateError } = await supabase
          .from("ai_coach_conversations")
          .update(patch)
          .eq("id", convId);
        if (convUpdateError) logger.error("Error updating conversation:", convUpdateError);
        const finalConvId = convId;
        setConversations((prev) => {
          const row = prev.find((c) => c.id === finalConvId);
          if (!row) return prev;
          return [{ ...row, ...patch }, ...prev.filter((c) => c.id !== finalConvId)];
        });

        // The rows are saved either way; if the parent moved to another thread,
        // this one shows them on its next load.
        if (!isCurrent()) return;
        const userMessage = toMessage(savedUser as MessageRow);
        const aiMessage = toMessage(savedAI as MessageRow);
        setMessages((prev) => [...prev.map((m) => (m.id === tempId ? userMessage : m)), aiMessage]);
        if (startedAsDraft) {
          skipLoadRef.current = finalConvId;
          activeConversationRef.current = finalConvId;
          setActiveConversation(finalConvId);
        }
        composerRef.current?.focus();
      } catch (error: unknown) {
        logger.error("Error sending coach message:", error);
        // No orphan rows: the question is only kept if it got an answer.
        if (savedUserId) {
          const { error: delError } = await supabase.from("ai_coach_messages").delete().eq("id", savedUserId);
          if (delError) logger.error("Error removing unanswered message:", delError);
        }
        if (createdConvId) {
          const { error: delConvError } = await supabase.from("ai_coach_conversations").delete().eq("id", createdConvId);
          if (delConvError) logger.error("Error removing empty conversation:", delConvError);
          const orphan = createdConvId;
          setConversations((prev) => prev.filter((c) => c.id !== orphan));
        }
        const kind = await classifySendError(error);
        if (kind === "limit") onLimitReached?.();
        if (isCurrent()) {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
          composerRef.current?.restoreIfEmpty(text);
        }
        const copy: Record<SendFailure, string> = {
          offline: t("aiCoach.errors.offline", { defaultValue: "You're offline. Your question is saved; send it when you're back." }),
          busy: t("aiCoach.errors.busy", { defaultValue: "The coach is busy right now. Try again in a minute." }),
          limit: t("aiCoach.errors.limit", { defaultValue: "You've used today's coach questions. Past answers are still here." }),
          generic: t("aiCoach.errors.generic", { defaultValue: "The coach couldn't answer that. Try again." }),
        };
        toast.error(copy[kind]);
      } finally {
        sendingRef.current = false;
        creatingRef.current = false;
        setSending(false);
        setPendingId((current) => (current === tempId ? null : current));
      }
    },
    [exhausted, threadKid, ctx, userId, kids, onLimitReached, t]
  );

  const handleComposerSend = useCallback((text: string) => void sendMessage(text), [sendMessage]);
  const handleRetry = useCallback((m: CoachMessage) => void sendMessage(m.content, m.id), [sendMessage]);

  const archiveConversation = useCallback(
    async (conv: CoachConversation) => {
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (activeConversationRef.current === conv.id) resetToDraft();
      const { error } = await supabase.from("ai_coach_conversations").update({ is_archived: true }).eq("id", conv.id);
      if (error) {
        logger.error("Error archiving conversation:", error);
        setConversations((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
        toast.error(t("aiCoach.list.archiveFailed", { defaultValue: "Couldn't delete that conversation." }));
        return;
      }
      // Archived first so Undo can bring it back; once the toast goes away
      // without Undo, the rows are really deleted (messages cascade), because
      // "deleted" is what the parent was told about a conversation about their child.
      let undone = false;
      let finalized = false;
      const finalize = () => {
        if (undone || finalized) return;
        finalized = true;
        void supabase
          .from("ai_coach_conversations")
          .delete()
          .eq("id", conv.id)
          .then(({ error: delError }) => {
            if (delError) logger.error("Error deleting archived conversation:", delError);
          });
      };
      toast(t("aiCoach.list.archived", { defaultValue: "Conversation deleted" }), {
        onAutoClose: finalize,
        onDismiss: finalize,
        action: {
          label: t("aiCoach.list.undo", { defaultValue: "Undo" }),
          onClick: async () => {
            if (finalized) return;
            undone = true;
            const { error: undoError } = await supabase
              .from("ai_coach_conversations")
              .update({ is_archived: false })
              .eq("id", conv.id);
            if (undoError) {
              logger.error("Error restoring conversation:", undoError);
              toast.error(t("aiCoach.list.restoreFailed", { defaultValue: "Couldn't restore that conversation." }));
              return;
            }
            setConversations((prev) =>
              [conv, ...prev.filter((c) => c.id !== conv.id)].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
            );
          },
        },
      });
    },
    [resetToDraft, t]
  );

  // Slots around each bubble. Stable per thread so memoised bubbles do not
  // re-render on every keystroke elsewhere.
  const renderAbove = useCallback(
    (m: CoachMessage) => {
      if (m.role === "user") {
        const flags = detectRedFlags(m.content);
        return flags.length > 0 ? <EscalationCard flags={flags} /> : null;
      }
      if (m.role === "assistant") return <ReplySafetyNotice text={m.content} kid={threadKid ?? null} />;
      return null;
    },
    [threadKid]
  );
  const renderBelow = useCallback(
    (m: CoachMessage) =>
      m.role === "assistant" && !m.status ? (
        <CoachActionChips
          actions={kidMissing ? [] : actionsFor(m.content)}
          onRun={handleRunAction}
          pending={actionsPending}
          done={actionsDone}
          disabled={kidMissing || !threadKid}
        />
      ) : null,
    [threadKid, kidMissing, actionsFor, handleRunAction, actionsPending, actionsDone]
  );

  // Starter questions from this kid's own data, then two fixed ones.
  const starters = useMemo(() => {
    const out: string[] = [];
    const next = ctx?.ladder.find((l) => l.status === "stalled" || l.status === "close");
    if (next) out.push(t("aiCoach.starters.nextFor", { defaultValue: "What next for {{food}}?", food: next.name }));
    const safe = ctx?.safeFoods[0];
    if (safe) out.push(t("aiCoach.starters.ideasLike", { defaultValue: "Ideas like {{food}}", food: safe.name }));
    out.push(t("aiCoach.starters.beige", { defaultValue: "Only eats beige food" }));
    out.push(t("aiCoach.starters.vegetables", { defaultValue: "Refuses vegetables" }));
    return out;
  }, [ctx, t]);

  const composerBlocked = loading || loadError || exhausted;
  const composerNotice = exhausted
    ? t("aiCoach.limit.reached", { defaultValue: "You've used today's coach questions. Your past conversations are still here." })
    : null;

  const list = (
    <ConversationList
      conversations={conversations}
      status={listStatus}
      activeId={activeConversation}
      kidNames={kidNames}
      onSelect={selectConversation}
      onDelete={archiveConversation}
      onNew={resetToDraft}
      onRetry={() => setListReload((n) => n + 1)}
      className="h-full"
    />
  );

  let lastDay = "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 md:grid md:grid-cols-4">
      <Card className="hidden min-h-0 p-4 md:col-span-1 md:flex md:flex-col">{list}</Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="flex w-[85vw] max-w-sm flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("aiCoach.list.title", { defaultValue: "Conversations" })}</SheetTitle>
            <SheetDescription>{t("aiCoach.list.sheetDescription", { defaultValue: "Pick a past conversation or start a new one." })}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 pt-6">{list}</div>
        </SheetContent>
      </Sheet>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden md:col-span-3">
        <div className="flex items-start gap-2 border-b p-3 md:p-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 md:hidden"
            onClick={() => setSheetOpen(true)}
            aria-label={t("aiCoach.list.history", { defaultValue: "Conversation history" })}
          >
            <History className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <CoachKidHeader kid={threadKid ?? null} ctx={ctx} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 md:hidden"
            onClick={resetToDraft}
            aria-label={t("aiCoach.list.new", { defaultValue: "Start a new conversation" })}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {aboutOtherKid && threadKid && (
          <p className="border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
            {t("aiCoach.thread.aboutOtherKid", {
              defaultValue: "This conversation is about {{name}}. Start a new one to ask about someone else.",
              name: threadKid.name,
            })}
          </p>
        )}
        {kidMissing && (
          <p className="border-b bg-muted px-4 py-2 text-xs text-muted-foreground">
            {t("aiCoach.thread.kidRemoved", {
              defaultValue: "The child this conversation was about has been removed, so answers here are general.",
            })}
          </p>
        )}

        <ScrollArea ref={scrollRootRef} className="min-h-0 flex-1">
          <div className="p-4 md:p-6">
            {loadError ? (
              <div className="space-y-3 py-8 text-center" role="alert">
                <p className="text-destructive">
                  {t("aiCoach.thread.loadError", { defaultValue: "Couldn't load this conversation." })}
                </p>
                <Button variant="outline" size="sm" onClick={() => setLoadReload((n) => n + 1)}>
                  {t("aiCoach.list.retry", { defaultValue: "Try again" })}
                </Button>
              </div>
            ) : loading && messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground" role="status">
                {t("aiCoach.thread.loading", { defaultValue: "Loading conversation..." })}
              </div>
            ) : messages.length === 0 ? (
              <div className="mx-auto max-w-prose py-6 text-center">
                <h2 className="text-lg font-semibold">
                  {t("aiCoach.starters.title", { defaultValue: "What's happening at mealtimes?" })}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("aiCoach.starters.intro", {
                    defaultValue: "Tap a question or type your own. Answers use this child's foods, ladder and allergies.",
                  })}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {starters.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant="outline"
                      className="min-h-11 rounded-full"
                      disabled={sending || composerBlocked}
                      onClick={() => void sendMessage(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {!loadError && messages.length > 0 && (
              <div
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={t("aiCoach.thread.log", { defaultValue: "Conversation with the coach" })}
                className="space-y-4"
              >
                {messages.map((m) => {
                  const day = localDayKey(m.created_at);
                  const showDay = day !== lastDay;
                  lastDay = day;
                  return (
                    <div key={m.id} className="space-y-4">
                      {showDay && <DaySeparator iso={m.created_at} language={i18n.language} />}
                      <MessageBubble
                        message={m}
                        language={i18n.language}
                        renderAbove={renderAbove}
                        renderBelow={renderBelow}
                        onRetry={handleRetry}
                        retrying={sending}
                      />
                    </div>
                  );
                })}
                {sending && pendingId && messages.some((m) => m.id === pendingId) && <TypingIndicator />}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* US-629: say what the coach is and keep the crisis numbers on screen,
            whatever the thread state. */}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {AI_COACH_DISCLAIMER} <span className="text-foreground">{CRISIS_HELP_LINE}</span>
        </p>
        <ChatComposer
          ref={composerRef}
          draftKey={activeConversation ?? "draft"}
          onSend={handleComposerSend}
          sending={sending}
          disabled={composerBlocked}
          disabledNotice={composerNotice}
        />
      </Card>
    </div>
  );
}
