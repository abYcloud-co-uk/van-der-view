'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PluginContext } from 'molstar/lib/mol-plugin/context'; // type-only → erased at runtime
import type { MolView, CreateMolViewOptions } from '../mol/create-mol-view';

/** Host configuration passed to createMolView by the canvas. */
export type MolViewConfig = Pick<CreateMolViewOptions, 'resolveStructure' | 'resolveCoordinates'>;

/** Stable empty-config sentinel so an omitted `config` prop doesn't churn the context value. */
const EMPTY_CONFIG: MolViewConfig = {};

interface MolViewContextValue {
  view: MolView | undefined;
  config: MolViewConfig;
  plugin?: PluginContext;
  registerView: (view: MolView | undefined) => void;
}

const MolViewCtx = createContext<MolViewContextValue | null>(null);

export interface MolViewProviderProps {
  config?: MolViewConfig;
  /** Attach to a plugin the host already mounted (vdv will not dispose it). */
  plugin?: PluginContext;
  children: ReactNode;
}

export function MolViewProvider({ config, plugin, children }: MolViewProviderProps) {
  const [view, setView] = useState<MolView | undefined>(undefined);
  const cfg = config ?? EMPTY_CONFIG;
  const value = useMemo<MolViewContextValue>(
    () => ({ view, config: cfg, plugin, registerView: setView }),
    [view, cfg, plugin],
  );
  return <MolViewCtx.Provider value={value}>{children}</MolViewCtx.Provider>;
}

export function useMolViewContext(): MolViewContextValue {
  const ctx = useContext(MolViewCtx);
  if (ctx === null) throw new Error('useMolView/<MolViewCanvas> must be used within <MolViewProvider>.');
  return ctx;
}
