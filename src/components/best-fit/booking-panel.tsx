import Link from "next/link";
import { OpButton, OpForm } from "@/components/best-fit/op-form";
import { DataTable, Panel, Status, km, rupees, when } from "@/components/best-fit/ui";
import { can, getCurrentUser } from "@/features/auth/session";
import { getGroups, getPeople, personName, techOptions } from "@/features/best-fit/queries";
import { geocodePin } from "@/lib/geocode";
import { roadDistance } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

type B = {
  id: string; booking_code: string; service_mode: string; service_centre_id: string | null; status: string; latitude: number | null; longitude: number | null;
  pin_code: string | null; estimated_distance_km: number | null; estimated_distance_source: string | null; verified_distance_km: number | null; verified_at: string | null;
  instructions: string | null; town: string | null; priority: string; purchase_invoice_path: string | null; category_label: string | null; service_type_label: string | null;
};

/** BEST FIT controls on the admin booking page: mode, distance, pre-invoice, work order, earnings. */
export async function BookingOpsPanel({ bookingId }: { bookingId: string }) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  const [{ data: bd }, { data: hist }, { data: pis }, { data: wos }, { data: inv }, people, groups] = await Promise.all([
    supabase.from("service_bookings").select("id, booking_code, service_mode, service_centre_id, status, latitude, longitude, pin_code, estimated_distance_km, estimated_distance_source, verified_distance_km, verified_at, instructions, town, priority, purchase_invoice_path, category_label, service_type_label").eq("id", bookingId).maybeSingle(),
    supabase.from("service_distance_history").select("id, kind, old_km, new_km, source, reason, created_at").eq("booking_id", bookingId).order("created_at", { ascending: false }),
    supabase.from("inspection_pre_invoices").select("id, invoice_number, status, distance_km, slab_code, rate_paise, charge_paise, total_paise, amount_paid, balance, payment_status").eq("booking_id", bookingId).order("created_at", { ascending: false }),
    supabase.from("work_orders").select("id, work_order_number, technician_id, group_id, status, scheduled_date, scheduled_slot, created_at").eq("booking_id", bookingId).order("created_at", { ascending: false }),
    supabase.from("service_invoices").select("id, invoice_number, approval_status, balance").eq("booking_id", bookingId).maybeSingle(),
    getPeople(),
    getGroups(),
  ]);
  const b = bd as B | null;
  if (!b) return null;
  const manage = can(me, "service", "edit");
  const bestFit = can(me, "best_fit", "edit");
  const accounts = can(me, "accounts", "view");
  const centre = b.service_centre_id ? ((await supabase.from("service_centres").select("name, address, phone, working_hours").eq("id", b.service_centre_id).maybeSingle()).data as { name: string; address: string; phone: string | null; working_hours: string | null } | null) : null;
  const invoiceUrl = b.purchase_invoice_path ? (await supabase.storage.from("service-media").createSignedUrl(b.purchase_invoice_path, 1800)).data?.signedUrl : null;
  const issued = ((pis ?? []) as { id: string; invoice_number: string; status: string; distance_km: number; slab_code: string; rate_paise: number; charge_paise: number; total_paise: number; amount_paid: number; balance: number; payment_status: string }[]);
  const openPi = issued.find((p) => p.status === "issued");
  const workOrders = (wos ?? []) as { id: string; work_order_number: string; technician_id: string | null; group_id: string | null; status: string; scheduled_date: string | null; scheduled_slot: string | null; created_at: string }[];
  const openWo = workOrders.find((w) => !["cancelled", "reassigned"].includes(w.status));
  const home = b.service_mode !== "centre";
  const invoice = inv as { id: string; invoice_number: string; approval_status: string; balance: number } | null;
  // Distance and charge: verified km wins; otherwise the saved estimate; otherwise a live road
  // estimate from the shop to the customer's pin (shown, saved only when staff press Save).
  const { data: baseRow } = await supabase.from("store_settings").select("value").eq("key", "best_fit.base_location").maybeSingle();
  const bv = (baseRow as { value: { lat: number | null; lng: number | null } } | null)?.value;
  const base = bv?.lat != null && bv?.lng != null ? { lat: Number(bv.lat), lng: Number(bv.lng) } : null;
  const byPin = (b.latitude == null || b.longitude == null) && b.pin_code ? await geocodePin(b.pin_code, b.town ?? "") : null;
  const pin = b.latitude != null && b.longitude != null ? { lat: b.latitude, lng: b.longitude } : byPin;
  const live = home && base && pin && b.estimated_distance_km == null && b.verified_distance_km == null ? await roadDistance(base, pin) : null;
  const liveKm = live?.ok ? live.km : null;
  const calcKm = b.verified_distance_km ?? b.estimated_distance_km ?? liveKm;
  const preview = calcKm != null ? ((await supabase.rpc("preview_inspection_charge", { p_km: calcKm })).data as { slab: string | null; rate_paise?: number; charge_paise: number | null } | null) : null;
  const assignable = ["new", "assigned", "scheduled", "accepted", "on_the_way", "reached"].includes(b.status);

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Service details" description={`${b.service_type_label ?? ""} · ${b.category_label ?? ""}`}>
        <dl className="grid gap-2 text-sm">
          <div><dt className="text-muted-foreground">Service mode</dt><dd className="font-medium text-deep">{home ? "Home service (technician visit)" : "Nearby service centre"}</dd></div>
          {centre ? <div><dt className="text-muted-foreground">Centre</dt><dd className="text-deep">{centre.name} · {centre.address}{centre.working_hours ? ` · ${centre.working_hours}` : ""}</dd></div> : null}
          {b.town ? <div><dt className="text-muted-foreground">Town / district</dt><dd className="text-deep">{b.town}</dd></div> : null}
          {b.pin_code ? <div><dt className="text-muted-foreground">PIN code</dt><dd className="text-deep">{b.pin_code}</dd></div> : null}
          {b.instructions ? <div><dt className="text-muted-foreground">Instructions</dt><dd className="whitespace-pre-line text-deep">{b.instructions}</dd></div> : null}
          {invoiceUrl ? <div><dt className="text-muted-foreground">KING DAY bill</dt><dd><a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-royal">Open attachment</a></dd></div> : null}
        </dl>
      </Panel>

      {home ? (
        <Panel title="Road distance" description="Billing uses only the verified one-way road distance.">
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-muted-foreground">Estimated</dt><dd className="font-semibold text-deep">{km(b.estimated_distance_km ?? liveKm)}{b.estimated_distance_source ? <span className="block text-xs font-normal text-muted-foreground">{b.estimated_distance_source}</span> : liveKm != null ? <span className="block text-xs font-normal text-muted-foreground">Road route from the shop{byPin ? ` to PIN ${b.pin_code}` : ""} (about {live?.ok ? live.minutes : 0} min) · not saved yet</span> : null}</dd></div>
            <div><dt className="text-muted-foreground">Verified</dt><dd className="font-semibold text-deep">{km(b.verified_distance_km)}{b.verified_at ? <span className="block text-xs font-normal text-muted-foreground">{when(b.verified_at)}</span> : null}</dd></div>
          </dl>
          {calcKm != null && preview?.charge_paise != null ? (
            <p className="mb-3 rounded-lg bg-royal-50 px-3 py-2 text-sm text-deep">
              <span className="font-semibold">Inspection charge{b.verified_distance_km == null ? " (estimate)" : ""}:</span> {km(calcKm)} × {rupees(preview.rate_paise ?? 0)}/km ({preview.slab}) = <span className="font-bold">{rupees(preview.charge_paise)}</span>
            </p>
          ) : null}
          {!base ? <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">The shop location is not set, so distance can&apos;t be calculated. <Link href="/admin/service/catalog?tab=settings" className="font-semibold underline">Set it in Service Configuration</Link>.</p> : null}
          {live && !live.ok ? <p className="mb-3 text-xs text-warning">{live.message}</p> : null}
          {manage ? (
            <div className="flex flex-col gap-3">
              {pin ? (
                base ? <OpButton op="distance.estimate" values={{ booking_id: b.id }} label={b.estimated_distance_km == null ? "Save estimated distance" : "Re-check road distance"} tone="neutral" /> : null
              ) : <p className="text-xs text-muted-foreground">No map pin from the customer. Enter the distance below after checking.</p>}
              {b.estimated_distance_km != null || b.verified_distance_km != null ? (
                <div className="flex flex-wrap gap-2">
                  {b.estimated_distance_km != null ? <OpButton op="distance.clear" values={{ booking_id: b.id, kind: "estimated" }} label={`Delete estimated km (${km(b.estimated_distance_km)})`} tone="danger" confirmText="Delete the estimated distance?" /> : null}
                  {b.verified_distance_km != null && !openPi ? <OpButton op="distance.clear" values={{ booking_id: b.id, kind: "verified" }} label={`Delete verified km (${km(b.verified_distance_km)})`} tone="danger" confirmText="Delete the verified distance?" /> : null}
                </div>
              ) : null}
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-royal">Edit estimated km</summary>
                <div className="mt-2"><OpForm op="distance.estimate.set" hidden={{ booking_id: b.id }} columns={2} submitLabel="Save estimated km" initial={{ km: b.estimated_distance_km ?? liveKm ?? "" }}
                  fields={[{ name: "km", label: "Estimated one-way km", type: "number", required: true, step: "0.01" }]} /></div>
              </details>
              {openPi ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-royal">Edit verified km ({km(b.verified_distance_km)})</summary>
                  <p className="mt-1 text-xs text-muted-foreground">The unpaid pre-invoice is cancelled and a new one is issued with the new km.</p>
                  <div className="mt-2"><OpForm op="distance.change" hidden={{ booking_id: b.id }} columns={2} submitLabel="Change distance" initial={{ km: b.verified_distance_km ?? "" }}
                    fields={[{ name: "km", label: "Correct one-way km", type: "number", required: true, step: "0.01" }, { name: "reason", label: "Note (optional)" }]} /></div>
                </details>
              ) : (
                <OpForm op="distance.verify" hidden={{ booking_id: b.id }} columns={2} submitLabel="Save verified distance"
                  fields={[{ name: "km", label: "Actual one-way km", type: "number", required: true, step: "0.01" }, { name: "reason", label: "Note (optional)" }]} />
              )}
            </div>
          ) : null}
          {(hist ?? []).length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-royal">Distance history ({(hist ?? []).length})</summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {((hist ?? []) as { id: number; kind: string; old_km: number | null; new_km: number; source: string | null; reason: string | null; created_at: string }[]).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2">{when(h.created_at)} · {h.kind}: {h.old_km != null ? `${h.old_km} → ` : ""}{h.new_km} km{h.source ? ` · ${h.source}` : ""}{h.reason ? ` · “${h.reason}”` : ""}
                    {manage ? <OpButton op="distance.history.delete" values={{ id: h.id }} label="Delete" tone="danger" confirmText="Delete this history line?" /> : null}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>
      ) : null}

      {home ? (
        <Panel title="Inspection pre-invoice">
          {issued.length ? (
            <ul className="mb-3 flex flex-col gap-2 text-sm">
              {issued.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                  <span>
                    <Link href={`/service-invoice/pre/${p.id}`} target="_blank" className="font-mono font-semibold text-royal">{p.invoice_number}</Link>{" "}
                    <span className="text-muted-foreground">{p.distance_km} km × {rupees(p.rate_paise)} ({p.slab_code}) = {rupees(p.charge_paise)}</span>
                  </span>
                  <span className="flex items-center gap-2"><Status s={p.status === "void" ? "void" : p.payment_status} /> <span className="font-semibold">{rupees(p.total_paise)}</span></span>
                  {p.status === "issued" && p.balance > 0 && (can(me, "accounts", "create") || can(me, "billing", "approve")) ? (
                    <div className="w-full border-t pt-2">
                      <OpForm op="payment.record" hidden={{ pre_invoice_id: p.id }} columns={3} submitLabel="Record payment" initial={{ amount_paise: p.balance }}
                        fields={[{ name: "amount_paise", label: "Amount (₹)", type: "money", required: true }, { name: "method", label: "Method", type: "select", required: true, options: [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "bank_transfer", label: "Bank transfer" }, { value: "online", label: "Online" }, { value: "card", label: "Card" }, { value: "other", label: "Other" }] }, { name: "reference", label: "Reference" }]} />
                    </div>
                  ) : null}
                  {p.status === "issued" && p.amount_paid === 0 && manage ? <OpButton op="preinvoice.void" values={{ id: p.id }} label="Void" tone="danger" ask="Reason" /> : null}
                </li>
              ))}
            </ul>
          ) : <p className="mb-3 text-sm text-muted-foreground">No pre-invoice yet.</p>}
          {manage && !openPi && b.verified_distance_km != null && b.status !== "cancelled" ? <OpButton op="preinvoice.create" values={{ booking_id: b.id }} label="Create pre-invoice from slab" /> : null}
          {manage && b.verified_distance_km == null ? <p className="text-xs text-muted-foreground">Verify the distance to create the pre-invoice.</p> : null}
        </Panel>
      ) : null}

      <Panel title="Work order" description={openWo ? `${openWo.work_order_number} · ${personName(people, openWo.technician_id)}` : "Not assigned yet (Unassigned Services)"}>
        {openWo ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Status s={openWo.status} />
            {openWo.group_id ? <span className="text-muted-foreground">Group: {groups.find((g) => g.id === openWo.group_id)?.name}</span> : null}
            <span className="text-muted-foreground">{openWo.scheduled_date ? `Scheduled ${openWo.scheduled_date}${openWo.scheduled_slot ? ` (${openWo.scheduled_slot})` : ""}` : "Not scheduled"}</span>
          </div>
        ) : null}
        {bestFit && manage && assignable ? (
          <OpForm op="wo.assign" hidden={{ booking_id: b.id }} columns={2} submitLabel={openWo ? "Reassign" : "Assign"}
            fields={[
              { name: "technician_id", label: "Technician", type: "select", options: techOptions(people) },
              { name: "group_id", label: "or Group (leader by default)", type: "select", options: groups.filter((g) => g.is_active).map((g) => ({ value: g.id, label: g.name })) },
              { name: "scheduled_date", label: "Schedule date", type: "date" },
              { name: "scheduled_slot", label: "Slot", type: "select", options: [{ value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }, { value: "evening", label: "Evening" }] },
              { name: "note", label: "Note", wide: true },
            ]} />
        ) : null}
        {bestFit && openWo && !assignable && !["completed", "ready_for_delivery", "invoiced", "cancelled"].includes(openWo.status) ? (
          <OpForm op="wo.schedule" hidden={{ id: openWo.id }} columns={2} submitLabel="Reschedule"
            fields={[{ name: "scheduled_date", label: "Date", type: "date", required: true }, { name: "scheduled_slot", label: "Slot", type: "select", options: [{ value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }, { value: "evening", label: "Evening" }] }]} />
        ) : null}
        {workOrders.length > 1 ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-royal">Assignment history</summary>
            <DataTable rows={workOrders} cols={[{ key: "work_order_number", label: "WO" }, { key: "t", label: "Technician", render: (w) => personName(people, w.technician_id) }, { key: "status", label: "Status", render: (w) => <Status s={w.status} /> }, { key: "created_at", label: "Created", render: (w) => when(w.created_at) }]} />
          </details>
        ) : null}
      </Panel>

      {accounts && invoice ? (
        <Panel title="Earnings & commission">
          <p className="text-sm text-muted-foreground">Final invoice {invoice.invoice_number} · {invoice.approval_status}</p>
          <Link href={`/admin/best-fit/technician-invoices?invoice=${invoice.id}`} className="mt-2 inline-block text-sm font-semibold text-royal">Preview / finalise earnings →</Link>
        </Panel>
      ) : null}
    </div>
  );
}
