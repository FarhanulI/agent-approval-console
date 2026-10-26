import NextAuth from "next-auth";
import { createAuthOptions } from "@/lib/auth/options";
import { env } from "@/lib/config/env";

// Auth.js v4 builds callback/redirect URLs from NEXTAUTH_URL. Pin it to the
// configured public origin instead of trusting request headers.
process.env.NEXTAUTH_URL ??= env.APP_URL;

/** Auth.js endpoints (sign-in, callback, sign-out, csrf, session). Public by design. */
const handler = NextAuth(createAuthOptions());

export { handler as GET, handler as POST };
