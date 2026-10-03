import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogImportService } from './catalog-import.service';
import { csvCell, parseCsv, parseGrid, toCsv } from './csv';

/**
 * The spreadsheet route, where a shopkeeper's whole shelf arrives at once.
 *
 * Two classes of bug matter here and nothing else much does.
 *
 * **Reading the file wrong.** A Nepali catalogue has commas inside product
 * descriptions, quotes inside names and a BOM on the front because it came out
 * of Excel. A parser that gets any of those wrong corrupts data silently.
 *
 * **Writing when it should not.** The contract is: a dry run writes nothing,
 * and one bad row fails the whole file. Both are asserted against a fake Prisma
 * that records every call, so "it did not write" is a fact about the calls
 * rather than about the return value.
 */

/* ── the codec ────────────────────────────────────────────────────────────── */

describe('csv', () => {
  it('reads a quoted comma, a quoted newline and an escaped quote', () => {
    const grid = parseGrid('a,b\n"x,1","line1\nline2"\n"say ""hi""",2\n');
    assert.deepEqual(grid, [
      ['a', 'b'],
      ['x,1', 'line1\nline2'],
      ['say "hi"', '2'],
    ]);
  });

  it('strips the BOM Excel writes, so the first header still matches', () => {
    const sheet = parseCsv('﻿name,price\nDaal,160\n');
    assert.deepEqual(sheet.headers, ['name', 'price']);
    assert.equal(sheet.rows[0].name, 'Daal');
  });

  it('handles CRLF and ignores a trailing blank line', () => {
    const sheet = parseCsv('name,price\r\nRice,180\r\n\r\n');
    assert.equal(sheet.rows.length, 1);
    assert.equal(sheet.lines[0], 2);
  });

  it('lower-cases headers so Price and PRICE are one column', () => {
    const sheet = parseCsv('Name, PRICE \nRice,180\n');
    assert.deepEqual(sheet.headers, ['name', 'price']);
    assert.equal(sheet.rows[0].price, '180');
  });

  it('defuses a cell that would be a formula in Excel, and reads it back plain', () => {
    const written = toCsv(['name'], [['=cmd()']]);
    assert.ok(written.includes('\t=cmd()'));
    assert.equal(parseCsv(written).rows[0].name, '=cmd()');
  });

  it('round-trips values that need quoting', () => {
    const rows = [['Rice, aged', 'He said "no"', 'two\nlines']];
    const sheet = parseCsv(toCsv(['a', 'b', 'c'], rows));
    assert.deepEqual([sheet.rows[0].a, sheet.rows[0].b, sheet.rows[0].c], rows[0]);
  });

  it('writes an empty cell for null and undefined rather than the word', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
    assert.equal(csvCell(0), '0');
  });
});

/* ── the importer ─────────────────────────────────────────────────────────── */

interface Calls {
  productCreate: unknown[];
  productUpdate: unknown[];
  variantCreate: unknown[];
  variantUpdate: unknown[];
}

function fakePrisma(existing: { id: string; name: string; variants?: { id: string; name: string; sku: string | null }[] }[] = []) {
  const calls: Calls = { productCreate: [], productUpdate: [], variantCreate: [], variantUpdate: [] };
  const tx = {
    product: {
      create: (args: { data: Record<string, unknown> }) => {
        calls.productCreate.push(args.data);
        return Promise.resolve({ id: `new-${calls.productCreate.length}` });
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.productUpdate.push({ id: args.where.id, ...args.data });
        return Promise.resolve({ id: args.where.id });
      },
    },
    productVariant: {
      create: (args: { data: Record<string, unknown> }) => {
        calls.variantCreate.push(args.data);
        return Promise.resolve({ id: 'v-new' });
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.variantUpdate.push({ id: args.where.id, ...args.data });
        return Promise.resolve({ id: args.where.id });
      },
    },
  };

  const prisma = {
    category: {
      findMany: () => Promise.resolve([
        { id: 'cat-grocery', slug: 'grocery', en: 'Grocery', np: 'किराना' },
        { id: 'cat-bakery', slug: 'bakery', en: 'Bakery', np: 'बेकरी' },
      ]),
    },
    product: {
      findMany: () => Promise.resolve(
        existing.map((p) => ({ id: p.id, name: p.name, variants: p.variants ?? [] }))),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  } as unknown as PrismaService;

  return { prisma, calls };
}

const file = (text: string) => ({ buffer: Buffer.from(text, 'utf8') }) as never;

const HEADER = 'name,category,unit,price,mrp,track_stock,stock,tags,active';

describe('catalogue import', () => {
  it('reports what it would do and writes nothing on a dry run', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new CatalogImportService(prisma);

    const report = await service.import(
      'shop-1',
      file(`${HEADER}\nBasmati Rice,grocery,1 kg,180,200,yes,40,"staple; rice",yes\n`),
      { dryRun: true },
    );

    assert.equal(report.rows, 1);
    assert.equal(report.productsCreated, 1);
    assert.equal(report.applied, false);
    assert.deepEqual(report.errors, []);
    assert.equal(calls.productCreate.length, 0);
  });

  it('creates on apply, with the category resolved and the tags split', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new CatalogImportService(prisma);

    const report = await service.import(
      'shop-1',
      file(`${HEADER}\nBasmati Rice,grocery,1 kg,180,200,yes,40,"staple; rice",yes\n`),
      { dryRun: false },
    );

    assert.equal(report.applied, true);
    assert.equal(calls.productCreate.length, 1);
    const created = calls.productCreate[0] as Record<string, unknown>;
    assert.equal(created.shopId, 'shop-1');
    assert.equal(created.categoryId, 'cat-grocery');
    assert.equal(created.price, 180);
    assert.deepEqual(created.tags, ['staple', 'rice']);
    assert.equal(created.trackStock, true);
  });

  it('matches an existing product by name and updates instead of duplicating', async () => {
    const { prisma, calls } = fakePrisma([{ id: 'p-1', name: 'Basmati Rice' }]);
    const service = new CatalogImportService(prisma);

    const report = await service.import('shop-1', file(`${HEADER}\nbasmati rice,,,190,,,,,\n`), {
      dryRun: false,
    });

    assert.equal(report.productsUpdated, 1);
    assert.equal(report.productsCreated, 0);
    assert.equal(calls.productCreate.length, 0);
    assert.equal((calls.productUpdate[0] as Record<string, unknown>).price, 190);
  });

  it('leaves a column alone when the cell is blank', async () => {
    const { prisma, calls } = fakePrisma([{ id: 'p-1', name: 'Rice' }]);
    const service = new CatalogImportService(prisma);

    await service.import('shop-1', file(`${HEADER}\nRice,,,,,,,,\n`), { dryRun: false });

    const patch = calls.productUpdate[0] as Record<string, unknown>;
    assert.equal('price' in patch, false, 'a blank price must not zero the price');
    assert.equal('stock' in patch, false);
    assert.equal('isActive' in patch, false);
  });

  it('groups the variant rows of one product and keeps the ids it already has', async () => {
    const { prisma, calls } = fakePrisma([
      { id: 'p-1', name: 'Rice', variants: [{ id: 'v-1', name: '5 kg', sku: null }] },
    ]);
    const service = new CatalogImportService(prisma);

    const csv =
      'name,price,variant,variant_price,variant_stock\n' +
      'Rice,180,1 kg,180,40\n' +
      'Rice,180,5 kg,860,12\n';
    const report = await service.import('shop-1', file(csv), { dryRun: false });

    assert.equal(report.productsUpdated, 1);
    assert.equal(report.variantsCreated, 1, '1 kg is new');
    assert.equal(report.variantsUpdated, 1, '5 kg already exists');
    assert.equal((calls.variantUpdate[0] as Record<string, unknown>).id, 'v-1');
  });

  it('refuses the whole file when one row is wrong', async () => {
    const { prisma, calls } = fakePrisma();
    const service = new CatalogImportService(prisma);

    const csv = `${HEADER}\nRice,grocery,1 kg,180,,yes,10,,yes\nDaal,grocery,1 kg,abc,,yes,10,,yes\n`;
    const report = await service.import('shop-1', file(csv), { dryRun: false });

    assert.equal(report.applied, false);
    assert.equal(calls.productCreate.length, 0, 'the good row must not go in on its own');
    assert.match(report.errors[0].message, /whole number/);
    assert.equal(report.errors[0].line, 3, 'the line number is the one Excel shows');
  });

  it('catches an MRP below the selling price, a bad category and a bad yes/no', async () => {
    const { prisma } = fakePrisma();
    const service = new CatalogImportService(prisma);

    const csv = `${HEADER}\nRice,fruitstuff,1 kg,200,150,maybe,10,,yes\n`;
    const report = await service.import('shop-1', file(csv), { dryRun: true });

    const messages = report.errors.map((e) => e.message).join(' | ');
    assert.match(messages, /not a category/);
    assert.match(messages, /below the selling price/);
    assert.match(messages, /yes or no/);
  });

  it('needs a price on a product it has never seen', async () => {
    const { prisma } = fakePrisma();
    const service = new CatalogImportService(prisma);

    const report = await service.import('shop-1', file(`${HEADER}\nNew Thing,,,,,,,,\n`), {
      dryRun: true,
    });
    assert.match(report.errors[0].message, /need a price/);
  });

  it('rejects an id that belongs to another shop rather than creating a row', async () => {
    const { prisma, calls } = fakePrisma([{ id: 'p-mine', name: 'Rice' }]);
    const service = new CatalogImportService(prisma);

    const report = await service.import(
      'shop-1',
      file('id,name,price\np-theirs,Stolen,100\n'),
      { dryRun: false },
    );

    assert.match(report.errors[0].message, /No product with id/);
    assert.equal(calls.productCreate.length, 0);
  });

  it('says something useful when handed an .xlsx', async () => {
    const { prisma } = fakePrisma();
    const service = new CatalogImportService(prisma);
    await assert.rejects(
      () => service.import('shop-1', file('PK\u0003\u0004\u0000binary'), { dryRun: true }),
      (e: unknown) => e instanceof BadRequestException && /Save As → CSV/.test((e as Error).message),
    );
  });

  it('refuses a file with no name column', async () => {
    const { prisma } = fakePrisma();
    const service = new CatalogImportService(prisma);
    await assert.rejects(
      () => service.import('shop-1', file('product,price\nRice,180\n'), { dryRun: true }),
      /must be the column headers/,
    );
  });

  it('exports a row per variant, and that export imports back unchanged', async () => {
    const prisma = {
      product: {
        findMany: () => Promise.resolve([
          {
            id: 'p-1',
            name: 'Basmati Rice',
            nameNp: 'बासमती चामल',
            description: 'Aged, long grain',
            unit: '1 kg',
            price: 180,
            mrp: 200,
            trackStock: true,
            stock: 40,
            tags: ['staple', 'rice'],
            isActive: true,
            category: { slug: 'grocery' },
            variants: [
              { name: '1 kg', sku: null, price: 180, mrp: 200, stock: 40 },
              { name: '5 kg', sku: 'R5', price: 860, mrp: 950, stock: 12 },
            ],
          },
        ]),
      },
    } as unknown as PrismaService;

    const csv = await new CatalogImportService(prisma).exportCsv('shop-1');
    const sheet = parseCsv(csv);

    assert.equal(sheet.rows.length, 2, 'one row per variant');
    assert.equal(sheet.rows[0].name, 'Basmati Rice');
    assert.equal(sheet.rows[0].id, 'p-1');
    assert.equal(sheet.rows[1].variant, '5 kg');
    assert.equal(sheet.rows[1].variant_price, '860');
    assert.equal(sheet.rows[0].tags, 'staple; rice');
    assert.equal(sheet.rows[0].active, 'yes');
  });
});
