import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { DocumentList, EmploymentForm, PersonalDetailsForm, StaffPhoto } from "@/components/staff/profile-forms";
import { Card, CardContent } from "@/components/ui/card";
import { can, getCurrentUser } from "@/features/auth/session";
import { employmentLabel, getStaffRecord } from "@/features/staff/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Staff profile" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold text-deep">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

async function StaffProfileContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await getCurrentUser();
  const r = await getStaffRecord(id);
  if (!r || !r.staffCode) notFound();
  const editable = can(me, "staff", "edit");
  const name = r.fullName ?? "Staff member";
  const p = r.personal;

  return (
    <>
      <Link href="/admin/staff" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Staff Management
      </Link>
      <PageHeader
        title={name}
        description={[r.staffCode, r.categoryName, r.status === "inactive" ? "Inactive" : null].filter(Boolean).join(" · ")}
        actions={can(me, "users") ? <Link href={`/admin/users/${id}`} className="inline-flex h-10 items-center rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">Account &amp; access</Link> : null}
      />
      <div className="flex flex-col gap-6">
        <Section title="Photo">
          <StaffPhoto userId={id} url={p.photoUrl} name={name} editable={editable} />
        </Section>

        <Section title="Employment">
          {editable ? (
            <EmploymentForm values={{ userId: id, department: r.department ?? "", designation: r.designation ?? "", employmentType: r.employmentType, joiningDate: r.joiningDate ?? "" }} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {[r.designation, r.department, employmentLabel(r.employmentType), r.joiningDate ? `Joined ${formatDate(new Date(r.joiningDate))}` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </Section>

        <Section title="Personal details">
          {editable ? (
            <PersonalDetailsForm
              self={me?.id === id}
              values={{
                userId: id,
                fullName: r.fullName ?? "",
                phone: r.phone ?? "",
                dateOfBirth: p.dateOfBirth ?? "",
                address: p.address ?? "",
                emergencyName: p.emergencyName ?? "",
                emergencyRelation: p.emergencyRelation ?? "",
                emergencyPhone: p.emergencyPhone ?? "",
                bloodGroup: p.bloodGroup ?? "",
              }}
            />
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[["Phone", r.phone], ["Date of birth", p.dateOfBirth], ["Blood group", p.bloodGroup], ["Address", p.address], ["Emergency contact", [p.emergencyName, p.emergencyRelation, p.emergencyPhone].filter(Boolean).join(" · ")]].map(([k, v]) => (
                <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium text-deep">{v || "—"}</dd></div>
              ))}
            </dl>
          )}
          {!editable || me?.id === id ? null : <p className="text-xs text-muted-foreground">Name and phone are changed by the staff member (or in Users &amp; Roles).</p>}
        </Section>

        <Section title="Documents">
          <DocumentList docs={r.documents} userId={id} manage={editable} />
        </Section>
      </div>
    </>
  );
}

export default function StaffProfilePage(props: PageProps<"/admin/staff/[id]">) {
  return (
    <StaffOnly module="staff">
      <StaffProfileContent params={props.params} />
    </StaffOnly>
  );
}
