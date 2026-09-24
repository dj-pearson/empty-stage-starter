import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatRelative } from "./coachThreadFormat";
import "@/i18n/appLocale";

export type ConversationListStatus = "loading" | "error" | "ready";

export interface CoachConversation {
  id: string;
  conversation_title: string;
  kid_id: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface ConversationListProps {
  conversations: CoachConversation[];
  status: ConversationListStatus;
  activeId: string | null;
  /** Kid id -> display name, for the badge. Names never leave the device from here. */
  kidNames: Record<string, string>;
  onSelect: (id: string) => void;
  onDelete: (conversation: CoachConversation) => void;
  onNew: () => void;
  onRetry: () => void;
  className?: string;
}

function ConversationListInner({
  conversations,
  status,
  activeId,
  kidNames,
  onSelect,
  onDelete,
  onNew,
  onRetry,
  className,
}: ConversationListProps) {
  const { t, i18n } = useTranslation();
  const now = Date.now();

  return (
    <nav
      className={cn("flex min-h-0 flex-col", className)}
      aria-label={t("aiCoach.list.title", { defaultValue: "Conversations" })}
    >
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="text-base font-semibold">{t("aiCoach.list.title", { defaultValue: "Conversations" })}</h2>
        <Button
          size="icon"
          variant="outline"
          className="h-10 w-10 md:h-8 md:w-8"
          onClick={onNew}
          aria-label={t("aiCoach.list.new", { defaultValue: "Start a new conversation" })}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "loading" ? (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="space-y-2 rounded-lg border p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <div role="alert" className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">
              {t("aiCoach.list.loadError", { defaultValue: "Couldn't load your conversations." })}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("aiCoach.list.retry", { defaultValue: "Try again" })}
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("aiCoach.list.empty", { defaultValue: "No conversations yet. Ask your first question." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {conversations.map((conv) => {
              const active = conv.id === activeId;
              const kidName = conv.kid_id ? kidNames[conv.kid_id] : undefined;
              return (
                <li
                  key={conv.id}
                  className={cn(
                    "flex items-start gap-1 rounded-lg border transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    aria-current={active ? "true" : undefined}
                    className="min-h-11 min-w-0 flex-1 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="line-clamp-2 text-sm font-medium">{conv.conversation_title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {kidName && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs font-normal">
                          {kidName}
                        </Badge>
                      )}
                      <time dateTime={conv.updated_at}>{formatRelative(conv.updated_at, i18n.language, now)}</time>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="m-1 h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive md:h-8 md:w-8"
                    aria-label={t("aiCoach.list.deleteNamed", {
                      defaultValue: "Delete conversation {{title}}",
                      title: conv.conversation_title,
                    })}
                    onClick={() => onDelete(conv)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}

export const ConversationList = memo(ConversationListInner);
