import { createAuthClient } from "better-auth/react"
import { expoClient } from "@better-auth/expo/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

import { getAuthBaseURLForClient } from "@/lib/config"

/**
 * Platform-aware synchronous storage for the Expo cookie-jar.
 *
 * `@better-auth/expo`'s expoClient persists the Better Auth session cookie via
 * `storage.getItem`/`setItem`. On native we back it with expo-secure-store; on
 * web (`Platform.OS === "web"`) expo-secure-store's native module is empty and
 * `SecureStore.getItem` THROWS, so we fall back to `localStorage` (and the
 * browser cookie jar is used anyway).
 */
const authStorage =
  Platform.OS === "web"
    ? {
        getItem: (key: string): string | null =>
          typeof window !== "undefined"
            ? window.localStorage.getItem(key)
            : null,
        getItemAsync: async (key: string): Promise<string | null> =>
          typeof window !== "undefined"
            ? window.localStorage.getItem(key)
            : null,
        setItem: (key: string, value: string): void => {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(key, value)
          }
        },
        setItemAsync: async (key: string, value: string): Promise<void> => {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(key, value)
          }
        },
      }
    : {
        getItem: (key: string) => SecureStore.getItem(key),
        getItemAsync: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) =>
          SecureStore.setItem(key, value),
        setItemAsync: (key: string, value: string) =>
          SecureStore.setItemAsync(key, value),
      }

// Lazily constructed so this module can be imported during Expo web static
// prerender (and with any env) without running createAuthClient at load. The
// factory wrapper preserves the plugin-derived action types (device, ...) that
// a bare `ReturnType<typeof createAuthClient>` would lose. better-auth 1.7
// registers generic OAuth providers as first-class social providers, so the
// old genericOAuthClient() plugin (and signIn.oauth2) are gone; sign-in goes
// through signIn.social({ provider: "feishu" }).
function createConfiguredAuthClient() {
  return createAuthClient({
    // Public origin Better Auth is mounted on; basePath rides the same /api/v1
    // path the rest of the app uses (the BA client default is /api/auth).
    // Resolved lazily: an absolute origin when configured, or undefined so BA
    // self-derives at construction without throwing (never a relative string).
    baseURL: getAuthBaseURLForClient(),
    basePath: "/api/v1/auth",
    plugins: [
      expoClient({
        scheme: "synapse",
        storagePrefix: "synapse",
        storage: authStorage,
      }),
      deviceAuthorizationClient(),
    ],
  })
}

type AuthClient = ReturnType<typeof createConfiguredAuthClient>

let cachedAuthClient: AuthClient | undefined

export function getAuthClient(): AuthClient {
  if (!cachedAuthClient) {
    cachedAuthClient = createConfiguredAuthClient()
  }
  return cachedAuthClient
}

/**
 * Extract the single Better Auth session-cookie VALUE from the cookie-jar's
 * `Cookie` header string, for the contexts that must use `Authorization:
 * Bearer <token>` instead of a Cookie header (DOM/WebView, service worker,
 * media `<img>`/fetch, and the WS auth frame — `Cookie` is a forbidden header
 * there). The signed value (which contains a `.`) is what the server's bearer
 * plugin verifies; we never send the whole `a=b; c=d` cookie string as a token.
 *
 * Returns null on web (the cookie-jar is empty there; web uses the browser
 * cookie store) or when no session cookie is present.
 */
export async function getSessionBearerToken(): Promise<string | null> {
  // @better-auth/expo 1.7 made getCookie() async (it reads the storage adapter
  // asynchronously); the jar can also be chunked, so callers must use this API
  // rather than reading the storage key directly.
  const header = await getAuthClient().getCookie()
  if (!header) return null
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    // Match Better Auth's session cookie by suffix so it works regardless of
    // the production `__Secure-` prefix (e.g. better-auth.session_token /
    // __Secure-better-auth.session_token).
    if (name.endsWith("session_token")) {
      return value || null
    }
  }
  return null
}

// The expo client persists its cookie-jar and cached session under
// `<storagePrefix>_cookie` / `<storagePrefix>_session_data` (storagePrefix:
// "synapse"). Clear both so a stale session from a previous login can't be read
// as the outcome of a fresh OAuth attempt (see verifyOAuthSession). Best-effort:
// secure-store deletes can throw on web, where the jar is unused anyway.
export function clearExpoAuthJar(): void {
  for (const key of ["synapse_cookie", "synapse_session_data"]) {
    try {
      authStorage.setItem(key, "")
    } catch {
      // ignore: web/secure-store edge cases; jar is empty there.
    }
  }
}
