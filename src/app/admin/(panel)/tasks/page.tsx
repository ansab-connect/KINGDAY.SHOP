import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { TaskAssignForm, TaskStatusControl, type TeamMember } from "@/components/admin/people/work-admin-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { PRIORITY, TASK_STATUS, type Task } from "@/features/staff/work";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff Tasks" };

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
] as const;

async function TasksContent({ searchParams }: PageProps<"/admin/tasks">) {
  if (!isSupabaseConfigured) return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Tasks need Supabase.</p>;
  const raw = (await searchParams).show;
  const show = FILTERS.find((f) => f.key === raw)?.key ?? "open";
  const me = await getCurrentUser();
  const canEdit = can(me, "staff", "edit");
  const supabase = await createClient();

  const statuses = show === "open" ? ["todo", "in_progress"] : [show];
  const [{ data: staffRows }, { data: taskRows }] = await Promise.all([
    supabase.from("staff_profiles").select("user_id, staff_code, designation, status").order("staff_code"),
    supabase
      .from("staff_tasks")
      .select("id, title, details, assigned_to, priority, due_date, status, staff_note, completed_at, created_at")
      .in("status", statuses)
      .order(show === "open" ? "due_date" : "updated_at", { ascending: show === "open", nullsFirst: false })
      .limit(300),
  ]);
  const staff = (staffRows ?? []) as { user_id: string; staff_code: string; designation: string | null; status: string }[];
  const { data: names } = staff.length ? await supabase.from("profiles").select("id, full_name").in("id", staff.map((s) => s.user_id)) : { data: [] };
  const nameOf = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((n) => [n.id, n.full_name]));
  const label = (id: string) => {
    const s = staff.find((x) => x.user_id === id);
    return [nameOf.get(id) ?? "Team member", s?.staff_code].filter(Boolean).join(" · ");
  };
  const team: TeamMember[] = staff.filter((s) => s.status === "active").map((s) => ({ userId: s.user_id, label: [label(s.user_id), s.designation].filter(Boolean).join(" · ") }));
  const tasks = (taskRows ?? []) as Task[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <>
      <PageHeader title="Staff Tasks" description="Give work to your team. Each person sees only their own tasks and gets a notification." />
      {canEdit ? (
        <Card className="mb-6 shadow-card">
          <CardHeader>
            <CardTitle>New task</CardTitle>
          </CardHeader>
          <CardContent>
            {team.length ? <TaskAssignForm team={team} /> : <p className="text-sm text-muted-foreground">Add staff accounts first (Users &amp; Roles).</p>}
          </CardContent>
        </Card>
      ) : null}

      <nav aria-label="Filter tasks" className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/admin/tasks" : `/admin/tasks?show=${f.key}`}
            aria-current={show === f.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", show === f.key ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          {tasks.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">No tasks here.</p> : null}
          <ul className="divide-y">
            {tasks.map((t) => {
              const overdue = t.due_date && t.due_date < today && (t.status === "todo" || t.status === "in_progress");
              return (
                <li key={t.id} className="flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-center lg:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words text-deep">
                      {t.title}
                      {t.priority === "high" ? <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{PRIORITY.high.en}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {label(t.assigned_to)} · {TASK_STATUS[t.status].en}
                      {t.due_date ? (
                        <span className={cn("ml-2 inline-flex items-center gap-1", overdue && "font-semibold text-danger")}>
                          <CalendarDays aria-hidden className="size-3" /> {overdue ? "Overdue " : "Due "}
                          {t.due_date}
                        </span>
                      ) : null}
                    </p>
                    {t.staff_note ? <p className="mt-1 text-sm break-words text-muted-foreground">Note: {t.staff_note}</p> : null}
                  </div>
                  {canEdit ? <TaskStatusControl id={t.id} status={t.status} /> : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

export default function StaffTasksPage(props: PageProps<"/admin/tasks">) {
  return (
    <StaffOnly module="staff">
      <TasksContent {...props} />
    </StaffOnly>
  );
}
