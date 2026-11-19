/**
 * Where a run can run: the platform's cloud workspace, or one of the org's machines.
 *
 *   GET /v1/agent/targets → {targets: [...]}, newest first (machines.ts)
 *
 * The cloud workspace is not a row the platform lists — it is what a run gets when it
 * names no target — so it is the first place here and carries no id. A machine
 * can take a run only while it is online.
 */
import { phrase } from '@hanzo/i18n'

import { formatDeviceLabel } from '../dev-mode.ts'
import type { Target } from './call.ts'
import { machines, state } from './machines.ts'

export interface Place {
  /** `tgt_…`, or '' for the cloud workspace. */
  id: string
  label: string
  /** laptop | gpu | cloud | … as the platform names it; 'sandbox' for the cloud workspace. */
  kind: string
  /** online | offline | draining | not seen yet, as machines.ts `state` reads it; the cloud workspace is always online. */
  status: string
  /** "10 vCPU / 122G / 1× GB10", when the machine reported one. */
  capacity: string
}

/** The cloud workspace, named in English and marked (`phrase`): a screen draws its label through `t`. */
export const SANDBOX: Place = { id: '', label: phrase('Cloud workspace'), kind: 'sandbox', status: 'online', capacity: '' }

export async function places(t: Target): Promise<Place[]> {
  const list = await machines(t)
  return [SANDBOX, ...list.map((m) => ({ id: m.id, label: m.label, kind: m.kind, status: state(m), capacity: m.capacity }))]
}

export function displayPlace(
  p: Place,
  opts?: { devMode?: boolean; cloudTitle?: string },
): { title: string; detail?: string } {
  if (!p.id) {
    return {
      title: opts?.devMode ? 'Cloud' : (opts?.cloudTitle ?? 'Auto (Cloud)'),
      detail: 'Runs automatically in your Hanzo cloud workspace',
    }
  }
  return formatDeviceLabel(p.label, {
    kind: p.kind,
    hardware: p.capacity,
    devMode: opts?.devMode,
  })
}

/** Whether a run sent here now would be taken. */
export const ready = (p: Place): boolean => p.status === 'online'
