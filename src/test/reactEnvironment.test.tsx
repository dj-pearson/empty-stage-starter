import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { existsSync, realpathSync } from 'fs';
import path from 'path';
import { useState } from 'react';

/**
 * US-813. The suite spent months at 272 failed / 2859 passed, and every one of
 * those failures was the same line:
 *
 *   TypeError: Cannot read properties of null (reading 'useState')
 *
 * Not a bug in any of the components. There were two React copies in the test
 * environment. node_modules held an npm tree with a Deno store layered under
 * it -- node_modules/.deno, 82 packages reached by symlink, left by a stray
 * `deno install` -- and @testing-library/react was one of the symlinked ones.
 * Vite resolves a symlinked package to its realpath, so the renderer loaded
 * .deno/react-dom@19.1.0 and set the hook dispatcher on the React beside it,
 * while every component under test read useState from node_modules/react.
 *
 * `npm ci` fixes it. resolve.dedupe, react/react-dom aliases and
 * server.deps.inline do not: the duplicate is loaded by Node from the realpath
 * before Vite is asked. CI never saw it, because CI installs from scratch.
 *
 * What made it expensive was not the fix, it was the four days of reading it
 * as 42 broken test files. So this file renders one useState and says what to
 * do when that stops working.
 */

function Counter() {
  const [n] = useState(41);
  return <p>answer {n + 1}</p>;
}

describe('the test environment has one React', () => {
  it('can render a component that calls useState', () => {
    try {
      render(<Counter />);
    } catch (error) {
      throw new Error(
        'Rendering a component with useState threw. This is almost always two ' +
          'React copies in node_modules rather than a fault in the component. ' +
          'Run `npm ci` -- a full reinstall, not `npm install` -- and try again. ' +
          `Original error: ${(error as Error).message}`
      );
    }
    expect(screen.getByText('answer 42')).toBeInTheDocument();
  });

  it('has no Deno package store layered under the npm tree', () => {
    // The specific thing that caused it, named so the next person does not
    // have to rediscover it from a null dispatcher. `deno install` and
    // `deno task` in this repo root both write node_modules/.deno; the edge
    // functions have their own deno.json and should be run from supabase/.
    expect(
      existsSync(path.resolve(process.cwd(), 'node_modules/.deno')),
      'node_modules/.deno exists: a deno install has layered a second copy of ' +
        'react, react-dom, vite and 79 other packages under the npm tree. Run `npm ci`.'
    ).toBe(false);
  });

  it('resolves the renderer from the same tree as the app', () => {
    // Vite resolves through symlinks, so a package that lives outside
    // node_modules/@testing-library resolves its own react-dom from wherever
    // it actually is. That is the mechanism, independent of Deno.
    // Compare realpath to realpath: a repo checked out under a symlinked path
    // would otherwise fail this for no reason.
    const scope = realpathSync(path.resolve(process.cwd(), 'node_modules/@testing-library'));
    expect(
      realpathSync(path.join(scope, 'react')),
      '@testing-library/react is a symlink out of the npm tree, so it will ' +
        'resolve its own react-dom and hand you a second React. Run `npm ci`.'
    ).toBe(path.join(scope, 'react'));
  });
});
