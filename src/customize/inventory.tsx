/**
 * The Big Five questionnaire Clone yourself asks, and what it found.
 *
 * On a phone one statement fills the screen, with a bar, Back, and the keys 1
 * to 5; a wider window lists them all, and the keys answer the first one left.
 * Every answer goes to `onChange` as it is given, which keeps it in this
 * browser, so a closed dialog opens where it stopped. The statements are the
 * IPIP's (ocean.ts), drawn through `t`; figures are drawn as given.
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
import { Button } from '@hanzo/ui'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { ANCHORS, DOMAIN, DOMAINS, FACET, FACETS, ITEMS, type Answers, type Form, type Score } from './ocean.ts'

const LEVELS = [1, 2, 3, 4, 5] as const

export function Inventory({ answers, onChange, onDone }: { answers: Answers; onChange: (a: Answers) => void; onDone: () => void }) {
  const { t } = useI18n()
  const phone = !useMedia().sm
  const items = ITEMS[answers.form]
  const given = answers[answers.form]
  const n = given.filter(Boolean).length
  const [at, setAt] = useState(() => Math.max(0, given.indexOf(0)))
  const list = useRef<HTMLDivElement | null>(null)
  // The keys answer the statement on screen, or the first one left in the list.
  const current = phone ? at : given.indexOf(0)

  const answer = (i: number, v: number) => {
    const next = given.map((x, j) => (j === i ? v : x))
    onChange({ ...answers, [answers.form]: next })
    const after = next.findIndex((x, j) => j > i && !x)
    const left = after >= 0 ? after : next.indexOf(0)
    if (phone) {
      if (left < 0) onDone()
      else setAt(left)
    } else if (left >= 0) {
      list.current?.querySelector(`[data-item="${left}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  const press = useRef(answer)
  press.current = answer
  // One handler for every row, so a row redraws only when its own answer or highlight changes.
  const pick = useCallback((i: number, v: number) => press.current(i, v), [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const v = Number(e.key)
      if (e.metaKey || e.ctrlKey || e.altKey || !(v >= 1 && v <= 5) || current < 0) return
      e.preventDefault()
      press.current(current, v)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [current])

  // Pinned to the top of the dialog's scroll, so the count and Done stay in reach down the list.
  const head = (
    <YStack gap="$2" pb="$2" bg="$background" z={1} position="sticky" t={0}>
      <XStack items="center" gap="$3">
        <YStack flex={1} height={4} rounded={999} bg="$hover" overflow="hidden" role="progressbar" aria-label={t('Answered')} aria-valuenow={n} aria-valuemin={0} aria-valuemax={items.length}>
          <YStack height={4} width={`${(n / items.length) * 100}%`} rounded={999} bg="$ink" />
        </YStack>
        <SizableText size="$1" color="$soft" fontVariant={['tabular-nums']}>
          {t('{n} of {total}', { n, total: items.length })}
        </SizableText>
        <Button size="sm" variant="ghost" onPress={onDone}>
          {t('Done')}
        </Button>
      </XStack>
      <SizableText size="$1" color="$soft">
        {t('Describe yourself as you generally are now, not as you wish to be in the future. From 1, very inaccurate, to 5, very accurate.')}
      </SizableText>
    </YStack>
  )

  if (phone) {
    const item = items[at]!
    return (
      <YStack gap="$4">
        {head}
        <SizableText size="$6" color="$ink" minH={64}>
          {t(item.text)}
        </SizableText>
        <YStack role="radiogroup" aria-label={t(item.text)} gap="$2">
          {LEVELS.map((v) => (
            <XStack
              key={v}
              render="button"
              role="radio"
              aria-checked={given[at] === v}
              aria-label={t(ANCHORS[v - 1])}
              onPress={() => answer(at, v)}
              minH={48}
              px="$3"
              gap="$3"
              items="center"
              rounded="$3"
              borderWidth={1}
              borderColor={given[at] === v ? '$ink' : '$borderColor'}
              bg={given[at] === v ? '$hover' : 'transparent'}
              cursor="pointer"
            >
              <SizableText size="$2" color="$soft" width={12} fontVariant={['tabular-nums']}>
                {v}
              </SizableText>
              <SizableText size="$3" color="$ink">
                {t(ANCHORS[v - 1])}
              </SizableText>
            </XStack>
          ))}
        </YStack>
        <XStack>
          <Button size="sm" variant="ghost" disabled={at === 0} onPress={() => setAt(at - 1)}>
            {t('Back')}
          </Button>
        </XStack>
      </YStack>
    )
  }

  return (
    <YStack gap="$3">
      {head}
      <YStack ref={list as never} role="list" aria-label={t('Statements')}>
        {items.map((item, i) => (
          <Statement key={i} i={i} text={t(item.text)} value={given[i] ?? 0} current={i === current} onAnswer={pick} />
        ))}
      </YStack>
    </YStack>
  )
}

/** One statement of the list, with its five answers. */
const Statement = memo(function Statement({ i, text, value, current, onAnswer }: { i: number; text: string; value: number; current: boolean; onAnswer: (i: number, v: number) => void }) {
  const { t } = useI18n()
  return (
    <XStack role="listitem" data-item={i} items="center" gap="$3" px="$2" py="$1.5" rounded="$2" bg={current ? '$hover' : 'transparent'}>
      <SizableText flex={1} size="$2" color={value ? '$soft' : '$ink'}>
        {text}
      </SizableText>
      <XStack role="radiogroup" aria-label={text} gap="$1.5" shrink={0}>
        {LEVELS.map((v) => (
          <XStack
            key={v}
            render="button"
            role="radio"
            aria-checked={value === v}
            aria-label={t(ANCHORS[v - 1])}
            onPress={() => onAnswer(i, v)}
            width={28}
            height={28}
            rounded={999}
            items="center"
            justify="center"
            borderWidth={1}
            borderColor={value === v ? '$ink' : '$borderColor'}
            bg={value === v ? '$ink' : 'transparent'}
            hoverStyle={value === v ? undefined : { bg: '$hover' }}
            cursor="pointer"
          >
            <SizableText size="$1" color={value === v ? '$background' : '$soft'} fontVariant={['tabular-nums']}>
              {v}
            </SizableText>
          </XStack>
        ))}
      </XStack>
    </XStack>
  )
})

/** The five domains as bars of their raw means, 1 to 5, and on the long form each domain's six facets under it. */
export function Traits({ form, score }: { form: Form; score: Score }) {
  const { t } = useI18n()
  return (
    <YStack gap="$3">
      {DOMAINS.map((d) => (
        <YStack key={d} gap="$1.5">
          <Bar label={t(DOMAIN[d])} value={score.domains[d]} strong />
          {form === 'long' ? FACETS(d).map((f) => <Bar key={f} label={t(FACET[f])} value={score.facets[f] ?? 0} />) : null}
        </YStack>
      ))}
    </YStack>
  )
}

function Bar({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  const h = strong ? 6 : 4
  return (
    <XStack items="center" gap="$3" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={1} aria-valuemax={5} aria-valuetext={value.toFixed(1)} pl={strong ? 0 : '$3'}>
      <SizableText size={strong ? '$2' : '$1'} color={strong ? '$ink' : '$soft'} width={strong ? 150 : 138} numberOfLines={1}>
        {label}
      </SizableText>
      <YStack flex={1} height={h} rounded={999} bg="$hover" overflow="hidden">
        <YStack height={h} width={`${((value - 1) / 4) * 100}%`} rounded={999} bg={strong ? '$ink' : '$soft'} />
      </YStack>
      <SizableText size="$1" color="$soft" width={24} text="right" fontVariant={['tabular-nums']}>
        {value.toFixed(1)}
      </SizableText>
    </XStack>
  )
}
