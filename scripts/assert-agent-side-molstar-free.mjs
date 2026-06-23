// Static guard: the built agent-side entry (dist/index.js) and every chunk it
// statically imports must not import molstar. Turns the molstar-free invariant of
// the "." export into an executable gate. Run after `pnpm build`.
import { existsSync, readFileSync } from 'node:fs';
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

/** Resolve a relative specifier to an emitted chunk on disk (esbuild writes `.js`). */
function resolveLocal(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  if (existsSync(base)) return base;
  if (existsSync(`${base}.js`)) return `${base}.js`; // extensionless-import fallback
  return undefined;
}

function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const spec of importSpecs(code)) {
    if (/^molstar(\/|$)/.test(spec)) {
      offenders.push(`${file} → ${spec}`);
    } else if (spec.startsWith('.')) {
      // Don't readFileSync a non-existent path — a missing local chunk would crash the
      // gate (and block every release) instead of failing clearly. esbuild always emits
      // extensioned, on-disk chunks, so this only guards against the unexpected.
      const target = resolveLocal(file, spec);
      if (target) walk(target);
      else console.warn(`  (note) unresolved local import ${spec} from ${file} — skipped`);
    }
  }
}

walk(ENTRY);

if (offenders.length > 0) {
  console.error('✗ agent-side entry imports molstar:\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log(`✓ agent-side entry is molstar-free (${seen.size} chunk(s) checked)`);
