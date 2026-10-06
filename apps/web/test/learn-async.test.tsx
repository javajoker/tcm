// The hook behind the herb pages: a value that comes from a promise. The loader is a new closure on every render, so the one thing it must never do is run again because of that.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useAsync } from "../src/learn/useAsync.ts";

const settle = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe("useAsync", () => {
  it("runs an inline loader once, however many times the component renders", async () => {
    let loads = 0;
    function C({ n }: { n: number }) {
      const { state } = useAsync("k", () => { loads += 1; return Promise.resolve(n); });
      return <p>{state.status === "ready" ? `ready ${state.value}` : state.status}</p>;
    }
    const { rerender } = render(<C n={1} />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    await settle();
    expect(screen.getByText("ready 1")).toBeInTheDocument();
    rerender(<C n={2} />);
    rerender(<C n={3} />);
    await settle();
    expect(loads).toBe(1);
    expect(screen.getByText("ready 1")).toBeInTheDocument();       // the value of the source that was asked for, not of a later closure
  });

  it("loads again for another source, and goes back to loading while it does", async () => {
    const asked: string[] = [];
    function C({ slug }: { slug: string }) {
      const { state } = useAsync(slug, () => { asked.push(slug); return new Promise<string>((r) => setTimeout(() => r(`value of ${slug}`), 10)); });
      return <p>{state.status === "ready" ? state.value : state.status}</p>;
    }
    const { rerender } = render(<C slug="a" />);
    await settle();
    expect(screen.getByText("value of a")).toBeInTheDocument();
    rerender(<C slug="b" />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    await settle();
    expect(screen.getByText("value of b")).toBeInTheDocument();
    expect(asked).toEqual(["a", "b"]);
  });

  it("says so when the load fails and tries again on request", async () => {
    let attempts = 0;
    function C() {
      const { state, retry } = useAsync("k", () => { attempts += 1; return attempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve("back"); });
      return <><p>{state.status === "ready" ? state.value : state.status}</p><button onClick={retry}>again</button></>;
    }
    render(<C />);
    await settle();
    expect(screen.getByText("error")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "again" }));
    await settle();
    expect(screen.getByText("back")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("ignores what comes back after the component has gone", async () => {
    let resolve: (v: string) => void = () => undefined;
    function C() {
      const { state } = useAsync("k", () => new Promise<string>((r) => { resolve = r; }));
      return <p>{state.status}</p>;
    }
    function Host() {
      const [shown, setShown] = useState(true);
      return <>{shown ? <C /> : <p>gone</p>}<button onClick={() => setShown(false)}>remove</button></>;
    }
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "remove" }));
    resolve("late");
    await settle();
    expect(screen.getByText("gone")).toBeInTheDocument();
  });
});
