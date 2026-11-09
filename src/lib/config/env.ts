import { z } from "zod";

const appUrlSchema = z.string().refine(
  (value) => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !parsed.username &&
        !parsed.password &&
        parsed.pathname === "/" &&
        !parsed.search &&
        !parsed.hash
      );
    } catch {
      return false;
    }
  },
  "APP_URL must be an HTTP(S) origin without credentials or a path.",
);

export const envSchema = z.object({
  APP_URL: appUrlSchema.default("http://localhost:3000"),
});

export const parseEnvironment = (input: unknown) => envSchema.parse(input);

export const env = parseEnvironment({ APP_URL: process.env.APP_URL });
