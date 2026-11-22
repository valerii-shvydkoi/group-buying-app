import { useEffect, useRef, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage.js'

const identity = (value) => value

function resolveInitialValue(initialValue, normalizeValue) {
  return normalizeValue(typeof initialValue === 'function' ? initialValue() : initialValue)
}

export default function useLocalStorage(key, initialValue, normalizeValue = identity, enabled = true, syncAcrossTabs = true) {
  const channelRef = useRef(null)
  const [value, setValue] = useState(() => {
    if (!enabled) return resolveInitialValue(initialValue, normalizeValue)
    const storedValue = readStorage(key, undefined)
    return storedValue === undefined ? resolveInitialValue(initialValue, normalizeValue) : normalizeValue(storedValue)
  })

  useEffect(() => {
    if (!enabled) return
    const serialized = JSON.stringify(value)
    let changed = true
    try {
      changed = window.localStorage.getItem(key) !== serialized
    } catch {
      // writeStorage handles unavailable storage below.
    }
    writeStorage(key, value)
    if (changed) channelRef.current?.postMessage({ key, serialized })
  }, [key, value, enabled])

  useEffect(() => {
    if (!enabled || !syncAcrossTabs) return undefined
    const fallbackValue = resolveInitialValue(initialValue, normalizeValue)
    let channel = null
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(`group-buying:${key}`)
        channelRef.current = channel
        channel.addEventListener('message', (event) => {
          if (event.data?.key !== key || typeof event.data.serialized !== 'string') return
          try {
            setValue(normalizeValue(JSON.parse(event.data.serialized)))
          } catch {
            setValue(fallbackValue)
          }
        })
      } catch {
        channel = null
      }
    }

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

    function rereadFromStorage() {
      setValue(normalizeValue(readStorage(key, fallbackValue)))
    }

    function rereadWhenVisible() {
      if (document.visibilityState === 'visible') rereadFromStorage()
    }

    window.addEventListener('storage', syncFromStorage)
    window.addEventListener('focus', rereadFromStorage)
    document.addEventListener('visibilitychange', rereadWhenVisible)
    return () => {
      window.removeEventListener('storage', syncFromStorage)
      window.removeEventListener('focus', rereadFromStorage)
      document.removeEventListener('visibilitychange', rereadWhenVisible)
      channel?.close()
      if (channelRef.current === channel) channelRef.current = null
    }
  }, [key, initialValue, normalizeValue, enabled, syncAcrossTabs])

  return [value, setValue]
}
