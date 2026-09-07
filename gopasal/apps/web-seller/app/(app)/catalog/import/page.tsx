"use client";

import { ArrowLeft, FileSpreadsheet, Plus } from "lucide-react";
import { PageHeader, Card, Button } from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { InlineNotice } from "@/components/states";

/**
 * Bulk import: a permission with no pipeline behind it.
 *
 * `catalog.import` is a real key in the RBAC catalogue, so sellers who hold it
 * can still reach this route and deserve an answer rather than a 403. The answer
 * is that the API has no bulk route: `CatalogSellerController` exposes product
 * create/update/delete and variant create/update/delete one row at a time, and
 * nothing anywhere in the service parses a spreadsheet.
 *
 * This screen therefore does not:
 *
 * - accept a file, because nothing would receive it;
 * - offer a template, because a template implies something consumes it;
 * - show a parsed preview or an import summary, because both would be invented.
 *
 * When the endpoint lands, the wizard belongs here — upload, server-side parse,
 * server-reported per-row results. Until then the honest path is the one link
 * that does work.
 */

export default function ImportPage() {
  return (
    <PermissionGate perm="catalog.import">
      <ImportUnavailable />
    </PermissionGate>
  );
}

function ImportUnavailable() {
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
        subtitle="Bulk import isn’t available yet."
      />

      <Reveal>
        <Card className="mx-auto max-w-2xl p-6">
          <h2 className="text-lg font-semibold text-ink-900">
            There’s no spreadsheet import behind this screen yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Your account has permission to import products, but GoPasal doesn’t have a bulk import
            service running yet. Products are added one at a time for now — each one with its own
            price, unit and variants.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            We’d rather tell you this than take a file and quietly drop it. When bulk import is
            ready, this page is where it will appear, and you’ll be able to see exactly which rows
            went through and which didn’t.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button href="/catalog/new">
              <Plus className="h-4 w-4" /> Add a product
            </Button>
            <Button href="/catalog" variant="outline">
              View products
            </Button>
          </div>
        </Card>
      </Reveal>

      <Reveal delay={1}>
        <div className="mx-auto mt-4 max-w-2xl">
          <InlineNotice message="Adding many products by hand is slow, and we know it. If a large catalog is holding you back, tell your GoPasal contact — it helps us prioritise this." />
        </div>
      </Reveal>
    </div>
  );
}
