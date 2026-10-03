"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { PageHeader, Card, Button, Badge } from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { ErrorPanel, InlineNotice, Spinner } from "@/components/states";
import { useShops } from "@/components/shop-provider";
import { asApiError } from "@/lib/api/client";
import {
  exportProductsCsv,
  importProducts,
  importTemplateCsv,
  type ImportReportWire,
} from "@/lib/api/products";
import { num } from "@/lib/format";

/**
 * Bulk import, in the two steps the API insists on.
 *
 * `POST /seller/shops/:shopId/products/import` defaults to a **dry run**: it
 * parses, validates and matches against the shop's existing products, and writes
 * nothing. Only a second call with `apply=true` writes, and one bad row fails the
 * whole file either way. So the screen is a two-button flow rather than a drop
 * zone — check, read the report, then apply — and the apply button does not exist
 * until a check has come back clean.
 *
 * The export sits on the same page on purpose. The file the exporter writes is
 * exactly the file the importer reads, so the working loop for a shopkeeper with
 * two hundred lines is: download, edit in Excel, upload. A seller starting from
 * nothing gets the template instead, which is the same headers with one row
 * filled in.
 *
 * One shop at a time: the import is scoped to a shop id, and there is no sensible
 * reading of "import into all shops". The consolidated view says so rather than
 * silently picking one.
 */

export default function ImportPage() {
  return (
    <PermissionGate perm="catalog.import">
      <ImportScreen />
    </PermissionGate>
  );
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ImportScreen() {
  const { activeShop, shops, switchShop } = useShops();

  const [file, setFile] = React.useState<File | null>(null);
  const [report, setReport] = React.useState<ImportReportWire | null>(null);
  const [busy, setBusy] = React.useState<null | "check" | "apply" | "export" | "template">(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const shopId = activeShop?.id ?? null;

  // A new file invalidates the old report — otherwise the apply button would
  // write the previous file's plan.
  const chooseFile = (next: File | null) => {
    setFile(next);
    setReport(null);
    setError(null);
  };

  const run = async (apply: boolean) => {
    if (!shopId || !file) return;
    setBusy(apply ? "apply" : "check");
    setError(null);
    try {
      const result = await importProducts(shopId, file, apply);
      setReport(result);
      if (result.applied) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (err) {
      setError(asApiError(err));
      setReport(null);
    } finally {
      setBusy(null);
    }
  };

  const grab = async (kind: "export" | "template") => {
    if (!shopId) return;
    setBusy(kind);
    setError(null);
    try {
      const { url, revoke } =
        kind === "export" ? await exportProductsCsv(shopId) : await importTemplateCsv(shopId);
      const date = new Date().toISOString().slice(0, 10);
      download(
        url,
        kind === "export" ? `gopasal-catalogue-${date}.csv` : "gopasal-catalogue-template.csv",
      );
      // The object URL is only needed for the duration of the click.
      setTimeout(revoke, 10_000);
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(null);
    }
  };

  // Applying needs a clean *plan* and the file it was made from. After a
  // successful apply the report stays on screen as the receipt, but the button
  // goes: pressing it again would re-send a file the seller has already used.
  const clean = report !== null && report.errors.length === 0 && !report.applied && file !== null;
  const changes = report
    ? report.productsCreated + report.productsUpdated + report.variantsCreated + report.variantsUpdated
    : 0;

  return (
    <div>
      <a
        href="/catalog"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </a>
      <PageHeader
        icon={<FileSpreadsheet className="h-5 w-5" />}
        title="Import products"
        subtitle="Upload a spreadsheet of your shelf, or download the one you already have."
      />

      {!shopId ? (
        <Reveal>
          <Card className="mx-auto max-w-2xl p-6">
            <h2 className="text-lg font-semibold text-ink-900">Pick one shop first</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              An import writes into one shop&rsquo;s catalogue. You&rsquo;re looking at all{" "}
              {num(shops.length)} of them at once, and there&rsquo;s no sensible way to spread one
              spreadsheet across them.
            </p>
            {shops.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {shops.map((shop) => (
                  <Button key={shop.id} variant="outline" onClick={() => switchShop(shop.id)}>
                    {shop.name}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <Reveal>
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-ink-900">1 · Start from a file</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                The export and the import are the same shape, so the usual route is to download
                your catalogue, edit it in Excel and upload it again. Rows with an{" "}
                <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">id</code> update that
                product; rows without one create a new product, matching on name if it already
                exists. One row per size, with the product&rsquo;s own columns repeated.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => grab("export")} disabled={busy !== null}>
                  {busy === "export" ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  Download my catalogue
                </Button>
                <Button variant="ghost" onClick={() => grab("template")} disabled={busy !== null}>
                  {busy === "template" ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Empty template
                </Button>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={1}>
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-ink-900">2 · Check it</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Nothing is written until you say so. This reads the file, checks every row against
                your shop and tells you what would change.
              </p>

              <label
                className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-4 py-8 text-center hover:border-crimson-300 hover:bg-crimson-50/40"
                htmlFor="import-file"
              >
                <Upload className="h-6 w-6 text-ink-400" />
                <span className="text-sm font-medium text-ink-800">
                  {file ? file.name : "Choose a CSV file"}
                </span>
                <span className="text-xs text-ink-500">
                  {file
                    ? `${num(Math.max(1, Math.round(file.size / 1024)))} KB · click to choose another`
                    : "Saved from Excel as CSV UTF-8"}
                </span>
                <input
                  id="import-file"
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={() => run(false)} disabled={!file || busy !== null}>
                  {busy === "check" ? <Spinner className="h-4 w-4" /> : null}
                  Check the file
                </Button>
                {clean && changes > 0 && (
                  <Button variant="subtle" onClick={() => run(true)} disabled={busy !== null}>
                    {busy === "apply" ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    Apply {num(changes)} {changes === 1 ? "change" : "changes"}
                  </Button>
                )}
              </div>
            </Card>
          </Reveal>

          {error && (
            <Reveal delay={2}>
              <ErrorPanel
                message={error.message}
                offline={error.offline}
                onRetry={file ? () => void run(false) : undefined}
              />
            </Reveal>
          )}

          {report && (
            <Reveal delay={2}>
              <Card className="p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-ink-900">
                    {report.applied
                      ? "Imported"
                      : report.errors.length > 0
                        ? "Not imported"
                        : "Ready to apply"}
                  </h2>
                  <Badge tone={report.applied ? "green" : report.errors.length > 0 ? "red" : "ink"}>
                    {num(report.rows)} {report.rows === 1 ? "row" : "rows"} read
                  </Badge>
                </div>

{/* Counts describe a plan. On a file that failed there is no plan, and
                    "New products: 1" next to "nothing was imported" reads as a
                    contradiction — so the figures only appear when they mean
                    something. */}
                {report.errors.length === 0 && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Figure label="New products" value={report.productsCreated} />
                    <Figure label="Updated" value={report.productsUpdated} />
                    <Figure label="New sizes" value={report.variantsCreated} />
                    <Figure label="Sizes updated" value={report.variantsUpdated} />
                  </dl>
                )}

                {report.errors.length > 0 && (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#c02636]">
                      <AlertTriangle className="h-4 w-4" />
                      {num(report.errors.length)}{" "}
                      {report.errors.length === 1 ? "problem" : "problems"} — nothing was imported
                    </div>
                    <ul className="mt-2 divide-y divide-ink-100 rounded-lg border border-red-100 bg-red-50/50">
                      {report.errors.map((issue, i) => (
                        <li key={`${issue.line}-${i}`} className="flex gap-3 px-3 py-2 text-sm">
                          <span className="shrink-0 font-mono text-xs text-ink-500">
                            line {issue.line}
                          </span>
                          <span className="text-ink-700">{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-ink-500">
                      Line numbers are the ones your spreadsheet shows, header included. Fix them
                      and upload the file again.
                    </p>
                  </div>
                )}

                {report.errors.length === 0 && report.preview.length > 0 && (
                  <div className="mt-5">
                    <div className="text-sm font-semibold text-ink-800">
                      {report.applied ? "What went in" : "What would change"}
                    </div>
                    <ul className="mt-2 divide-y divide-ink-100 rounded-lg border border-ink-100">
                      {report.preview.map((row) => (
                        <li
                          key={`${row.line}-${row.name}`}
                          className="flex items-center gap-3 px-3 py-2 text-sm"
                        >
                          <Badge tone={row.action === "create" ? "green" : "ink"}>
                            {row.action === "create" ? "new" : "update"}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-ink-800">{row.name}</span>
                          <span className="shrink-0 text-xs text-ink-500">{row.detail}</span>
                        </li>
                      ))}
                    </ul>
                    {report.preview.length <
                      report.productsCreated + report.productsUpdated && (
                      <p className="mt-2 text-xs text-ink-500">
                        Showing the first {num(report.preview.length)} of{" "}
                        {num(report.productsCreated + report.productsUpdated)} products.
                      </p>
                    )}
                  </div>
                )}

                {report.applied && (
                  <div className="mt-5">
                    <Button href="/catalog">See the catalogue</Button>
                  </div>
                )}
              </Card>
            </Reveal>
          )}

          <Reveal delay={3}>
            <InlineNotice message="An import is all or nothing: if any row is wrong, none of them go in. That is deliberate — a catalogue half-rewritten from a spreadsheet is very hard to undo." />
          </Reveal>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-3 py-2">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-900">{num(value)}</dd>
    </div>
  );
}
