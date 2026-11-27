import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Keeps Supabase auth cookies fresh on routes that use the session.
 * Authorisation is enforced in layouts and server actions, not here.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/super-admin/:path*",
    "/staff/:path*",
    "/launch",
    "/my",
    "/book-service",
    "/service-cart",
    "/service-invoice/:path*",
    "/order-invoice/:path*",
    "/account/:path*",
    "/wishlist",
    "/cart",
    "/checkout/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
  ],
};
