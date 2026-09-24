/**
 * The texture_dislikes entry that means "nothing may touch". Written by the
 * intake questionnaire's TEXTURE_OPTIONS; matched case-insensitively so a
 * hand-edited value still works.
 *
 * Its own module so a screen that only needs the constant (Meal Builder's
 * PlateSvg) does not pull platePlanner and the sibling solver into its chunk.
 */
export const NO_TOUCHING_DISLIKE = 'foods touching each other';
