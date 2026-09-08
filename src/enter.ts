/**
 * Signing in WITHOUT LOSING THE PAGE.
 *
 * A full-page redirect unloads the document, and with it the sentence somebody
 * typed and the project they had open. The popup keeps the document, so the
 * work is still on screen when the account arrives. A browser that refuses the
 * popup falls back to the redirect, which is the only alternative there is.
 *
 * One function, so every Sign in on this surface behaves the same way.
 */
export interface Door {
  login: () => unknown
  loginPopup: () => Promise<unknown>
}

/** True when the popup completed here; false when the browser was sent away. */
export async function enter(door: Door): Promise<boolean> {
  try {
    await door.loginPopup()
    return true
  } catch {
    void door.login()
    return false
  }
}
