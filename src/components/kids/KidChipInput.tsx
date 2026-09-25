import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { commitListDraft, suggestFoodNames } from "@/lib/kidIntakeForm";

export interface KidChipInputProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  values: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Names offered as the parent types (household foods, or a fixed list). */
  suggestions?: readonly string[];
  removeLabel: (item: string) => string;
  /** A warning shown on a chip, e.g. the allergen a food carries. */
  warningFor?: (item: string) => string | null;
  suggestionsLabel?: string;
}

/**
 * A list typed as chips. Enter or a comma adds what was typed; leaving the
 * field adds it too. While typing, matching suggestions are offered in a
 * listbox the arrow keys move through, and Enter picks the highlighted one.
 * The text being typed is kept apart from the list, so a comma never eats the
 * word before it.
 */
export function KidChipInput({
  id,
  label,
  hint,
  values,
  onChange,
  placeholder,
  suggestions,
  removeLabel,
  warningFor,
  suggestionsLabel,
}: KidChipInputProps) {
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const uid = useId();
  const hintId = `${id}-hint`;
  const listboxId = `${uid}-listbox`;

  const options = useMemo(
    () => (suggestions ? suggestFoodNames(suggestions, draft, values) : []),
    [suggestions, draft, values],
  );
  const expanded = focused && options.length > 0;

  const commit = (text: string) => {
    const next = commitListDraft(values, text);
    if (next.length !== values.length) onChange(next);
    setDraft("");
    setActive(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options.length > 0) {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length > 0) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      e.stopPropagation();
      setActive(-1);
      setFocused(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(active >= 0 && options[active] ? options[active] : draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="block">
        {label}
      </Label>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((item) => {
            const warning = warningFor?.(item) ?? null;
            return (
              <li key={item}>
                <span
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm",
                    warning ? "border-destructive text-destructive" : "border-input bg-secondary text-secondary-foreground",
                  )}
                >
                  {warning && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  <span>{item}</span>
                  {warning && <span className="text-xs">{warning}</span>}
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={removeLabel(item)}
                    onClick={() => onChange(values.filter((v) => v !== item))}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          autoComplete="off"
          role={suggestions ? "combobox" : undefined}
          aria-autocomplete={suggestions ? "list" : undefined}
          aria-expanded={suggestions ? expanded : undefined}
          aria-controls={suggestions ? listboxId : undefined}
          aria-activedescendant={expanded && active >= 0 ? `${listboxId}-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          className="min-h-11"
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const value = e.target.value;
            setActive(-1);
            if (value.includes(",")) {
              // Commit everything before the last comma; keep typing after it.
              const cut = value.lastIndexOf(",");
              const next = commitListDraft(values, value.slice(0, cut));
              if (next.length !== values.length) onChange(next);
              setDraft(value.slice(cut + 1).trimStart());
            } else {
              setDraft(value);
            }
          }}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) commit(draft);
          }}
        />
        {suggestions && (
          <div
            id={listboxId}
            role="listbox"
            aria-label={suggestionsLabel}
            hidden={!expanded}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {options.map((option, i) => (
              <div
                key={option}
                id={`${listboxId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                // mousedown, not click: the input's blur would commit the draft first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {option}
              </div>
            ))}
          </div>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
