import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("combines conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("px-3 py-2", false && "px-8", "px-6", ["font-medium"])).toBe(
      "py-2 px-6 font-medium",
    );
  });
});