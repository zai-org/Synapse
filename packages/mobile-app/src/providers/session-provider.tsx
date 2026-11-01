import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  ApiError,
  api,
  setApiAuthToken,
  setApiUnauthorizedHandler,
} from "@/lib/api"
import {
  clearExpoAuthJar,
  getAuthClient,
  getSessionBearerToken,
} from "@/lib/auth-client"
import { assertAuthConfigured, hasValidAuthNetworkConfig } from "@/lib/config"
import { createChatPersistence } from "@/lib/chat-persistence"
import { SESSION_TOKEN_KEY } from "@/lib/storage-keys"
import {
  deleteStoredValue,
  readStoredValue,
  writeStoredValue,
} from "@/lib/storage"
import type { AuthMeView, AuthSessionSummary, User } from "@shared"
const chatPersistence = createChatPersistence()

type SessionStatus = "loading" | "authenticated" | "unauthenticated"

interface SessionContextValue {
  status: SessionStatus
  user: User | null
  session: AuthSessionSummary | null
  token: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  /**
   * Strict session check for the OAuth return: resolves true ONLY when a token
   * exists AND `getMe()` succeeds. No token, 401/403, or a network failure all
   * resolve false (and do not mark the session authenticated). Distinct from
   * `refreshSession`, which keeps an authenticated session through a network
   * blip — the OAuth path must not treat "couldn't verify" as success.
   */
  verifyOAuthSession: () => Promise<boolean>
  /** Wipe any local session before starting an OAuth attempt (see usage). */
  clearLocalSessionForOAuth: () => Promise<void>
  updateProfile: (data: {
    name?: string
    avatarFileId?: string | null
  }) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

async function persistSessionToken(token: string | null) {
  if (token) {
    await writeStoredValue(SESSION_TOKEN_KEY, token)
    return
  }

  await deleteStoredValue(SESSION_TOKEN_KEY)
}

function applySession(
  payload: {
    token: string | null
    response?: AuthMeView | { user: User; session: AuthSessionSummary } | null
  },
  setState: React.Dispatch<
    React.SetStateAction<{
      status: SessionStatus
      user: User | null
      session: AuthSessionSummary | null
      token: string | null
    }>
  >
) {
  setApiAuthToken(payload.token)
  setState({
    status: payload.response ? "authenticated" : "unauthenticated",
    token: payload.token,
    user: payload.response?.user ?? null,
    session: payload.response?.session ?? null,
  })
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<{
    status: SessionStatus
    user: User | null
    session: AuthSessionSummary | null
    token: string | null
  }>({
    status: "loading",
    user: null,
    session: null,
    token: null,
  })

  const clearSession = useCallback(async () => {
    await persistSessionToken(null)
    await chatPersistence.clearAllWorkspaceState()
    // Wipe React Query cache so a subsequent login (possibly a different user)
    // never reads the previous session's cached workspace data.
    queryClient.clear()
    applySession({ token: null }, setState)
  }, [queryClient])

  const refreshSession = useCallback(async () => {
    // Prefer our persisted bearer token; otherwise fall back to the Better Auth
    // expo cookie-jar (this is how an OAuth/deep-link return surfaces a session
    // that was established by the browser flow, not by our email sign-in).
    let storedToken = await readStoredValue(SESSION_TOKEN_KEY)
    if (!storedToken) {
      const jarToken = await getSessionBearerToken()
      if (jarToken) {
        storedToken = jarToken
        await persistSessionToken(jarToken)
      }
    }
    if (!storedToken) {
      applySession({ token: null }, setState)
      return
    }

    setApiAuthToken(storedToken)

    try {
      const response = await api.getMe()
      applySession({ token: storedToken, response }, setState)
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        await clearSession()
        return
      }

      setApiAuthToken(storedToken)
      setState((current) => ({
        ...current,
        status: "authenticated",
        token: storedToken,
      }))
    }
  }, [clearSession])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  // Wipe every local trace of a session before an OAuth attempt: our persisted
  // token + provider state + query cache (via clearSession), plus the Better
  // Auth expo cookie-jar / session cache. Otherwise a leftover session from a
  // previous login could make verifyOAuthSession() succeed even after the user
  // cancelled this OAuth flow.
  const clearLocalSessionForOAuth = useCallback(async () => {
    await clearSession()
    clearExpoAuthJar()
  }, [clearSession])

  // Strict post-OAuth check (see SessionContextValue). Only a token + a
  // successful getMe() counts as signed in; everything else is false and leaves
  // the session unauthenticated.
  const verifyOAuthSession = useCallback(async () => {
    let token = await readStoredValue(SESSION_TOKEN_KEY)
    if (!token) {
      const jarToken = await getSessionBearerToken()
      if (jarToken) {
        token = jarToken
        await persistSessionToken(jarToken)
      }
    }
    if (!token) {
      applySession({ token: null }, setState)
      return false
    }

    setApiAuthToken(token)
    try {
      const response = await api.getMe()
      applySession({ token, response }, setState)
      return true
    } catch {
      // Any failure (401/403, network, anything) is NOT a successful sign-in.
      await clearSession()
      return false
    }
  }, [clearSession])

  useEffect(() => {
    setApiUnauthorizedHandler(() => clearSession())
    return () => {
      setApiUnauthorizedHandler(null)
    }
  }, [clearSession])

  const signIn = useCallback(async (email: string, password: string) => {
    assertAuthConfigured()
    const { data, error } = await getAuthClient().signIn.email({
      email,
      password,
    })
    if (error) {
      throw new ApiError(
        error.message ?? "Sign in failed",
        error.status ?? 401,
        error.code
      )
    }
    // Prefer the token from the response body; fall back to the expo cookie-jar.
    // This is the bearer token the REST/WS layers attach.
    const token = data?.token ?? (await getSessionBearerToken())
    await persistSessionToken(token)
    setApiAuthToken(token)
    const me = await api.getMe()
    applySession({ token, response: me }, setState)
  }, [])

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      assertAuthConfigured()
      const { data, error } = await getAuthClient().signUp.email({
        name,
        email,
        password,
      })
      if (error) {
        throw new ApiError(
          error.message ?? "Sign up failed",
          error.status ?? 400,
          error.code
        )
      }
      const token = data?.token ?? (await getSessionBearerToken())
      await persistSessionToken(token)
      setApiAuthToken(token)
      const me = await api.getMe()
      applySession({ token, response: me }, setState)
    },
    []
  )

  const signOut = useCallback(async () => {
    // Best-effort remote sign-out only when the config is complete and valid;
    // otherwise skip the network call (a missing/malformed base URL would make
    // better-auth fall back to the wrong endpoint) and just clear local state.
    if (hasValidAuthNetworkConfig()) {
      try {
        await getAuthClient().signOut()
      } catch {
        // Ignore sign out transport issues and clear the local token anyway.
      }
    }

    await clearSession()
  }, [clearSession])

  const updateProfile = useCallback(
    async (data: { name?: string; avatarFileId?: string | null }) => {
      const response = await api.updateMe(data)
      setState((current) => ({
        ...current,
        user: response.user,
        session: response.session ?? current.session,
      }))
    },
    []
  )

  const value = useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      session: state.session,
      token: state.token,
      signIn,
      signUp,
      signOut,
      refreshSession,
      verifyOAuthSession,
      clearLocalSessionForOAuth,
      updateProfile,
    }),
    [
      refreshSession,
      verifyOAuthSession,
      clearLocalSessionForOAuth,
      signIn,
      signOut,
      signUp,
      state.session,
      state.status,
      state.token,
      state.user,
      updateProfile,
    ]
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider.")
  }

  return value
}
