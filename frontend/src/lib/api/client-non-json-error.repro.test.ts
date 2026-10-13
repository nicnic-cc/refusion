import { afterEach, describe, expect, it, vi } from "vitest";
import { apiErrorMessage } from "./client";
import { groupAPI } from "./index";

async function failWith(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  return groupAPI.list().then(
    () => {
      throw new Error("expected the request to fail");
    },
    (err: unknown) => err,
  );
}

describe("api error messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  // A non-JSON 4xx body must not surface the made-up "Unknown error" to the user.
  it("a non-JSON 413 gives the caller's fallback or the status", async () => {
    const err = await failWith(new Response("<html>too large</html>", { status: 413 }));
    const message = apiErrorMessage(err, "fallback text");
    expect(message).not.toBe("Unknown error");
    expect(message === "fallback text" || message.includes("413")).toBe(true);
  });

  // Control: a JSON error body is passed through.
  it("control: a JSON 409 gives the server message", async () => {
    const err = await failWith(
      new Response(JSON.stringify({ error: "feed link already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(apiErrorMessage(err, "fallback text")).toBe("feed link already exists");
  });
});
