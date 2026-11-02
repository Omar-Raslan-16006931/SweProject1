import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Minimal RFC-4180 CSV reader (quoted fields supported) for the official reference datasets. */
export function readCsv(file: string): Record<string, string>[] {
  const text = readFileSync(resolve(__dirname, 'seed-data', file), 'utf8').replace(/^﻿/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
