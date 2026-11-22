import { describe, expect, it } from "vitest";
import { normaliseSocialVideoUrl, parseSocialVideo } from "./social-video";

describe("parseSocialVideo", () => {
  it("reads YouTube links", () => {
    expect(parseSocialVideo("https://youtu.be/dQw4w9WgXcQ?si=x")).toMatchObject({ kind: "youtube", id: "dQw4w9WgXcQ", vertical: false });
    expect(parseSocialVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")?.thumb).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(parseSocialVideo("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toMatchObject({ vertical: true, url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" });
  });
  it("reads Instagram reels and posts", () => {
    expect(parseSocialVideo("https://www.instagram.com/reel/C9abc_12-X/?igsh=abc")).toMatchObject({ kind: "instagram", id: "C9abc_12-X", embed: "https://www.instagram.com/reel/C9abc_12-X/embed/" });
    expect(normaliseSocialVideoUrl("https://instagram.com/kingday/reels/C9abc_12-X")).toBe("https://www.instagram.com/reel/C9abc_12-X/");
    expect(normaliseSocialVideoUrl("https://www.instagram.com/p/C9abc_12-X/")).toBe("https://www.instagram.com/p/C9abc_12-X/");
  });
  it("rejects other links", () => {
    for (const bad of ["", "hello", "https://example.com/reel/abc", "javascript:alert(1)", "https://www.youtube.com/watch?v=short", "https://www.instagram.com/kingday/"]) {
      expect(parseSocialVideo(bad)).toBeNull();
    }
  });
});
