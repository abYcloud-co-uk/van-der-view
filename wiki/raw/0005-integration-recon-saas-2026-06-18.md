---
source_id: 0005
title: Integration recon — abycloud saas app (molstar Next.js chatbot) + resulting design deltas
origin: "dev session 2026-06-18 — Explore recon of /Users/yichengjin/Projects/aws_protein_project/abycloud-platform/apps/saas; analysis with user (jyc)"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# Integration recon: abycloud `apps/saas` + design deltas (2026-06-18)

First real integration target for van-der-view: an existing Mol\*-based chatbot.
Reconnaissance via an Explore subagent over
`/Users/yichengjin/Projects/aws_protein_project/abycloud-platform/apps/saas`.

## The app as found (facts)
- Stack: **molstar ^5.9.0**, **React 19.2**, **Next 16 App Router**, three ^0.184.
  Next config: `transpilePackages: ['molstar']` + a webpack/turbopack alias stub
  for `h264-mp4-encoder`.
- Mol\* mount: `src/components/chat/molstar-structure-scene.tsx` uses the **UI** path
  `createPluginUI({ target, spec, render: renderReact18 })` — NOT headless.
  `'use client'`, init in `useEffect`, `plugin.dispose()` on unmount, wrapped in
  `next/dynamic({ ssr:false })` (`structure-viewer.tsx`).
- **Plugin instance is component-local and ephemeral** — no context/store/singleton;
  unreachable from other code; disposed on unmount.
- Structure loading (`molstar-structure-scene.tsx`): `plugin.clear()` →
  `builders.data.rawData({ data: content })` → `parseTrajectory(data, format)` →
  `applyPreset('default')`. Sources: **inline PDB/CIF text** in tool results, and
  **auth-protected presigned S3 URLs** (`result-transport.ts`: `presign` with a
  **Bearer token**, then fetch text). Formats: pdb / mmcif (text). NOT public PDB ids.
- **LLM lives in the backend** (Python `serve.py` behind CloudFront/ALB). Frontend
  has **no LLM SDK**. It POSTs `/chat` (ACK only) and receives assistant tokens +
  **tool_call / tool_result events asynchronously over AppSync Events**. Tool calls/
  results are already modeled as chat rows (`role:'tool_call'|'tool_result'`).
- Agent→view is **user-driven**: tool results show a "View 3D" button; the user
  clicks to open the viewer. No automatic agent-driven dispatch.

## Design deltas decided (consequences for van-der-view)
1. **load-structure data sourcing.** Add `source:'inline'` (`{ data, format }`) →
   `builders.data.rawData`. Route ALL loading through a host-provided
   **`resolveStructure(input) → { data?|url?, format }`** resolver (promote
   `MolViewConfig.resolveStructure` to v1) so auth / S3 / internal-storage fetching
   lives in the host app. `pdb`/`url` still map to `builders.data.download`.
2. **Attach to an existing plugin.** Support driving a Mol\* instance the host
   already mounted: `createMolView({ plugin })` / `<MolViewProvider plugin={…}>`.
   Don't force van-der-view to own the mount. (`PluginUIContext` extends
   `PluginContext`, so the same `managers`/`builders` calls work either way.) Also
   fixes the app's ephemeral, unreachable-plugin problem if they adopt the provider.
3. **Backend-LLM / thin-client integration path.** The developer's *backend* may own
   the LLM call. Then: (a) publish the command specs as a **language-neutral JSON**
   so a non-JS backend can register the tools; (b) the frontend maps incoming
   tool_call events → `Command` and calls `viewer.dispatch`. The Anthropic JS adapter
   is ONE path (frontend-owns-LLM, or backend forwards raw blocks), not the only one.
   The provider-agnostic executor + schema are the reusable core.

## Packaging notes
- `molstar` is a **peerDependency** (reuse the host's single instance; avoid double
  molstar / double WebGL).
- Consumers on Next.js need `transpilePackages: ['molstar']` (Mol\* ships untranspiled
  ESM); may also need the `h264-mp4-encoder` alias stub.
- Headless (no `createPluginUI`) sidesteps Mol\*'s React-render adapter, so React 19
  is not a problem for van-der-view.
