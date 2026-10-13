// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { useUIStore } from "@/store";
import { ImportOpmlDialog } from "./import-opml-dialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const opml = `<?xml version="1.0"?><opml version="2.0"><body>
<outline text="Example Posts" xmlUrl="https://example.com/posts.xml"/></body></opml>`;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useUIStore.setState({ isImportOpmlOpen: false });
});

async function importWith(batchResponse: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/feeds/batch")
        ? batchResponse()
        : new Response(JSON.stringify({ data: [] }), {
            headers: { "Content-Type": "application/json" },
          }),
    ),
  );
  useUIStore.setState({ isImportOpmlOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportOpmlDialog />
    </QueryClientProvider>,
  );
  const input = (await screen.findAllByLabelText("Import OPML")).find(
    (el) => el instanceof HTMLInputElement,
  )!;
  await userEvent.upload(input, new File([opml], "feeds.opml", { type: "text/xml" }));
  await userEvent.click(screen.getByRole("button", { name: /^Import$/ }));
}

describe("OPML import failure toast", () => {
  // A proxy's non-JSON 502 must show the localized failure text, not the raw "HTTP 502".
  it("shows the localized message for a non-JSON 502", async () => {
    await importWith(
      () => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("Failed to import OPML");
  });

  // Control: a successful import reports the created count.
  it("control: a successful import toasts success", async () => {
    await importWith(
      () =>
        new Response(JSON.stringify({ data: { created: 1, failed: 0 } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
