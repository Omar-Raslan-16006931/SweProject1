/** Loads .env from the backend folder, then the repository root (no extra dependency needed). */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function load() {
  for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
