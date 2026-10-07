/**
 * Customize's reads: data.ts `useRead`, given up on after `WAIT`. A read that
 * hangs says so and offers a retry instead of loading forever; the request
 * itself is left to finish or fail on its own.
 */
import { useRead, type Read } from '../data.ts'
import { Slow } from './say.ts'

/** How long a read may take before the page says it is slow. */
export const WAIT = 15_000

/** `p`, or a `Slow` refusal once `ms` pass first. */
export function within<T>(p: Promise<T>, ms = WAIT): Promise<T> {
  return new Promise<T>((ok, no) => {
    const id = setTimeout(() => no(new Slow()), ms)
    p.then(
      (v) => {
        clearTimeout(id)
        ok(v)
      },
      (e: unknown) => {
        clearTimeout(id)
        no(e)
      },
    )
  })
}

export function useLoad<T>(load: (() => Promise<T>) | null, initial: T, key: unknown[]): Read<T> {
  return useRead(load ? () => within(load()) : null, initial, key)
}
