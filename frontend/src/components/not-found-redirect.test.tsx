// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { NotFoundRedirect } from "./not-found-redirect";

afterEach(cleanup);

describe("NotFoundRedirect", () => {
  // A multi-segment unknown URL has no matching route; it must end on /unread.
  it("sends /foo/bar/baz to /unread", async () => {
    const root = createRootRoute();
    const filter = createRoute({
      getParentRoute: () => root,
      path: "/$filter",
      component: () => <p>list</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([filter]),
      defaultNotFoundComponent: NotFoundRedirect,
      history: createMemoryHistory({ initialEntries: ["/foo/bar/baz"] }),
    });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe("/unread"));
  });
});
