// Static guard: the built agent-side entry (dist/index.js) and every chunk it
// statically imports must not import molstar. Turns the molstar-free invariant of
// the "." export into an executable gate. Run after `pnpm build`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ENTRY = resolve('dist/index.js');
const seen = new Set();
const offenders = [];

/** All import/export specifiers in a chunk: static `from '...'`, bare `import '...'`, dynamic `import('...')`. */
function importSpecs(code) {
  const specs = [];
  for (const m of code.matchAll(/(?:\bimport\b|\bexport\b)[^'"`]*?\bfrom\s*['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  return specs;
}

function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const spec of importSpecs(code)) {
    if (/^molstar(\/|$)/.test(spec)) offenders.push(`${file} → ${spec}`);
    else if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
  }
}

walk(ENTRY);

if (offenders.length > 0) {
  console.error('✗ agent-side entry imports molstar:\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log(`✓ agent-side entry is molstar-free (${seen.size} chunk(s) checked)`);
