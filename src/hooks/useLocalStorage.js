import { useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage.js'

const identity = (value) => value

function resolveInitialValue(initialValue, normalizeValue) {
  return normalizeValue(typeof initialValue === 'function' ? initialValue() : initialValue)
}

export default function useLocalStorage(key, initialValue, normalizeValue = identity, enabled = true, syncAcrossTabs = true) {
  const [value, setValue] = useState(() => {
    if (!enabled) return resolveInitialValue(initialValue, normalizeValue)
    const storedValue = readStorage(key, undefined)
    return storedValue === undefined ? resolveInitialValue(initialValue, normalizeValue) : normalizeValue(storedValue)
  })

  useEffect(() => {
    if (!enabled) return
    writeStorage(key, value)
  }, [key, value, enabled])

  useEffect(() => {
    if (!enabled || !syncAcrossTabs) return undefined
    const fallbackValue = resolveInitialValue(initialValue, normalizeValue)
    function syncFromStorage(event) {
      if (event.key !== key && event.key !== null) return
      if (event.key === null || event.newValue === null) {
        setValue(fallbackValue)
        return
      }
      try {
        setValue(normalizeValue(JSON.parse(event.newValue)))
      } catch {
        setValue(fallbackValue)
      }
    }

    window.addEventListener('storage', syncFromStorage)
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [key, initialValue, normalizeValue, enabled, syncAcrossTabs])

  return [value, setValue]
}
