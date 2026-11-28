import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { getCurrentUser } from "@/features/auth/session";
import { filesOf, findTemporaryBookings, getCleanupSettings, saveCleanupSettings } from "@/features/data/temporary";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Download the temporary files (voice notes and complaint photos of closed jobs) as one ZIP,
 * with an overview sheet. Only files downloaded here are removed on the clean date.
 * Super Admin only.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new NextResponse("Sign in", { status: 401 });
  if (!me.roles.includes("super_admin")) return new NextResponse("Super Admin only", { status: 403 });
  const db = createAdminClient();
  const s = await getCleanupSettings(db);
  const due = await findTemporaryBookings(db, s.keep_days);
  const files: Record<string, Uint8Array> = {};
  const lines = ["booking_code,customer,status,closed,files"];
  const saved: string[] = [];
  let bytes = 0;
  for (const b of due) {
    if (bytes > 150 * 1024 * 1024) break; // the rest comes in the next download
    const names: string[] = [];
    let ok = true;
    for (const path of filesOf(b)) {
      const { data, error } = await db.storage.from("service-media").download(path);
      if (error || !data) { ok = false; continue; }
      const buf = new Uint8Array(await data.arrayBuffer());
      bytes += buf.length;
      const name = `${b.booking_code}/${path.split("/").pop()}`;
      files[name] = buf;
      names.push(name);
    }
    if (ok) saved.push(b.id);
    lines.push([b.booking_code, `"${b.customer_name.replace(/"/g, '""')}"`, b.status, b.updated_at.slice(0, 10), `"${names.join(" ")}"`].join(","));
  }
  files["overview.csv"] = strToU8(lines.join("\n"));
  await saveCleanupSettings(db, { ...s, downloaded_ids: [...new Set([...s.downloaded_ids, ...saved])], downloaded_at: new Date().toISOString() });
  const zip = zipSync(files, { level: 0 });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(zip), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="kingday-temporary-files-${day}.zip"`, "cache-control": "no-store" },
  });
}
