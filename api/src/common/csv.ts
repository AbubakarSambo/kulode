// Server-side twin of client/src/lib/csv.ts parseCsv — uploaded CSVs (e.g. a retail catalog
// import) routinely carry quoted fields like "Indomie Chicken, 70g", which a plain split(',')
// silently shifts into the wrong columns.

/** Parses RFC4180-ish CSV text (quoted fields, embedded commas/newlines/escaped quotes) into rows of strings. */
export function parseCsv(text: string): string[][] {
  // Excel's "CSV UTF-8" export prefixes a byte-order mark, which would otherwise end up glued to
  // the first header name ("﻿name") and make that column unfindable.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      // skip, \n (if present) handles the row break
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}
