# van-der-view demo — AI agent + Mol\* viewer

A small Vite + React app that shows van-der-view end to end: a **conversational
agent** (text or voice) drives the Mol\* 3D molecular viewer by emitting the
library's JSON commands. Type *"load 1CRN and colour it by chain"* and watch the
structure load, recolour, and focus.

It also keeps the original developer panels (load, representation, trajectory,
paste-`tool_use`, XR, …) tucked inside a collapsible **Dev tools** drawer.

---

## 1. Prerequisites

- **Node.js 18+** (uses the built-in `fetch`).
- A **DeepSeek API key** for the agent — get one at
  <https://platform.deepseek.com/api_keys>. (Any OpenAI-compatible key works if you
  also change the base URL; see step 3.)

> No GitHub token is needed to run the demo: it imports the library straight from
> `../../src` via a Vite alias, so you are **not** installing the published package.

## 2. Add your API key

The key is read **only by the dev server** (a small proxy in `vite.config.ts`) and
is never exposed to the browser. Copy the example env file and paste your key in:

```bash
cd examples/demo
cp .env.example .env
```

Then open `.env` and set your key:

```
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
```

`.env` is gitignored — your key never gets committed.

## 3. (Optional) use a different OpenAI-compatible provider

The proxy defaults to DeepSeek. To point it elsewhere (e.g. OpenAI), add to `.env`:

```
DEEPSEEK_BASE_URL=https://api.openai.com/v1   # default: https://api.deepseek.com
DEEPSEEK_MODEL=gpt-4o-mini                    # default: deepseek-chat
```

`DEEPSEEK_BASE_URL` is the prefix the proxy appends `/chat/completions` to — so
include any version segment: OpenAI mounts under `/v1` (hence `…openai.com/v1`),
while DeepSeek serves at the root (`…deepseek.com`, no `/v1`).

## 4. Install and run

```bash
# from examples/demo
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5173>).

> Using pnpm? `pnpm install` at the repo root works too; then `pnpm --dir examples/demo dev`.

## 5. Use the agent

- **Type** a request in the **Agent** panel and press **Send** — e.g.
  - *"Load the PDB structure 1CRN."*
  - *"Colour it by chain and focus chain A."*
  - *"How far apart are residues 10 and 40?"*
- **Voice** (Chrome/Edge): click the 🎤 button and speak; the transcript is sent
  automatically. The mic is hidden in browsers without the Web Speech API.
- Each action the agent takes appears as a **tool-call chip** showing the command,
  its arguments, and the result (`ok` / data / error) — so you can see exactly what
  it did.

## How it works (1 minute)

```
Agent panel ──▶ POST /api/chat ──▶ DeepSeek (with vdv tools.openai)
   ▲                                     │  tool_calls
   │                                     ▼
 transcript ◀── CommandResult ◀── viewer.dispatch(command) ◀── adapters.openai.toCommand
```

1. Your message + the library's tool definitions (`tools.openai`) are POSTed to the
   dev-server proxy, which forwards them to DeepSeek with your key attached
   server-side.
2. DeepSeek replies with `tool_calls`. Each is converted to a `Command`
   (`adapters.openai.toCommand`) and run via `viewer.dispatch(command)`.
3. The `CommandResult` is fed back to the model so it can chain steps and
   self-correct, until it returns a final text answer.

Key files: [`vite.config.ts`](vite.config.ts) (proxy), [`src/agent/loop.ts`](src/agent/loop.ts)
(the loop), [`src/agent/use-speech-input.ts`](src/agent/use-speech-input.ts) (voice),
[`src/panels/AgentPanel.tsx`](src/panels/AgentPanel.tsx) (UI). Styling comes from the
[design system](../../docs/design/DESIGN_SYSTEM.md) via `src/theme.css`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agent error: *"DEEPSEEK_API_KEY is not set"* | You skipped step 2 — create `examples/demo/.env` with your key, then restart `npm run dev`. |
| Agent error: 401 / 402 from the provider | Bad or out-of-credit key; check it at the provider dashboard. |
| No 🎤 button | Your browser lacks the Web Speech API — use Chrome or Edge, or just type. |
| Blank 3D canvas | WebGL is required; try a hardware-accelerated browser. |
