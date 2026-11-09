import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseEnvironment } from "./env";

describe("APP_URL validation", () => {
  it.each(["http://localhost:3000", "https://console.example.com"])(
    "accepts a safe HTTP(S) origin: %s",
    (value) => {
      expect(parseEnvironment({ APP_URL: value }).APP_URL).toBe(value);
    },
  );

  it.each([
    "javascript:alert(1)",
    "https://user:password@example.com",
    "https://console.example.com/path",
  ])(
    "rejects unsafe URLs: %s",
    (value) => {
      expect(() => parseEnvironment({ APP_URL: value })).toThrow();
    },
  );

  it("reports malformed URLs as schema validation errors", () => {
    expect(() => parseEnvironment({ APP_URL: "******example.com" })).toThrow(
      ZodError,
    );
  });
});
