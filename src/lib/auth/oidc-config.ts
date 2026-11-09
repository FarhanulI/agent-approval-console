import { z } from "zod";

type OidcEnvironment = {
  AUTH_OIDC_ISSUER?: string;
  AUTH_OIDC_CLIENT_ID?: string;
  AUTH_OIDC_CLIENT_SECRET?: string;
};

function isSafeIssuer(value: string, nodeEnv: string | undefined) {
  try {
    const url = new URL(value);
    const isLocalHttp =
      nodeEnv !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" || isLocalHttp)
    );
  } catch {
    return false;
  }
}

function createOidcSchema(nodeEnv: string | undefined) {
  return z.object({
    issuer: z.string().refine((value) => isSafeIssuer(value, nodeEnv)),
    clientId: z.string().trim().min(1),
    clientSecret: z.string().refine((value) => value.trim().length > 0),
  });
}

export type OidcConfigurationResult =
  | { kind: "absent" }
  | { kind: "incomplete" | "invalid" }
  | {
      kind: "configured";
      value: { issuer: string; clientId: string; clientSecret: string };
    };

export function parseOidcConfiguration(
  input: OidcEnvironment,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): OidcConfigurationResult {
  const values = [
    input.AUTH_OIDC_ISSUER,
    input.AUTH_OIDC_CLIENT_ID,
    input.AUTH_OIDC_CLIENT_SECRET,
  ];
  const present = values.map(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  if (present.every((value) => !value)) return { kind: "absent" };
  if (!present.every(Boolean)) return { kind: "incomplete" };

  const parsed = createOidcSchema(nodeEnv).safeParse({
    issuer: input.AUTH_OIDC_ISSUER,
    clientId: input.AUTH_OIDC_CLIENT_ID,
    clientSecret: input.AUTH_OIDC_CLIENT_SECRET,
  });
  return parsed.success
    ? { kind: "configured", value: parsed.data }
    : { kind: "invalid" };
}
