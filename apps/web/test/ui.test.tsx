import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import Catalogue from "../src/dev/Catalogue.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { Button, Dialog, DialogActions, Field, Notice, Progress, SegmentedControl, TextInput, Tile, Tooltip } from "../src/ui/index.ts";

describe("Tile", () => {
  it("is a real radio/checkbox with a visible ✓ mark, and reports changes", async () => {
    const onChange = vi.fn();
    render(<Tile type="radio" name="q" value="a" checked={false} onChange={onChange} label="Often" description="Most days" />);
    const input = screen.getByRole("radio", { name: /Often/ });
    expect(screen.getByText("Most days")).toBeInTheDocument();
    await userEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it("a disabled tile cannot be selected", async () => {
    const onChange = vi.fn();
    render(<Tile type="checkbox" name="q" value="a" checked={false} onChange={onChange} label="Nope" disabled />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SegmentedControl", () => {
  function Harness(): React.ReactNode {
    const [v, setV] = useState<"a" | "b" | null>(null);
    return <SegmentedControl legend="Severity" value={v} onChange={setV} options={[{ value: "a", label: "Mild" }, { value: "b", label: "Strong" }]} />;
  }
  it("is a labelled radiogroup; arrow keys move the choice", async () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Severity" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Mild" }));
    expect(screen.getByRole("radio", { name: "Mild" })).toBeChecked();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Strong" })).toBeChecked();
  });
});

describe("Notice", () => {
  it("never relies on colour alone: an icon and a kind label come with the text; emergencies are alerts", () => {
    render(<Notice kind="emergency" kindLabel="Emergency" title="Seek care">Now.</Notice>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Emergency: Seek care");
    expect(alert.querySelector("[aria-hidden=true]")?.textContent).toBe("!");
  });
  it("cautions are status regions", () => {
    render(<Notice kind="caution" kindLabel="Caution">Careful.</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("Caution: Careful.");
  });
});

describe("Progress", () => {
  it("exposes a text equivalent and clamps", () => {
    render(<Progress value={1.7} name="Answered" label="5 / 5" />);
    const bar = screen.getByRole("progressbar", { name: "Answered" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "5 / 5");
  });
});

describe("Field", () => {
  it("wires label, hint and error to the control", () => {
    render(<Field label="Height" hint="in cm" error="Too small" required><TextInput /></Field>);
    const input = screen.getByRole("textbox", { name: /Height/ });
    expect(input).toBeRequired();
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("in cm Too small");
    expect(screen.getByRole("alert")).toHaveTextContent("Too small");
  });
  it("a valid field is not marked invalid", () => {
    render(<Field label="Height"><TextInput /></Field>);
    expect(screen.getByRole("textbox")).toBeValid();
  });
});

describe("Tooltip", () => {
  it("opens by click, closes by Esc and by an outside press; aria-expanded tracks it", async () => {
    render(<div><Tooltip label="What is this?">Explained.</Tooltip><button type="button">elsewhere</button></div>);
    const trigger = screen.getByRole("button", { name: "What is this?" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByRole("note")).toHaveTextContent("Explained.");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("note")).toBeNull();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("Dialog", () => {
  function Harness({ dismissable }: { dismissable: boolean }): React.ReactNode {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>open</Button>
        <Dialog open={open} onClose={() => setOpen(false)} labelledBy="t" dismissable={dismissable} alert={!dismissable}>
          <h2 id="t">Title</h2>
          <DialogActions><Button onClick={() => setOpen(false)}>OK</Button></DialogActions>
        </Dialog>
      </>
    );
  }
  it("opens as a named modal and closes through its action", async () => {
    render(<Harness dismissable />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog", { name: "Title" });
    await userEvent.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("a dismissable dialog closes on a backdrop click", async () => {
    render(<Harness dismissable />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await userEvent.click(screen.getByRole("dialog", { name: "Title" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("a blocking dialog that the browser closes anyway (Chrome's second-Esc rule) is shown again", async () => {
    render(<Harness dismissable={false} />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("alertdialog", { name: "Title" });
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
    expect(screen.getByRole("alertdialog", { name: "Title" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("a blocking dialog ignores Esc (cancel) and backdrop clicks and only closes through its action", async () => {
    render(<Harness dismissable={false} />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("alertdialog", { name: "Title" });
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await userEvent.click(dialog);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("catalogue", () => {
  it("renders every component state without axe violations", async () => {
    const { container } = render(<I18nProvider lang="en" setLang={() => undefined}><main><Catalogue /></main></I18nProvider>);
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });   // jsdom has no layout/CSS: contrast is covered by tokens.test.ts
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
