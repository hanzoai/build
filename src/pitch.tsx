// What this is, for a reader who has not signed in.
//
// THE PITCH IS UNDER THE ASK, not over it. Someone who already knows what they
// want types it and never reads this; someone who does not scrolls. Putting the
// explanation first would make the second reader's page the first reader's
// obstacle.
//
// EVERY CLAIM HERE IS ONE THE CODE MAKES. The modes are Build.tsx's, the rows
// are `/v1/projects`, the starters are `/v1/templates`, and the address is the
// `?session=` a run already lives at. A landing page that promises a sixth
// thing is a landing page that goes stale the first time nobody updates it.

import { Text, XStack, YStack } from '@hanzo/ui'

/** One claim, and the sentence that makes it concrete. */
interface Claim {
  title: string
  says: string
}

const CLAIMS: Claim[] = [
  {
    title: 'Say it, or ask what it would take',
    says: 'Build writes the thing. Plan answers what building it would involve, before anything is written. The mode rides with the ask, so the surface that answers knows which one you meant.',
  },
  {
    title: 'It runs where it ships',
    says: 'A project here is a real row, the same one a deployed site is served from. There is no draft store to promote out of — what you are looking at is what is live.',
  },
  {
    title: 'The parts are already there',
    says: 'The database, the sign-in and the storage exist before you ask. Nothing to provision, nothing to wire, and no keys to paste in.',
  },
  {
    title: 'Start from a picture',
    says: 'The starters are a public catalog, so you pick one by looking at it. Choosing takes a copy rather than asking a model to reinvent a starter that already exists.',
  },
  {
    title: 'A run has an address',
    says: 'Every run is at its own URL. A reload lands back on it and so does anyone you send it to.',
  },
]

export function Pitch() {
  return (
    <YStack pt="$6" pb="$9" gap="$6" items="center" px="$4">
      <YStack maxW={560} gap="$2">
        <Text render="h2" fontSize="$7" lineHeight="$7" fontWeight="500" color="$ink" text="center">
          Describe an app. Watch it built.
        </Text>
        <Text fontSize="$3" color="$soft" text="center">
          Hanzo Build takes a sentence and gives back something running on a URL you can send to
          someone.
        </Text>
      </YStack>

      {/* A column of claims rather than a grid of cards: these are read in
          order and the last one is the one that closes, which a grid loses. */}
      <YStack width={720} maxW="100%" gap="$5">
        {CLAIMS.map((claim) => (
          <XStack key={claim.title} gap="$4" items="flex-start">
            {/* The rule stands in for a number. It orders the list without
                claiming these are steps — they are not, they are true at once. */}
            <YStack width={2} self="stretch" bg="$borderColor" rounded="$1" />
            <YStack flex={1} gap="$1">
              <Text fontSize="$4" fontWeight="500" color="$ink">
                {claim.title}
              </Text>
              <Text fontSize="$3" lineHeight="$4" color="$soft">
                {claim.says}
              </Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}
