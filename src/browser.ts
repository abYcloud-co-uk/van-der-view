// Molstar/React surface for van-der-view. Intentionally NOT re-exported from
// src/index.ts (the agent-side barrel stays molstar-free). Only the React layer is
// re-exported as values here, so importing this module pulls no molstar at module
// load — the mol layer (and molstar) loads lazily inside <MolViewCanvas/>'s effect.
export { MolViewProvider } from './react/provider';
export type { MolViewConfig, MolViewProviderProps } from './react/provider';
export { MolViewCanvas } from './react/canvas';
export { useMolView } from './react/use-mol-view';
export type { MolView, CreateMolViewOptions } from './mol/create-mol-view';
export type { MolViewXR } from './mol/xr';
