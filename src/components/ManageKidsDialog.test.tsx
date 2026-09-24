import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import '@/i18n';
import type { Kid } from '@/types';
import type { KidSectionId } from '@/lib/kidIntakeForm';
import { ManageKidsDialog, type ManageKidsDialogRef } from './ManageKidsDialog';

/**
 * Item 30: one editor for a child profile. Each section saves only its own
 * changed fields through KidsContext.updateKid; adding a child walks Basics
 * then Allergies and saves through addKid.
 */

const mocks = vi.hoisted(() => ({
  kids: [] as Kid[],
  foods: [] as { id: string; name: string; allergens?: string[] }[],
  planEntries: [] as { kid_id: string }[],
  isMobile: false,
  addKid: vi.fn(),
  updateKid: vi.fn(),
  deleteKid: vi.fn(),
  upload: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({
    kids: mocks.kids,
    addKid: mocks.addKid,
    updateKid: mocks.updateKid,
    deleteKid: mocks.deleteKid,
  }),
  usePlan: () => ({ planEntries: mocks.planEntries }),
  useFoods: () => ({ foods: mocks.foods }),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/profile-pictures/${path}` } }),
        remove: vi.fn(async () => ({ data: [], error: null })),
      }),
    },
    from: () => {
      throw new Error('the editor must save through KidsContext');
    },
  },
}));

vi.mock('@/lib/storageCleanup', () => ({
  deleteStorageObject: vi.fn(async () => true),
  deleteReplacedStorageObject: vi.fn(async () => true),
}));

vi.mock('@/hooks/useSignedProfilePicture', () => ({
  useSignedProfilePicture: (src?: string) => src,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const alex: Kid = {
  id: 'kid-alex',
  name: 'Alex',
  date_of_birth: '2019-05-10',
  notes: 'Prefers crunchy food',
  allergens: ['peanuts'],
  favorite_foods: ['Apple'],
  disliked_foods: ['peas'],
};

let requested: { kidId: string; section?: KidSectionId; review?: boolean } | 'add' = 'add';

function Harness() {
  const ref = useRef<ManageKidsDialogRef>(null);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          requested === 'add' ? ref.current?.openForAdd() : ref.current?.openForEdit(requested.kidId, requested.section, { review: requested.review })
        }
      >
        open
      </button>
      <ManageKidsDialog ref={ref} />
    </>
  );
}

async function openSection(section: KidSectionId, title: string, kidId = 'kid-alex', review = false) {
  requested = { kidId, section, review };
  const user = userEvent.setup();
  const { rerender } = render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'open' }));
  const dialog = await screen.findByRole('dialog', { name: title });
  return { user, dialog, rerender };
}

async function openAdd() {
  requested = 'add';
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'open' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add child' });
  return { user, dialog };
}

async function save(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name = 'Save changes') {
  await user.click(within(dialog).getByRole('button', { name }));
}

/** The patch for one save. A section edit is not a review, so it never stamps the review date. */
async function savedPatch(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledTimes(1));
  const [id, patch] = mocks.updateKid.mock.calls[0] as [string, Record<string, unknown>];
  expect(id).toBe('kid-alex');
  expect(patch).not.toHaveProperty('profile_last_reviewed');
  return patch;
}

beforeEach(() => {
  mocks.kids = [alex];
  mocks.foods = [
    { id: 'f1', name: 'Mac and cheese', allergens: ['milk'] },
    { id: 'f2', name: 'Macaroni' },
    { id: 'f3', name: 'Rice' },
  ];
  mocks.planEntries = [];
  mocks.isMobile = false;
  mocks.addKid.mockReset().mockResolvedValue(true);
  mocks.updateKid.mockReset().mockResolvedValue(true);
  mocks.deleteKid.mockReset().mockResolvedValue(true);
  mocks.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe('child profile editor: sections', () => {
  it('Basics saves only what changed', async () => {
    const { user, dialog } = await openSection('basics', 'Basics');
    const name = within(dialog).getByLabelText("Child's name");
    await user.clear(name);
    await user.type(name, 'Alexa');
    fireEvent.change(within(dialog).getByLabelText('Date of birth'), { target: { value: '2019-05-11' } });
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ name: 'Alexa', date_of_birth: '2019-05-11' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Basics will not save an empty name', async () => {
    const { user, dialog } = await openSection('basics', 'Basics');
    await user.clear(within(dialog).getByLabelText("Child's name"));
    await save(user, dialog);
    expect(within(dialog).getByText('Please enter a name')).toBeInTheDocument();
    expect(mocks.updateKid).not.toHaveBeenCalled();
  });

  it('Basics keeps a delete, which asks first', async () => {
    const { user, dialog } = await openSection('basics', 'Basics');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete profile' }));
    await waitFor(() => expect(mocks.deleteKid).toHaveBeenCalledWith('kid-alex'));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('Allergies: unticking the last allergen asks first, then sends allergens: []', async () => {
    const { user, dialog } = await openSection('allergies', 'Allergies');
    await user.click(within(dialog).getByRole('button', { name: 'peanuts', pressed: true }));
    await save(user, dialog);

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      "Remove peanuts from Alex's allergies? Meals with peanuts will start appearing in plans.",
    );
    expect(mocks.updateKid).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Remove and save' }));
    expect(await savedPatch()).toEqual({ allergens: [] });
  });

  it('Allergies: severity and cross-contact save without resending the list', async () => {
    const { user, dialog } = await openSection('allergies', 'Allergies');
    const peanuts = within(dialog).getByRole('group', { name: 'peanuts' });
    await user.click(within(peanuts).getByRole('radio', { name: 'Severe' }));
    await user.click(within(dialog).getByRole('checkbox', { name: /cross-contact/ }));
    await save(user, dialog);
    expect(await savedPatch()).toEqual({
      allergen_severity: { peanuts: 'severe' },
      cross_contamination_sensitive: true,
    });
  });

  it('Allergies: "Has allergies" with nothing ticked asks for one', async () => {
    mocks.kids = [{ ...alex, allergens: undefined }];
    const { user, dialog } = await openSection('allergies', 'Allergies');
    await user.click(within(dialog).getByRole('radio', { name: 'Has allergies' }));
    await save(user, dialog);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Pick at least one allergen, or choose No known allergies.',
    );
    expect(mocks.updateKid).not.toHaveBeenCalled();
  });

  it('Allergies: "Not sure yet" never erases a recorded answer', async () => {
    const { user, dialog } = await openSection('allergies', 'Allergies');
    await user.click(within(dialog).getByRole('radio', { name: 'Not sure yet' }));
    expect(within(dialog).getByText(/leaves the saved answer as it is/)).toBeInTheDocument();
    await save(user, dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.updateKid).not.toHaveBeenCalled();
  });

  it('Safe foods: autocomplete from household foods, comma adds a chip', async () => {
    const { user, dialog } = await openSection('safeFoods', 'Safe foods');
    const input = within(dialog).getByRole('combobox', { name: 'Foods Alex likes and accepts' });
    await user.type(input, 'Mac');
    const listbox = within(dialog).getByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['Mac and cheese', 'Macaroni']);
    await user.keyboard('{ArrowDown}{Enter}');
    await user.type(input, 'Toast,');
    expect(within(dialog).getByRole('button', { name: 'Remove Mac and cheese' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove Toast' })).toBeInTheDocument();
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ favorite_foods: ['Apple', 'Mac and cheese', 'Toast'] });
  });

  it('Safe foods: flags a food the child is allergic to, typed or quick-added', async () => {
    mocks.kids = [{ ...alex, allergens: ['milk', 'eggs'] }];
    const { user, dialog } = await openSection('safeFoods', 'Safe foods');
    expect(within(dialog).getByRole('button', { name: /Pancakes/ })).toBeDisabled();
    await user.type(within(dialog).getByRole('combobox'), 'Mac and cheese{Enter}');
    const chip = within(dialog).getByRole('button', { name: 'Remove Mac and cheese' }).parentElement;
    expect(chip).toHaveTextContent('Mac and cheeseContains milk');
  });

  it('Always eats: Enter adds a chip and the list saves', async () => {
    const { user, dialog } = await openSection('alwaysEats', 'Always eats');
    await user.type(within(dialog).getByRole('combobox'), 'toast{Enter}');
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ always_eats_foods: ['toast'] });
  });

  it('Dislikes: removing the last chip sends []', async () => {
    const { user, dialog } = await openSection('dislikes', 'Dislikes');
    await user.click(within(dialog).getByRole('button', { name: 'Remove peas' }));
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ disliked_foods: [] });
  });

  it('Textures and sensory: saves the level and preparations', async () => {
    const { user, dialog } = await openSection('textures', 'Textures and sensory');
    await user.click(within(dialog).getByRole('radio', { name: /Mild, dislikes/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Slimy' }));
    await user.type(within(dialog).getByRole('combobox', { name: 'How Alex likes food prepared' }), 'Roasted{Enter}');
    await save(user, dialog);
    expect(await savedPatch()).toEqual({
      texture_sensitivity_level: 'mild',
      texture_dislikes: ['Slimy'],
      preferred_preparations: ['Roasted'],
    });
  });

  it('Eating behavior: saves the answer and the pickiness it implies', async () => {
    const { user, dialog } = await openSection('behavior', 'Eating behavior');
    await user.click(within(dialog).getByRole('radio', { name: /Very limited/ }));
    expect(within(dialog).getByTestId('pickiness-level')).toHaveTextContent('Extremely picky');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Only eats specific brands' }));
    await save(user, dialog);
    expect(await savedPatch()).toEqual({
      eating_behavior: 'very_limited',
      behavioral_notes: 'Only eats specific brands',
      pickiness_level: 'extremely_picky',
    });
  });

  it('Goals: saves ticked goals and concerns', async () => {
    const { user, dialog } = await openSection('goals', 'Goals');
    await user.click(within(dialog).getByRole('checkbox', { name: 'More protein' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Iron deficiency' }));
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ health_goals: ['More protein'], nutrition_concerns: ['Iron deficiency'] });
  });

  it('Notes: clearing sends notes: null and nothing else', async () => {
    const { user, dialog } = await openSection('notes', 'Notes');
    await user.clear(within(dialog).getByLabelText('Notes (optional)'));
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ notes: null });
  });

  it('Allergies: an allergen added on another device while open is not erased', async () => {
    const { user, dialog, rerender } = await openSection('allergies', 'Allergies');
    await user.click(within(dialog).getByRole('button', { name: 'milk', pressed: false }));
    // Another caregiver adds sesame; realtime updates the kids list.
    mocks.kids = [{ ...alex, allergens: ['peanuts', 'sesame'] }];
    rerender(<Harness />);
    await save(user, dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('changed on another device');
    expect(mocks.updateKid).not.toHaveBeenCalled();
    // The form now shows the latest list; saving again keeps sesame.
    await user.click(within(dialog).getByRole('button', { name: 'milk', pressed: false }));
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ allergens: ['peanuts', 'sesame', 'milk'] });
  });

  it('a review opened from the Insights nudge records the review with no changes', async () => {
    const { user, dialog } = await openSection('basics', 'Basics', 'kid-alex', true);
    await save(user, dialog, 'Still current');
    await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledTimes(1));
    const [id, patch] = mocks.updateKid.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('kid-alex');
    expect(Object.keys(patch)).toEqual(['profile_last_reviewed']);
  });

  it('marks the profile complete when a save fills the last gap', async () => {
    mocks.kids = [{ ...alex, allergens: [], always_eats_foods: ['a', 'b', 'c'], health_goals: ['More protein'] }];
    const { user, dialog } = await openSection('dislikes', 'Dislikes');
    await user.click(within(dialog).getByRole('button', { name: 'Remove peas' }));
    await user.type(within(dialog).getByRole('combobox'), 'onions{Enter}');
    await save(user, dialog);
    expect(await savedPatch()).toEqual({ disliked_foods: ['onions'], profile_completed: true });
  });

  it('keeps the section open with its answers when the save fails', async () => {
    mocks.updateKid.mockResolvedValue(false);
    const { user, dialog } = await openSection('notes', 'Notes');
    await user.type(within(dialog).getByLabelText('Notes (optional)'), ' and dips');
    await save(user, dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't save.");
    expect(within(dialog).getByLabelText('Notes (optional)')).toHaveValue('Prefers crunchy food and dips');
  });

  it('asks before throwing away unsaved changes', async () => {
    const { user, dialog } = await openSection('notes', 'Notes');
    await user.type(within(dialog).getByLabelText('Notes (optional)'), '!');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.updateKid).not.toHaveBeenCalled();
  });

  it('opens as a bottom sheet on a phone', async () => {
    mocks.isMobile = true;
    requested = { kidId: 'kid-alex', section: 'notes' };
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByTestId('kid-editor-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('kid-editor-sheet')).not.toBeInTheDocument();
  });
});

describe('child profile editor: adding a child', () => {
  it('walks Basics then Allergies and adds through addKid', async () => {
    const { user, dialog } = await openAdd();
    expect(within(dialog).getByText('Step 1 of 2: Basics')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Child's name"), 'Leo');
    await user.click(within(dialog).getByRole('button', { name: /Next: Allergies/ }));
    expect(within(dialog).getByText('Step 2 of 2: Allergies')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Has allergies' }));
    await user.click(within(dialog).getByRole('button', { name: 'sesame', pressed: false }));
    await user.click(within(dialog).getByRole('button', { name: 'Add child' }));
    await waitFor(() =>
      expect(mocks.addKid).toHaveBeenCalledWith({ name: 'Leo', allergens: ['sesame'] }),
    );
    expect(mocks.updateKid).not.toHaveBeenCalled();
  });

  it('records "Not sure yet" as allergens: null, not as no allergies', async () => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText("Child's name"), 'Leo');
    await user.click(within(dialog).getByRole('button', { name: /Next: Allergies/ }));
    expect(within(dialog).getByRole('radio', { name: 'Not sure yet' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Add child' }));
    await waitFor(() => expect(mocks.addKid).toHaveBeenCalledWith({ name: 'Leo', allergens: null }));
  });

  it('needs a name before moving on', async () => {
    const { user, dialog } = await openAdd();
    await user.click(within(dialog).getByRole('button', { name: /Next: Allergies/ }));
    expect(within(dialog).getByText('Please enter a name')).toBeInTheDocument();
    expect(within(dialog).getByText('Step 1 of 2: Basics')).toBeInTheDocument();
  });
});
