"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { usePrincipalHint } from "./principal-context";

/** Shows who is signed in and offers sign-out (Auth.js POST with CSRF token). */
export function SessionBar() {
  const hint = usePrincipalHint();
  if (!hint) return null;
  return (
    <div className="flex items-center justify-end gap-3 border-b border-line bg-surface px-4 py-2 text-sm text-fg-muted sm:px-6 lg:px-8">
      <span data-testid="session-identity">
        {hint.userId} · {hint.role}
      </span>
      <Button variant="secondary" size="sm" onClick={() => void signOut({ callbackUrl: "/login" })}>
        Sign out
      </Button>
    </div>
  );
}
