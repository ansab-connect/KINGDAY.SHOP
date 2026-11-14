import type { Metadata } from "next";
import { Suspense } from "react";
import { L } from "@/components/i18n/lang";
import { DocumentList, PersonalDetailsForm, StaffPhoto } from "@/components/staff/profile-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { employmentLabel, getStaffRecord } from "@/features/staff/queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "My profile" };

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 font-heading text-lg font-semibold text-deep">{title}</h2>
      {children}
    </section>
  );
}

async function Profile() {
  const user = await requireTeam();
  const r = await getStaffRecord(user.id, user.email);
  if (!r) return <p className="text-sm text-muted-foreground">Profile not found.</p>;
  const name = r.fullName ?? user.email ?? "Staff";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <StaffPhoto userId={r.userId} url={r.personal.photoUrl} name={name} editable />
        <div className="sm:text-right">
          <h1 className="text-2xl font-bold text-deep">{name}</h1>
          <p className="text-sm text-muted-foreground">{r.email}</p>
        </div>
      </div>

      <Card title={<L en="Employment" ml="ജോലി വിവരങ്ങൾ" />}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ["Staff ID", r.staffCode ?? "—"],
            ["Category", r.categoryName ?? "—"],
            ["Designation", r.designation ?? "—"],
            ["Department", r.department ?? "—"],
            ["Employment type", employmentLabel(r.employmentType)],
            ["Joining date", r.joiningDate ? formatDate(new Date(r.joiningDate)) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium text-deep">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          <L en="Employment details are managed by the office. Ask an admin to correct them." ml="ജോലി വിവരങ്ങൾ ഓഫീസ് ആണ് മാറ്റുന്നത്." />
        </p>
      </Card>

      <Card title={<L en="Personal details" ml="വ്യക്തിഗത വിവരങ്ങൾ" />}>
        <PersonalDetailsForm
          self
          values={{
            userId: r.userId,
            fullName: r.fullName ?? "",
            phone: r.phone ?? "",
            dateOfBirth: r.personal.dateOfBirth ?? "",
            address: r.personal.address ?? "",
            emergencyName: r.personal.emergencyName ?? "",
            emergencyRelation: r.personal.emergencyRelation ?? "",
            emergencyPhone: r.personal.emergencyPhone ?? "",
            bloodGroup: r.personal.bloodGroup ?? "",
          }}
        />
      </Card>

      <Card title={<L en="My documents" ml="എന്റെ രേഖകൾ" />}>
        <DocumentList docs={r.documents} userId={r.userId} manage={false} />
      </Card>
    </div>
  );
}

export default function StaffProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <Profile />
    </Suspense>
  );
}
