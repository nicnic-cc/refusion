// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedErrorLine } from "./feed-error-line";

const state = vi.hoisted(() => ({ isMobile: true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.isMobile }));

const fullError = `dial tcp 192.0.2.1:443: i/o timeout ${"while reading the response ".repeat(4)}end`;
vi.mock("@/queries/feeds", () => ({
  useFeedLookup: () => ({
    getFeedById: () => ({ fetch_state: { last_error: fullError } }),
  }),
}));

afterEach(cleanup);

describe("FeedErrorLine", () => {
  it("on mobile a tap opens the full error without any hover", async () => {
    const user = userEvent.setup();
    render(<FeedErrorLine feedId={1} />);

    expect(screen.queryByText(fullError)).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(fullError)).toBeTruthy();
  });

  it("on mobile a tap outside closes it", async () => {
    const user = userEvent.setup();
    render(<FeedErrorLine feedId={1} />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByText(fullError)).toBeTruthy();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByText(fullError)).toBeNull());
  });
});
