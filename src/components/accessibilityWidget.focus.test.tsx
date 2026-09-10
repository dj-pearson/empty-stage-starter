/**
 * US-839, WCAG 2.1.2 No Keyboard Trap.
 *
 * The VPAT recorded this as "Partially Supports -- the custom
 * accessibility-settings panel currently supports Escape-to-close but does not
 * yet fully trap/restore focus; remediation in progress." The remediation had
 * shipped and nobody had written the test, so the document went on describing
 * a defect that was gone. This file is what lets that row be corrected.
 *
 * "Trap" here means the WCAG-correct kind: focus cycles inside the dialog while
 * it is open and there is always a way out (Escape, the close button, the
 * backdrop), each of which returns focus to the control that opened it. A trap
 * with no exit is the failure; a trap with an exit is the requirement.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccessibilityWidget } from './AccessibilityWidget';
import { AccessibilityProvider } from '@/contexts/AccessibilityContext';

function renderWidget() {
  return render(
    <MemoryRouter>
      <AccessibilityProvider>
        <button>Outside before</button>
        <AccessibilityWidget />
        <button>Outside after</button>
      </AccessibilityProvider>
    </MemoryRouter>
  );
}

const panel = () => document.getElementById('accessibility-widget-panel');

function panelControls(): HTMLElement[] {
  return Array.from(
    panel()!.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  );
}

describe('US-839: the accessibility panel traps focus and gives it back', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('moves focus into the panel when it opens', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText('Open accessibility settings'));

    expect(panel()).not.toBeNull();
    expect(panel()!.contains(document.activeElement)).toBe(true);
  });

  it('has controls to cycle through, so the cycle assertions mean something', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText('Open accessibility settings'));
    expect(panelControls().length).toBeGreaterThanOrEqual(5);
  });

  it('Tab from the last control wraps to the first instead of escaping', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText('Open accessibility settings'));

    const controls = panelControls();
    controls[controls.length - 1].focus();
    await user.tab();

    expect(document.activeElement).toBe(controls[0]);
    expect(panel()!.contains(document.activeElement)).toBe(true);
  });

  it('Shift+Tab from the first control wraps to the last', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText('Open accessibility settings'));

    const controls = panelControls();
    controls[0].focus();
    await user.tab({ shift: true });

    expect(document.activeElement).toBe(controls[controls.length - 1]);
  });

  it('tabbing all the way round never leaves the panel', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText('Open accessibility settings'));

    const controls = panelControls();
    controls[0].focus();
    for (let i = 0; i < controls.length + 2; i += 1) {
      await user.tab();
      expect(
        panel()!.contains(document.activeElement),
        `focus left the panel after ${i + 1} tabs`
      ).toBe(true);
    }
  });

  it('Escape closes the panel and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    renderWidget();
    const trigger = screen.getByLabelText('Open accessibility settings');
    await user.click(trigger);

    panelControls()[2].focus();
    await user.keyboard('{Escape}');

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Open accessibility settings'));
  });

  it('a backdrop click also hands focus back, rather than dropping it on the body', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByLabelText('Open accessibility settings'));

    const backdrop = document.querySelector<HTMLElement>('div[aria-hidden="true"].fixed.inset-0');
    expect(backdrop, 'no backdrop to click').not.toBeNull();
    await user.click(backdrop!);

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Open accessibility settings'));
  });
});
