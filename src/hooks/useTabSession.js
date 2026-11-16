import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../data/initialData.js'
import { readStorage, removeStorage } from '../lib/storage.js'

const ACTIVE_TAB_USER_KEY = 'activeTabUserId'
const LAST_USER_KEY = 'lastUserId'

function readTabSession() {
  try {
    const activeTabUserId = window.sessionStorage.getItem(ACTIVE_TAB_USER_KEY)
    if (activeTabUserId) return { id: activeTabUserId }
  } catch {
    // Fall back to the last signed-in account if sessionStorage is unavailable.
  }

  try {
    const lastUserId = window.localStorage.getItem(LAST_USER_KEY)
    if (lastUserId) return { id: lastUserId }
  } catch {
    // Continue to the previous app session key for existing installs.
  }

  const legacySession = readStorage(STORAGE_KEYS.session, null)
  return legacySession && typeof legacySession.id === 'string' ? { id: legacySession.id } : null
}

export default function useTabSession() {
  const [session, setSessionState] = useState(readTabSession)

  const setSession = useCallback((nextSession) => {
    const normalized = nextSession && typeof nextSession.id === 'string' ? { id: nextSession.id } : null
    setSessionState(normalized)
    try {
      if (normalized) {
        window.sessionStorage.setItem(ACTIVE_TAB_USER_KEY, normalized.id)
        window.localStorage.setItem(LAST_USER_KEY, normalized.id)
        removeStorage(STORAGE_KEYS.session)
      } else {
        window.sessionStorage.removeItem(ACTIVE_TAB_USER_KEY)
        window.localStorage.removeItem(LAST_USER_KEY)
        removeStorage(STORAGE_KEYS.session)
      }
    } catch {
      // The current React session still works if browser storage is blocked.
    }
  }, [])

  useEffect(() => {
    if (!session?.id) return
    try {
      window.sessionStorage.setItem(ACTIVE_TAB_USER_KEY, session.id)
      window.localStorage.setItem(LAST_USER_KEY, session.id)
      removeStorage(STORAGE_KEYS.session)
    } catch {
      // The React state remains available for the current tab.
    }
  }, [session?.id])

  return [session, setSession]
}
