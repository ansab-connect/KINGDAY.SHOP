import type { Metadata } from "next";
import { Download } from "lucide-react";
import { CleanupPlanForm } from "@/components/admin/data-cleanup";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Panel } from "@/components/best-fit/ui";
import { countOldNotifications, filesOf, findTemporaryBookings, getCleanupSettings } from "@/features/data/temporary";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Data" };

const PERMANENT = [
  "Customers and their addresses",
  "Orders, order invoices and payments",
  "Service bookings (details, status, timeline), service invoices and pre-invoices",
  "Products, stock, purchases and expenses",
  "Staff, earnings, wallets and payouts",
  "Customer purchase bills (warranty proof)",
];

async function Content() {
  const db = createAdminClient();
  const s = await getCleanupSettings(db);
  const due = await findTemporaryBookings(db, s.keep_days);
  const ready = new Set(s.downloaded_ids);
  const fileCount = due.reduce((n, b) => n + filesOf(b).length, 0);
  const downloaded = due.filter((b) => ready.has(b.id));
  const waiting = due.length - downloaded.length;
  const oldNotes = await countOldNotifications(db);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Permanent data" description="Kept forever. Never cleaned automatically.">
          <ul className="list-disc pl-5 text-sm text-deep">{PERMANENT.map((p) => <li key={p}>{p}</li>)}</ul>
        </Panel>
        <Panel title="Temporary data" description={`Cleaned on the date below. A job's files become temporary ${s.keep_days} days after it is invoiced or cancelled.`}>
          <ul className="list-disc pl-5 text-sm text-deep">
            <li>Voice notes and complaint photos of closed service jobs: <b>{fileCount}</b> file(s) in {due.length} job(s)</li>
            <li>Read notifications older than 90 days: <b>{oldNotes ?? 0}</b></li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">After cleaning, each job keeps an overview line, for example: voice note (0:42) and 2 photos removed on 28 Nov. The job record itself stays.</p>
        </Panel>
      </div>
      <Panel title="1. Download the temporary files first" description="Save this ZIP on your computer, a pen drive or Google Drive. Only files you downloaded are cleaned.">
        <a href="/admin/export/temporary" download className="inline-flex h-12 w-fit items-center gap-2 rounded-xl bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800">
          <Download aria-hidden className="size-5" /> Download temporary files (ZIP)
        </a>
        <p className="mt-3 text-sm text-deep">
          Ready to clean: <b>{downloaded.length}</b> job(s).{" "}
          {waiting ? <span className="text-warning">Not downloaded yet: {waiting} job(s). They wait for the next date.</span> : null}
          {s.downloaded_at ? <span className="block text-xs text-muted-foreground">Last download: {new Date(s.downloaded_at).toLocaleString("en-IN")}</span> : null}
        </p>
      </Panel>
      <Panel title="2. Clean date" description="On this date the website deletes the downloaded temporary files by itself, then sets the next date.">
        <CleanupPlanForm date={s.date} every={s.every_days} keep={s.keep_days} canClean={downloaded.length > 0 || (oldNotes ?? 0) > 0} />
        {s.last_clean_at ? <p className="mt-3 text-xs text-muted-foreground">Last clean {new Date(s.last_clean_at).toLocaleString("en-IN")}: {s.last_clean_summary}</p> : null}
      </Panel>
    </div>
  );
}

export default function DataPage() {
  return (
    <StaffOnly minimum="super_admin" module="settings">
      <PageHeader title="Data" description="Permanent and temporary data. Temporary files are downloaded, then cleaned on a date you choose, to keep storage small." />
      <Content />
    </StaffOnly>
  );
}
