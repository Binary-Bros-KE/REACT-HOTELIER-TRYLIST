import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api } from '@/lib/api'

export type AuthRole = { id: string; name: string; allowedSections: string[]; permissions: string[] }
export type AuthLocation = { id: string; name: string }

export type AuthUser = {
  id: string
  firstName: string
  lastName: string
  employeeCode: string
  jobTitle: string
  isSupervisor: boolean
  department: string | null
  role: AuthRole | null
  locations: AuthLocation[]
  /** The POS's pre-selected location for this employee — one of `locations`
   *  (or any active location for an unrestricted employee), or null. */
  defaultLocation: AuthLocation | null
}

export type AuthState = {
  user: AuthUser | null
  token: string | null
  expiresAt: number | null
  status: 'idle' | 'loading' | 'error'
  error: string | null
}

const STORAGE_KEY = 'hotelier_auth'

function readPersisted(): Pick<AuthState, 'user' | 'token' | 'expiresAt'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: null, token: null, expiresAt: null }
    const parsed = JSON.parse(raw) as { user: AuthUser; token: string; expiresAt: number }
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY)
      return { user: null, token: null, expiresAt: null }
    }
    return { user: parsed.user, token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    return { user: null, token: null, expiresAt: null }
  }
}

export function persistAuth(state: Pick<AuthState, 'user' | 'token' | 'expiresAt'>) {
  if (state.user && state.token && state.expiresAt) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

const initialState: AuthState = { ...readPersisted(), status: 'idle', error: null }

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { employeeCode?: string; pin: string }) => {
    const response = await api<{ token: string; expiresAt: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    return { user: response.user, token: response.token, expiresAt: new Date(response.expiresAt).getTime() }
  },
)

export const restoreSession = createAsyncThunk('auth/restore', async (_: void, { getState, rejectWithValue }) => {
  const { auth } = getState() as { auth: AuthState }
  if (!auth.token) return rejectWithValue('No session')
  try {
    const response = await api<{ user: AuthUser; expiresAt: string }>('/auth/me')
    return { user: response.user, expiresAt: new Date(response.expiresAt).getTime() }
  } catch (cause) {
    return rejectWithValue(cause instanceof Error ? cause.message : 'Session invalid')
  }
})

/** Switch (or clear) the signed-in employee's default POS location. */
export const setDefaultLocation = createAsyncThunk('auth/setDefaultLocation', async (locationId: string | null) => {
  const response = await api<{ user: AuthUser }>('/auth/me/location', {
    method: 'PATCH',
    body: JSON.stringify({ locationId }),
  })
  return response.user
})

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await api('/auth/logout', { method: 'POST' })
  } catch {
    // Best-effort: clear local session regardless of server response.
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'idle'
        state.user = action.payload.user
        state.token = action.payload.token
        state.expiresAt = action.payload.expiresAt
        persistAuth(state)
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.error.message ?? 'Could not sign in'
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload.user
        state.expiresAt = action.payload.expiresAt
        persistAuth(state)
      })
      .addCase(setDefaultLocation.fulfilled, (state, action) => {
        state.user = action.payload
        persistAuth(state)
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null
        state.token = null
        state.expiresAt = null
        persistAuth(state)
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null
        state.token = null
        state.expiresAt = null
        state.status = 'idle'
        persistAuth(state)
      })
  },
})

export default authSlice.reducer
