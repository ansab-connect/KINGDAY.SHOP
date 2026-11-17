import { describe, expect, it } from "vitest";
import { extractJson, isGeminiConfigured } from "./gemini";

describe("gemini helpers", () => {
  it("reads JSON from a fenced reply", () => {
    expect(extractJson('Here you go:\n```json\n{"name":"Jeep","specifications":[]}\n```')).toEqual({ name: "Jeep", specifications: [] });
  });
  it("reads a bare JSON object and rejects junk", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{broken")).toBeNull();
  });
  it("is off when no key is set", () => {
    const old = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);
    if (old) process.env.GEMINI_API_KEY = old;
  });
});
