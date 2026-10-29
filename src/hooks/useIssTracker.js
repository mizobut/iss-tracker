import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadPositions, savePosition, RETENTION_SEC } from '../lib/db'
import { buildTrack, computeSpeedKmh } from '../lib/orbit'

const API_URL = 'http://api.open-notify.org/iss-now.json'

export const MIN_INTERVAL_MS = 5000
const MAX_INTERVAL_MS = 60000
const EMA_ALPHA = 0.3 // 응답 시간 지수이동평균 가중치
const LATENCY_FACTOR = 5 // 응답 1ms 당 polling 간격 5ms 추가

/**
 * 응답 속도에 따라 polling 간격을 결정한다.
 * - 기본 5초 + 평균 응답시간 × 5 (응답이 느릴수록 서버 부담을 줄이도록 간격 확대)
 * - 연속 실패 시 2배씩 백오프
 * - 항상 5초 이상, 60초 이하
 */
export function computeInterval({ avgResponseMs, failures }) {
  const base = MIN_INTERVAL_MS + (avgResponseMs ?? 0) * LATENCY_FACTOR
  const backoff = base * 2 ** Math.min(failures, 4)
  return Math.round(Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, backoff)))
}

const HISTORY_KEY = ['iss', 'history']

export function useIssTracker() {
  const queryClient = useQueryClient()
  const stats = useRef({ avgResponseMs: null, failures: 0 })

  // IndexedDB에 저장된 최근 4시간 좌표
  const history = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: loadPositions,
    staleTime: Infinity,
  })

  // 실시간 위치 polling
  const now = useQuery({
    queryKey: ['iss', 'now'],
    queryFn: async ({ signal }) => {
      const started = performance.now()
      try {
        const res = await fetch(API_URL, { signal, cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (json.message !== 'success') throw new Error('API 응답 오류')
        const responseMs = performance.now() - started

        const s = stats.current
        s.avgResponseMs =
          s.avgResponseMs == null ? responseMs : s.avgResponseMs * (1 - EMA_ALPHA) + responseMs * EMA_ALPHA
        s.failures = 0

        return {
          ts: json.timestamp,
          lat: Number(json.iss_position.latitude),
          lon: Number(json.iss_position.longitude),
          responseMs,
        }
      } catch (err) {
        if (err.name !== 'AbortError') stats.current.failures += 1
        throw err
      }
    },
    // 매 응답 후 다시 계산되므로 측정된 응답 속도가 다음 polling 간격에 바로 반영된다.
    refetchInterval: () => computeInterval(stats.current),
    refetchIntervalInBackground: true,
    retry: false,
  })

  // 새 좌표가 들어오면 IndexedDB에 저장하고 history 캐시를 갱신
  const latest = now.data
  useEffect(() => {
    if (!latest) return
    savePosition({ ts: latest.ts, lat: latest.lat, lon: latest.lon })
      .then((rows) => queryClient.setQueryData(HISTORY_KEY, rows))
      .catch((err) => console.error('IndexedDB 저장 실패', err))
  }, [latest, queryClient])

  const intervalMs = computeInterval(stats.current)
  const points = history.data ?? []
  const gapSec = Math.max(90, (intervalMs / 1000) * 2.5)
  const endTs = points.length ? points[points.length - 1].ts : null

  const track = useMemo(
    () => (endTs ? buildTrack(points, { endTs, windowSec: RETENTION_SEC, gapSec }) : []),
    [points, endTs, gapSec],
  )
  const speedKmh = useMemo(() => computeSpeedKmh(points), [points])

  return {
    position: latest ?? (points.length ? points[points.length - 1] : null),
    track,
    speedKmh,
    pointCount: points.length,
    intervalMs,
    lastResponseMs: latest?.responseMs ?? null,
    avgResponseMs: stats.current.avgResponseMs,
    failures: stats.current.failures,
    error: now.error,
    isFetching: now.isFetching,
    lastUpdated: now.dataUpdatedAt,
  }
}
