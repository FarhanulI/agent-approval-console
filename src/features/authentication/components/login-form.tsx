"use client";

import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LoginFormProps = {
  /** Already validated, same-origin relative path. */
  callbackUrl: string;
  devLogin: boolean;
  sso: boolean;
  error?: string;
};

/**
 * Starts Auth.js sign-in. Credentials are posted by Auth.js to its own
 * endpoint with its CSRF token; nothing is kept in web storage. The dev form
 * only renders when the server reports the dev provider is registered.
 */
export function LoginForm({ callbackUrl, devLogin, sso, error }: LoginFormProps) {
  const [pending, setPending] = useState(false);

  function submitDev(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    void signIn("credentials", {
      username: String(data.get("username") ?? ""),
      password: String(data.get("password") ?? ""),
      callbackUrl,
    });
  }

  if (!devLogin && !sso) {
    return (
      <p role="status" className="text-sm text-fg-muted">
        Sign-in is not configured for this environment, so no one can sign in.
        An administrator must configure the identity provider.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          Sign-in failed. Check your details and try again.
        </p>
      ) : null}
      {sso ? (
        <Button onClick={() => void signIn("oidc", { callbackUrl })}>
          Continue with single sign-on
        </Button>
      ) : null}
      {devLogin ? (
        <form onSubmit={submitDev} className="space-y-3" aria-label="Development login">
          <p className="text-xs text-fg-subtle">
            Development/test login (mock mode only). Not production authentication.
          </p>
          <div>
            <label htmlFor="login-username" className="text-sm font-medium text-fg">
              Username
            </label>
            <Input id="login-username" name="username" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="login-password" className="text-sm font-medium text-fg">
              Password
            </label>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" loading={pending}>
            Sign in
          </Button>
        </form>
      ) : null}
    </div>
  );
}
