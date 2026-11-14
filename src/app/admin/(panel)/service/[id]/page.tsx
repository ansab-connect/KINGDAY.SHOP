import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { categoryLabel, directionsLink, mapsLink, statusLabel } from "@/features/service/constants";
import { bookingMedia, type BookingRow } from "@/features/service/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service booking" };

async function BookingContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("service_bookings").select("*").eq("id", id).maybeSingle();
  const b = data as BookingRow | null;
  if (!b) notFound();
  const media = await bookingMedia(b);
  const wa = `https://wa.me/${b.mobile.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(`Hi ${b.customer_name}, this is KING DAY Service about booking ${b.booking_code}.`)}`;

  return (
    <>
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
                  ["Category", categoryLabel(b.category)],
                  ["Product", b.product_name],
                  ["Bought", b.purchase_source === "kingday" ? "From KING DAY" : "Elsewhere"],
                  ["Purchase date", b.purchase_date ? formatDate(new Date(b.purchase_date)) : "—"],
                  ["Purchase details", b.purchase_details ?? "—"],
                  ["Preferred date", formatDate(new Date(b.preferred_date))],
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
        </div>

        <Card className="h-fit shadow-card">
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-semibold text-deep">Customer</h2>
            <div className="text-sm">
              <p className="font-semibold text-deep">{b.customer_name}</p>
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
