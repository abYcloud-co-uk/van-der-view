'use client';
import type { MolView } from '../mol/create-mol-view';
import { useMolViewContext } from './provider';

/** The mounted viewer, or undefined until <MolViewCanvas/> has mounted and initialized. */
export function useMolView(): MolView | undefined {
  return useMolViewContext().view;
}
