import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser, homeFor } from "@/features/auth/session";

/**
 * Start page of the installed app (manifest start_url) and the default after sign-in.
 * The role comes from the verified session on the server, never from browser storage:
 * customers → /account, staff → /staff, admins → /admin. Signed-out visitors see the shop.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const target = user ? homeFor(user) : "/";
  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
