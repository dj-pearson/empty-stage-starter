# `impeccable detect src` — what is real and what is not

`npx impeccable detect src` reports **64** anti-patterns as of 2026-09-18. Most
of them are not defects, and the point of this file is that nobody has to
re-derive that. A number with no triage beside it gets ignored, and then the
real findings inside it get ignored too.

Re-run the count with `npx impeccable detect src` and the breakdown with
`npx impeccable detect src | grep -oE '\[[a-z-]+\]' | sort | uniq -c | sort -rn`.

## Known false positives (49 of the 64)

**35 × `border-accent-on-rounded`** — every one is the Tailwind spinner:

```tsx
<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
```

The rule reads "thick accent border on a rounded card". There is no card: the
border IS the spinner, and `rounded-full` is what makes it a circle. Changing
either breaks the spinner. This is the single biggest contributor to the count
and it will not go down.

**5 × `broken-image`** — all in `src/test/security/`. They are XSS attack
strings (`<img onerror=alert(1)>`) inside test fixtures asserting that the app
escapes them. They are the opposite of shipped markup.

**5 × `bounce-easing`** — `animate-bounce-dynamic` in `VisibleFoodOrbit` and
`RichTextEditor`. The rule matches the name. The keyframes
(`src/index.css:469`) are `translateY/rotate/scale` on a 4s `ease-in-out` loop:
a slow float, not elastic easing, and `@media (prefers-reduced-motion: reduce)`
turns it off entirely.

**4 × `side-tab`** — three are `prose-blockquote:border-l-4` (`BlogPost.tsx`,
`RichTextEditor.tsx`) and one is the same rule inside the HTML
`RecipeExportActions` generates for printing. A rule down the left of a
blockquote is centuries-old typographic convention. The tell the rule is after
is a coloured tab on a *card*, which is a different thing in the same CSS.

## Real, and deliberately open (15)

**8 × `ai-color-palette`, 7 × `overused-font`** — the body font. `src/index.css`
sets Inter, which the house style calls out as a non-choice. Swapping the
typeface of a shipped app is a design decision for the owner, not a lint fix, so
it is recorded here rather than quietly changed. The `Arial` hits inside emailed
and exported HTML stay regardless: a web font would not load there.

## History

US-814 took this from 82 to 67 by fixing what was real — the FoodCard's 4px
coloured left stripe (which also encoded category in colour alone), gradient
text on three headings, two purple gradients, a loading skeleton that did not
match the card it stood in for, and two form progress bars that animated
`width` instead of `transform`. Categorical colour was left alone on purpose:
the purple in `ProgressDashboard` and `WeeklyProgressReport` is one of four stat
colours, not decoration.

It is 64 now rather than 67 because later work removed three more incidentally.
