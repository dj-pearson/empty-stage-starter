// Every Date in this file is built under a zone west of UTC, where
// new Date('2019-05-10') is May 9 local time. The DOB round trip must survive it.
process.env.TZ = 'America/Los_Angeles';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import '@/i18n';
import type { Kid } from '@/types';
import { ManageKidsDialog, type ManageKidsDialogRef } from './ManageKidsDialog';

const mocks = vi.hoisted(() => ({
  kids: [] as Kid[],
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
  usePlan: () => ({ planEntries: [] }),
}));

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
};

function Harness() {
  const ref = useRef<ManageKidsDialogRef>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.openForAdd()}>open add</button>
      <button type="button" onClick={() => ref.current?.openForEdit('kid-alex')}>open edit</button>
      <ManageKidsDialog ref={ref} />
    </>
  );
}

async function openEdit() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'open edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit child' });
  return { user, dialog };
}

async function openAdd() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'open add' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add child' });
  return { user, dialog };
}

beforeEach(() => {
  mocks.kids = [alex];
  mocks.addKid.mockReset().mockResolvedValue(true);
  mocks.updateKid.mockReset().mockResolvedValue(true);
  mocks.deleteKid.mockReset().mockResolvedValue(true);
  mocks.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe('ManageKidsDialog', () => {
  it('unchecking the last allergen sends allergens: [] after the removal is confirmed', async () => {
    const { user, dialog } = await openEdit();
    await user.click(within(dialog).getByRole('button', { name: 'peanuts', pressed: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      "Remove peanuts from Alex's allergies? Meals with peanuts will start appearing in plans.",
    );
    expect(mocks.updateKid).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole('button', { name: 'Remove and save' }));
    await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledTimes(1));
    expect(mocks.updateKid).toHaveBeenCalledWith('kid-alex', { allergens: [] });
  });

  it('marks a favorite that carries a child allergen through the shared matcher', async () => {
    mocks.kids = [{ ...alex, allergens: ['eggs'] }];
    const { dialog } = await openEdit();
    const pancakes = within(dialog).getByRole('button', { name: /Pancakes/ });
    expect(pancakes).toBeDisabled();
    expect(pancakes).toHaveTextContent('Contains eggs');
    expect(within(dialog).getByRole('button', { name: /Waffles/ })).not.toBeDisabled();
  });

  it('clearing the notes sends notes: null and nothing else', async () => {
    const { user, dialog } = await openEdit();
    await user.clear(within(dialog).getByLabelText('Notes (optional)'));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledWith('kid-alex', { notes: null }));
  });

  it('keeps the DOB on May 10 west of UTC and does not resend it unchanged', async () => {
    expect(new Date(2019, 4, 10).getTimezoneOffset()).toBeGreaterThan(0);
    const { user, dialog } = await openEdit();
    expect(within(dialog).getByTestId('kid-dob-value')).toHaveTextContent('May 10, 2019');

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledTimes(1));
    expect(mocks.updateKid.mock.calls[0][1]).not.toHaveProperty('date_of_birth');
  });

  it('adds with "Not sure yet" as allergens: null', async () => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText("Child's name"), '  Sam  ');
    await user.click(within(dialog).getByRole('radio', { name: 'Not sure yet' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add child' }));
    await waitFor(() => expect(mocks.addKid).toHaveBeenCalledTimes(1));
    expect(mocks.addKid).toHaveBeenCalledWith({ name: 'Sam', allergens: null });
  });

  it('adds with "No known allergies" as allergens: []', async () => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText("Child's name"), 'Sam');
    await user.click(within(dialog).getByRole('radio', { name: 'No known allergies' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add child' }));
    await waitFor(() => expect(mocks.addKid).toHaveBeenCalledWith({ name: 'Sam', allergens: [] }));
  });

  it('keeps the dialog open with the input when the save fails', async () => {
    mocks.updateKid.mockResolvedValue(false);
    const { user, dialog } = await openEdit();
    const name = within(dialog).getByLabelText("Child's name");
    await user.clear(name);
    await user.type(name, 'Alexandra');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledWith('kid-alex', { name: 'Alexandra' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't save");
    expect(screen.getByRole('dialog', { name: 'Edit child' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Child's name")).toHaveValue('Alexandra');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('Cancel in edit mode closes the dialog', async () => {
    const { user, dialog } = await openEdit();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.updateKid).not.toHaveBeenCalled();
  });

  it('keeps an allergen checked while a photo upload is in flight', async () => {
    let finishUpload: (value: { data: object; error: null }) => void = () => {};
    mocks.upload.mockReturnValue(new Promise((resolve) => { finishUpload = resolve; }));
    const { user, dialog } = await openEdit();

    const file = new File(['png'], 'face.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Profile picture'), file);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.upload.mock.calls[0][0]).toMatch(/^user-1\/.+\.png$/);
    expect(mocks.upload.mock.calls[0][2]).toEqual({ contentType: 'image/png', upsert: false });
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'milk', pressed: false }));
    finishUpload({ data: {}, error: null });

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save changes' })).not.toBeDisabled(),
    );
    expect(within(dialog).getByRole('button', { name: 'milk', pressed: true })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.updateKid).toHaveBeenCalledTimes(1));
    const patch = mocks.updateKid.mock.calls[0][1];
    expect(patch.allergens).toEqual(['peanuts', 'milk']);
    expect(patch.profile_picture_url).toMatch(/\/profile-pictures\/user-1\/.+\.png$/);
  });
});
