import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { InvoiceEditor } from "@/components/service/invoice-editor";
import { InspectionView, JobTimeline } from "@/components/service/job-views";
import { InspectionForm, JobActions } from "@/components/staff/jobs/job-workflow";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { categoryLabel, directionsLink, mapsLink, statusLabel } from "@/features/service/constants";
import { bookingMedia, getInspection, getJobEvents, type BookingRow } from "@/features/service/queries";
import { getDefaultBasicCharge, getInvoiceForBooking } from "@/features/service/invoices";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Job" };

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-card">
      <h2 className="mb-3 font-heading text-base font-semibold text-deep">{title}</h2>
      {children}
    </section>
  );
}

async function Job({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireTeam();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("service_bookings").select("*").eq("id", id).eq("assigned_to", user.id).maybeSingle();
  const b = data as BookingRow | null;
  if (!b) notFound();
  const [media, events, inspection, invoice, basicDefault] = await Promise.all([bookingMedia(b), getJobEvents(id), getInspection(id), getInvoiceForBooking(id), getDefaultBasicCharge()]);
  const phone = b.mobile.replace(/\s/g, "");
  const wa = `https://wa.me/${b.mobile.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(`Hi ${b.customer_name}, I'm the KING DAY technician for booking ${b.booking_code}.`)}`;
  const canReport = ["reached", "started", "completed"].includes(b.status);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/staff/jobs" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal"><ArrowLeft aria-hidden className="size-4" /> <L en="My jobs" ml="എന്റെ ജോലികൾ" /></Link>
      <div>
        <p className="font-mono text-sm font-bold text-royal">{b.booking_code}</p>
        <h1 className="text-2xl font-bold text-deep">{b.customer_name}</h1>
        <p className="text-sm text-muted-foreground">{statusLabel(b.status)} · {formatDate(new Date(b.preferred_date))}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <a href={`tel:${phone}`} className="flex flex-col items-center gap-1 rounded-xl border bg-white py-3 text-xs font-semibold text-deep"><Phone aria-hidden className="size-5 text-royal" /> <L en="Call" ml="വിളിക്കുക" /></a>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-xl border bg-white py-3 text-xs font-semibold text-deep"><MessageCircle aria-hidden className="size-5 text-[#25D366]" /> WhatsApp</a>
        {b.latitude != null && b.longitude != null ? (
          <a href={directionsLink(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-xl border bg-white py-3 text-xs font-semibold text-deep"><Navigation aria-hidden className="size-5 text-royal" /> <L en="Navigate" ml="വഴി" /></a>
        ) : (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-xl border bg-white py-3 text-xs font-semibold text-deep"><MapPin aria-hidden className="size-5 text-royal" /> <L en="Find address" ml="വിലാസം" /></a>
        )}
      </div>

      {b.status === "assigned" || ["accepted", "on_the_way", "reached", "started"].includes(b.status) ? (
        <Card title={<L en="Update job" ml="ജോലി അപ്ഡേറ്റ്" />}>
          <JobActions bookingId={b.id} status={b.status} />
        </Card>
      ) : null}

      <Card title={<L en="Job details" ml="ജോലി വിവരങ്ങൾ" />}>
        <dl className="grid gap-2 text-sm">
          {[
            ["Product", `${categoryLabel(b.category)} · ${b.product_name}`],
            ["Bought", b.purchase_source === "kingday" ? `KING DAY${b.purchase_details ? ` (${b.purchase_details})` : ""}` : "Elsewhere"],
            ["Mobile", b.mobile],
            ["Address", b.address],
            ["Booked on", formatDate(new Date(b.created_at))],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="whitespace-pre-line text-deep">{v}</dd>
            </div>
          ))}
        </dl>
        {b.latitude != null && b.longitude != null ? (
          <a href={mapsLink(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-royal">Open pin in Google Maps</a>
        ) : null}
        <div className="mt-4">
          <p className="text-sm text-muted-foreground"><L en="Complaint" ml="പരാതി" /></p>
          <p className="mt-1 text-sm whitespace-pre-line text-deep">{b.complaint || "—"}</p>
        </div>
        {media.voice ? <audio controls src={media.voice} className="mt-3 w-full" /> : null}
        {media.photos.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {media.photos.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block size-20 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                <img src={u} alt={`Customer photo ${i + 1}`} className="size-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title={<L en="Inspection report" ml="പരിശോധനാ റിപ്പോർട്ട്" />}>
        {canReport ? (
          <InspectionForm
            bookingId={b.id}
            userId={user.id}
            showConfirmation={b.status === "started" || b.status === "completed"}
            initial={{
              problem_found: inspection?.problem_found ?? "",
              work_performed: inspection?.work_performed ?? "",
              spare_parts: inspection?.spare_parts ?? "",
              notes: inspection?.notes ?? "",
              before: inspection?.before ?? [],
              after: inspection?.after ?? [],
              confirmed_by: inspection?.confirmed_by ?? b.customer_name,
              signature: inspection?.signature ?? null,
            }}
          />
        ) : inspection ? (
          <InspectionView data={inspection} />
        ) : (
          <p className="text-sm text-muted-foreground"><L en="You can fill the report after reaching the location." ml="സ്ഥലത്തെത്തിയ ശേഷം റിപ്പോർട്ട് പൂരിപ്പിക്കാം." /></p>
        )}
      </Card>

      {b.status === "completed" || b.status === "invoiced" ? (
        <Card title={<L en={invoice ? `Invoice ${invoice.invoice_number}` : "Invoice"} ml="ബിൽ" />}>
          <InvoiceEditor
            bookingId={b.id}
            invoiceId={invoice?.id ?? null}
            locked={invoice?.payment_status === "paid"}
            initial={{
              service_description: invoice?.service_description ?? inspection?.work_performed ?? "",
              basic: String((invoice?.basic_charge ?? basicDefault) / 100),
              labour: String((invoice?.labour_charge ?? 0) / 100),
              discount: String((invoice?.discount ?? 0) / 100),
              tax: String(invoice?.tax_percent ?? 0),
              items: invoice?.items ?? [],
              payment_method: invoice?.payment_method ?? "",
              payment_status: invoice?.payment_status ?? "unpaid",
              }}
          />
          {invoice?.payment_status === "paid" ? (
            <a href={`/service-invoice/${invoice.id}`} target="_blank" className="mt-3 inline-block text-sm font-semibold text-royal">View / print invoice</a>
          ) : null}
        </Card>
      ) : null}

      <Card title={<L en="Timeline" ml="ടൈംലൈൻ" />}>
        <JobTimeline events={events} />
      </Card>
    </div>
  );
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Job params={params} />
    </Suspense>
  );
}
