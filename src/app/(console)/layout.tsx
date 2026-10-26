import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { PrincipalProvider } from "@/features/authentication/components/principal-context";
import { SessionBar } from "@/features/authentication/components/session-bar";
import { resolvePrincipal } from "@/lib/auth/principal";

/**
 * Console layout. Re-checks the session on the server (the proxy is only the
 * first layer) and hands the client a UI-only hint; see `PrincipalProvider`.
 * The session read is request-time data, so it lives behind a Suspense
 * boundary (required with Cache Components).
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-sm text-fg-muted">
          Loading…
        </p>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const auth = await resolvePrincipal({ headers: await headers() });
  if (!auth.authenticated) redirect("/login");
  const { userId, role } = auth.principal;

  return (
    <PrincipalProvider value={{ userId, role }}>
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
        <Sidebar />
        <div className="min-w-0">
          <SessionBar />
          <MobileNav />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </PrincipalProvider>
  );
}
