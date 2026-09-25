import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/passwordRules";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

/**
 * The password policy as a checklist (settings pass B), driven by
 * PasswordSchema's own checks through passwordRules.ts. Used by the Change
 * Password form and the bind-email flow; point aria-describedby at its id.
 */
interface PasswordRequirementsProps {
  value: string;
  id?: string;
  className?: string;
}

export function PasswordRequirements({ value, id, className }: PasswordRequirementsProps) {
  const { t } = useTranslation();

  const items = useMemo(
    () =>
      PASSWORD_RULES.map((rule, index) => {
        let label: string;
        switch (rule.id) {
          case "length":
            label = t("auth.bind.rules.length", {
              defaultValue: "At least {{min}} characters",
              min: rule.min,
            });
            break;
          case "upper":
            label = t("auth.bind.rules.upper", { defaultValue: "An uppercase letter" });
            break;
          case "lower":
            label = t("auth.bind.rules.lower", { defaultValue: "A lowercase letter" });
            break;
          case "number":
            label = t("auth.bind.rules.number", { defaultValue: "A number" });
            break;
          case "special":
            label = t("auth.bind.rules.special", { defaultValue: "A symbol, like ! or #" });
            break;
          default:
            label = rule.fallback;
        }
        return { key: `${rule.id}-${index}`, label, met: rule.test(value) };
      }),
    [t, value]
  );

  return (
    <ul id={id} className={cn("space-y-1 text-xs", className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(
            "flex items-center gap-2",
            item.met ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {item.met ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>
            {item.label}
            <span className="sr-only">
              {" "}
              {item.met
                ? t("auth.bind.rules.met", { defaultValue: "(done)" })
                : t("auth.bind.rules.unmet", { defaultValue: "(not yet)" })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
