/**
 * A small RFC 4180 reader and writer.
 *
 * Small on purpose. The one thing this file exists to get right is the case a
 * naive `split(",")` gets wrong and a Nepali catalogue hits on its first row:
 * a quoted field containing a comma, a quoted field containing a newline, and
 * the doubled quote that escapes a quote. Everything else a CSV library offers —
 * streaming, type coercion, dialect sniffing — is either unnecessary here or
 * something this module deliberately does itself, with the shop's own rules.
 *
 * Both halves round-trip: `toCsv(parseCsv(x))` preserves values, which is the
 * property the export → edit in Excel → import loop depends on.
 */

/** A parsed sheet: the header row, and the data rows as objects keyed by header. */
export interface Sheet {
  headers: string[];
  /** One entry per data row. Missing trailing columns read as "". */
  rows: Record<string, string>[];
  /** 1-based line number in the file for each row, for error messages. */
  lines: number[];
}

/**
 * Split a CSV document into a grid of raw cells.
 *
 * Handles CRLF and LF, quoted fields, embedded commas and newlines, and `""`
 * as an escaped quote. A BOM is stripped: Excel writes one, and a header of
 * A name header prefixed by U+FEFF matches nothing unless stripped.
 */
export function parseGrid(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const grid: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    grid.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // CRLF and a lone CR both end the row.
      endRow();
      i += input[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // A trailing newline is a terminator, not an empty last row.
  if (field !== "" || row.length > 0) endRow();
  return grid;
}

/**
 * Parse into header-keyed rows.
 *
 * Headers are lower-cased and trimmed so `Price `, `price` and `PRICE` are the
 * same column — a spreadsheet exported from anywhere will disagree about case,
 * and refusing the file over it helps nobody. Entirely blank rows are dropped,
 * because every spreadsheet ends with a few.
 */
export function parseCsv(text: string): Sheet {
  const grid = parseGrid(text);
  if (grid.length === 0) return { headers: [], rows: [], lines: [] };

  const headers = grid[0].map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  const lines: number[] = [];

  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r];
    if (cells.every((c) => c.trim() === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, c) => {
      row[header] = (cells[c] ?? "").trim();
    });
    rows.push(row);
    lines.push(r + 1); // 1-based, and row 1 is the header
  }

  return { headers, rows, lines };
}

/** Quote a single value only when it needs it. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  // A leading =, +, - or @ is what turns a CSV cell into a formula when the
  // file is opened in Excel. Prefixing a tab is the usual defence and survives
  // the round trip, because the reader trims it back off.
  const guarded = /^[=+\-@]/.test(text) ? `\t${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // CRLF: it is what RFC 4180 says and what Excel on Windows expects.
  return `${lines.join("\r\n")}\r\n`;
}
