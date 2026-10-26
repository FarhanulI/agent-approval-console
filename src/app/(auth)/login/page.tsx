import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LoginForm } from "@/features/authentication/components/login-form";
import { resolvePrincipal } from "@/lib/auth/principal";
import { isDevLoginAvailable } from "@/lib/auth/dev-users";
import { safeCallbackPath } from "@/lib/auth/redirect";

/**
 * Public login route. Already-authenticated users are sent to the (validated)
 * callback path. `callbackUrl` is sanitized server-side; an absolute or
 * protocol-relative value falls back to `/approvals`.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(params.callbackUrl);

  const auth = await resolvePrincipal({ headers: await headers() });
  if (auth.authenticated) redirect(callbackUrl);

  const sso = Boolean(
    process.env.AUTH_OIDC_ISSUER &&
      process.env.AUTH_OIDC_CLIENT_ID &&
      process.env.AUTH_OIDC_CLIENT_SECRET,
  );

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-2xl px-4 py-10 focus:outline-none sm:px-6 sm:py-16"
    >
      <PageHeader
        title="Sign in"
        description="Access to the supervision console requires authentication."
      />
      <LoginForm
        callbackUrl={callbackUrl}
        devLogin={isDevLoginAvailable()}
        sso={sso}
        error={params.error}
      />
    </main>
  );
}
