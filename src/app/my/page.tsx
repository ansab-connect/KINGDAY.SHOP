import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser, homeFor } from "@/features/auth/session";

/**
 * Target of the shop's Account button. Sends each person to their own home
 * (Super Admin → Control Centre, admin → admin panel, staff → staff portal,
 * customer → My Account); signed-out visitors go to sign in.
 * A page (not a route handler) so in-app links can follow the redirect.
 */
async function Go(): Promise<null> {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user) : "/login");
}

export default function MyHomePage() {
  return (
    <Suspense fallback={null}>
      <Go />
    </Suspense>
  );
}
