"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderOpen,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { findExistingSkus } from "@/features/catalog/bulk-actions";
import { addProductImage, saveProduct } from "@/features/catalog/admin-actions";
import {
  IMPORT_COLUMNS,
  attachImages,
  checkRows,
  groupRows,
  imageKey,
  parseSpecs,
  readCsv,
  readXlsxPackage,
  rowsFromSheet,
  toProductInput,
  type ImportImage,
  type ImportRow,
  type Option,
  type RowCheck,
} from "@/features/catalog/bulk-import";
import { slugify } from "@/features/catalog/schemas";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i;
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };
const MAX_ROWS = 500;
const rupees = (v: string) => (v && Number.isFinite(Number(v)) ? `₹${Number(v).toLocaleString("en-IN")}` : v || "—");

type Result = { status: "done"; productId: string } | { status: "failed"; error: string };

// ---------------------------------------------------------------- Template
async function downloadTemplate(categories: Option[], brands: Option[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "KING DAY";
  const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 30;
  // No cell notes/comments: some spreadsheet apps re-save them in a form Excel readers choke on.
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B0082" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  const cat = categories[0]?.name ?? "Electric Jeeps & Cars";
  const brand = brands[0]?.name ?? "";
  const samples = [
    { name: "SAMPLE Thunder Jeep (delete these rows)", sku: "SAMPLE-JEEP-12-BLU", category: cat, brand, option1Name: "Voltage", option1: "12V", option2Name: "Colour", option2: "Volt Blue", short: "Ride-on jeep with parental remote.", description: "Soft-start motors, LED lights and MP3 music.", mrp: 28999, price: 23499, stock: 5, specs: "Battery: 12V 7Ah; Motor: 2 x 35W; Max load: 30 kg", age: "3–8 years", images: "jeep-12v-blue-1.jpg, jeep-12v-blue-2.jpg", status: "draft" },
    { name: "SAMPLE Thunder Jeep (delete these rows)", sku: "SAMPLE-JEEP-12-GRN", category: cat, brand, option1Name: "Voltage", option1: "12V", option2Name: "Colour", option2: "Dynamic Green", mrp: 28999, price: 23499, stock: 3, images: "jeep-12v-green-1.jpg", status: "draft" },
    { name: "SAMPLE Thunder Jeep (delete these rows)", sku: "SAMPLE-JEEP-24-BLU", category: cat, brand, option1Name: "Voltage", option1: "24V", option2Name: "Colour", option2: "Volt Blue", mrp: 38999, price: 33499, stock: 2, specs: "Battery: 24V 9Ah; Motor: 2 x 45W", images: "jeep-24v-blue-1.jpg", status: "draft" },
    { name: "SAMPLE Comet Scooter (delete this row)", sku: "SAMPLE-COMET-RED", category: cat, brand, colour: "Red", mrp: 2999, price: 2499, stock: 4, status: "draft" },
  ];
  samples.forEach((s) => ws.addRow(s).eachCell((c) => (c.font = { italic: true, color: { argb: "FF7A6F8A" } })));

  // Drop-down lists from the store's real categories and brands.
  const lists = wb.addWorksheet("Lists", { state: "hidden" });
  categories.forEach((c, i) => (lists.getCell(i + 1, 1).value = c.name));
  brands.forEach((b, i) => (lists.getCell(i + 1, 2).value = b.name));
  lists.getCell(1, 3).value = "draft";
  lists.getCell(2, 3).value = "active";
  const col = (k: string) => IMPORT_COLUMNS.findIndex((c) => c.key === k) + 1;
  for (let r = 2; r <= 1000; r++) {
    if (categories.length) ws.getCell(r, col("category")).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$A$1:$A$${categories.length}`] };
    if (brands.length) ws.getCell(r, col("brand")).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$B$1:$B$${brands.length}`] };
    ws.getCell(r, col("status")).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$C$1:$C$2"] };
  }

  const help = wb.addWorksheet("How to use");
  help.getColumn(1).width = 110;
  [
    "KING DAY – Bulk product import",
    "",
    "1. Fill one row per product on the 'Products' sheet. Columns marked * are required.",
    "2. Several variants of the same product: use the same Product Name and Category on each row, with a different SKU.",
    "   Two levels (e.g. Voltage → Colour): fill Main Variant Type + Main Variant, and Sub Variant Type + Sub Variant, one row per combination.",
    "   Each Main Variant can have its own colours (12V: Blue, Green; 24V: Blue only). Each row has its own price, stock, specs and images.",
    "   One level only: just Variant / Colour (simple), or Main Variant Type + Main Variant.",
    "3. Prices are in rupees, numbers only (e.g. 28999). Selling price can't be higher than MRP.",
    "4. Specifications: Name: value; Name: value   (e.g. Battery: 12V 7Ah; Motor: 2 x 35W)",
    "5. Images: list file names in 'Image File Names', or name the files after the SKU (THUNDER-RED.jpg, THUNDER-RED-2.jpg).",
    "   Then upload the images together with this file (as a ZIP, a folder, or selected images).",
    "6. Rows starting with 'SAMPLE' are ignored. Delete them when you're done.",
    "7. Products import as Draft unless Status is 'active'. You review every row before anything is saved.",
    "",
    "Columns:",
    ...IMPORT_COLUMNS.map((c) => `• ${c.header}: ${c.note}`),
  ].forEach((t, i) => {
    help.getCell(i + 1, 1).value = t;
    if (i === 0) help.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF4B0082" } };
  });

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "KING-DAY-product-import-template.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function readWorkbook(file: File, categories: Option[], brands: Option[]) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) {
    throw new Error('This is an old ".xls" file. In Excel choose File → Save As → "Excel Workbook (.xlsx)", then upload that file.');
  }
  if (name.endsWith(".csv")) return rowsFromSheet(readCsv(await file.text()), categories, brands);

  const buf = await file.arrayBuffer();
  const fallback = async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(new Uint8Array(buf), { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
    return rowsFromSheet(readXlsxPackage(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strFromU8(v)]))), categories, brands);
  };

  let main: ReturnType<typeof rowsFromSheet> | null = null;
  let mainError = "";
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Products") ?? wb.worksheets.find((w) => w.state !== "hidden") ?? wb.worksheets[0];
    if (ws) {
      const values: unknown[][] = [];
      for (let r = 1; r <= ws.rowCount; r++) values.push((ws.getRow(r).values as unknown[]).slice(1));
      main = rowsFromSheet(values, categories, brands);
    }
  } catch (e) {
    mainError = e instanceof Error ? e.message : String(e);
  }
  // Files saved by other spreadsheet apps sometimes trip the main reader: read the raw data instead.
  if (!main || main.missingColumns.length || !main.rows.length) {
    try {
      const alt = await fallback();
      if (!main || (!alt.missingColumns.length && alt.rows.length >= main.rows.length)) return alt;
    } catch (e) {
      if (!main) {
        throw new Error(
          `Couldn't read this Excel file (${mainError || (e instanceof Error ? e.message : "unknown error")}). Open it and use File → Save As → "Excel Workbook (.xlsx)" or "CSV", then upload again.`,
        );
      }
    }
  }
  return main!;
}

async function readImages(files: FileList | File[]): Promise<ImportImage[]> {
  const out: ImportImage[] = [];
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) {
      const { unzipSync } = await import("fflate");
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => IMAGE_EXT.test(e.name) && !e.name.includes("__MACOSX") && e.originalSize < 15 * 1024 * 1024 });
      for (const [path, data] of Object.entries(entries)) {
        const name = path.split("/").pop()!;
        const ext = name.split(".").pop()!.toLowerCase();
        const file = new File([data as BlobPart], name, { type: MIME[ext] ?? "image/jpeg" });
        out.push({ name, file, url: URL.createObjectURL(file) });
      }
    } else if (IMAGE_EXT.test(f.name) && f.size < 15 * 1024 * 1024) {
      out.push({ name: f.name, file: f, url: URL.createObjectURL(f) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Component
export function BulkImport({ categories, brands }: { categories: Option[]; brands: Option[] }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [library, setLibrary] = useState<Map<string, ImportImage>>(new Map());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const checks = useMemo(() => checkRows(rows, existing), [rows, existing]);
  const pending = rows.filter((r) => !results.has(r.key) || results.get(r.key)!.status === "failed");
  const ready = pending.filter((r) => !checks.get(r.key)?.errors.length);
  const withErrors = pending.length - ready.length;
  const importing = Boolean(progress && progress.done < progress.total);
  const shown = onlyProblems ? rows.filter((r) => checks.get(r.key)?.errors.length || checks.get(r.key)?.warnings.length) : rows;
  const groupSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groupRows(rows)) for (const r of g) m.set(r.key, g.length);
    return m;
  }, [rows]);

  async function loadExcel(file: File) {
    setBusy("Reading the Excel file…");
    setNotice(null);
    try {
      const { rows: parsed, missingColumns, samplesSkipped } = await readWorkbook(file, categories, brands);
      if (missingColumns.length) {
        throw new Error(`These columns are missing in the first row: ${missingColumns.join(", ")}. Keep the template's header row as it is (row 1) and type products from row 2.`);
      }
      if (!parsed.length) {
        throw new Error(
          samplesSkipped
            ? `Only the ${samplesSkipped} SAMPLE row(s) were found, and they are ignored on purpose. Type your products in new rows, or replace the word "SAMPLE" in the Product Name.`
            : "No products found. Type your products on the 'Products' sheet, starting from row 2.",
        );
      }
      if (parsed.length > MAX_ROWS) throw new Error(`This file has ${parsed.length} rows. Import at most ${MAX_ROWS} at a time.`);
      const res = await findExistingSkus(parsed.map((r) => r.sku));
      if (!res.ok) throw new Error(res.error);
      setExisting(new Set(res.existing));
      setRows(attachImages(parsed, library));
      setResults(new Map());
      setFileName(file.name);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Couldn't read this file. Save it as .xlsx and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function loadImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy("Reading images…");
    try {
      const imgs = await readImages(files);
      urls.current.push(...imgs.map((i) => i.url));
      const next = new Map(library);
      imgs.forEach((i) => next.set(imageKey(i.name), i));
      setLibrary(next);
      setRows((rs) => attachImages(rs, next));
      setNotice({ kind: "info", text: `${imgs.length} image${imgs.length === 1 ? "" : "s"} loaded.` });
    } catch {
      setNotice({ kind: "error", text: "Couldn't read those images. Use JPG, PNG or WebP, or a ZIP of them." });
    } finally {
      setBusy(null);
    }
  }

  const update = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function importAll() {
    const groups = groupRows(ready);
    if (!groups.length) return;
    const skipped = withErrors ? `\n${withErrors} row(s) with errors will be skipped.` : "";
    if (!window.confirm(`Import ${groups.length} product${groups.length === 1 ? "" : "s"} (${ready.length} row${ready.length === 1 ? "" : "s"})?${skipped}\n\nProducts marked Draft stay hidden from customers until you publish them.`)) return;

    // Re-check SKUs right before saving (someone may have added one meanwhile).
    const fresh = await findExistingSkus(ready.map((r) => r.sku));
    if (fresh.ok && fresh.existing.length) {
      setExisting(new Set(fresh.existing));
      setNotice({ kind: "error", text: `${fresh.existing.length} SKU(s) were just added to the store by someone else. Fix those rows and try again.` });
      return;
    }

    setProgress({ done: 0, total: groups.length });
    const storage = createClient().storage.from("product-images");
    for (const [gi, group] of groups.entries()) {
      const mark = (r: Result) => setResults((m) => new Map([...m, ...group.map((row) => [row.key, r] as const)]));
      try {
        let res = await saveProduct(toProductInput(group));
        if (!res.ok && /slug/i.test(res.error)) res = await saveProduct(toProductInput(group, slugify(`${group[0].name} ${group[0].sku}`)));
        if (!res.ok) {
          const field = res.fieldErrors ? Object.values(res.fieldErrors)[0] : "";
          mark({ status: "failed", error: field ? `${res.error} ${field}` : res.error });
        } else {
          const productId = res.data.id;
          // One variant: images are the product's. Several: each row's images are that variant's own gallery.
          const uploads =
            group.length > 1
              ? group.flatMap((r) => r.images.slice(0, 12).map((img) => ({ img, variantSku: r.sku })))
              : [...new Map(group.flatMap((r) => r.images).map((i) => [i.name, i])).values()].slice(0, 12).map((img) => ({ img, variantSku: null as string | null }));
          let imageErrors = 0;
          for (const { img, variantSku } of uploads) {
            try {
              const opt = await optimizeImage(img.file);
              const path = `products/${productId}/${randomFileId()}.${opt.extension}`;
              const up = await storage.upload(path, opt.blob, { contentType: opt.blob.type, cacheControl: "31536000", upsert: false });
              if (up.error) throw up.error;
              const added = await addProductImage({ productId, path, alt: group[0].name, width: opt.width, height: opt.height, variantSku });
              if (!added.ok) {
                await storage.remove([path]);
                throw new Error(added.error);
              }
            } catch {
              imageErrors++;
            }
          }
          // The product is saved either way; image problems are reported, never re-imported.
          mark({ status: "done", productId });
          if (imageErrors) setNotice({ kind: "error", text: `${imageErrors} image(s) for "${group[0].name}" didn't upload. The product was saved; add them in its editor.` });
        }
      } catch {
        mark({ status: "failed", error: "Network error. Try again." });
      }
      setProgress({ done: gi + 1, total: groups.length });
    }
  }

  function reset() {
    if (rows.length && !window.confirm("Clear this import and start again?")) return;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setRows([]);
    setLibrary(new Map());
    setResults(new Map());
    setFileName("");
    setProgress(null);
    setNotice(null);
  }

  const doneCount = [...results.values()].filter((r) => r.status === "done").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Steps 1 & 2 */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-card">
          <p className="flex items-center gap-2 font-heading font-semibold text-deep"><span className="grid size-6 place-items-center rounded-full bg-royal text-xs text-white">1</span> Download template</p>
          <p className="text-sm text-muted-foreground">Excel file with every column, drop-downs for your categories and brands, and sample rows.</p>
          <button type="button" onClick={() => downloadTemplate(categories, brands)} className="mt-auto inline-flex h-10 w-fit items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">
            <Download aria-hidden className="size-4" /> Download Excel template
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-card">
          <p className="flex items-center gap-2 font-heading font-semibold text-deep"><span className="grid size-6 place-items-center rounded-full bg-royal text-xs text-white">2</span> Upload Excel</p>
          <p className="text-sm text-muted-foreground">{fileName ? <>Loaded <b className="text-deep">{fileName}</b> · {rows.length} row{rows.length === 1 ? "" : "s"}</> : "The completed template (.xlsx or .csv)."}</p>
          <label className={cn("mt-auto inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800", (busy || importing) && "pointer-events-none opacity-60")}>
            <FileSpreadsheet aria-hidden className="size-4" /> {fileName ? "Upload another file" : "Upload Excel"}
            <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) loadExcel(f); }} />
          </label>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-card">
          <p className="flex items-center gap-2 font-heading font-semibold text-deep"><span className="grid size-6 place-items-center rounded-full bg-royal text-xs text-white">3</span> Upload images <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
          <p className="text-sm text-muted-foreground">{library.size ? `${library.size} image${library.size === 1 ? "" : "s"} loaded.` : "A ZIP, a folder, or selected images. Matched by file name or SKU."}</p>
          <div className="mt-auto flex flex-wrap gap-2">
            <label className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted", (busy || importing) && "pointer-events-none opacity-60")}>
              <Images aria-hidden className="size-4" /> Images or ZIP
              <input type="file" multiple accept=".zip,image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => { const f = e.target.files; loadImages(f).finally(() => (e.target.value = "")); }} />
            </label>
            <label className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-deep hover:bg-muted", (busy || importing) && "pointer-events-none opacity-60")}>
              <FolderOpen aria-hidden className="size-4" /> Folder
              <input type="file" multiple className="sr-only" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { const f = e.target.files; loadImages(f).finally(() => (e.target.value = "")); }} />
            </label>
          </div>
        </div>
      </section>

      {busy ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden className="size-4 animate-spin" /> {busy}</p> : null}
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 text-sm", notice.kind === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{notice.text}</p>
      ) : null}

      {rows.length ? (
        <>
          {/* Summary + filter */}
          <div className="sticky top-16 z-10 flex flex-col gap-3 rounded-2xl border bg-white/95 p-4 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold text-deep">{groupRows(rows).length} products · {rows.length} rows</span>
              <span className="text-success">{ready.length} ready</span>
              {withErrors ? <span className="text-danger">{withErrors} with errors</span> : null}
              {doneCount ? <span className="text-royal">{doneCount} imported</span> : null}
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-royal" /> Only rows with problems
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={reset} disabled={importing} className="inline-flex h-10 items-center rounded-lg border px-3 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50">Start over</button>
              <button
                type="button"
                onClick={importAll}
                disabled={!ready.length || importing || Boolean(busy)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-bold text-deep hover:bg-gold-300 disabled:opacity-50"
              >
                {importing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Upload aria-hidden className="size-4" />}
                Import all products ({groupRows(ready).length})
              </button>
            </div>
          </div>

          {progress ? (
            <div className="rounded-2xl border bg-white p-4 shadow-card">
              <div className="flex justify-between text-sm"><span className="font-semibold text-deep">{importing ? "Importing…" : "Import finished"}</span><span className="tabular text-muted-foreground">{progress.done} / {progress.total}</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                <div className="h-full rounded-full bg-royal transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              {!importing ? <p className="mt-2 text-sm text-muted-foreground">Imported products are in <Link href="/admin/products?status=draft" className="font-semibold text-royal hover:underline">Products</Link>. Draft products stay hidden until you publish them.</p> : null}
            </div>
          ) : null}

          {/* Rows */}
          <ul className="flex flex-col gap-3">
            {shown.map((r) => {
              const c = checks.get(r.key) ?? { errors: [], warnings: [] };
              const res = results.get(r.key);
              const locked = res?.status === "done" || importing;
              return (
                <li key={r.key} className={cn("rounded-2xl border bg-white shadow-card", c.errors.length && !res ? "border-danger/40" : res?.status === "done" ? "border-success/40" : "")}>
                  <RowSummary row={r} check={c} result={res} grouped={(groupSize.get(r.key) ?? 1) > 1} locked={locked} onEdit={() => setEditing(editing === r.key ? null : r.key)} onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
                  {editing === r.key && !locked ? (
                    <RowEditor row={r} categories={categories} brands={brands} library={library} onChange={(p) => update(r.key, p)} onClose={() => setEditing(null)} onAddImages={async (files) => {
                      const imgs = await readImages(files);
                      urls.current.push(...imgs.map((i) => i.url));
                      update(r.key, { images: [...r.images, ...imgs].slice(0, 12) });
                    }} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function RowSummary({ row: r, check: c, result, grouped, locked, onEdit, onRemove }: { row: ImportRow; check: RowCheck; result?: Result; grouped: boolean; locked: boolean; onEdit: () => void; onRemove: () => void }) {
  const specs = parseSpecs(r.specs);
  return (
    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start">
      <div className="flex items-start gap-3 lg:w-80 lg:shrink-0">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border bg-muted">
          {r.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview before upload
            <img src={r.images[0].url} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground"><ImagePlus aria-hidden className="size-5" /></span>
          )}
          {r.images.length > 1 ? <span className="absolute right-0.5 bottom-0.5 rounded bg-deep/80 px-1 text-[0.6rem] font-bold text-white">+{r.images.length - 1}</span> : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Row {r.rowNumber}{grouped ? " · variant of a grouped product" : ""}</p>
          <p className="line-clamp-2 font-semibold text-deep">{r.name || <span className="text-danger">No name</span>}</p>
          <p className="font-mono text-xs text-royal">{r.sku || "—"}</p>
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
        {[
          ["Category", categoriesLabel(r)],
          ["Brand", r.brandId ? r.brandText : r.brandText ? `${r.brandText} (not found)` : "—"],
          ["Variant", [r.option1Name && r.option1 ? `${r.option1Name}: ${r.option1}` : "", r.option2Name && r.option2 ? `${r.option2Name}: ${r.option2}` : ""].filter(Boolean).join(" · ") || r.option1 || r.option2 || r.colour || "—"],
          ["Status", r.status === "active" ? "Active" : "Draft"],
          ["MRP", rupees(r.mrp)],
          ["Selling price", rupees(r.price)],
          ["Stock", r.stock || "0"],
          ["Specifications", specs.length ? `${specs.length} item${specs.length === 1 ? "" : "s"}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate text-deep">{v}</dd>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs text-muted-foreground">Description</dt>
          <dd className="line-clamp-2 text-deep/80">{r.short || r.description || "—"}</dd>
        </div>
        {c.errors.length || c.warnings.length || result ? (
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
            {result?.status === "done" ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 aria-hidden className="size-4" /> Imported · <Link href={`/admin/products/${result.productId}`} className="underline">open</Link></p>
            ) : null}
            {result?.status === "failed" ? <p className="flex items-start gap-1.5 text-sm text-danger"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {result.error}</p> : null}
            {!result || result.status === "failed"
              ? c.errors.map((e) => <p key={e} className="flex items-start gap-1.5 text-sm text-danger"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {e}</p>)
              : null}
            {!result ? c.warnings.map((w) => <p key={w} className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {w}</p>) : null}
          </div>
        ) : null}
      </dl>
      {!locked ? (
        <div className="flex gap-2 lg:flex-col">
          <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-deep hover:bg-muted"><Pencil aria-hidden className="size-4" /> Edit</button>
          <button type="button" onClick={onRemove} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-danger hover:bg-danger-soft"><Trash2 aria-hidden className="size-4" /> Remove</button>
        </div>
      ) : null}
    </div>
  );
}

const categoriesLabel = (r: ImportRow) => (r.categoryId ? r.categoryText : r.categoryText ? `${r.categoryText} (not found)` : "—");

function RowEditor({
  row: r,
  categories,
  brands,
  library,
  onChange,
  onClose,
  onAddImages,
}: {
  row: ImportRow;
  categories: Option[];
  brands: Option[];
  library: Map<string, ImportImage>;
  onChange: (p: Partial<ImportRow>) => void;
  onClose: () => void;
  onAddImages: (files: FileList) => Promise<void>;
}) {
  const field = (label: string, key: "name" | "sku" | "colour" | "option1" | "option2" | "mrp" | "price" | "stock" | "age", extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="flex flex-col gap-1 text-sm font-medium text-deep">
      {label}
      <input
        value={r[key]}
        onChange={(e) => onChange({ [key]: key === "sku" ? e.target.value.toUpperCase().replace(/\s+/g, "") : e.target.value } as Partial<ImportRow>)}
        className={inputClass}
        {...extra}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-4 border-t bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">{field("Product name", "name", { maxLength: 160 })}</div>
        {field("SKU", "sku", { maxLength: 40 })}
        {r.option1Name ? field(r.option1Name, "option1", { maxLength: 60 }) : field("Variant / Colour", "colour", { maxLength: 40 })}
        {r.option2Name ? field(r.option2Name, "option2", { maxLength: 60 }) : null}
        <label className="flex flex-col gap-1 text-sm font-medium text-deep">
          Category
          <select value={r.categoryId} onChange={(e) => onChange({ categoryId: e.target.value, categoryText: categories.find((c) => c.id === e.target.value)?.name ?? "" })} className={inputClass}>
            <option value="">Choose…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-deep">
          Brand
          <select value={r.brandId} onChange={(e) => onChange({ brandId: e.target.value, brandText: brands.find((b) => b.id === e.target.value)?.name ?? "" })} className={inputClass}>
            <option value="">None</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {field("MRP (₹)", "mrp", { inputMode: "decimal" })}
        {field("Selling price (₹)", "price", { inputMode: "decimal" })}
        {field("Stock", "stock", { inputMode: "numeric" })}
        {field("Age range", "age", { maxLength: 40 })}
        <label className="flex flex-col gap-1 text-sm font-medium text-deep">
          Status
          <select value={r.status} onChange={(e) => onChange({ status: e.target.value as "draft" | "active" })} className={inputClass}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Active (visible)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-deep sm:col-span-2 lg:col-span-4">
          Short description
          <input value={r.short} onChange={(e) => onChange({ short: e.target.value })} maxLength={300} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-deep sm:col-span-2">
          Description
          <textarea value={r.description} onChange={(e) => onChange({ description: e.target.value })} rows={4} maxLength={10000} className={cn(inputClass, "h-auto py-2")} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-deep sm:col-span-2">
          Specifications <span className="text-xs font-normal text-muted-foreground">Name: value; Name: value</span>
          <textarea value={r.specs} onChange={(e) => onChange({ specs: e.target.value })} rows={4} className={cn(inputClass, "h-auto py-2")} />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-deep">Images ({r.images.length}/12)</p>
        <div className="flex flex-wrap gap-2">
          {r.images.map((img, i) => (
            <div key={`${img.name}-${i}`} className="relative size-20 overflow-hidden rounded-xl border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
              <img src={img.url} alt={img.name} className="size-full object-cover" />
              <button type="button" onClick={() => onChange({ images: r.images.filter((_, j) => j !== i) })} aria-label={`Remove ${img.name}`} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-deep/70 text-white"><X className="size-3.5" /></button>
              {i === 0 ? <span className="absolute bottom-0 left-0 rounded-tr bg-royal px-1 text-[0.6rem] font-bold text-white">Main</span> : null}
            </div>
          ))}
          {r.images.length < 12 ? (
            <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed text-muted-foreground hover:border-royal-300 hover:text-royal">
              <ImagePlus aria-hidden className="size-6" />
              <span className="sr-only">Add images</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => { const f = e.target.files; if (f?.length) onAddImages(f).finally(() => (e.target.value = "")); }} />
            </label>
          ) : null}
        </div>
        {library.size ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-royal">Pick from uploaded images ({library.size})</summary>
            <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
              {[...library.values()].map((img) => (
                <button key={img.name} type="button" onClick={() => !r.images.some((x) => x.name === img.name) && r.images.length < 12 && onChange({ images: [...r.images, img] })} className="relative size-14 overflow-hidden rounded-lg border" title={img.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={img.url} alt={img.name} className="size-full object-cover" />
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <button type="button" onClick={onClose} className="inline-flex h-10 w-fit items-center rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">Done</button>
    </div>
  );
}

