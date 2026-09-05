import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { HelmetProvider } from "react-helmet-async";

/**
 * Onboarding as a route (US-770).
 *
 * The old dialog fired from Auth.tsx and nowhere else, and required a child's
 * name at step one -- so a couple planning for themselves could not finish
 * setup without inventing a child. These cover the three branches, the skip,
 * and that completing writes the same profiles column iOS US-708 writes.
 */

const navigate = vi.fn();
const addKid = vi.fn().mockResolvedValue(true);
const trackEvent = vi.fn();
const profileUpdate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ addKid }) }));

vi.mock("@/lib/analytics", () => ({
  analytics: { trackEvent: (...a: unknown[]) => trackEvent(...a) },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn().mockReturnValue({
      update: (payload: unknown) => {
        profileUpdate(payload);
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      },
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

async function renderOnboarding() {
  const Onboarding = (await import("./Onboarding")).default;
  return render(
    <HelmetProvider>
      <Onboarding />
    </HelmetProvider>
  );
}

describe("Onboarding route", () => {
  it("asks who you are planning for before anything else", async () => {
    await renderOnboarding();
    expect(screen.getByText(/who are you planning for/i)).toBeInTheDocument();
    expect(screen.getByText("Just me")).toBeInTheDocument();
    expect(screen.getByText("Me and a partner")).toBeInTheDocument();
    expect(screen.getByText("My family")).toBeInTheDocument();
  });

  it.each([
    ["Just me", "just_me"],
    ["Me and a partner", "me_and_partner"],
  ])("finishes %s without ever asking for a child", async (label, id) => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByText(label));

    // The whole point of the branch. The old dialog blocked at step 1 on a
    // required child name, so these two households could not complete setup.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(addKid).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/child's first name/i)).not.toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith(
      "onboarding_planning_for_selected",
      expect.objectContaining({ planning_for: id })
    );
  });

  it("asks for a child only on the family branch, and creates them", async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByText("My family"));
    const field = await screen.findByLabelText(/child's first name/i);
    await user.type(field, "Sam");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(addKid).toHaveBeenCalledWith(expect.objectContaining({ name: "Sam" })));
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("will not continue past the family branch with an empty name", async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByText("My family"));
    await screen.findByLabelText(/child's first name/i);

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(addKid).not.toHaveBeenCalled();
  });

  it("lets you back out of the family branch", async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByText("My family"));
    await screen.findByLabelText(/child's first name/i);
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText(/who are you planning for/i)).toBeInTheDocument();
  });

  it("treats skip as an answer and does not ask again", async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    // "Not now" is an answer. Re-asking on every visit is how a setup flow
    // becomes something people learn to dismiss without reading.
    await waitFor(() => expect(profileUpdate).toHaveBeenCalledWith({ onboarding_completed: true }));
    expect(addKid).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("onboarding_skipped", expect.any(Object));
  });

  it("writes the same profiles column iOS writes, and caches it locally", async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByText("Just me"));

    // profiles.onboarding_completed is what US-708 sets on the phone. If web
    // recorded completion anywhere else, a parent who set up on their phone
    // would be asked to set up again on their laptop.
    await waitFor(() => expect(profileUpdate).toHaveBeenCalledWith({ onboarding_completed: true }));
    const { ONBOARDING_LOCAL_KEY } = await import("@/lib/onboardingStatus");
    expect(localStorage.getItem(ONBOARDING_LOCAL_KEY)).toBe("true");
  });
});
