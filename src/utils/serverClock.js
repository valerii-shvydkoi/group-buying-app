let serverClockOffset = 0
let hasServerTimeSample = false
let serverTimeAnchor = 0
let monotonicTimeAnchor = 0

/** Record a Date response header using the request midpoint to reduce latency error. */
export function recordServerTimeSample(dateHeader, requestStartedAt, responseReceivedAt, requestStartedMonotonic, responseReceivedMonotonic) {
  const serverTimestamp = Date.parse(dateHeader)
  const startedAt = Number(requestStartedAt)
  const receivedAt = Number(responseReceivedAt)
  if (!Number.isFinite(serverTimestamp) || !Number.isFinite(startedAt) || !Number.isFinite(receivedAt)) return

  const requestMidpoint = startedAt + Math.max(0, receivedAt - startedAt) / 2
  const measuredOffset = serverTimestamp - requestMidpoint
  if (!Number.isFinite(measuredOffset)) return

  serverClockOffset = hasServerTimeSample
    ? Math.round(serverClockOffset * 0.75 + measuredOffset * 0.25)
    : Math.round(measuredOffset)
  hasServerTimeSample = true

  const monotonicStarted = Number(requestStartedMonotonic)
  const monotonicReceived = Number(responseReceivedMonotonic)
  if (Number.isFinite(monotonicStarted) && Number.isFinite(monotonicReceived) && monotonicReceived >= monotonicStarted) {
    // Continue from a server-time anchor on the monotonic clock. A later manual
    // adjustment of the device clock therefore cannot speed up or rewind timers.
    serverTimeAnchor = serverTimestamp + (monotonicReceived - monotonicStarted) / 2
    monotonicTimeAnchor = monotonicReceived
  }
}

export function getSynchronizedNow() {
  if (hasServerTimeSample && Number.isFinite(monotonicTimeAnchor) && typeof globalThis.performance?.now === 'function') {
    return serverTimeAnchor + Math.max(0, globalThis.performance.now() - monotonicTimeAnchor)
  }
  return Date.now() + serverClockOffset
}

export function getServerClockOffset() {
  return serverClockOffset
}
