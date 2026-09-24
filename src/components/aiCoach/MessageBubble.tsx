import { lazy, memo, Suspense } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Loader2, RotateCcw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { COACH_MARKDOWN_ELEMENTS, formatMessageDay, formatMessageTime } from "./coachThreadFormat";
import "@/i18n/appLocale";

// Only the coach's replies need markdown, and only once a thread has one, so
// the parser stays out of the page chunk.
const Markdown = lazy(() => import("react-markdown"));

export interface CoachMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  /** Client-only: a send that never got a reply. */
  status?: "failed";
}

export type MessageSlot = (message: CoachMessage) => ReactNode;

export interface MessageBubbleProps {
  message: CoachMessage;
  language: string;
  /** Rendered above the bubble (user: escalation card; assistant: safety notice). */
  renderAbove?: MessageSlot;
  /** Rendered under an assistant bubble (action chips). */
  renderBelow?: MessageSlot;
  onRetry?: (message: CoachMessage) => void;
  retrying?: boolean;
}

function MessageBubbleInner({ message, language, renderAbove, renderBelow, onRetry, retrying }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const failed = message.status === "failed";
  const above = renderAbove?.(message);
  const below = !isUser ? renderBelow?.(message) : null;

  return (
    <div className="space-y-2">
      {above}
      <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
        {!isUser && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
            <Bot className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className={cn("min-w-0 max-w-prose", isUser && "flex flex-col items-end")}>
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm",
              isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              failed && "opacity-70"
            )}
          >
            <span className="sr-only">
              {isUser ? t("aiCoach.thread.you", { defaultValue: "You" }) : t("aiCoach.thread.coach", { defaultValue: "Coach" })}:{" "}
            </span>
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <Suspense fallback={<p className="whitespace-pre-wrap break-words">{message.content}</p>}>
                <div className="coach-markdown space-y-2 break-words [&_h3]:font-semibold [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                  <Markdown allowedElements={COACH_MARKDOWN_ELEMENTS} unwrapDisallowed skipHtml>
                    {message.content}
                  </Markdown>
                </div>
              </Suspense>
            )}
            <p className={cn("mt-2 text-xs", isUser ? "text-primary-foreground/80" : "text-muted-foreground")}>
              <time dateTime={message.created_at}>{formatMessageTime(message.created_at, language)}</time>
            </p>
          </div>
          {failed && (
            <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
              <span>{t("aiCoach.thread.notSent", { defaultValue: "Not sent" })}</span>
              {onRetry && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 md:min-h-8"
                  disabled={retrying}
                  onClick={() => onRetry(message)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t("aiCoach.thread.retry", { defaultValue: "Retry" })}
                </Button>
              )}
            </div>
          )}
          {below}
        </div>
        {isUser && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden="true">
            <User className="h-5 w-5 text-secondary-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(
  MessageBubbleInner,
  (prev, next) =>
    prev.message === next.message &&
    prev.language === next.language &&
    prev.renderAbove === next.renderAbove &&
    prev.renderBelow === next.renderBelow &&
    prev.onRetry === next.onRetry &&
    prev.retrying === next.retrying
);

export function DaySeparator({ iso, language }: { iso: string; language: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{formatMessageDay(iso, language)}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

export function TypingIndicator() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  return (
    <div className="flex justify-start gap-3" role="status">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
        <Bot className="h-5 w-5 text-primary" />
      </div>
      <div className="rounded-2xl bg-muted px-4 py-3">
        <span className="sr-only">{t("aiCoach.thread.typing", { defaultValue: "The coach is writing a reply" })}</span>
        {reducedMotion ? (
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          </span>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
