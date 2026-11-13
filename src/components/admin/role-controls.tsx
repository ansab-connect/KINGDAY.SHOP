"use client";

import { useActionState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { FormNotice } from "@/components/forms/action-form";
import { grantRoleAction, revokeRoleAction } from "@/features/admin/actions";
import type { FormState } from "@/features/forms";

const LABEL: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", staff: "Staff", customer: "Customer" };
const STAFF_ROLES = ["staff", "admin", "super_admin"] as const;

/** Role chips with grant/revoke for Super Admins; read-only chips for everyone else. */
export function RoleControls({ userId, roles, canManage, isSelf }: { userId: string; roles: string[]; canManage: boolean; isSelf: boolean }) {
  const [grantState, grant, granting] = useActionState<FormState, FormData>(grantRoleAction, {});
  const [revokeState, revoke, revoking] = useActionState<FormState, FormData>(revokeRoleAction, {});
  const staffRoles = roles.filter((r) => r !== "customer");
  const grantable = STAFF_ROLES.filter((r) => !roles.includes(r));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {staffRoles.length === 0 ? <span className="text-xs text-muted-foreground">Customer</span> : null}
        {staffRoles.map((r) => (
          <form key={r} action={revoke} className="inline-flex">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="role" value={r} />
            <span className="inline-flex items-center gap-1 rounded-full bg-royal-50 py-0.5 pr-1 pl-2.5 text-xs font-semibold text-royal">
              {LABEL[r] ?? r}
              {canManage && !isSelf ? (
                <button
                  type="submit"
                  disabled={revoking}
                  onClick={(e) => {
                    if (!window.confirm(`Remove the ${LABEL[r]} role? They lose that access immediately.`)) e.preventDefault();
                  }}
                  aria-label={`Remove ${LABEL[r]} role`}
                  className="grid size-5 place-items-center rounded-full hover:bg-royal-100"
                >
                  {revoking ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                </button>
              ) : null}
            </span>
          </form>
        ))}
      </div>
      {canManage && grantable.length ? (
        <form action={grant} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="userId" value={userId} />
          <select name="role" aria-label="Role to grant" className="h-8 rounded-md border bg-white px-2 text-base sm:text-xs" defaultValue={grantable[0]}>
            {grantable.map((r) => (
              <option key={r} value={r}>{LABEL[r]}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={granting}
            onClick={(e) => {
              if (!window.confirm("Grant this role? The user gets admin panel access on their next page load.")) e.preventDefault();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-semibold text-deep hover:bg-muted disabled:opacity-60"
          >
            {granting ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Grant
          </button>
        </form>
      ) : null}
      <FormNotice state={grantState.at && (!revokeState.at || grantState.at > revokeState.at) ? grantState : revokeState} />
    </div>
  );
}
