/**
 * The builder's reads, as hooks: one per thing on screen, each answering
 * `{value, error, loading, reload}` so every pane owes the same three states.
 *
 * A read that fails says so and keeps what it had; a read with no person
 * signed in is not attempted — the platform would refuse it and the refusal
 * would read as an outage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Target } from './api/call.ts'
import { places, type Place } from './api/places.ts'
import { projects, type Project } from './api/projects.ts'
import { get, list, watch, type Detail, type Event, type Session } from './api/sessions.ts'
import { merge } from './api/turn.ts'

export interface Read<T> {
  value: T
  error: Error | null
  loading: boolean
  reload: () => void
}

/** Run `load` whenever `key` changes (and on `reload`), keeping the last good value. */
export function useRead<T>(load: (() => Promise<T>) | null, initial: T, key: unknown[]): Read<T> {
  const [value, setValue] = useState<T>(initial)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(Boolean(load))
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])
  useEffect(() => {
    if (!load) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    load()
      .then((v) => {
        if (!live) return
        setValue(v)
        setError(null)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // `key` is the dependency list, by contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...key, tick])
  return { value, error, loading, reload }
}

/**
 * The org's coding runs, newest first, kept current by the org's own session
 * stream: a status that moves moves its dot, and a run started anywhere appears.
 */
export function useRecents(t: Target, signed: boolean): Read<Session[]> {
  const read = useRead(signed ? () => list(t, { kind: 'coding', limit: 50 }) : null, [] as Session[], [t, signed])
  const [rows, setRows] = useState<Session[]>([])
  useEffect(() => setRows(read.value), [read.value])
  // A feed of the whole org carries every agent's heartbeat, so an unseen id
  // re-reads the list at most every five seconds.
  const last = useRef(0)
  const reload = useRef(() => {})
  reload.current = () => {
    const now = Date.now()
    if (now - last.current < 5000) return
    last.current = now
    read.reload()
  }
  useEffect(() => {
    if (!signed) return
    const ctl = new AbortController()
    void watch(
      t,
      '',
      {
        session: (s) =>
          setRows((prev) => {
            const i = prev.findIndex((r) => r.id === s.id)
            if (i === -1) {
              // A run this list has not seen: re-read rather than guess its kind.
              reload.current()
              return prev
            }
            const next = prev.slice()
            next[i] = { ...prev[i], ...s, title: s.title || prev[i].title }
            return next
          }),
        open: (n) => {
          if (n > 0) reload.current()
        },
      },
      ctl.signal,
    ).catch(() => {
      /* a refused feed leaves the list as read */
    })
    return () => ctl.abort()
  }, [t, signed])
  return { ...read, value: rows }
}

export function usePlaces(t: Target, signed: boolean): Read<Place[]> {
  return useRead(signed ? () => places(t) : null, [] as Place[], [t, signed])
}

export function useProjects(t: Target, signed: boolean): Read<Project[]> {
  return useRead(signed ? () => projects(t) : null, [] as Project[], [t, signed])
}

/** A value kept in this browser, per key; storage that throws keeps it in memory. */
export function useKept<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        window.localStorage.setItem(key, JSON.stringify(v))
      } catch {
        /* kept for this page only */
      }
    },
    [key],
  )
  return [value, set]
}

export interface RunState {
  detail: Read<Detail | null>
  /** Every turn, recorded and live, in order. */
  events: Event[]
  /** The run's status as last reported by the record or the feed. */
  status: string
  /** Why the feed stopped, when it was refused. */
  refused: string
}

/**
 * One run: the recorded detail, then the live feed added to it. A reconnect
 * after a drop re-reads the detail — frames missed while dropped are only in
 * the record. `id` null reads nothing.
 */
export function useRun(t: Target, id: string | null): RunState {
  const detail = useRead<Detail | null>(id ? () => get(t, id) : null, null, [t, id])
  const [live, setLive] = useState<Event[]>([])
  const [status, setStatus] = useState('')
  const [refused, setRefused] = useState('')
  const reload = useRef(detail.reload)
  reload.current = detail.reload

  useEffect(() => {
    setLive([])
    setStatus('')
    setRefused('')
    if (!id) return
    const ctl = new AbortController()
    void watch(
      t,
      id,
      {
        event: (e) => {
          if (e.sessionId === id) setLive((prev) => [...prev, e])
        },
        session: (s) => {
          if (s.id === id) setStatus(s.status)
        },
        open: (n) => {
          if (n > 0) reload.current()
        },
      },
      ctl.signal,
    ).catch((e: unknown) => setRefused(e instanceof Error ? e.message : 'The feed was refused'))
    return () => ctl.abort()
  }, [t, id])

  const events = useMemo(() => merge(detail.value?.recent ?? [], live), [detail.value, live])
  return { detail, events, status: status || detail.value?.status || '', refused }
}
