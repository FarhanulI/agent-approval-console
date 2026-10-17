import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
});

export const env = envSchema.parse({
  APP_URL: process.env.APP_URL,
});
