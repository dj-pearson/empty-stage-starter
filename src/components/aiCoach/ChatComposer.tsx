import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOnline } from "@/hooks/useCommon";
import { getStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export const COMPOSER_MAX_LENGTH = 2000;
const COUNTER_FROM = 1500;
/** About six lines of text-base before the textarea scrolls instead of growing. */
const MAX_HEIGHT_PX = 160;
export const DRAFT_PREFIX = "aiCoach.draft.";

export interface ChatComposerHandle {
  /** Clear the draft, but only if it still holds the text that was sent. */
  clearIfUnchanged: (sent: string) => void;
  /** Put a failed message back, unless the parent has typed something new since. */
  restoreIfEmpty: (text: string) => void;
  focus: () => void;
}

export interface ChatComposerProps {
  /** Conversation id, or "draft" before one exists. Drafts are saved per key. */
  draftKey: string;
  onSend: (text: string) => void;
  sending: boolean;
  /** Blocks sending (loading a thread, a load error, a used-up quota). */
  disabled?: boolean;
  /** Shown under the box when sending is blocked for a reason the parent should know. */
  disabledNotice?: string | null;
}

const ChatComposerInner = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  { draftKey, onSend, sending, disabled = false, disabledNotice = null },
  ref
) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const online = useOnline();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Load the saved draft for this conversation. A draft the parent is already
  // typing wins over a slow storage read.
  const prevKeyRef = useRef(draftKey);
  useEffect(() => {
    let ignore = false;
    // A new conversation is created from the draft on its first send; keep
    // whatever the parent typed while waiting instead of wiping it.
    const carryOver = prevKeyRef.current === "draft";
    prevKeyRef.current = draftKey;
    if (!carryOver) setDraft("");
    (async () => {
      try {
        const storage = await getStorage();
        const saved = await storage.getItem(DRAFT_PREFIX + draftKey);
        if (!ignore && saved && draftRef.current === "") setDraft(saved.slice(0, COMPOSER_MAX_LENGTH));
      } catch (error: unknown) {
        logger.debug("[AI Coach] draft read skipped", error);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [draftKey]);

  // Write-through, debounced so a fast typist is not a storage write per key.
  useEffect(() => {
    const handle = window.setTimeout(async () => {
      try {
        const storage = await getStorage();
        if (draft) await storage.setItem(DRAFT_PREFIX + draftKey, draft);
        else await storage.removeItem(DRAFT_PREFIX + draftKey);
      } catch (error: unknown) {
        logger.debug("[AI Coach] draft write skipped", error);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft, draftKey]);

  // Grow with the text up to about six lines.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  useImperativeHandle(
    ref,
    () => ({
      clearIfUnchanged: (sent: string) => {
        setDraft((current) => (current.trim() === sent.trim() ? "" : current));
      },
      restoreIfEmpty: (text: string) => {
        setDraft((current) => (current.trim() === "" ? text : current));
      },
      focus: () => textareaRef.current?.focus(),
    }),
    []
  );

  const blocked = disabled || !online;
  const canSend = !blocked && !sending && draft.trim().length > 0;

  const submit = useCallback(() => {
    const text = draftRef.current.trim();
    if (!text || blocked || sending) return;
    onSend(text);
  }, [blocked, sending, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // On a phone the return key is the only way to get a new line.
    if (isMobile) return;
    e.preventDefault();
    submit();
  };

  const notice = !online ? t("aiCoach.composer.offline", { defaultValue: "You're offline. Reconnect to send." }) : disabledNotice;

  return (
    <div className="sticky bottom-0 z-10 border-t bg-background px-3 pt-3 pb-[env(safe-area-inset-bottom)] md:px-4">
      <div className="flex items-end gap-2 pb-3">
        <Textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          maxLength={COMPOSER_MAX_LENGTH}
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("aiCoach.composer.placeholder", { defaultValue: "Ask about meals, picky eating, new foods..." })}
          aria-label={t("aiCoach.composer.label", { defaultValue: "Message the coach" })}
          className="min-h-11 max-h-40 flex-1 resize-none overflow-y-auto py-2.5"
        />
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={submit}
          disabled={!canSend}
          aria-label={t("aiCoach.composer.send", { defaultValue: "Send message" })}
        >
          {sending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      {(notice || draft.length > COUNTER_FROM || !isMobile) && (
        <div className="flex items-center justify-between gap-3 pb-2 text-xs text-muted-foreground">
          <span className={cn("flex items-center gap-1.5", !online && "text-foreground")} role={notice ? "status" : undefined}>
            {!online && <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
            {notice ??
              (!isMobile ? t("aiCoach.composer.hint", { defaultValue: "Enter to send, Shift+Enter for a new line" }) : null)}
          </span>
          {draft.length > COUNTER_FROM && (
            <span className="tabular-nums" aria-live="polite">
              {t("aiCoach.composer.counter", {
                defaultValue: "{{length}}/{{max}}",
                length: draft.length,
                max: COMPOSER_MAX_LENGTH,
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export const ChatComposer = memo(ChatComposerInner);
