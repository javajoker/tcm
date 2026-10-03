import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App.tsx";
import { APP_PROFILE, IS_DEV_PROFILE } from "../src/app/profile.ts";

describe("app scaffold", () => {
  it("renders the shell with a main landmark, a skip link and the permanent disclaimer", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /跳到主要內容/ })).toHaveAttribute("href", "#main");
    expect(screen.getByText(/不是醫療診斷或處方/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("knows its build-time profile (tests run as dev unless APP_PROFILE says otherwise)", () => {
    expect(["release", "dev"]).toContain(APP_PROFILE);
    expect(IS_DEV_PROFILE).toBe(APP_PROFILE === "dev");
    render(<App />);
    expect(screen.queryByTestId("profile-badge") !== null).toBe(IS_DEV_PROFILE);
  });
});
