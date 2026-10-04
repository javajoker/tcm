import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { CitationChip, CitationsProvider } from "../src/app/citations.tsx";
import { KnowledgeProvider, type Loaded } from "../src/app/knowledge.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";

const dev: Loaded = { kb: indexKnowledgeBase(rawChunksFromDisk("dev")), engine };
const release: Loaded = { kb: indexKnowledgeBase(rawChunksFromDisk("release")), engine };
const cite = dev.kb.citation("shanghan-035")!;

function Tree({ children, loaded = dev, lang = "en" }: { children: ReactNode; loaded?: Loaded; lang?: "en" | "zh-Hant" }): ReactNode {
  return <I18nProvider lang={lang} setLang={() => undefined}><KnowledgeProvider load={() => Promise.resolve(loaded)}><CitationsProvider>{children}</CitationsProvider></KnowledgeProvider></I18nProvider>;
}

describe("Citation viewer (S15)", () => {
  it("a chip names the source and opens the sheet with the original text, its verification state and what it is used for", async () => {
    render(<Tree><CitationChip id="shanghan-035" usedFor="Mahuang Tang" /></Tree>);
    const opener = await screen.findByRole("button", { name: `Open source: 《${cite.book}》${cite.chapter}` });
    expect(opener).toHaveTextContent(`《${cite.book}》${cite.chapter}`);
    expect(opener).toHaveAttribute("lang", "zh-Hant");
    await userEvent.click(opener);
    const sheet = screen.getByRole("dialog", { name: `《${cite.book}》${cite.chapter}` });
    expect(within(sheet).getByText(cite.quote_zh_hant)).toHaveAttribute("lang", "zh-Hant");
    expect(within(sheet).getByText(cite.verified ? "✓ Matched in the source text" : "○ Not yet matched against the source text")).toBeInTheDocument();
    expect(within(sheet).getByText("No English rendering yet.")).toBeInTheDocument();
    expect(within(sheet).getByText("Used in your result for: Mahuang Tang")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Sources" })).toHaveAttribute("href", "/sources");
  });

  it("Close and the backdrop close it and focus returns to the chip", async () => {
    render(<Tree><CitationChip id="shanghan-035" /></Tree>);
    const opener = await screen.findByRole("button", { name: /Open source/ });
    await userEvent.click(opener);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("dialog"));                                              // the backdrop is the dialog itself
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("Esc (the browser's cancel) closes it too", async () => {
    render(<Tree><CitationChip id="shanghan-035" /></Tree>);
    const opener = await screen.findByRole("button", { name: /Open source/ });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(false);                                                   // a dismissable dialog lets the browser close it
    act(() => (dialog as HTMLDialogElement).close());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("shows where the text comes from (edition and licence) in both builds, and never an internal path", async () => {
    for (const loaded of [dev, release]) {
      const { unmount } = render(<Tree loaded={loaded}><CitationChip id="shanghan-035" /></Tree>);
      await userEvent.click(await screen.findByRole("button", { name: /Open source/ }));
      expect(screen.getByRole("heading", { name: "Source edition" })).toBeInTheDocument();
      expect(screen.getByText("TCM-Library (MIT)")).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("reference/sources");
      unmount();
    }
  });

  it("renders nothing for an unknown id or before the knowledge base is loaded", async () => {
    const { container } = render(<Tree><span data-testid="host"><CitationChip id="no-such-citation" /></span></Tree>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("button", { name: /Open source/ })).toBeNull();
    expect(container.querySelector("[data-testid=host] button")).toBeNull();
  });

  it("is in Traditional Chinese on the zh-Hant route and has no axe violations with the sheet open", async () => {
    const { container } = render(<Tree lang="zh-Hant"><CitationChip id="shanghan-035" /></Tree>);
    await userEvent.click(await screen.findByRole("button", { name: /查看出處/ }));
    expect(screen.getByText("原文")).toBeInTheDocument();
    expect(screen.getByText("尚無英文譯文。")).toBeInTheDocument();
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
