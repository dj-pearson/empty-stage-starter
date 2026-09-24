import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { SETTINGS_SECTION_KEYS } from '@/lib/settingsSections';

let reducedMotion = false;
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotion,
}));

import { useSettingsSection } from './useSettingsSection';

function Harness() {
  const { section, focus, setSection } = useSettingsSection();
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <div>
      <output data-testid="loc">{`${location.pathname}${location.search}${location.hash}`}</output>
      <output data-testid="nav">{navigationType}</output>
      <output data-testid="section">{section ?? 'none'}</output>
      <output data-testid="focus">{focus ?? 'none'}</output>
      {SETTINGS_SECTION_KEYS.filter((k) => k === section).map((k) => (
        <section key={k} id={`settings-${k}`}>
          <h2>{k}</h2>
          <button id="export-data" type="button">
            export
          </button>
        </section>
      ))}
      <button type="button" onClick={() => setSection('data')}>
        go-data
      </button>
      <button type="button" onClick={() => setSection(null)}>
        go-index
      </button>
    </div>
  );
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/dashboard/settings" element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );
}

const loc = () => screen.getByTestId('loc').textContent;
const nav = () => screen.getByTestId('nav').textContent;

describe('useSettingsSection', () => {
  const scrollIntoView = vi.fn();
  const original = Element.prototype.scrollIntoView;

  beforeEach(() => {
    reducedMotion = false;
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
    document.documentElement.classList.remove('reduce-motion');
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it('selects a valid ?section=', () => {
    renderAt('/dashboard/settings?section=privacy');
    expect(screen.getByTestId('section').textContent).toBe('privacy');
  });

  it('drops an unknown ?section= with a replace', async () => {
    renderAt('/dashboard/settings?section=subscription');
    await waitFor(() => expect(loc()).toBe('/dashboard/settings'));
    expect(nav()).toBe('REPLACE');
    expect(screen.getByTestId('section').textContent).toBe('none');
  });

  it('accepts a legacy #hash on first load', async () => {
    renderAt('/dashboard/settings#accessibility');
    await waitFor(() => expect(loc()).toBe('/dashboard/settings?section=accessibility'));
    expect(nav()).toBe('REPLACE');
  });

  it('ignores a hash that is not a section', async () => {
    renderAt('/dashboard/settings#main-content');
    await new Promise((r) => setTimeout(r, 20));
    expect(loc()).toBe('/dashboard/settings#main-content');
    expect(screen.getByTestId('section').textContent).toBe('none');
  });

  it('pushes a history entry on setSection, and pops back to the index', async () => {
    renderAt('/dashboard/settings');
    fireEvent.click(screen.getByText('go-data'));
    await waitFor(() => expect(loc()).toBe('/dashboard/settings?section=data'));
    expect(nav()).toBe('PUSH');

    fireEvent.click(screen.getByText('go-index'));
    await waitFor(() => expect(loc()).toBe('/dashboard/settings'));
    // Went BACK rather than pushing the index on top of the section.
    expect(nav()).toBe('POP');
  });

  it('pushes the index when the section was deep-linked, since there is nothing to go back to', async () => {
    renderAt('/dashboard/settings?section=data');
    fireEvent.click(screen.getByText('go-index'));
    await waitFor(() => expect(loc()).toBe('/dashboard/settings'));
    expect(nav()).toBe('PUSH');
  });

  it('moves focus to the section h2', async () => {
    renderAt('/dashboard/settings?section=data');
    const heading = screen.getByRole('heading', { level: 2 });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it("scrolls with behavior 'auto' under reduced motion", async () => {
    reducedMotion = true;
    renderAt('/dashboard/settings?section=data');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it("scrolls with behavior 'smooth' otherwise", async () => {
    renderAt('/dashboard/settings?section=data');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('honors the in-app reduce-motion class too', async () => {
    document.documentElement.classList.add('reduce-motion');
    renderAt('/dashboard/settings?section=data');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('focuses a registered control from &focus= after landing', async () => {
    renderAt('/dashboard/settings?section=data&focus=export-data');
    expect(screen.getByTestId('focus').textContent).toBe('export-data');
    await waitFor(() => expect(document.activeElement?.id).toBe('export-data'));
  });

  it('drops a focus id the section does not register, and focuses nothing inside', async () => {
    renderAt('/dashboard/settings?section=profile&focus=export-data');
    await waitFor(() => expect(loc()).toBe('/dashboard/settings?section=profile'));
    expect(screen.getByTestId('focus').textContent).toBe('none');
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H2'));
  });
});
