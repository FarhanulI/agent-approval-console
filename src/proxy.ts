import { NextResponse, type NextRequest } from "next/server";
import { resolvePrincipal } from "@/lib/auth/principal";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { unauthenticated, getRequestId } from "@/lib/server/http";

/**
 * FIRST layer of route protection only. Unauthenticated page requests are
 * redirected to `/login` (with a validated relative `callbackUrl`); API
 * requests get a structured 401 instead of an HTML redirect. It is not the
 * security boundary: every Route Handler and the console layout re-resolve the
 * session and authorize on their own, so a matcher mistake cannot expose data.
 *
 * Public: `/login` and `/api/auth/*` (Auth.js endpoints). No redirect loop is
 * possible because the login route is never redirected.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const auth = await resolvePrincipal(request);
  if (auth.authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return unauthenticated(getRequestId(request));
  }

  const login = new URL("/login", request.url);
  const target = safeCallbackPath(pathname + search);
  if (target !== "/approvals" || pathname === "/approvals") {
    login.searchParams.set("callbackUrl", target);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js)$).*)"],
};
