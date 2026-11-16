export function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key, value) {
  try {
    const serialized = JSON.stringify(value)
    if (window.localStorage.getItem(key) === serialized) return true
    window.localStorage.setItem(key, serialized)
    return true
  } catch {
    return false
  }
}

export function removeStorage(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // The app remains usable when browser storage is unavailable.
  }
}
