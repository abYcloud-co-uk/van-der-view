# Agent-Side Core + Anthropic Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build van-der-view's provider-neutral agent-side core — the `Command` types, the v1 command catalog, and the Anthropic adapter (`toTools` / `toCommand`) — fully unit-tested in Node (test focus **F1**).

**Architecture:** Pure TypeScript, no `molstar`, no React, no DOM. Two halves of the library are decoupled by a normalized `Command { name, input }`; this plan builds the *agent-side* half: canonical `CommandSpec[]` plus thin per-provider adapters. The browser-side executor, the React mount, and the demo come in later plans and consume these exports unchanged.

**Tech Stack:** TypeScript (strict), Vitest, pnpm. ESM. Node-only tests, CI-ready.

**Plan series (v1):** This is **Plan 1 of 3**. Plan 2 = browser-side (headless Mol\* wrapper + executor + `resolveSelection` + F2 selection tests, opening with the Node-`Structure` spike). Plan 3 = React mount + SSR smoke + the Vite demo harness. Source spec: `docs/superpowers/specs/2026-06-18-testing-strategy-design.md`; design in `wiki/pages/{command-schema,agent-command-flow,testing-strategy}.md`.

**Commits:** follow the repo convention (each commit ends with the `Co-Authored-By` trailer). The `-m` messages below show intent only.

---

## File structure

```
package.json              # name, scripts, devDeps (private; not published yet)
tsconfig.json             # strict, moduleResolution Bundler (no build step yet)
vitest.config.ts          # node environment, test/**/*.test.ts
.gitignore                # node_modules, dist
src/
  types.ts                # Command, CommandResult, ok/err, Selection, JSONSchema,
                          #   CommandSpec, ProviderAdapter, Anthropic wire shapes
  commands.ts             # VDV_COMMANDS: the v1 CommandSpec[]
  adapters/
    anthropic.ts          # toTools, toCommand, AdapterError
    index.ts              # adapters = { anthropic, openai: notImplemented('openai') }
  index.ts                # public barrel: commands, tools.anthropic, adapters, types
test/
  smoke.test.ts           # Task 1 only; deleted in Task 2
  types.test.ts           # ok/err runtime helpers
  commands.test.ts        # the v1 catalog
  adapters/
    anthropic.test.ts     # toTools + toCommand (well-formed + malformed)
    index.test.ts         # anthropic works; openai placeholder throws clearly
  public.test.ts          # the barrel surface
```

Relative imports are **extensionless** (resolved by `moduleResolution: "Bundler"` / Vitest). Build-time module resolution (NodeNext, `.js` extensions, a bundler) is deferred to the packaging plan — there is no build step in this plan.

---

## Task 1: Project scaffold + test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Test: `test/smoke.test.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "van-der-view",
  "version": "0.0.0",
  "description": "Headless React bridge between an AI agent and the Mol* 3D molecular renderer.",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `pnpm add -D vitest typescript @types/node`
Expected: `pnpm-lock.yaml` and `node_modules/` created; the three packages appear under `devDependencies` in `package.json`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```gitignore
node_modules/
dist/
```

- [ ] **Step 6: Write the smoke test**

`test/smoke.test.ts`:

```ts
import { expect, it } from 'vitest';

it('runs the test harness', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run the smoke test to verify the harness works**

Run: `pnpm test`
Expected: PASS — 1 test passed.

- [ ] **Step 8: Verify the typechecker runs**

Run: `pnpm typecheck`
Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts .gitignore test/smoke.test.ts
git commit -m "chore: scaffold TypeScript + Vitest project"
```

---

## Task 2: Core types

**Files:**
- Create: `src/types.ts`
- Test: `test/types.test.ts`
- Delete: `test/smoke.test.ts`

- [ ] **Step 1: Delete the smoke test**

Run: `git rm test/smoke.test.ts`

- [ ] **Step 2: Write the failing test**

`test/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { err, ok } from '../src/types';

describe('CommandResult helpers', () => {
  it('ok() builds a success result', () => {
    expect(ok({ loaded: true })).toEqual({ ok: true, data: { loaded: true } });
  });

  it('ok() with no data omits an undefined payload meaningfully', () => {
    expect(ok()).toEqual({ ok: true, data: undefined });
  });

  it('err() builds a failure result', () => {
    expect(err('bad_selection', 'no chain "Z"')).toEqual({
      ok: false,
      error: { code: 'bad_selection', message: 'no chain "Z"' },
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot find module `../src/types` (or `ok`/`err` undefined).

- [ ] **Step 4: Write `src/types.ts`**

```ts
// ── Command envelope (locked: wiki command-schema) ──────────────────────────

/** A normalized command the executor consumes. Provider-agnostic. */
export interface Command {
  name: string;
  input: unknown;
}

/** Result of dispatching a command; fed back to the agent as a tool_result. */
export type CommandResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } };

/** Build a success result. */
export const ok = (data?: unknown): CommandResult => ({ ok: true, data });

/** Build a failure result. */
export const err = (code: string, message: string): CommandResult => ({
  ok: false,
  error: { code, message },
});

// ── Selection (LLM-friendly; modeled on MVS ComponentExpression) ────────────

/** Which residue numbering a Selection uses. auth = PDB author, label = entity. */
export type Numbering = 'auth' | 'label';

/** A named group of atoms, used instead of chain/residues. */
export type SelectionPreset =
  | 'all' | 'polymer' | 'protein' | 'nucleic' | 'ligand' | 'ion' | 'water';

/** A single residue number, or an inclusive [start, end] range. */
export type ResidueRef = number | [number, number];

/**
 * A residue/chain/ligand selector. Either give `chain`/`residues` (+`numbering`)
 * OR a `preset`. auth vs label numbering is explicit — mixing them silently
 * selects the wrong residues.
 */
export interface Selection {
  chain?: string;
  residues?: ResidueRef[];
  numbering?: Numbering;
  preset?: SelectionPreset;
}

// ── Command specs + JSON Schema ─────────────────────────────────────────────

/** A minimal JSON Schema object — enough for tool input schemas. */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** The canonical, provider-neutral definition of one command. */
export interface CommandSpec {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/** A per-provider-family shim between the LLM wire format and our Command. */
export interface ProviderAdapter {
  toTools(commands: CommandSpec[]): unknown;
  toCommand(toolCall: unknown): Command;
}

// ── Anthropic wire shapes (verified via the claude-api skill) ───────────────

/** An Anthropic tool definition (the output shape of toTools). */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/** An Anthropic tool_use content block (the input shape of toCommand). */
export interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — 3 tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts test/types.test.ts
git commit -m "feat: core Command/CommandResult/Selection types"
```

---

## Task 3: v1 command registry

**Files:**
- Create: `src/commands.ts`
- Test: `test/commands.test.ts`

- [ ] **Step 1: Write the failing test**

`test/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../src/commands';

describe('VDV_COMMANDS', () => {
  it('contains exactly the v1 commands', () => {
    const names = VDV_COMMANDS.map((c) => c.name).sort();
    expect(names).toEqual([
      'focus',
      'get-scene-context',
      'highlight',
      'load-structure',
      'reset-camera',
    ]);
  });

  it('gives every command a non-empty description and an object input schema', () => {
    for (const c of VDV_COMMANDS) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.inputSchema.type).toBe('object');
      expect(typeof c.inputSchema.properties).toBe('object');
    }
  });

  it('requires source on load-structure', () => {
    const load = VDV_COMMANDS.find((c) => c.name === 'load-structure');
    expect(load?.inputSchema.required).toContain('source');
  });

  it('requires selection on highlight and focus', () => {
    for (const name of ['highlight', 'focus']) {
      const cmd = VDV_COMMANDS.find((c) => c.name === name);
      expect(cmd?.inputSchema.required).toContain('selection');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/commands.test.ts`
Expected: FAIL — cannot find module `../src/commands`.

- [ ] **Step 3: Write `src/commands.ts`**

```ts
import type { CommandSpec } from './types';

/** JSON Schema fragment for a Selection (shared by highlight/focus). */
const selectionSchema = {
  type: 'object',
  description: 'A residue/chain/ligand selector. Give chain/residues + numbering, OR a preset.',
  properties: {
    chain: { type: 'string', description: 'Chain id, e.g. "A".' },
    residues: {
      type: 'array',
      description: 'Residue numbers; each item is a number or a [start, end] range.',
      items: {
        oneOf: [
          { type: 'number' },
          { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        ],
      },
    },
    numbering: {
      type: 'string',
      enum: ['auth', 'label'],
      description: 'auth = PDB author numbering (what users cite); label = entity numbering.',
    },
    preset: {
      type: 'string',
      enum: ['all', 'polymer', 'protein', 'nucleic', 'ligand', 'ion', 'water'],
      description: 'A named group, used instead of chain/residues.',
    },
  },
  additionalProperties: false,
};

/** The canonical v1 command catalog (provider-neutral). */
export const VDV_COMMANDS: CommandSpec[] = [
  {
    name: 'load-structure',
    description: 'Load a molecular structure into the viewer by PDB id or URL.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['pdb', 'url', 'inline'], description: 'Where to load from.' },
        id: { type: 'string', description: 'PDB id, when source is "pdb" (e.g. "1CRN").' },
        url: { type: 'string', description: 'Structure URL, when source is "url".' },
        data: { type: 'string', description: 'Raw structure text, when source is "inline".' },
        format: { type: 'string', enum: ['mmcif', 'pdb'], description: 'File format (default mmcif).' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  {
    name: 'highlight',
    description: 'Transiently highlight a selection of residues, a chain, or a ligand.',
    inputSchema: {
      type: 'object',
      properties: { selection: selectionSchema },
      required: ['selection'],
      additionalProperties: false,
    },
  },
  {
    name: 'focus',
    description: 'Move the camera to focus on a selection.',
    inputSchema: {
      type: 'object',
      properties: {
        selection: selectionSchema,
        durationMs: { type: 'number', description: 'Camera animation duration in ms.' },
        zoomOut: { type: 'number', description: 'Extra zoom-out factor.' },
      },
      required: ['selection'],
      additionalProperties: false,
    },
  },
  {
    name: 'get-scene-context',
    description:
      'Read the current scene: loaded structures, chains, and what is selected. Call this before guessing selectors.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'reset-camera',
    description: 'Reset the camera to the default view.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/commands.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/commands.ts test/commands.test.ts
git commit -m "feat: v1 command catalog (VDV_COMMANDS)"
```

---

## Task 4: Anthropic adapter — `toTools` (outbound)

**Files:**
- Create: `src/adapters/anthropic.ts`
- Test: `test/adapters/anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

`test/adapters/anthropic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VDV_COMMANDS } from '../../src/commands';
import { toTools } from '../../src/adapters/anthropic';

describe('toTools', () => {
  it('maps every command spec to an Anthropic tool def', () => {
    const tools = toTools(VDV_COMMANDS);
    expect(tools).toHaveLength(VDV_COMMANDS.length);
  });

  it('renames inputSchema to input_schema and preserves name/description', () => {
    const tools = toTools(VDV_COMMANDS);
    const highlight = tools.find((t) => t.name === 'highlight');
    expect(highlight).toMatchObject({
      name: 'highlight',
      description: expect.any(String),
      input_schema: { type: 'object' },
    });
    // the wire field is input_schema, not inputSchema
    expect(highlight).not.toHaveProperty('inputSchema');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/adapters/anthropic.test.ts`
Expected: FAIL — cannot find module `../../src/adapters/anthropic`.

- [ ] **Step 3: Write `src/adapters/anthropic.ts`**

```ts
import type { AnthropicTool, CommandSpec } from '../types';

/** Thrown when a provider tool-call block is structurally malformed. */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}

/** OUTBOUND: canonical command specs → Anthropic tool definitions. */
export function toTools(commands: CommandSpec[]): AnthropicTool[] {
  return commands.map((c) => ({
    name: c.name,
    description: c.description,
    input_schema: c.inputSchema,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/adapters/anthropic.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/anthropic.ts test/adapters/anthropic.test.ts
git commit -m "feat: anthropic adapter toTools (outbound)"
```

---

## Task 5: Anthropic adapter — `toCommand` (inbound)

**Files:**
- Modify: `src/adapters/anthropic.ts`
- Modify: `test/adapters/anthropic.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `test/adapters/anthropic.test.ts`:

```ts
import { AdapterError, toCommand } from '../../src/adapters/anthropic';

describe('toCommand', () => {
  it('normalizes a well-formed tool_use block into a Command', () => {
    const block = {
      type: 'tool_use',
      id: 'toolu_123',
      name: 'highlight',
      input: { selection: { chain: 'A', numbering: 'auth' } },
    };
    expect(toCommand(block)).toEqual({
      name: 'highlight',
      input: { selection: { chain: 'A', numbering: 'auth' } },
    });
  });

  it('keeps an empty-object input (e.g. reset-camera)', () => {
    const block = { type: 'tool_use', id: 'toolu_1', name: 'reset-camera', input: {} };
    expect(toCommand(block)).toEqual({ name: 'reset-camera', input: {} });
  });

  it('throws AdapterError when the block is not a tool_use', () => {
    expect(() => toCommand({ type: 'text', text: 'hi' })).toThrow(AdapterError);
  });

  it('throws AdapterError when name is missing', () => {
    expect(() => toCommand({ type: 'tool_use', id: 'x', input: {} })).toThrow(AdapterError);
  });

  it('throws AdapterError when input is not an object', () => {
    expect(() =>
      toCommand({ type: 'tool_use', id: 'x', name: 'focus', input: '[]' }),
    ).toThrow(AdapterError);
  });

  it('throws AdapterError when input is an array', () => {
    expect(() =>
      toCommand({ type: 'tool_use', id: 'x', name: 'focus', input: [] }),
    ).toThrow(AdapterError);
  });
});
```

> Note: `toCommand` validates the **envelope shape only** (is this a tool_use block with a string name and an object input). Whether `name` is a *known* command and whether `input` matches the schema is the **executor's** job (Plan 2), which returns a `CommandResult` error — not the adapter's. That separation keeps the adapter a pure format shim.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test test/adapters/anthropic.test.ts`
Expected: FAIL — `toCommand` is not exported.

- [ ] **Step 3: Add `toCommand` to `src/adapters/anthropic.ts`**

Append to `src/adapters/anthropic.ts`:

```ts
import type { AnthropicToolUse, Command } from '../types';

/** INBOUND: an Anthropic tool_use block → a normalized Command. */
export function toCommand(toolCall: unknown): Command {
  if (
    typeof toolCall !== 'object' ||
    toolCall === null ||
    (toolCall as { type?: unknown }).type !== 'tool_use'
  ) {
    throw new AdapterError('Expected an Anthropic tool_use block.');
  }
  const block = toolCall as Partial<AnthropicToolUse>;
  if (typeof block.name !== 'string' || block.name.length === 0) {
    throw new AdapterError('tool_use block is missing a string "name".');
  }
  if (
    typeof block.input !== 'object' ||
    block.input === null ||
    Array.isArray(block.input)
  ) {
    throw new AdapterError(`tool_use block "${block.name}" has a non-object "input".`);
  }
  return { name: block.name, input: block.input };
}
```

> The two `import type` lines may be merged with the existing import at the top of the file; keeping them adjacent to the function is fine for review and TypeScript dedupes them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test test/adapters/anthropic.test.ts`
Expected: PASS — 8 tests total in the file.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/anthropic.ts test/adapters/anthropic.test.ts
git commit -m "feat: anthropic adapter toCommand (inbound) with envelope validation"
```

---

## Task 6: Adapter registry + OpenAI placeholder

**Files:**
- Create: `src/adapters/index.ts`
- Test: `test/adapters/index.test.ts`

- [ ] **Step 1: Write the failing test**

`test/adapters/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adapters } from '../../src/adapters/index';

describe('adapters registry', () => {
  it('exposes a working anthropic adapter', () => {
    const cmd = adapters.anthropic.toCommand({
      type: 'tool_use',
      id: 'x',
      name: 'reset-camera',
      input: {},
    });
    expect(cmd).toEqual({ name: 'reset-camera', input: {} });
  });

  it('throws clearly for the unimplemented openai adapter (toCommand)', () => {
    expect(() => adapters.openai.toCommand({})).toThrow(/openai.*not implemented/i);
  });

  it('throws clearly for the unimplemented openai adapter (toTools)', () => {
    expect(() => adapters.openai.toTools([])).toThrow(/openai.*not implemented/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/adapters/index.test.ts`
Expected: FAIL — cannot find module `../../src/adapters/index`.

- [ ] **Step 3: Write `src/adapters/index.ts`**

```ts
import type { ProviderAdapter } from '../types';
import { toCommand, toTools } from './anthropic';

const anthropic: ProviderAdapter = { toTools, toCommand };

/** A reserved adapter that throws clearly until the provider is implemented. */
function notImplemented(provider: string): ProviderAdapter {
  const fail = (): never => {
    throw new Error(`van-der-view: the "${provider}" adapter is not implemented yet.`);
  };
  return { toTools: fail, toCommand: fail };
}

export const adapters = {
  anthropic,
  openai: notImplemented('openai'),
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/adapters/index.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/index.ts test/adapters/index.test.ts
git commit -m "feat: adapter registry + openai notImplemented placeholder"
```

---

## Task 7: Public barrel

**Files:**
- Create: `src/index.ts`
- Test: `test/public.test.ts`

- [ ] **Step 1: Write the failing test**

`test/public.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adapters, commands, tools } from '../src/index';

describe('public surface', () => {
  it('exposes the command catalog', () => {
    expect(commands.map((c) => c.name)).toContain('load-structure');
  });

  it('exposes ready-made anthropic tools, one per command', () => {
    expect(tools.anthropic).toHaveLength(commands.length);
    expect(tools.anthropic.every((t) => 'input_schema' in t)).toBe(true);
  });

  it('exposes the adapters registry', () => {
    expect(typeof adapters.anthropic.toCommand).toBe('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/public.test.ts`
Expected: FAIL — cannot find module `../src/index`.

- [ ] **Step 3: Write `src/index.ts`**

```ts
import { toTools } from './adapters/anthropic';
import { VDV_COMMANDS } from './commands';

export * from './types';
export { VDV_COMMANDS } from './commands';
export { adapters } from './adapters/index';
export { AdapterError } from './adapters/anthropic';

/** The canonical command catalog. */
export const commands = VDV_COMMANDS;

/** Ready-made provider tool definitions. */
export const tools = {
  anthropic: toTools(VDV_COMMANDS),
};
```

> Build `tools.anthropic` from the **concrete** `toTools` (not via `adapters.anthropic`, whose `ProviderAdapter` type returns `unknown`), so `tools.anthropic` keeps its `AnthropicTool[]` type.

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `pnpm test`
Expected: PASS — all files green (types, commands, adapters/anthropic, adapters/index, public).

- [ ] **Step 5: Typecheck the whole project**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts test/public.test.ts
git commit -m "feat: public barrel — commands, tools.anthropic, adapters"
```

---

## Done criteria

- `pnpm test` is green: F1 is covered — every v1 command round-trips through `toTools`, and well-formed/malformed `tool_use` blocks are handled by `toCommand`.
- `pnpm typecheck` is clean.
- `import { commands, tools, adapters } from 'van-der-view'` exposes the agent-side surface the later plans (executor, React mount, demo) consume unchanged.

## Notes for later plans (not in scope here)

- Per the spec's per-command checklist, the **"malformed input → CommandResult error"** test lives with the **executor** (Plan 2), since that is where input is validated against each command's schema and a `CommandResult` is produced. This plan covers the adapter's *envelope* validation only.
- Captured **real-Claude `tool_use` JSON fixtures** (under `test/fixtures/tool-use/`) can replace the inline literals later; the inline objects already satisfy F1.
- A `toolsFor([...])` subsetting helper and a `dispatch` convenience overload are deferred (YAGNI) until a consumer needs them.
```
