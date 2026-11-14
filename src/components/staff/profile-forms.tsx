"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { FormNotice } from "@/components/forms/action-form";
import { addStaffDocumentAction, deleteStaffDocumentAction, saveEmploymentAction, savePersonalDetailsAction, setStaffPhotoAction } from "@/features/staff/actions";
import type { FormState } from "@/features/forms";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const EMPLOYMENT = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["probation", "Probation"],
  ["intern", "Intern"],
] as const;

function Field({ name, label, error, className, children }: { name: string; label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={`p-${name}`} className="text-sm font-medium text-deep">{label}</label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export type PersonalValues = {
  userId: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  bloodGroup: string;
};

/** Personal details. `self` = the signed-in person's own record (name/phone editable). */
export function PersonalDetailsForm({ values, self }: { values: PersonalValues; self: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePersonalDetailsAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="userId" value={values.userId} />
      {self ? (
        <>
          <Field name="fullName" label="Full name" error={fe.fullName}>
            <input id="p-fullName" name="fullName" defaultValue={values.fullName} maxLength={120} required className={inputClass} />
          </Field>
          <Field name="phone" label="Phone" error={fe.phone}>
            <input id="p-phone" name="phone" type="tel" inputMode="tel" defaultValue={values.phone} maxLength={20} className={inputClass} />
          </Field>
        </>
      ) : (
        <input type="hidden" name="fullName" value={values.fullName || "Staff member"} />
      )}
      <Field name="dateOfBirth" label="Date of birth" error={fe.dateOfBirth}>
        <input id="p-dateOfBirth" name="dateOfBirth" type="date" defaultValue={values.dateOfBirth} className={inputClass} />
      </Field>
      <Field name="bloodGroup" label="Blood group">
        <select id="p-bloodGroup" name="bloodGroup" defaultValue={values.bloodGroup} className={inputClass}>
          <option value="">Not set</option>
          {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field name="address" label="Address" error={fe.address} className="sm:col-span-2">
        <textarea id="p-address" name="address" defaultValue={values.address} rows={3} maxLength={400} className={cn(inputClass, "h-auto py-2")} />
      </Field>
      <p className="text-sm font-semibold text-deep sm:col-span-2">Emergency contact</p>
      <Field name="emergencyName" label="Name">
        <input id="p-emergencyName" name="emergencyName" defaultValue={values.emergencyName} maxLength={120} className={inputClass} />
      </Field>
      <Field name="emergencyRelation" label="Relation">
        <input id="p-emergencyRelation" name="emergencyRelation" defaultValue={values.emergencyRelation} maxLength={60} placeholder="e.g. Father" className={inputClass} />
      </Field>
      <Field name="emergencyPhone" label="Phone" error={fe.emergencyPhone}>
        <input id="p-emergencyPhone" name="emergencyPhone" type="tel" inputMode="tel" defaultValue={values.emergencyPhone} maxLength={20} className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit pending={pending}>Save details</Submit>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function StaffPhoto({ userId, url, name, editable }: { userId: string; url: string | null; name: string; editable: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const img = await optimizeImage(file, 640);
      const path = `${userId}/photo-${randomFileId()}.${img.extension}`;
      const { error: upErr } = await createClient().storage.from("staff-files").upload(path, img.blob, { contentType: img.blob.type, upsert: false });
      if (upErr) throw new Error("Upload failed. Please try again.");
      const res = await setStaffPhotoAction({ userId, path });
      if (!res.ok) throw new Error(res.error ?? "Couldn't save the photo.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-royal-50 font-heading text-2xl font-bold text-royal">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL, not optimisable
          <img src={url} alt={`Photo of ${name}`} className="size-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase() || "?"
        )}
      </div>
      {editable ? (
        <div className="flex flex-col gap-1">
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id={`photo-${userId}`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <label htmlFor={`photo-${userId}`} className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted">
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Camera aria-hidden className="size-4" />} {url ? "Change photo" : "Add photo"}
          </label>
          {error ? <p role="alert" className="text-xs text-danger">{error}</p> : <p className="text-xs text-muted-foreground">JPG, PNG or WebP.</p>}
        </div>
      ) : null}
    </div>
  );
}

export type EmploymentValues = { userId: string; department: string; designation: string; employmentType: string; joiningDate: string };

export function EmploymentForm({ values }: { values: EmploymentValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEmploymentAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="userId" value={values.userId} />
      <Field name="department" label="Department">
        <input id="p-department" name="department" defaultValue={values.department} maxLength={80} placeholder="e.g. Sales" className={inputClass} />
      </Field>
      <Field name="designation" label="Designation">
        <input id="p-designation" name="designation" defaultValue={values.designation} maxLength={80} className={inputClass} />
      </Field>
      <Field name="employmentType" label="Employment type">
        <select id="p-employmentType" name="employmentType" defaultValue={values.employmentType} className={inputClass}>
          {EMPLOYMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field name="joiningDate" label="Joining date" error={fe.joiningDate}>
        <input id="p-joiningDate" name="joiningDate" type="date" defaultValue={values.joiningDate} className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit pending={pending}>Save employment</Submit>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

type Doc = { id: string; title: string; url: string | null; createdAt: string };

export function DocumentList({ docs, userId, manage }: { docs: Doc[]; userId: string; manage: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delState, del, deleting] = useActionState<FormState, FormData>(deleteStaffDocumentAction, {});

  async function upload(file: File) {
    if (title.trim().length < 2) {
      setError("Type the document name first (e.g. Aadhaar, Offer letter).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Files must be 10 MB or smaller.");
      return;
    }
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/jpeg" ? "jpg" : null;
    if (!ext) {
      setError("Use a PDF, JPG, PNG or WebP file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const path = `${userId}/docs/${randomFileId()}.${ext}`;
      const { error: upErr } = await createClient().storage.from("staff-files").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error("Upload failed. Please try again.");
      const res = await addStaffDocumentAction({ userId, title: title.trim(), path, sizeBytes: file.size });
      if (!res.ok) throw new Error(res.error ?? "Couldn't save the document.");
      setTitle("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> : null}
      <ul className="divide-y rounded-xl border">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            <FileText aria-hidden className="size-5 shrink-0 text-royal" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-deep">{d.title}</span>
              <span className="block text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            </span>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-royal hover:underline">Open</a>
            ) : null}
            {manage ? (
              <form action={del} onSubmit={(e) => { if (!window.confirm(`Delete “${d.title}”?`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" disabled={deleting} aria-label={`Delete ${d.title}`} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-danger-soft">
                  <Trash2 className="size-4" />
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {manage ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field name="docTitle" label="Document name">
            <input id="p-docTitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Aadhaar card" className={cn(inputClass, "w-60")} />
          </Field>
          <input ref={ref} id={`doc-${userId}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <label htmlFor={`doc-${userId}`} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted">
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Upload aria-hidden className="size-4" />} Upload file
          </label>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : <FormNotice state={delState} />}
    </div>
  );
}
