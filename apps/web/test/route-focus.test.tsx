// RouteFocus (UX spec §8): focus goes to the new screen's heading when the route changes — and, for a screen whose content arrives after a fetch, to the heading when it arrives.
import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it } from "vitest";
import { RouteFocus } from "../src/app/RouteFocus.tsx";

const wait = (ms: number): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

/** A page at /sync with its heading at once, one at /late whose heading comes `delay` ms after the route changed, and a field to move focus to. */
function Pages({ delay }: { delay: number }) {
  const [path] = useLocation();
  const [arrived, setArrived] = useState<string | null>(null);
  useEffect(() => {
    if (path !== "/late") return;
    const id = setTimeout(() => setArrived(path), delay);
    return () => clearTimeout(id);
  }, [path, delay]);
  return (
    <>
      <RouteFocus />
      <input aria-label="elsewhere" />
      <main id="main">
        {path === "/late" ? (arrived === "/late" ? <h1>Late heading</h1> : <p>Loading</p>) : <h1>{path === "/sync" ? "Sync heading" : "Start heading"}</h1>}
        {path === "/sync" ? <section id="target" aria-label="A place on the page"><p>Named by the address</p></section> : null}
      </main>
    </>
  );
}
function setup(delay = 40) {
  const loc = memoryLocation({ path: "/", record: false });
  render(<Router hook={loc.hook}><Pages delay={delay} /></Router>);
  return loc;
}
afterEach(() => { document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });

describe("RouteFocus", () => {
  it("does nothing on the first load", () => {
    setup();
    expect(document.body).toHaveFocus();
  });
  it("moves focus to the heading of a screen that has one when the route changes", async () => {
    const loc = setup();
    await act(async () => { loc.navigate("/sync"); });
    expect(screen.getByRole("heading", { name: "Sync heading" })).toHaveFocus();
  });
  it("goes to the place the address names with a #, when the new page has it", async () => {
    const loc = setup();
    window.history.pushState(null, "", "/#target");
    await act(async () => { loc.navigate("/sync"); });
    expect(screen.getByRole("region", { name: "A place on the page" })).toHaveFocus();
  });
  it("does not count a heading that is in the page but hidden — the old screen React keeps while a new one loads — and moves to the new heading when it is shown", async () => {
    document.body.innerHTML = "";
    const loc = setup(60);
    await act(async () => { loc.navigate("/late"); });
    // the page keeps the previous screen's heading in the DOM, hidden, beside the loading state (as a suspended lazy route does)
    const old = document.createElement("h1");
    old.textContent = "Old screen";
    old.style.display = "none";
    document.getElementById("main")!.appendChild(old);
    await wait(150);
    expect(screen.getByRole("heading", { name: "Late heading" })).toHaveFocus();
  });
  it("focus given at the moment of the change skips a hidden heading and rests on the container", async () => {
    const loc = setup(500);
    const old = document.createElement("h1");
    old.textContent = "Old screen";
    old.style.display = "none";
    document.getElementById("main")!.prepend(old);
    await act(async () => { loc.navigate("/late"); });
    expect(document.getElementById("main")).toHaveFocus();
  });
  it("falls back to the heading when the # names nothing on the page, or is not a valid name at all", async () => {
    for (const hash of ["#nothing-here", "#%E0%A4%A"]) {
      document.body.innerHTML = "";
      const loc = setup();
      window.history.pushState(null, "", `/${hash}`);
      await act(async () => { loc.navigate("/sync"); });
      expect(screen.getByRole("heading", { name: "Sync heading" }), hash).toHaveFocus();
    }
  });
  it("puts focus on the container while a screen's content is on its way, then on its heading when it arrives", async () => {
    const loc = setup(60);
    await act(async () => { loc.navigate("/late"); });
    expect(document.getElementById("main")).toHaveFocus();
    expect(screen.queryByRole("heading")).toBeNull();
    await wait(150);
    expect(screen.getByRole("heading", { name: "Late heading" })).toHaveFocus();
  });
  it("leaves focus where the person has put it if they moved on before the heading arrived", async () => {
    const loc = setup(60);
    await act(async () => { loc.navigate("/late"); });
    screen.getByLabelText("elsewhere").focus();
    await wait(150);
    expect(screen.getByRole("heading", { name: "Late heading" })).toBeInTheDocument();
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
  });
  it("does not carry a wait over to the next route: a heading that arrives for the screen left behind takes no focus", async () => {
    const loc = setup(80);
    await act(async () => { loc.navigate("/late"); });
    await act(async () => { loc.navigate("/sync"); });
    expect(screen.getByRole("heading", { name: "Sync heading" })).toHaveFocus();
    await wait(150);
    expect(screen.getByRole("heading", { name: "Sync heading" })).toHaveFocus();
  });
});
