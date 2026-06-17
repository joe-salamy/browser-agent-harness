// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("renders system when there is no forced theme", () => {
    render(<ThemeToggle />);

    expect(screen.getByLabelText("Color theme")).toHaveValue("system");
  });

  it("forces and persists dark theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.selectOptions(screen.getByLabelText("Color theme"), "dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("bah-theme")).toBe("dark");
  });

  it("forces and persists light theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.selectOptions(screen.getByLabelText("Color theme"), "light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("bah-theme")).toBe("light");
  });

  it("returns to system by removing the forced theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.selectOptions(screen.getByLabelText("Color theme"), "dark");
    await user.selectOptions(screen.getByLabelText("Color theme"), "system");

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("bah-theme")).toBe("system");
  });
});
