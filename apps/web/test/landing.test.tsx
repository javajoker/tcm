import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disclaimerVersionOf, DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import { relativeTime } from "../src/app/format.ts";
import { catalogs } from "../src/i18n/catalogs.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const savedAck = (env: ReturnType<typeof fakeEnvironment>, version: string): void => env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version, at: 1 } }));

describe("Landing (S01)", () => {
  it("explains the purpose, shows the three cards, the privacy line and a labelled sample panel", () => {
    go("/en/");
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Understand your body the way classical TCM does");
    for (const h of ["Constitution and pattern chart", "How it was worked out", "Formulas and lifestyle advice"]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    expect(screen.getByText(/stays on this device/)).toBeInTheDocument();
    expect(screen.getByText("For illustration only — not your result.")).toBeInTheDocument();
    expect(screen.getByText("Five Phases tendency (illustration)")).toBeInTheDocument();
  });

  it("start is disabled, with the reason shown, until the statement is acknowledged", async () => {
    go("/en/");
    renderApp();
    const start = screen.getByRole("button", { name: "Start assessment" });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription("Tick the statement below to start.");
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand this is educational/ }));
    expect(start).toBeEnabled();
    expect(screen.queryByText("Tick the statement below to start.")).toBeNull();
  });

  it("starting records the acknowledgement with the disclaimer version, creates the draft and goes to the profile", async () => {
    go("/en/");
    const { store } = renderApp();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Start assessment" }));
    expect(store.getState().prefs.disclaimerAck?.version).toBe(DISCLAIMER_VERSION);
    expect(store.getState().draft).not.toBeNull();
    expect(window.location.pathname).toBe("/en/start");
  });

  it("a current acknowledgement is remembered; changed wording (a different version) asks again", () => {
    go("/en/");
    const env = fakeEnvironment();
    savedAck(env, DISCLAIMER_VERSION);
    const first = renderApp(testStore(env).store);
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Start assessment" })).toBeEnabled();
    first.unmount();
    savedAck(env, "old-wording");
    renderApp(testStore(env).store);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Start assessment" })).toBeDisabled();
  });

  it("opens the full statement in a dialog, with the emphasis the policy gives it", async () => {
    go("/en/");
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Read in full" }));
    const dialog = screen.getByRole("dialog", { name: "Full statement" });
    expect(within(dialog).getByText(/for education and self-understanding only and is not a medical diagnosis or prescription\./).tagName).toBe("STRONG");
    expect(dialog).toHaveTextContent("call your local emergency number immediately");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("resume", () => {
    const withDraft = async (route: string): Promise<ReturnType<typeof fakeEnvironment>> => {
      const env = fakeEnvironment();
      const { store } = testStore(env, { now: () => Date.now() - 8 * 60_000 });
      store.getState().startDraft();
      store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 44 }, position: { route } }));
      await store.flush();
      return env;
    };

    it("shows where the unfinished assessment stopped and how long ago, only once the draft has been read", async () => {
      go("/en/");
      const env = await withDraft("/inquiry");
      renderApp(testStore(env).store);
      expect(await screen.findByRole("heading", { name: "Unfinished assessment" })).toBeInTheDocument();
      expect(screen.getByText("Inquiry · 8 minutes ago")).toBeInTheDocument();
    });

    it("shows no resume card without a draft", async () => {
      go("/en/");
      renderApp();
      await waitFor(() => expect(screen.getByRole("button", { name: "Start assessment" })).toBeInTheDocument());
      expect(screen.queryByRole("heading", { name: "Unfinished assessment" })).toBeNull();
    });

    it("Continue goes to the saved position", async () => {
      go("/zh-Hant/");
      const env = await withDraft("/observe");
      renderApp(testStore(env).store);
      expect(await screen.findByText(/望診與切診・8 分鐘前/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "繼續" }));
      expect(window.location.pathname).toBe("/zh-Hant/observe");
    });

    it("Discard asks first; cancelling keeps the draft, confirming deletes it everywhere", async () => {
      go("/en/");
      const env = await withDraft("/observe");
      const { store } = renderApp(testStore(env).store);
      await screen.findByRole("heading", { name: "Unfinished assessment" });
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      expect(store.getState().draft).not.toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
      await waitFor(() => expect(store.getState().draft).toBeNull());
      expect(screen.queryByRole("heading", { name: "Unfinished assessment" })).toBeNull();
      const again = testStore(env);
      await again.store.getState().init();
      expect(again.store.getState().draft).toBeNull();
    });

    it("starting a new assessment while one is unfinished asks before replacing it", async () => {
      go("/en/");
      const env = await withDraft("/screen");
      const { store } = renderApp(testStore(env).store);
      const old = (await waitFor(() => { const d = store.getState().draft; expect(d).not.toBeNull(); return d; }))!.id;
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByRole("button", { name: "Start assessment" }));
      const dialog = screen.getByRole("dialog", { name: "Start a new assessment?" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(store.getState().draft?.id).toBe(old);
      expect(window.location.pathname).toBe("/en/");
      await userEvent.click(screen.getByRole("button", { name: "Start assessment" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start a new assessment" }));
      expect(store.getState().draft?.id).not.toBe(old);
      expect(window.location.pathname).toBe("/en/start");
    });
  });

  it("erase everything is reachable from the landing page, asks once, then empties storage and reloads", async () => {
    go("/en/");
    const env = fakeEnvironment();
    const reload = vi.fn();
    const { store } = renderApp(testStore(env, { reload }).store);
    store.getState().setPrefs({ theme: "dark" });
    expect(env.localStorage.length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Erase everything on this device" }));
    const dialog = screen.getByRole("dialog", { name: "Erase everything on this device?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Erase everything" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(env.localStorage.length).toBe(0);
  });

  it.each([["/zh-Hant/"], ["/en/"]])("has no axe violations at %s", async (path) => {
    go(path);
    const { container } = renderApp();
    await screen.findByRole("heading", { level: 1 });
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

describe("the disclaimer text", () => {
  const doc = readFileSync(resolvePath(process.cwd(), "../../docs/safety-policy.md"), "utf8");
  const row = doc.split("\n").find((l) => l.startsWith("| **N-DISCLAIMER-FULL**"))!;
  const [, , , zh, en] = row.split("|").map((c) => c.trim());
  const fromDoc = (t: string | undefined): string => t!.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  it("is exactly the wording of docs/safety-policy.md, in both languages (no drift between policy and UI)", () => {
    expect((catalogs["zh-Hant"] as Record<string, unknown>)["safety.disclaimer.full"]).toBe(fromDoc(zh));
    expect((catalogs.en as Record<string, unknown>)["safety.disclaimer.full"]).toBe(fromDoc(en));
  });

  it("its version follows the wording", () => {
    expect(disclaimerVersionOf(["a", "b"])).toBe(disclaimerVersionOf(["a", "b"]));
    expect(disclaimerVersionOf(["a", "b"])).not.toBe(disclaimerVersionOf(["a", "c"]));
    expect(disclaimerVersionOf(["ab", ""])).not.toBe(disclaimerVersionOf(["a", "b"]));
    expect(DISCLAIMER_VERSION).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("relativeTime", () => {
  const now = 10_000_000_000;
  it("is coarse and localised", () => {
    expect(relativeTime("en", now - 8 * 60_000, now)).toBe("8 minutes ago");
    expect(relativeTime("en", now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(relativeTime("en", now - 2 * 86_400_000, now)).toBe("2 days ago");
    expect(relativeTime("zh-Hant", now - 8 * 60_000, now)).toBe("8 分鐘前");
  });
});
