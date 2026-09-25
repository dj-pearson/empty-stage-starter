import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFoods, useGrocery, usePlan, useRecipes } from '@/contexts/AppContext';
import { addIsoDays } from '@/lib/date-utils';
import { buildResultIndex } from '@/lib/kidFit';
import { ingredientMatchKey } from '@/lib/groceryMerge';
import { buildOnListKeySet, pantryToGroceryInput } from '@/lib/pantryGrocery';
import {
  buildFoodById,
  computeGroupBalance,
  computeKidRepeats,
  kidWindowEntries,
  rankEasyAdds,
  type BalanceGroup,
  type EasyAdd,
  type GroupBalanceRow,
} from '@/lib/insights';
import type { Food, Kid } from '@/types';
import { RepeatList } from './RepeatList';
import '@/i18n/appLocale';

/**
 * "Where is variety thin" for one child: per food group, how many different
 * foods were eaten or tasted out of those offered in the last 4 weeks, a few
 * easy adds for the thinnest groups, and what has been on repeat. Counts are
 * distinct foods from logged results only; there are no percentages and no
 * red badges, because a toddler who tasted two vegetables is not failing.
 */
export interface VarietySectionProps {
  kid: Kid;
  todayIso: string;
}

function groupLabel(t: TFunction, group: BalanceGroup): string {
  switch (group) {
    case 'protein':
      return t('insightsVariety.groups.protein', { defaultValue: 'Protein' });
    case 'carb':
      return t('insightsVariety.groups.carb', { defaultValue: 'Grains and starches' });
    case 'dairy':
      return t('insightsVariety.groups.dairy', { defaultValue: 'Dairy' });
    case 'fruit':
      return t('insightsVariety.groups.fruit', { defaultValue: 'Fruit' });
    case 'vegetable':
      return t('insightsVariety.groups.vegetable', { defaultValue: 'Vegetables' });
  }
}

function BalanceRow({ row, t }: { row: GroupBalanceRow; t: TFunction }) {
  const label = groupLabel(t, row.group);
  const detail =
    row.offered === 0
      ? t('insightsVariety.balance.notOffered', { defaultValue: 'Not offered in 4 weeks' })
      : t('insightsVariety.balance.counts', {
          accepted: row.accepted,
          offered: row.offered,
          defaultValue: '{{accepted}} eaten or tasted of {{offered}} offered',
        });
  const fill = row.offered > 0 ? Math.min(1, row.accepted / row.offered) : 0;
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </div>
    </li>
  );
}

function availabilityTag(t: TFunction, add: EasyAdd): string | null {
  if (add.availability === 'pantry') return t('insightsVariety.easyAdd.inPantry', { defaultValue: 'In pantry' });
  if (add.availability === 'onList') return t('insightsVariety.easyAdd.onList', { defaultValue: 'On the list' });
  return null;
}

function VarietySectionImpl({ kid, todayIso }: VarietySectionProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { planEntries } = usePlan();
  const { recipes } = useRecipes();
  const { groceryItems, addGroceryItem, deleteGroceryItem } = useGrocery();

  const foodById = useMemo(() => buildFoodById(foods), [foods]);
  const windowed = useMemo(
    () => kidWindowEntries({ kid, planEntries, todayIso }),
    [kid, planEntries, todayIso],
  );
  const resultIndex = useMemo(
    () => buildResultIndex(windowed, kid.id, addIsoDays(todayIso, 1)),
    [windowed, kid.id, todayIso],
  );
  const onListKeys = useMemo(() => buildOnListKeySet(groceryItems), [groceryItems]);

  const balance = useMemo(
    () => computeGroupBalance({ kid, foods, planEntries: windowed, todayIso, foodById }),
    [kid, foods, windowed, todayIso, foodById],
  );
  const easyAdds = useMemo(
    () =>
      balance.thinGroups.slice(0, 2).map((group) => ({
        group,
        adds: rankEasyAdds({ kid, group, foods, resultIndex, onListKeys }),
      })),
    [balance.thinGroups, kid, foods, resultIndex, onListKeys],
  );
  const repeats = useMemo(
    () => computeKidRepeats({ kid, planEntries: windowed, recipes, foods, todayIso }),
    [kid, windowed, recipes, foods, todayIso],
  );

  // The undo needs the list as it is after the add lands, not as it was when
  // the toast was created.
  const groceryRef = useRef(groceryItems);
  useEffect(() => {
    groceryRef.current = groceryItems;
  }, [groceryItems]);

  const handleAddToList = useCallback(
    (food: Food) => {
      const input = pantryToGroceryInput(food, null);
      const before = new Set(groceryRef.current.map((i) => i.id));
      addGroceryItem({
        name: input.name,
        quantity: input.quantity,
        unit: input.unit ?? '',
        category: food.category,
        aisle: input.aisle ?? undefined,
        added_via: input.added_via,
      });
      const key = ingredientMatchKey(input.name);
      toast.success(
        t('insightsVariety.easyAdd.added', { name: input.name, defaultValue: '{{name}} added to the grocery list' }),
        {
          action: {
            label: t('insightsVariety.easyAdd.undo', { defaultValue: 'Undo' }),
            onClick: () => {
              for (const item of groceryRef.current) {
                if (!before.has(item.id) && ingredientMatchKey(item.name) === key) deleteGroceryItem(item.id);
              }
            },
          },
        },
      );
    },
    [addGroceryItem, deleteGroceryItem, t],
  );

  const titleId = 'insights-variety-title';
  return (
    <section id="insights-variety" aria-labelledby={titleId} className="space-y-4">
      <div>
        <h2 id={titleId} className="text-lg font-semibold">
          {t('insightsVariety.balance.title', { defaultValue: 'Variety across food groups' })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('insightsVariety.balance.subtitle', {
            name: kid.name,
            defaultValue: 'Different foods {{name}} ate or tasted in the last 4 weeks, by food group.',
          })}
        </p>
      </div>

      {balance.loggedCount === 0 ? (
        <p className="text-sm">
          {t('insightsVariety.balance.empty', {
            name: kid.name,
            defaultValue: "Log how meals went for {{name}} and the food groups fill in here.",
          })}{' '}
          <Link to="/dashboard/planner" className="font-medium text-primary underline-offset-4 hover:underline">
            {t('insightsVariety.balance.emptyCta', { defaultValue: 'Open the planner' })}
          </Link>
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {balance.groups.map((row) => (
              <BalanceRow key={row.group} row={row} t={t} />
            ))}
          </ul>

          {easyAdds.length > 0 && (
            <div className="space-y-3 rounded-xl bg-muted/50 p-4">
              <h3 className="text-base font-semibold">
                {t('insightsVariety.easyAdd.title', { defaultValue: 'Room to grow' })}
              </h3>
              {easyAdds.map(({ group, adds }) => (
                <div key={group} className="space-y-2">
                  <p className="text-sm">
                    {t('insightsVariety.easyAdd.groupLine', {
                      group: groupLabel(t, group),
                      defaultValue: '{{group}}: nothing eaten or tasted in the last 2 weeks.',
                    })}
                  </p>
                  {adds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('insightsVariety.easyAdd.noneKnown', {
                        group: groupLabel(t, group),
                        defaultValue: 'No {{group}} in your foods yet.',
                      })}{' '}
                      <Link to="/dashboard/pantry" className="font-medium text-primary underline-offset-4 hover:underline">
                        {t('insightsVariety.easyAdd.addFoods', { defaultValue: 'Add some in the pantry' })}
                      </Link>
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {adds.map((add) => {
                        const tag = availabilityTag(t, add);
                        return (
                          <li
                            key={add.food.id}
                            className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-3 pr-1 text-sm"
                          >
                            <span>{add.food.name}</span>
                            {tag ? (
                              <Badge variant="outline" className="mr-1 font-normal text-muted-foreground">
                                {tag}
                              </Badge>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full px-2"
                                onClick={() => handleAddToList(add.food)}
                                aria-label={t('insightsVariety.easyAdd.addToListFor', {
                                  name: add.food.name,
                                  defaultValue: 'Add {{name}} to the grocery list',
                                })}
                              >
                                {t('insightsVariety.easyAdd.addToList', { defaultValue: 'Add to list' })}
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
              <Button asChild size="sm">
                <Link to="/dashboard/planner">
                  {t('insightsVariety.easyAdd.plan', { defaultValue: 'Plan one this week' })}
                </Link>
              </Button>
            </div>
          )}

          {balance.otherCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('insightsVariety.balance.otherFootnote', {
                count: balance.otherCount,
                defaultValue_one: '{{count}} logged food has no food group, so it is not counted above.',
                defaultValue: '{{count}} logged foods have no food group, so they are not counted above.',
              })}{' '}
              <Link to="/dashboard/pantry" className="font-medium text-primary underline-offset-4 hover:underline">
                {t('insightsVariety.balance.otherCta', { defaultValue: 'Set groups in the pantry' })}
              </Link>
            </p>
          )}
        </>
      )}

      <RepeatList repeats={repeats} kidName={kid.name} />
    </section>
  );
}

export const VarietySection = memo(VarietySectionImpl);
