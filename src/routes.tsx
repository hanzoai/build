import { createBrowserRouter } from 'react-router'

import { Build } from '~/Build'
import { Callback } from '~/callback'
import { Frame } from '~/frame'
import { Root } from '~/root'
import { Session } from '~/Session'
import { useOpen } from '~/open'

/**
 * The builder, in the two states it has.
 *
 * ONE SURFACE. The build pane is the empty state and an open run replaces it in
 * place — a run is not a second address, it is what this address is showing, and
 * `?session=` in the URL is what a reload and a shared link both land on.
 *
 * `key` on the run, so moving from one to another remounts rather than feeding a
 * second run's turns into the first one's transcript.
 */
function Builder() {
  const { session } = useOpen()
  return <Frame>{session ? <Session key={session} id={session} /> : <Build />}</Frame>
}

/**
 * Every address this app answers, in one table.
 *
 * `/auth/callback` is where the issuer returns a browser, and it is the address
 * `origin()` registers, so it is a route rather than a state of the builder.
 *
 * Anything else is the builder. A demo with one surface has no second page to
 * send a stranger to, and forwarding an unknown address to another host would
 * make this repo depend on one.
 */
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/auth/callback', element: <Callback /> },
      { path: '*', element: <Builder /> },
    ],
  },
])
