// Wire @testing-library/jest-dom's matcher types into Vitest's `expect`
// (US-329 backlog reduction): the matchers are registered at runtime in
// src/test/setup.ts, but tsc didn't know their types, so every
// `.toBeInTheDocument()` / `.toHaveTextContent()` etc. in a *.test.tsx
// reported TS2339. This augmentation fixes all of them.
import '@testing-library/jest-dom/vitest';
