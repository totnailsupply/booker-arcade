// Entry for `node --test scripts/test/` (see package.json "main"): imports every
// *.test.mjs in this folder so new game test files are picked up automatically.
// You can still run one file: node --test scripts/test/wallet.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();
for (const f of files) await import(pathToFileURL(path.join(dir, f)).href);
