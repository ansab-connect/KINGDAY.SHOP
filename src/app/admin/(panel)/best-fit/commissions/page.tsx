import type { Metadata } from "next";
import { CommissionRuleForm } from "@/components/best-fit/commission-form";
import { OpButton } from "@/components/best-fit/op-form";
import { BfPage, MoreLinks, DataTable, Panel, Status, Tabs, day, param, type SP } from "@/components/best-fit/ui";
import { can, getCurrentUser } from "@/features/auth/session";
import { getPeople, getSetting, personName, staffOptions, techOptions } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invoice & Commission Settings" };

type Rule = { id: string; section: "inspection" | "service" | "parts"; technician_id: string | null; effective_from: string; effective_to: string | null; is_active: boolean; notes: string | null; created_at: string; replaces_id: string | null; commission_rule_shares: { beneficiary: "company" | "assigned_technician" | "user"; user_id: string | null; percent: number }[] };
const SECTIONS = [
  { key: "inspection", label: "1. Inspection commission", base: "the inspection charge (before tax)" },
  { key: "service", label: "2. Service cost commission", base: "service + labour + extra charges, after discount, before tax" },
  { key: "parts", label: "3. Parts / replacement commission", base: "the approved net parts selling amount, before tax" },
] as const;

async function Content({ searchParams }: SP) {
  const want = param(await searchParams, "section");
  const tab = (SECTIONS.find((s) => s.key === want)?.key ?? "inspection") as Rule["section"];
  const me = await getCurrentUser();
  const editable = can(me, "best_fit", "edit") && (can(me, "accounts", "edit") || (me?.roles.includes("super_admin") ?? false));
  const supabase = await createClient();
  const [{ data }, people, partsOn] = await Promise.all([
    supabase.from("commission_rules").select("*, commission_rule_shares(beneficiary, user_id, percent)").eq("section", tab).order("technician_id", { nullsFirst: true }).order("effective_from", { ascending: false }),
    getPeople(),
    getSetting<boolean>("best_fit.parts_commission_enabled", false),
  ]);
  const rules = (data ?? []) as Rule[];
  const sec = SECTIONS.find((s) => s.key === tab)!;
  const techs = techOptions(people);
  const staff = staffOptions(people);
  const who = (s: Rule["commission_rule_shares"][number]) => (s.beneficiary === "company" ? "Company" : s.beneficiary === "assigned_technician" ? "Assigned technician" : personName(people, s.user_id));
  const today = new Date().toISOString().slice(0, 10);
  const current = (r: Rule) => r.is_active && r.effective_from <= today && (!r.effective_to || r.effective_to >= today);
  return (
    <>
      <Tabs current={tab} tabs={SECTIONS.map((s) => ({ key: s.key, label: s.label, href: `?section=${s.key}` }))} />
      {tab === "parts" && !partsOn ? <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info">Parts commission is switched OFF: parts sales stay 100% with the company. A Super Admin can switch it on in Service Configuration → Base location &amp; company.</p> : null}
      <Panel title={sec.label} description={`Each split applies only to ${sec.base}. Priority: a valid individual rule → the default rule → no rule = the invoice is flagged for review (no allocation is invented). Percentages must total exactly 100%. Technicians never see these settings.`}>
        <DataTable rows={rules} empty="No rules for this section yet." cols={[
          { key: "w", label: "Applies to", render: (r) => <><p className="font-semibold">{r.technician_id ? personName(people, r.technician_id) : "Default"}</p>{r.notes ? <p className="text-xs text-muted-foreground">{r.notes}</p> : null}</> },
          { key: "s", label: "Split", render: (r) => <ul className="text-xs">{r.commission_rule_shares.map((s, i) => <li key={i}>{who(s)}: <b>{s.percent}%</b></li>)}</ul> },
          { key: "d", label: "Effective", render: (r) => `${day(r.effective_from)} → ${r.effective_to ? day(r.effective_to) : "open"}` },
          { key: "st", label: "Status", render: (r) => <div className="flex flex-col gap-1"><Status s={r.is_active ? "active" : "inactive"} />{current(r) ? <span className="text-xs text-success">In use today</span> : null}</div> },
          { key: "e", label: "", render: (r) => (editable ? (
            <div className="flex flex-col gap-2">
              <OpButton op="rule.active" values={{ id: r.id, active: !r.is_active }} label={r.is_active ? "Deactivate" : "Activate"} tone="neutral" />
              <details><summary className="cursor-pointer text-sm font-semibold text-royal">New version</summary>
                <div className="mt-2 w-[min(85vw,720px)]"><CommissionRuleForm section={tab} techs={techs} staff={staff} replaces={r.id} initial={{ ...r, shares: r.commission_rule_shares }} /></div>
              </details>
            </div>
          ) : null) },
        ]} />
      </Panel>
      {editable ? (
        <Panel title="Add a rule" description="Choose a technician for an individual override, or leave “Default”. Add the company and any other staff members who share this section.">
          <CommissionRuleForm section={tab} techs={techs} staff={staff} />
        </Panel>
      ) : <p className="text-sm text-muted-foreground">Changing commissions needs BEST FIT edit and Accounts edit permission (or Super Admin).</p>}
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Invoice & Commission Settings" description="Three independent splits per Service Booking: inspection, service cost and parts." module="best_fit"><MoreLinks links={[["/admin/best-fit/payment-slabs", "Technician payment slabs"], ["/admin/best-fit/service-charges", "Service charge (₹300 split)"], ["/admin/best-fit/wallet", "Staff earnings wallet"], ["/admin/best-fit/performance", "Technician performance"], ["/admin/best-fit/reports", "Reports"]]} /><Content {...props} /></BfPage>;
}
