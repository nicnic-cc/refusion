// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SharedTooltipRoot } from "./shared-tooltip";
import { TooltipButton } from "./tooltip-button";

afterEach(cleanup);

// The app renders the shared popup once in RootLayout.
const wrapper = ({ children }: { children: ReactNode }) => (
  <>
    <SharedTooltipRoot />
    {children}
  </>
);

// Real timers: Base UI's 600 ms open delay is part of what is guarded.
const opens = { timeout: 2000 };

describe("TooltipButton", () => {
  it("shows the label with its shortcut after the hover delay and hides it on leave", async () => {
    const user = userEvent.setup();
    render(
      <TooltipButton label="Refresh" shortcut="r">
        x
      </TooltipButton>,
      { wrapper },
    );
    const button = screen.getByRole("button", { name: "Refresh" });

    await user.hover(button);
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText("Refresh")).toBeNull();
    const label = await screen.findByText("Refresh", {}, opens);
    expect(label.querySelector("kbd")?.textContent).toBe("r");

    await user.unhover(button);
    await waitFor(() => expect(screen.queryByText("Refresh")).toBeNull(), opens);
  });

  it("opens on keyboard focus without replacing the focused element", async () => {
    const user = userEvent.setup();
    render(<TooltipButton label="Refresh">x</TooltipButton>, { wrapper });

    await user.tab();
    const focused = document.activeElement;
    expect(focused?.getAttribute("aria-label")).toBe("Refresh");

    await screen.findByText("Refresh", {}, opens);
    expect(document.activeElement).toBe(focused);
  });

  it("opens from the wrapper when the button is disabled", async () => {
    const user = userEvent.setup();
    render(
      <TooltipButton label="Nothing to do" disabled>
        x
      </TooltipButton>,
      { wrapper },
    );

    await user.hover(screen.getByRole("button", { name: "Nothing to do" }).parentElement!);
    await screen.findByText("Nothing to do", {}, opens);
  });
});

describe("controlled tooltip", () => {
  it("shows its content with open=true and no hover", () => {
    render(
      <Tooltip open>
        <TooltipTrigger render={<button type="button" />}>x</TooltipTrigger>
        <TooltipContent>Full error text</TooltipContent>
      </Tooltip>,
    );
    expect(screen.getByText("Full error text")).toBeTruthy();
  });
});
