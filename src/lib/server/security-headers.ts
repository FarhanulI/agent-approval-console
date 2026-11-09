export type SecurityHeaderEnvironment = {
  nodeEnv: string | undefined;
  appUrl: string;
};

export function getSecurityHeaders({
  nodeEnv,
  appUrl,
}: SecurityHeaderEnvironment): { key: string; value: string }[] {
  const parsedAppUrl = new URL(appUrl);
  const isHttpsProduction =
    nodeEnv === "production" && parsedAppUrl.protocol === "https:";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // Next.js inline bootstrap styles/scripts currently require this compatibility allowance.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
  ];
  if (isHttpsProduction) directives.push("upgrade-insecure-requests");

  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    { key: "Content-Security-Policy", value: directives.join("; ") },
    ...(isHttpsProduction
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
        ]
      : []),
  ];
}
