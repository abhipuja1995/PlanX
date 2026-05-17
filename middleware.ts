import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth";

const ROLE_GATES: Record<string, UserRole[]> = {
  '/pricing/admin':   ['admin', 'super_admin'],
  '/pricing/vendors': ['finance', 'admin', 'super_admin'],
  '/pricing/audit':   ['finance', 'admin', 'super_admin'],
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    // @ts-expect-error role injected by jwt callback
    const role: UserRole | null = req.nextauth.token?.role ?? null;

    for (const [prefix, allowed] of Object.entries(ROLE_GATES)) {
      if (pathname.startsWith(prefix) && (!role || !allowed.includes(role))) {
        return NextResponse.redirect(new URL('/pricing?error=unauthorized', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!login|api/auth|api/mailer|api/insights|_next/static|_next/image|favicon.ico).*)",
  ],
};
