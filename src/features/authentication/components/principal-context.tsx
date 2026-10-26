"use client";

import { createContext, useContext, type ReactNode } from "react";
import { roleHasPermission, type Permission, type Role } from "@/lib/auth/policy";

/**
 * UI-only hint about the signed-in user, supplied by the server layout.
 * NOT an authorization source: it only decides which controls to offer. The
 * BFF re-derives identity from the session cookie and enforces policy on every
 * request, so tampering with this value in the browser grants nothing.
 */
export type PrincipalHint = { userId: string; role: Role };

const PrincipalContext = createContext<PrincipalHint | null>(null);

export function PrincipalProvider({
  value,
  children,
}: {
  value: PrincipalHint;
  children: ReactNode;
}) {
  return <PrincipalContext.Provider value={value}>{children}</PrincipalContext.Provider>;
}

export function usePrincipalHint(): PrincipalHint | null {
  return useContext(PrincipalContext);
}

/**
 * Whether to offer a control. With no provider (e.g. isolated component
 * tests) it returns true: the hint only ever hides controls, and the server
 * is the actual gate.
 */
export function useCanOffer(permission: Permission): boolean {
  const hint = usePrincipalHint();
  return hint ? roleHasPermission(hint.role, permission) : true;
}
