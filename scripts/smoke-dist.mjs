// Smoke: the built agent-side entry imports cleanly in Node (no molstar present at
// runtime is fine — it must not be reached) and exposes the public agent surface.
import { strict as assert } from 'node:assert';

const mod = await import('../dist/index.js');
assert(Array.isArray(mod.commands) && mod.commands.length > 0, 'commands must be a non-empty array');
assert(mod.tools && mod.tools.anthropic, 'tools.anthropic must be present');
assert(mod.tools.openai, 'tools.openai must be present');
assert(typeof mod.adapters?.anthropic?.toCommand === 'function', 'adapters.anthropic.toCommand must be a function');
assert(typeof mod.adapters?.openai?.toCommand === 'function', 'adapters.openai.toCommand must be a function');
console.log(`✓ dist/index.js smoke OK (${mod.commands.length} commands, tools.anthropic + tools.openai present)`);
