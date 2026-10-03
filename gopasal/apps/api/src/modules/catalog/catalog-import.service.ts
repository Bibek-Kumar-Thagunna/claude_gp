import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import { parseCsv, toCsv } from './csv';
import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_TAG_LIMIT,
  PRODUCT_TAG_MAX_LENGTH,
  PRODUCT_UNIT_MAX_LENGTH,
  VARIANT_SKU_MAX_LENGTH,
} from './dto/catalog.dto';

/**
 * The catalogue as a spreadsheet.
 *
 * A kirana with two hundred lines is not going to type them into a web form,
 * and the shopkeeper who agrees to try GoPasal on a Tuesday has their stock in
 * a book or in somebody's Excel file. This is the route from there to a live
 * shelf, and back again — the export is the same shape as the import, so the
 * working loop is: export, edit in Excel, import.
 *
 * Three decisions worth stating, because they are what make a bulk tool safe to
 * hand to somebody who is not a programmer:
 *
 *  - **A dry run first.** The console always asks for the report before it asks
 *    to apply, so the seller sees "14 new, 3 updated, 2 errors" against their own
 *    product names before anything changes.
 *  - **All or nothing.** One bad row fails the whole file. A half-applied import
 *    leaves a catalogue nobody can reason about, and "which of my 200 rows went
 *    in?" is a worse question than "fix line 43 and try again".
 *  - **Names, not ids.** A seller's spreadsheet has product names in it. The `id`
 *    column exists because the export writes it and round-tripping should update
 *    rather than duplicate, but a file typed from scratch works without it.
 */

/** What a row can say. Anything else in the header is ignored, not an error. */
export const IMPORT_COLUMNS = [
  'id',
  'name',
  'name_np',
  'description',
  'category',
  'unit',
  'price',
  'mrp',
  'track_stock',
  'stock',
  'tags',
  'active',
  'variant',
  'variant_sku',
  'variant_price',
  'variant_mrp',
  'variant_stock',
] as const;

/** A spreadsheet bigger than this is a data migration, not a catalogue edit. */
export const IMPORT_ROW_LIMIT = 2000;
const PREVIEW_LIMIT = 25;

export interface ImportIssue {
  /** 1-based line in the file, header included, so it matches what Excel shows. */
  line: number;
  message: string;
}

export interface ImportPreviewRow {
  line: number;
  action: 'create' | 'update';
  name: string;
  detail: string;
}

export interface ImportReport {
  dryRun: boolean;
  /** Data rows read, blank lines excluded. */
  rows: number;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  errors: ImportIssue[];
  /** What the change would look like — the first few, for a preview table. */
  preview: ImportPreviewRow[];
  /** True only when rows were actually written. */
  applied: boolean;
}

type PlannedVariant = {
  line: number;
  id?: string;
  name: string;
  sku?: string | null;
  price: number;
  mrp?: number | null;
  stock: number;
};

type PlannedProduct = {
  line: number;
  id?: string;
  name: string;
  nameNp?: string | null;
  description?: string | null;
  categoryId?: string | null;
  unit?: string;
  price: number;
  mrp?: number | null;
  trackStock?: boolean;
  stock?: number;
  tags?: string[];
  isActive?: boolean;
  variants: PlannedVariant[];
};

function parseMoney(raw: string, field: string, line: number, errors: ImportIssue[]): number | null {
  const cleaned = raw.replace(/[, ]/g, '').replace(/^(रु|Rs\.?|NPR)/i, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    errors.push({
      line,
      message: `${field} must be a whole number of rupees — got "${raw}"`,
    });
    return null;
  }
  if (value > 10_000_000) {
    errors.push({ line, message: `${field} of रु ${value} looks like a typo` });
    return null;
  }
  return value;
}

function parseCount(raw: string, field: string, line: number, errors: ImportIssue[]): number | null {
  if (raw === '') return null;
  const value = Number(raw.replace(/[, ]/g, ''));
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    errors.push({ line, message: `${field} must be a whole number — got "${raw}"` });
    return null;
  }
  return value;
}

/**
 * Yes, no, true, false, 1, 0 — and the Nepali-English "y"/"n" people actually
 * type. Anything else is an error rather than a silent `false`, because a
 * mis-read "active" column hides a shelf.
 */
function parseBool(raw: string, field: string, line: number, errors: ImportIssue[]): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === '') return null;
  if (['yes', 'y', 'true', '1', 'on'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(v)) return false;
  errors.push({ line, message: `${field} should be yes or no — got "${raw}"` });
  return null;
}

@Injectable()
export class CatalogImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole shelf as one sheet.
   *
   * A product with variants takes one row per variant, with the product's own
   * columns repeated: that is how the same information looks in a spreadsheet
   * anybody has ever kept stock in, and the importer reads it back the same way.
   */
  async exportCsv(shopId: string): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { shopId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: { category: { select: { slug: true } }, variants: { orderBy: { price: 'asc' } } },
    });

    const rows: (string | number | boolean | null)[][] = [];
    for (const p of products) {
      const base = [
        p.id,
        p.name,
        p.nameNp ?? '',
        p.description ?? '',
        p.category?.slug ?? '',
        p.unit,
        p.price,
        p.mrp ?? '',
        p.trackStock ? 'yes' : 'no',
        p.stock,
        p.tags.join('; '),
        p.isActive ? 'yes' : 'no',
      ];
      if (p.variants.length === 0) {
        rows.push([...base, '', '', '', '', '']);
        continue;
      }
      for (const v of p.variants) {
        rows.push([...base, v.name, v.sku ?? '', v.price, v.mrp ?? '', v.stock]);
      }
    }

    return toCsv([...IMPORT_COLUMNS], rows);
  }

  /** A file with the headers and one worked example, for a seller starting from nothing. */
  template(): string {
    return toCsv(
      [...IMPORT_COLUMNS],
      [
        [
          '',
          'Basmati Rice',
          'बासमती चामल',
          'Long grain, aged',
          'grocery',
          '1 kg',
          180,
          200,
          'yes',
          40,
          'staple; rice',
          'yes',
          '5 kg',
          'RICE-5KG',
          860,
          950,
          12,
        ],
      ],
    );
  }

  async import(
    shopId: string,
    file: UploadedFile | undefined,
    options: { dryRun: boolean },
  ): Promise<ImportReport> {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a CSV file');

    const text = file.buffer.toString('utf8');
    // A file that is not text at all — someone attaching the .xlsx — fails here
    // with something they can act on rather than as a wall of parse errors.
    if (text.includes('\u0000')) {
      throw new BadRequestException(
        'That looks like an Excel file, not a CSV. In Excel choose File → Save As → CSV UTF-8.',
      );
    }

    const sheet = parseCsv(text);
    if (sheet.rows.length === 0) throw new BadRequestException('That file has no rows in it');
    if (!sheet.headers.includes('name')) {
      throw new BadRequestException(
        'The first line must be the column headers, and there must be a "name" column. Download the template to see the shape.',
      );
    }
    if (sheet.rows.length > IMPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `${sheet.rows.length} rows is over the ${IMPORT_ROW_LIMIT}-row limit for one import. Split the file.`,
      );
    }

    const errors: ImportIssue[] = [];

    const [categories, existing] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, slug: true, en: true, np: true } }),
      this.prisma.product.findMany({
        where: { shopId },
        select: { id: true, name: true, variants: { select: { id: true, name: true, sku: true } } },
      }),
    ]);

    const categoryByKey = new Map<string, string>();
    for (const c of categories) {
      categoryByKey.set(c.slug.toLowerCase(), c.id);
      categoryByKey.set(c.en.toLowerCase(), c.id);
      categoryByKey.set(c.np.toLowerCase(), c.id);
    }
    const existingById = new Map(existing.map((p) => [p.id, p]));
    const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));

    // Rows group into products: consecutive or scattered, `id` wins over name.
    const planned = new Map<string, PlannedProduct>();

    sheet.rows.forEach((row, index) => {
      const line = sheet.lines[index];
      const name = (row.name ?? '').trim();
      const id = (row.id ?? '').trim();

      if (!name && !id) {
        errors.push({ line, message: 'This row has no name' });
        return;
      }
      if (name.length > PRODUCT_NAME_MAX_LENGTH) {
        errors.push({ line, message: `Name is longer than ${PRODUCT_NAME_MAX_LENGTH} characters` });
        return;
      }
      if (id && !existingById.has(id)) {
        errors.push({
          line,
          message: `No product with id ${id} in this shop. Clear the id column to create a new one.`,
        });
        return;
      }

      const key = id || name.toLowerCase();
      let entry = planned.get(key);

      if (!entry) {
        const price = parseMoney(row.price ?? '', 'Price', line, errors);
        const match = id ? existingById.get(id) : existingByName.get(name.toLowerCase());
        // A new product must be priced. An existing one may leave the column
        // blank to mean "leave it as it is".
        if (price === null && !match) {
          if ((row.price ?? '').trim() === '') errors.push({ line, message: 'New products need a price' });
          return;
        }

        const mrp = parseMoney(row.mrp ?? '', 'MRP', line, errors);
        if (mrp !== null && price !== null && mrp < price) {
          errors.push({ line, message: `MRP रु ${mrp} is below the selling price रु ${price}` });
        }

        const categoryRaw = (row.category ?? '').trim();
        let categoryId: string | null | undefined;
        if (categoryRaw) {
          categoryId = categoryByKey.get(categoryRaw.toLowerCase());
          if (!categoryId) {
            errors.push({
              line,
              message: `"${categoryRaw}" is not a category. Use one of: ${categories
                .slice(0, 6)
                .map((c) => c.slug)
                .join(', ')}…`,
            });
          }
        }

        const description = (row.description ?? '').trim();
        if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
          errors.push({ line, message: 'Description is too long' });
        }
        const unit = (row.unit ?? '').trim();
        if (unit.length > PRODUCT_UNIT_MAX_LENGTH) {
          errors.push({ line, message: 'Unit is too long' });
        }

        const tags = (row.tags ?? '')
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.length > PRODUCT_TAG_LIMIT) {
          errors.push({ line, message: `More than ${PRODUCT_TAG_LIMIT} tags` });
        }
        if (tags.some((t) => t.length > PRODUCT_TAG_MAX_LENGTH)) {
          errors.push({ line, message: 'One of the tags is too long' });
        }

        entry = {
          line,
          id: match?.id,
          name: name || match?.name || '',
          nameNp: (row.name_np ?? '').trim() || undefined,
          description: description || undefined,
          categoryId,
          unit: unit || undefined,
          price: price ?? 0,
          mrp: mrp ?? undefined,
          trackStock: parseBool(row.track_stock ?? '', 'Track stock', line, errors) ?? undefined,
          stock: parseCount(row.stock ?? '', 'Stock', line, errors) ?? undefined,
          tags: (row.tags ?? '').trim() ? tags : undefined,
          isActive: parseBool(row.active ?? '', 'Active', line, errors) ?? undefined,
          variants: [],
        };
        // A blank price on an existing product means "unchanged"; carry the flag
        // by leaving price at 0 and remembering it was absent.
        if (price === null) entry.price = -1;
        planned.set(key, entry);
      }

      const variantName = (row.variant ?? '').trim();
      if (!variantName) return;

      if (variantName.length > PRODUCT_NAME_MAX_LENGTH) {
        errors.push({ line, message: 'Variant name is too long' });
        return;
      }
      const vPrice = parseMoney(row.variant_price ?? '', 'Variant price', line, errors);
      if (vPrice === null) {
        if ((row.variant_price ?? '').trim() === '') {
          errors.push({ line, message: `Variant "${variantName}" needs a price` });
        }
        return;
      }
      const vMrp = parseMoney(row.variant_mrp ?? '', 'Variant MRP', line, errors);
      if (vMrp !== null && vMrp < vPrice) {
        errors.push({ line, message: `Variant MRP रु ${vMrp} is below its price रु ${vPrice}` });
      }
      const sku = (row.variant_sku ?? '').trim();
      if (sku.length > VARIANT_SKU_MAX_LENGTH) {
        errors.push({ line, message: 'Variant SKU is too long' });
      }

      const owner = entry.id ? existingById.get(entry.id) : undefined;
      const match = owner?.variants.find(
        (v) =>
          (sku && v.sku && v.sku.toLowerCase() === sku.toLowerCase()) ||
          v.name.trim().toLowerCase() === variantName.toLowerCase(),
      );

      if (entry.variants.some((v) => v.name.toLowerCase() === variantName.toLowerCase())) {
        errors.push({ line, message: `"${variantName}" appears twice for the same product` });
        return;
      }

      entry.variants.push({
        line,
        id: match?.id,
        name: variantName,
        sku: sku || null,
        price: vPrice,
        mrp: vMrp ?? null,
        stock: parseCount(row.variant_stock ?? '', 'Variant stock', line, errors) ?? 0,
      });
    });

    const products = [...planned.values()];
    const productsCreated = products.filter((p) => !p.id).length;
    const productsUpdated = products.length - productsCreated;
    const variantsCreated = products.reduce(
      (n, p) => n + p.variants.filter((v) => !v.id).length,
      0,
    );
    const variantsUpdated = products.reduce((n, p) => n + p.variants.filter((v) => v.id).length, 0);

    const preview: ImportPreviewRow[] = products.slice(0, PREVIEW_LIMIT).map((p) => ({
      line: p.line,
      action: p.id ? 'update' : 'create',
      name: p.name,
      detail:
        p.variants.length > 0
          ? `${p.variants.length} ${p.variants.length === 1 ? 'size' : 'sizes'}`
          : p.price >= 0
            ? `रु ${p.price}`
            : 'fields unchanged',
    }));

    const report: ImportReport = {
      dryRun: options.dryRun,
      rows: sheet.rows.length,
      productsCreated,
      productsUpdated,
      variantsCreated,
      variantsUpdated,
      errors: errors.slice(0, 100),
      preview,
      applied: false,
    };

    // One bad row fails the file. A half-applied catalogue is the outcome
    // nobody can undo, and the seller is standing there with the spreadsheet
    // that produced it.
    if (options.dryRun || errors.length > 0) return report;

    await this.prisma.$transaction(async (tx) => {
      for (const p of products) {
        const data = {
          name: p.name,
          ...(p.nameNp !== undefined ? { nameNp: p.nameNp } : {}),
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...(p.categoryId !== undefined ? { categoryId: p.categoryId } : {}),
          ...(p.unit !== undefined ? { unit: p.unit } : {}),
          ...(p.price >= 0 ? { price: p.price } : {}),
          ...(p.mrp !== undefined ? { mrp: p.mrp } : {}),
          ...(p.trackStock !== undefined ? { trackStock: p.trackStock } : {}),
          ...(p.stock !== undefined ? { stock: p.stock } : {}),
          ...(p.tags !== undefined ? { tags: p.tags } : {}),
          ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
        };

        const productId = p.id
          ? (await tx.product.update({ where: { id: p.id }, data })).id
          : (
              await tx.product.create({
                data: { shopId, unit: '1 pc', ...data, price: Math.max(0, p.price) },
              })
            ).id;

        for (const v of p.variants) {
          const vData = { name: v.name, sku: v.sku, price: v.price, mrp: v.mrp, stock: v.stock };
          if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: vData });
          else await tx.productVariant.create({ data: { productId, ...vData } });
        }
      }
    });

    return { ...report, applied: true };
  }
}
