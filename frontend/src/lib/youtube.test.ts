import { describe, expect, it } from "vitest";
import { youtubeVideo } from "./youtube";

describe("youtubeVideo", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abcDEF12345", "abcDEF12345", false],
    ["https://m.youtube.com/watch?v=a_c-EF12345&t=5", "a_c-EF12345", false],
    ["https://youtu.be/abcDEF12345", "abcDEF12345", false],
    ["https://www.youtube.com/shorts/Zz9_-Y12345", "Zz9_-Y12345", true],
  ])("parses %s", (link, id, vertical) => {
    expect(youtubeVideo(link)).toEqual({ id, vertical });
  });

  it.each([
    "https://example.com/watch?v=abcDEF12345",
    "javascript:alert('https://www.youtube.com/watch?v=abcDEF12345')",
    "https://www.youtube.com/watch?v=abcDEF1234",
    "https://www.youtube.com/watch?v=abcDEF123456",
    'https://www.youtube.com/watch?v=abcDEF1234"',
    "https://youtu.be/abcDEF1234/",
    "https://www.youtube.com/shorts/abcDEF12/45",
    "not a url",
  ])("rejects %s", (link) => {
    expect(youtubeVideo(link)).toBeNull();
  });
});
