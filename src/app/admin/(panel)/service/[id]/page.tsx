import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { AssignJobForm, CancelJobForm } from "@/components/admin/service/assign-controls";
import { StaffOnly } from "@/components/admin/staff-only";
import { InvoiceEditor } from "@/components/service/invoice-editor";
import { InspectionView, JobTimeline } from "@/components/service/job-views";
import { JobActions } from "@/components/staff/jobs/job-workflow";
import { Card, CardContent } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { categoryLabel, directionsLink, mapsLink, statusLabel } from "@/features/service/constants";
import { preferredDateText } from "@/features/service/constants";
import { bookingMedia, getInspection, getJobEvents, listTechnicians, type BookingRow } from "@/features/service/queries";
import { getDefaultBasicCharge, getInvoiceForBooking, getReplacedItems, replacedName } from "@/features/service/invoices";
import { ReplacedItems } from "@/components/service/replaced-items";
import { BookingOpsPanel } from "@/components/best-fit/booking-panel";
import { CustomItemReview } from "@/components/admin/service/custom-item-review";
import { formatDate, formatDateTime, formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service booking" };

async function BookingContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("service_bookings").select("*").eq("id", id).maybeSingle();
  const b = data as BookingRow | null;
  if (!b) notFound();
  const me = await getCurrentUser();
  const manage = can(me, "service", "edit");
  const [media, events, inspection, technicians, invoice, basicDefault, replaced] = await Promise.all([bookingMedia(b), getJobEvents(id), getInspection(id), listTechnicians(), getInvoiceForBooking(id), getDefaultBasicCharge(), getReplacedItems(id)]);
  const partsLines = replaced.map((r) => ({ id: r.id, partId: r.part_id, name: replacedName(r), quantity: r.quantity, unitPrice: r.unit_price_paise, approval: r.approval_status }));
  const partsTotal = partsLines.filter((l) => l.approval === "approved").reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  const canApprove = can(me, "billing", "approve");
  const pendingCustom = replaced.filter((r) => r.approval_status === "pending");
  const tech = technicians.find((t) => t.user_id === b.assigned_to);
  const { data: cust } = b.customer_id ? await supabase.from("profiles").select("customer_code").eq("id", b.customer_id).maybeSingle() : { data: null };
  const customerCode = (cust as { customer_code?: string } | null)?.customer_code;
  const open = !["completed", "ready_for_delivery", "invoiced", "cancelled"].includes(b.status);
  // Managers can move the timeline too (workshop jobs, or when the technician cannot).
  const movable = ["assigned", "scheduled", "awaiting_parts", "accepted", "on_the_way", "reached", "inspection_started", "inspection_completed", "started", "completed", "invoiced"].includes(b.status);
  const reassignable = ["new", "assigned", "scheduled", "accepted", "on_the_way", "reached"].includes(b.status);
  const wa = `https://wa.me/${b.mobile.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(`Hi ${b.customer_name}, this is KING DAY Service about booking ${b.booking_code}.`)}`;

  return (
    <>
      <AutoRefresh seconds={45} />
      <Link href="/admin/service" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Service Management
      </Link>
      <PageHeader title={b.booking_code} description={`${statusLabel(b.status)} · booked ${formatDateTime(new Date(b.created_at))}`} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="shadow-card">
            <CardContent className="flex flex-col gap-4">
              <h2 className="font-heading text-lg font-semibold text-deep">Product &amp; problem</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {[
                  ["Category", (b as BookingRow & { category_label?: string | null }).category_label ?? categoryLabel(b.category)],
                  ["Product", b.product_name ?? "—"],
                  ["Bought", b.purchase_source === "kingday" ? "From KING DAY" : "Elsewhere"],
                  ["Purchase date", b.purchase_date ? formatDate(new Date(b.purchase_date)) : "—"],
                  ["Purchase details", b.purchase_details ?? "—"],
                  ["Preferred date", preferredDateText(b.preferred_date)],
                ].map(([k, v]) => (
                  <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium text-deep">{v}</dd></div>
                ))}
              </dl>
              {b.order_id ? <Link href={`/admin/orders/${b.order_id}`} className="text-sm font-semibold text-royal hover:underline">Open the KING DAY order</Link> : null}
              <div>
                <p className="text-sm text-muted-foreground">Complaint</p>
                <p className="mt-1 text-sm whitespace-pre-line text-deep">{b.complaint || "—"}</p>
              </div>
              {media.voice ? (
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Voice note</p>
                  <audio controls src={media.voice} className="w-full max-w-md" />
                </div>
              ) : null}
              {media.photos.length ? (
                <div className="flex flex-wrap gap-3">
                  {media.photos.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block size-28 overflow-hidden rounded-xl border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                      <img src={u} alt={`Customer photo ${i + 1}`} className="size-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="flex flex-col gap-4">
              <h2 className="font-heading text-lg font-semibold text-deep">Replaced items</h2>
              <ReplacedItems bookingId={b.id} lines={partsLines} editable={manage && b.status !== "cancelled" && invoice?.payment_status !== "paid"} />
              {canApprove && pendingCustom.length ? (
                <div className="flex flex-col gap-3 border-t pt-4">
                  <p className="text-sm font-semibold text-deep">Custom items waiting for approval</p>
                  {pendingCustom.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <CustomItemReview id={r.id} name={replacedName(r)} price={r.unit_price_paise} requested={r.master_request === "requested"} />
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          {["completed", "ready_for_delivery", "invoiced"].includes(b.status) ? (
            <Card className="shadow-card">
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-lg font-semibold text-deep">{invoice ? `Invoice ${invoice.invoice_number}` : "Invoice"}</h2>
                  {invoice ? (
                    <p className="text-sm">
                      <span className="font-semibold text-deep">{formatPaise(invoice.grand_total)}</span>{" "}
                      <span className={invoice.payment_status === "paid" ? "text-success" : "text-warning"}>{invoice.payment_status === "paid" ? "Paid" : invoice.payment_status === "partial" ? `Balance ${formatPaise(invoice.balance)}` : "Unpaid"}</span>{" "}
                      <span className={invoice.approval_status === "approved" ? "text-success" : "text-warning"}>· {invoice.approval_status === "approved" ? "Approved" : "Draft (customer can't see it)"}</span>
                    </p>
                  ) : null}
                </div>
                {manage ? (
                  <InvoiceEditor
                    bookingId={b.id}
                    invoiceId={invoice?.id ?? null}
                    locked={invoice?.approval_status === "approved" && !canApprove}
                    sparePartsTotal={partsTotal}
                    canApprove={canApprove}
                    approved={invoice?.approval_status === "approved"}
                    initial={{
                service_description: invoice?.service_description ?? inspection?.work_performed ?? "",
                basic: String((invoice?.basic_charge ?? basicDefault) / 100),
                labour: String((invoice?.labour_charge ?? 0) / 100),
                discount: String((invoice?.discount ?? 0) / 100),
                tax: String(invoice?.tax_percent ?? 0),
                items: invoice?.items ?? [],
                payment_method: invoice?.payment_method ?? "",
                amount_paid: String((invoice?.amount_paid ?? 0) / 100),
              }}
                  />
                ) : invoice ? (
                  <a href={`/service-invoice/${invoice.id}`} target="_blank" className="text-sm font-semibold text-royal">View / print invoice</a>
                ) : (
                  <p className="text-sm text-muted-foreground">No invoice yet.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-card">
            <CardContent className="flex flex-col gap-4">
              <h2 className="font-heading text-lg font-semibold text-deep">Inspection report</h2>
              <InspectionView data={inspection} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
        <BookingOpsPanel bookingId={b.id} />
        <Card className="shadow-card">
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-semibold text-deep">Technician</h2>
            <p className="text-sm text-deep">
              {tech ? `${tech.staff_code ?? ""} · ${tech.full_name ?? ""}` : b.assigned_to ? "Assigned (inactive staff)" : "Not assigned yet"}
            </p>
            {manage && reassignable && !can(me, "best_fit", "edit") ? (
              <AssignJobForm bookingId={b.id} technicians={technicians} currentId={b.assigned_to} locked={!["new", "assigned", "scheduled"].includes(b.status)} />
            ) : null}
            {manage && movable ? (
              <div className="flex flex-col gap-2 border-t pt-4">
                <p className="text-sm font-semibold text-deep">Update progress</p>
                <JobActions bookingId={b.id} status={b.status} manager />
              </div>
            ) : null}
            {manage && open ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold text-danger">Cancel this job</summary>
                <div className="mt-3"><CancelJobForm bookingId={b.id} /></div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit shadow-card">
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-semibold text-deep">Customer</h2>
            <div className="text-sm">
              <p className="font-semibold text-deep">{b.customer_name}{customerCode ? <span className="ml-2 font-mono text-xs text-royal">{customerCode}</span> : null}</p>
              <p className="text-muted-foreground">{b.mobile}{b.email ? ` · ${b.email}` : ""}</p>
              <p className="mt-2 whitespace-pre-line text-deep">{b.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${b.mobile.replace(/\s/g, "")}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-white text-sm font-semibold text-deep hover:bg-muted"><Phone aria-hidden className="size-4" /> Call</a>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-white hover:bg-[#1fb457]"><MessageCircle aria-hidden className="size-4" /> WhatsApp</a>
              {b.latitude != null && b.longitude != null ? (
                <>
                  <a href={mapsLink(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-white text-sm font-semibold text-deep hover:bg-muted"><MapPin aria-hidden className="size-4" /> Map</a>
                  <a href={directionsLink(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-royal text-sm font-semibold text-white hover:bg-royal-800"><Navigation aria-hidden className="size-4" /> Navigate</a>
                </>
              ) : (
                <p className="col-span-2 text-xs text-muted-foreground">No map pin was shared; use the address.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-semibold text-deep">Timeline</h2>
            <JobTimeline events={events} />
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}

export default function ServiceBookingPage(props: PageProps<"/admin/service/[id]">) {
  return (
    <StaffOnly module="service">
      <BookingContent params={props.params} />
    </StaffOnly>
  );
}
