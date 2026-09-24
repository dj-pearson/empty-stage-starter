import type { TFunction } from 'i18next';
import '@/i18n/appLocale';

/**
 * The words the Household page shows for one member (US-840 package B).
 *
 * household_members.role is a DB value ('parent', 'guardian'), and a raw DB
 * string on screen reads as a bug. Both the header's initials and the roster
 * go through here so they name a person the same way.
 */

export interface LabelledMember {
  role: string;
  isSelf: boolean;
  profiles: { full_name: string | null } | null;
}

export type KnownRole = 'parent' | 'guardian' | 'other';

export function roleKey(role: string): KnownRole {
  return role === 'parent' || role === 'guardian' ? role : 'other';
}

/** "Co-parent", "Caregiver", or a neutral fallback for a role we don't know. */
export function roleLabel(role: string, t: TFunction): string {
  switch (roleKey(role)) {
    case 'parent':
      return t('household.members.role.parent');
    case 'guardian':
      return t('household.members.role.guardian');
    default:
      return t('household.members.role.other');
  }
}

/** Profile name, else "You" for the viewer, else the role standing in as a name. */
export function memberDisplayName(member: LabelledMember, t: TFunction): string {
  const name = member.profiles?.full_name?.trim();
  if (name) return name;
  if (member.isSelf) return t('household.members.you');
  switch (roleKey(member.role)) {
    case 'parent':
      return t('household.members.unnamed.parent');
    case 'guardian':
      return t('household.members.unnamed.guardian');
    default:
      return t('household.members.unnamed.other');
  }
}
