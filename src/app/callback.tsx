import { useIam } from '@hanzo/iam/react'
import { Box, Text, YStack } from '@hanzo/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { back } from './enter.ts'

/**
 * The return from Hanzo IAM.
 *
 * The SDK reads the authorization code and state from the URL and the PKCE
 * verifier from storage, exchanges the code, and stores the tokens. Nothing
 * here touches a credential; this screen only decides where the reader lands:
 * the address they left from (enter.ts), or New.
 *
 * A failed exchange is reported rather than swallowed: it is the most expensive
 * refusal in the whole flow, and it is invisible from the outside.
 */
export function Callback() {
  const go = useNavigate()
  const { handleCallback } = useIam()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    handleCallback()
      .then(() => {
        if (!cancelled) go(back(), { replace: true })
      })
      .catch((err: unknown) => {
        // The SDK hands every refusal over as an Error.
        if (!cancelled) setError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [handleCallback, go])

  return (
    <Box flex={1} items="center" justify="center" bg="$background">
      <YStack gap="$2" items="center">
        <Text fontSize="$5" color="$ink">
          {error ?? 'Completing sign-in…'}
        </Text>
        <Text fontSize="$3" color="$soft">
          {error ? 'Try signing in again.' : 'One moment.'}
        </Text>
      </YStack>
    </Box>
  )
}
