/**
 * Food Tracker kid switching, in the page body.
 *
 * The shell's KidSelector is a dropdown in the header: fine on a desktop, two
 * taps and a hunt on a phone. With two or more children the tracker shows them
 * as chips right above the ladder, so switching is one tap. With one child
 * there is nothing to switch between and nothing renders.
 *
 * KidPickerGrid is the family-mode fallback: larger tiles, one per child,
 * when there is no ladder to summarise.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { KidAvatarImage } from '@/components/KidAvatarImage';
import { useKids } from '@/contexts/AppContext';
import { formatKidAge, type CareCardT } from '@/lib/careCard';
import { cn } from '@/lib/utils';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

/** formatKidAge takes a narrower t than react-i18next's overloads. */
function useAgeT(): CareCardT {
  const { t } = useTranslation();
  return useCallback<CareCardT>((key, options) => String(t(key, options)), [t]);
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function KidAvatar({ kid, className }: { kid: Kid; className?: string }) {
  return (
    <Avatar className={cn('h-7 w-7', className)} aria-hidden="true">
      {kid.profile_picture_url ? <KidAvatarImage src={kid.profile_picture_url} alt="" /> : null}
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {initial(kid.name)}
      </AvatarFallback>
    </Avatar>
  );
}

const chipClass =
  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function KidChips({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { kids, activeKidId, setActiveKid } = useKids();
  const ageT = useAgeT();

  if (kids.length < 2) return null;

  const familyPressed = activeKidId === null || !kids.some((k) => k.id === activeKidId);

  return (
    <div
      role="group"
      aria-label={t('foodTracker.chooseChild', { defaultValue: 'Choose a child' })}
      className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0', className)}
    >
      {kids.map((kid) => {
        const pressed = kid.id === activeKidId;
        const age = formatKidAge(kid, ageT);
        return (
          <button
            key={kid.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => setActiveKid(kid.id)}
            className={cn(
              chipClass,
              pressed
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted'
            )}
          >
            <KidAvatar kid={kid} />
            <span className="max-w-[10rem] truncate">{kid.name}</span>
            {age ? (
              <span className={cn('text-xs', pressed ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {age}
              </span>
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={familyPressed}
        onClick={() => setActiveKid(null)}
        className={cn(
          chipClass,
          familyPressed
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:bg-muted'
        )}
      >
        <Users className="h-4 w-4" aria-hidden="true" />
        <span>{t('foodTracker.familyHeading', { defaultValue: 'Family' })}</span>
      </button>
    </div>
  );
}

export function KidPickerGrid({ kids, body }: { kids: readonly Kid[]; body: string }) {
  const { t } = useTranslation();
  const { setActiveKid } = useKids();
  const ageT = useAgeT();

  return (
    <section aria-labelledby="food-tracker-pick-title" className="space-y-4">
      <div>
        <h2 id="food-tracker-pick-title" className="text-lg font-semibold">
          {t('foodTracker.gate.pickTitle', { defaultValue: 'Whose foods?' })}
        </h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kids.map((kid) => {
          const age = formatKidAge(kid, ageT);
          return (
            <li key={kid.id}>
              <button
                type="button"
                onClick={() => setActiveKid(kid.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left text-card-foreground motion-safe:transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <KidAvatar kid={kid} className="h-10 w-10" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{kid.name}</span>
                  {age ? <span className="block text-sm text-muted-foreground">{age}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
