// Usage: npx vite-node scripts/playtest-report.ts log1.json log2.json …
import { readFileSync } from 'node:fs';
import { formatReport, type PlaytestExport } from '../src/ui/playtest';

const files = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')) as PlaytestExport);
if (!files.length) {
  console.log('Give it the play logs testers exported from the pause menu (Export play log).');
  process.exit(1);
}
console.log(formatReport(files));
