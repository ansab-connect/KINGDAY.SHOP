import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Panel } from "@/components/best-fit/ui";

export const metadata: Metadata = { title: "Backup" };

export default function BackupPage() {
  return (
    <StaffOnly minimum="super_admin" module="settings">
      <PageHeader title="Backup" description="Download everything in one file and keep it safe on your computer." />
      <Panel title="Full backup (one download)" description="A ZIP file with one Excel-readable sheet (CSV) per area: customers, addresses, orders, order items, invoices and bills, service bookings, service invoices, payments, purchases, expenses, products, stock, coupons, technician earnings and settings.">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
        <a href="/admin/export/backup" download className="inline-flex h-12 w-fit items-center gap-2 rounded-xl bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800">
          <Download aria-hidden className="size-5" /> Download full backup
        </a>
        <ul className="mt-4 list-disc pl-5 text-sm text-muted-foreground">
          <li>Download it once a week (for example every Monday) and keep the last few copies.</li>
          <li>Save a copy outside this computer too: a pen drive or Google Drive.</li>
          <li>It can take up to a minute. The file name has the date, e.g. kingday-backup-2026-11-28.zip.</li>
          <li>Photos stay safely in cloud storage; this file holds all the records.</li>
        </ul>
      </Panel>
    </StaffOnly>
  );
}
