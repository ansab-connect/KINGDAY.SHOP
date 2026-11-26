import type { Metadata } from "next";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Status, Tabs, param, type SP } from "@/components/best-fit/ui";
import { getGroups, getPeople, techOptions } from "@/features/best-fit/queries";

export const metadata: Metadata = { title: "Technician Groups" };

async function Content({ searchParams }: SP) {
  const kind = param(await searchParams, "kind");
  const [groups, people] = await Promise.all([getGroups(), getPeople()]);
  const techs = techOptions(people);
  const fields: Field[] = [
    { name: "name", label: "Group name", required: true },
    { name: "leader_id", label: "Group leader", type: "select", options: techs },
    { name: "service_area", label: "Service area" },
    { name: "skills", label: "Skills (comma separated)", type: "list" },
    { name: "notes", label: "Notes", wide: true },
    { name: "is_active", label: "Active", type: "bool" },
  ];
  const rows = groups.filter((g) => !kind || g.kind === kind);
  const name = (id: string) => people.find((p) => p.user_id === id)?.full_name ?? "—";
  return (
    <>
      <Tabs current={kind || "all"} tabs={[{ key: "all", label: "All groups", href: "/admin/best-fit/groups" }, { key: "manual", label: "Manual groups", href: "/admin/best-fit/groups?kind=manual" }, { key: "ai", label: "From AI suggestions", href: "/admin/best-fit/groups?kind=ai" }]} />
      <Panel title="Technician groups" description="Assigning a booking to a group gives the job to its leader; every member can see the work order and the approved route.">
        <DataTable rows={rows} empty="No groups yet." cols={[
          { key: "n", label: "Group", render: (g) => <><p className="font-semibold">{g.name}</p><p className="text-xs text-muted-foreground">{g.kind === "ai" ? "AI suggestion" : "Manual"} · {g.service_area ?? "any area"}</p></> },
          { key: "l", label: "Leader", render: (g) => (g.leader_id ? name(g.leader_id) : "—") },
          { key: "m", label: "Members", render: (g) => (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {g.technician_group_members.map((m) => (
                  <span key={m.user_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {name(m.user_id)}
                    {m.user_id !== g.leader_id ? <OpButton op="member.delete" values={{ group_id: g.id, user_id: m.user_id }} label="×" tone="neutral" /> : null}
                  </span>
                ))}
              </div>
              <OpForm op="member.create" hidden={{ group_id: g.id }} columns={1} submitLabel="Add member" resetOnSuccess fields={[{ name: "user_id", label: "Technician", type: "select", required: true, options: techs.filter((t) => !g.technician_group_members.some((m) => m.user_id === t.value)) }]} />
            </div>
          ) },
          { key: "s", label: "Status", render: (g) => <Status s={g.is_active ? "active" : "inactive"} /> },
          { key: "e", label: "", render: (g) => (
            <details><summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary>
              <div className="mt-2 flex w-[min(80vw,600px)] flex-col gap-2"><OpForm op="group.update" hidden={{ id: g.id }} initial={g} fields={fields} /><OpButton op="group.delete" values={{ id: g.id }} label="Delete group" tone="danger" confirmText="Delete this group? Work orders keep their history." /></div>
            </details>
          ) },
        ]} />
      </Panel>
      <Panel title="New manual group">
        <OpForm op="group.create" hidden={{ kind: "manual" }} fields={fields} initial={{ is_active: true }} resetOnSuccess columns={3} submitLabel="Create group" />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Groups" module="best_fit"><Content {...props} /></BfPage>;
}
