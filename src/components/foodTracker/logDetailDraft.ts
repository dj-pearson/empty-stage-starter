/** sessionStorage key for an unsent detail log, per (child, food). */
export function draftKey(kidId: string, foodId: string): string {
  return `eatpal.ladderLogDraft.${kidId}.${foodId}`;
}
