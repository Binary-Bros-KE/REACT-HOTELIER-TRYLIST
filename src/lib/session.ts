// Leaf module holding the current session snapshot, so that api.ts can read
// the active auth token and resolved tenant without importing the Redux
// store directly (which would create a circular import: store -> authSlice
// / tenantSlice -> api -> store).
type SessionSnapshot = { token: string | null; userId: string | null; tenantId: string | null }

let current: SessionSnapshot = { token: null, userId: null, tenantId: null }

export function setSessionSnapshot(snapshot: SessionSnapshot) {
  current = snapshot
}

export function getSessionSnapshot(): SessionSnapshot {
  return current
}

// Same decoupling trick as the snapshot above: api.ts detects a shift-window
// rejection from the server (a continuous check, not just at login — an
// already-open session stops working the moment a shift ends) and needs to
// force a logout, but can't import the Redux store directly without a
// circular import. The store registers a handler once, at boot.
let outsideShiftHandler: (() => void) | null = null

export function setOutsideShiftHandler(handler: (() => void) | null) {
  outsideShiftHandler = handler
}

export function notifyOutsideShift() {
  outsideShiftHandler?.()
}

// The server ended the session (lapsed, logged out elsewhere, or the employee was
// deactivated): api.ts reports it and the app signs out to the login screen.
let sessionEndedHandler: (() => void) | null = null

export function setSessionEndedHandler(handler: (() => void) | null) {
  sessionEndedHandler = handler
}

export function notifySessionEnded() {
  sessionEndedHandler?.()
}
