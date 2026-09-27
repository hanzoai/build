/**
 * The clients behind the rail's Artifacts and the Code settings: a project's
 * rename, visibility and delete; the org's machines and their claim keys; and a
 * person's API keys. Exact addresses and bodies, thin rows read as empty values,
 * and what is refused before anything is sent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Refusal, type Target } from './call.ts'
import { keys, limits, mint, revoke } from './keys.ts'
import { add, change as changeMachine, key, machine, machines, remove as removeMachine } from './machines.ts'
import { places, SANDBOX } from './places.ts'
import { change, project, remove } from './projects.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

function answer(status: number, body: unknown) {
  const seen: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }),
  )
  return seen
}

afterEach(() => vi.unstubAllGlobals())

describe('projects', () => {
  it('reads visibility and both times, and thin rows as empty', () => {
    expect(project({ slug: 'site', visibility: 'private', createdAt: 100, updatedAt: 200 })).toMatchObject({ visibility: 'private', created: 100, updated: 200 })
    expect(project({ slug: 'site', createdAt: '100', updatedAt: Number.NaN })).toMatchObject({ visibility: '', created: 0, updated: 0 })
  })

  it('renames with only the name, trimmed', async () => {
    const seen = answer(200, { slug: 'site', name: 'Shop', visibility: 'public' })
    const p = await change(T, 'site', { name: '  Shop ' })
    expect(seen[0]).toEqual({ method: 'PATCH', url: 'https://api.hanzo.ai/v1/projects/site', body: { name: 'Shop' } })
    expect(p).toMatchObject({ slug: 'site', name: 'Shop' })
  })

  it('flips visibility with only the visibility', async () => {
    const seen = answer(200, { slug: 'site', visibility: 'private' })
    expect((await change(T, 'site', { visibility: 'private' })).visibility).toBe('private')
    expect(seen[0].body).toEqual({ visibility: 'private' })
  })

  it('refuses a blank name before sending', async () => {
    const seen = answer(200, {})
    await expect(change(T, 'site', { name: '  ' })).rejects.toThrow('A project needs a name')
    expect(seen).toHaveLength(0)
  })

  it('says the platform’s reason when private is not paid for', async () => {
    answer(402, { error: { code: 'insufficient_funds', message: 'add funds to publish privately' } })
    await expect(change(T, 'site', { visibility: 'private' })).rejects.toMatchObject({ status: 402, message: 'add funds to publish privately' })
  })

  it('deletes by an escaped slug', async () => {
    const seen = answer(204, undefined)
    await remove(T, 'a/b')
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: 'https://api.hanzo.ai/v1/projects/a%2Fb' })
  })
})

describe('machines', () => {
  const row = {
    id: 'tgt_1',
    label: 'workshop',
    kind: 'gpu',
    status: 'online',
    capacity: '1× GB10',
    host: 'spark',
    sessions: 4,
    running: 1,
    metricsAt: '2026-09-27T00:00:00Z',
    spec: { os: 'linux' },
  }

  it('lists the org’s machines, dropping a row with no id', async () => {
    const seen = answer(200, { targets: [row, { label: 'ghost' }] })
    const list = await machines(T)
    expect(seen[0]).toMatchObject({ method: 'GET', url: 'https://api.hanzo.ai/v1/agent/targets' })
    expect(list).toEqual([
      { id: 'tgt_1', label: 'workshop', kind: 'gpu', status: 'online', capacity: '1× GB10', host: 'spark', sessions: 4, running: 1, seen: '2026-09-27T00:00:00Z' },
    ])
  })

  it('names a machine by its host, then its id, when it has no label', () => {
    expect(machine({ id: 'tgt_2', host: 'box' }).label).toBe('box')
    expect(machine({ id: 'tgt_3' }).label).toBe('tgt_3')
  })

  it('keeps the places New offers the same rows', async () => {
    answer(200, { targets: [row] })
    expect(await places(T)).toEqual([SANDBOX, { id: 'tgt_1', label: 'workshop', kind: 'gpu', status: 'online', capacity: '1× GB10' }])
  })

  it('registers one by hand, sending a hostname only when there is one', async () => {
    let seen = answer(201, row)
    await add(T, { label: ' workshop ', kind: 'gpu', host: ' spark ' })
    expect(seen[0]).toEqual({ method: 'POST', url: 'https://api.hanzo.ai/v1/agent/targets', body: { label: 'workshop', kind: 'gpu', host: 'spark' } })
    seen = answer(201, row)
    await add(T, { label: 'laptop', kind: 'laptop' })
    expect(seen[0].body).toEqual({ label: 'laptop', kind: 'laptop' })
    seen = answer(201, row)
    await expect(add(T, { label: ' ', kind: 'machine' })).rejects.toThrow('A machine needs a name')
    expect(seen).toHaveLength(0)
  })

  it('renames and drains with only what changed', async () => {
    const seen = answer(200, { ...row, status: 'draining' })
    expect((await changeMachine(T, 'tgt_1', { status: 'draining' })).status).toBe('draining')
    expect(seen[0]).toEqual({ method: 'PATCH', url: 'https://api.hanzo.ai/v1/agent/targets/tgt_1', body: { status: 'draining' } })
    answer(200, row)
    await changeMachine(T, 'tgt_1', { label: ' dgx ' })
    await expect(changeMachine(T, 'tgt_1', { label: '' })).rejects.toThrow('A machine needs a name')
  })

  it('says who may, when the platform hides a machine that is not yours', async () => {
    answer(404, { detail: 'target not found' })
    const err = (await removeMachine(T, 'tgt_1').catch((e: unknown) => e)) as Refusal
    expect(err).toBeInstanceOf(Refusal)
    expect(err.message).toBe('This machine is gone, or not yours to change: only the member who linked it, or an org admin, can.')
    answer(403, { detail: 'org admin required' })
    await expect(changeMachine(T, 'tgt_1', { status: 'online' })).rejects.toThrow('org admin required')
  })

  it('removes by an escaped id', async () => {
    const seen = answer(200, { deleted: true, id: 'tgt_1' })
    await removeMachine(T, 'tgt 1')
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: 'https://api.hanzo.ai/v1/agent/targets/tgt%201' })
  })

  it('mints a claim key once, and refuses an answer with none', async () => {
    const seen = answer(200, { targetId: 'tgt_1', claimKey: 'tk_secret' })
    expect(await key(T, 'tgt_1')).toBe('tk_secret')
    expect(seen[0]).toEqual({ method: 'POST', url: 'https://api.hanzo.ai/v1/agent/targets/tgt_1/key', body: undefined })
    answer(200, { targetId: 'tgt_1' })
    await expect(key(T, 'tgt_1')).rejects.toThrow('The platform answered no key')
  })
})

describe('keys', () => {
  it('reads both keys, a secret by its prefix, and drops an unknown type', async () => {
    const seen = answer(200, {
      keys: [
        { type: 'secret', prefix: 'sk-ab12', createdAt: '2026-09-01T00:00:00Z', limit: ['model:zen5'] },
        { type: 'publishable', prefix: 'pk-cd34', key: 'pk-cd34full' },
        { type: 'master', prefix: 'mk-' },
      ],
    })
    expect(await keys(T)).toEqual([
      { type: 'secret', prefix: 'sk-ab12', key: '', limit: ['model:zen5'], created: '2026-09-01T00:00:00Z' },
      { type: 'publishable', prefix: 'pk-cd34', key: 'pk-cd34full', limit: [], created: '' },
    ])
    expect(seen[0]).toMatchObject({ method: 'GET', url: 'https://api.hanzo.ai/v1/account/keys' })
  })

  it('reads an empty answer as no keys', async () => {
    answer(200, {})
    expect(await keys(T)).toEqual([])
  })

  it('mints a key, sending a limit only when there is one', async () => {
    let seen = answer(200, { key: 'sk-new', accessKey: 'sk-new', type: 'secret' })
    expect(await mint(T, 'secret')).toEqual({ type: 'secret', key: 'sk-new', limit: [] })
    expect(seen[0]).toEqual({ method: 'POST', url: 'https://api.hanzo.ai/v1/account/keys', body: { type: 'secret' } })
    seen = answer(200, { accessKey: 'pk-new', type: 'publishable', limit: ['project:acme'] })
    expect(await mint(T, 'publishable', ['project:acme'])).toEqual({ type: 'publishable', key: 'pk-new', limit: ['project:acme'] })
    expect(seen[0].body).toEqual({ type: 'publishable', limit: ['project:acme'] })
    answer(200, { type: 'secret' })
    await expect(mint(T, 'secret')).rejects.toThrow('The platform answered no key')
  })

  it('revokes the one type named, in the query', async () => {
    const seen = answer(200, { ok: true, type: 'publishable' })
    await revoke(T, 'publishable')
    expect(seen[0]).toEqual({ method: 'DELETE', url: 'https://api.hanzo.ai/v1/account/keys?type=publishable', body: undefined })
  })

  it('reads limits as kind:name, and refuses the first that is not one', () => {
    expect(limits(' model:zen5, project:acme  model:* ')).toEqual(['model:zen5', 'project:acme', 'model:*'])
    expect(limits('')).toEqual([])
    expect(() => limits('model:zen5, zen5')).toThrow('zen5 is not a limit')
    expect(() => limits('Model:zen5')).toThrow('is not a limit')
  })
})
