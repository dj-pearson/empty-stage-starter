import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import "@/i18n";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  deleteStorageObject: vi.fn(async (_url: string) => true),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/profile-pictures/${path}` } }),
      }),
    },
  },
}));
vi.mock("@/lib/storageCleanup", () => ({
  deleteStorageObject: mocks.deleteStorageObject,
  deleteReplacedStorageObject: vi.fn(async () => true),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useKidPhotoUpload } from "./useKidPhotoUpload";

function pick(file: File): ChangeEvent<HTMLInputElement> {
  return { target: { files: [file], value: "x" } } as unknown as ChangeEvent<HTMLInputElement>;
}

describe("useKidPhotoUpload", () => {
  it("removes an upload that finishes after the editor closed without saving", async () => {
    let finish: (v: { data: object; error: null }) => void = () => {};
    mocks.upload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useKidPhotoUpload(onUploaded));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.handleFile(pick(new File(["x"], "a.png", { type: "image/png" })));
    });
    act(() => result.current.discardUploads());
    await act(async () => {
      finish({ data: {}, error: null });
      await pending;
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(mocks.deleteStorageObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteStorageObject.mock.calls[0][0]).toMatch(/^https:\/\/example\.test\/profile-pictures\/user-1\/.+\.png$/);
  });
});
