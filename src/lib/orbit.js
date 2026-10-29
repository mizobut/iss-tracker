// ISS 궤도 근사 모델 + 궤적 생성 유틸리티.
// 원 궤도(경사각 51.64°, 주기 약 92.9분)에 지구 자전과 J2 노드 세차를 반영해
// 관측 좌표 하나(기준점)로부터 임의 시각의 위치를 계산한다.

const DEG = Math.PI / 180
const INCLINATION = 51.64 * DEG
const PERIOD_SEC = 5574
const MEAN_MOTION = 360 / PERIOD_SEC // deg/s (위도 인수 증가율)
const EARTH_ROTATION = 360 / 86164.0905 // deg/s (항성일)
const NODAL_REGRESSION = -5.0 / 86400 // deg/s (J2 섭동에 의한 승교점 이동)
const EARTH_RADIUS_KM = 6371
export const ISS_ALTITUDE_KM = 420

const STEP_SEC = 30 // 유추 궤적 샘플 간격

export const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180

/** 두 좌표 사이의 중심각(라디안) */
export function centralAngle(a, b) {
  const dLat = (b.lat - a.lat) * DEG
  const dLon = (b.lon - a.lon) * DEG
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 기준점(anchor)에서 궤도 요소를 역산하고 시각 t(초)의 위치를 계산한다. */
export function propagate(anchor, ascending, t) {
  const s = Math.max(-1, Math.min(1, Math.sin(anchor.lat * DEG) / Math.sin(INCLINATION)))
  let u0 = Math.asin(s) / DEG
  if (!ascending) u0 = 180 - u0
  const nodeLon =
    anchor.lon -
    Math.atan2(Math.cos(INCLINATION) * Math.sin(u0 * DEG), Math.cos(u0 * DEG)) / DEG

  const dt = t - anchor.ts
  const u = (u0 + MEAN_MOTION * dt) * DEG
  const lat = Math.asin(Math.sin(INCLINATION) * Math.sin(u)) / DEG
  const lon =
    nodeLon +
    Math.atan2(Math.cos(INCLINATION) * Math.sin(u), Math.cos(u)) / DEG -
    (EARTH_ROTATION - NODAL_REGRESSION) * dt
  return { ts: t, lat, lon: normLon(lon) }
}

/** 기준점이 상승(북진) 구간인지 하강 구간인지를 이웃 관측점과 비교해 결정한다. */
function isAscending(anchor, ref) {
  if (!ref) return true
  const errUp = centralAngle(propagate(anchor, true, ref.ts), ref)
  const errDown = centralAngle(propagate(anchor, false, ref.ts), ref)
  return errUp <= errDown
}

/** 관측점 사이 단절 구간을 양쪽 기준점에서 계산한 궤적을 섞어(blend) 채운다. */
function bridgeGap(a, aRef, b, bRef) {
  const ascA = isAscending(a, aRef)
  const ascB = isAscending(b, bRef)
  const span = b.ts - a.ts
  const coords = [[a.lat, a.lon]]
  for (let t = a.ts + STEP_SEC; t < b.ts; t += STEP_SEC) {
    const pa = propagate(a, ascA, t)
    const pb = propagate(b, ascB, t)
    const w = (t - a.ts) / span
    const lat = pa.lat * (1 - w) + pb.lat * w
    const lon = normLon(pa.lon + normLon(pb.lon - pa.lon) * w)
    coords.push([lat, lon])
  }
  coords.push([b.lat, b.lon])
  return coords
}

/** 첫 관측점에서 startTs까지 거꾸로 궤적을 유추한다. */
function extrapolateBack(first, ref, startTs) {
  const asc = isAscending(first, ref)
  const coords = []
  for (let t = startTs; t < first.ts; t += STEP_SEC) {
    const p = propagate(first, asc, t)
    coords.push([p.lat, p.lon])
  }
  coords.push([first.lat, first.lon])
  return coords
}

/** 경도 ±180°(날짜변경선)를 넘는 지점에서 선을 끊어 지도에 가로줄이 생기지 않게 한다. */
function splitAntimeridian(coords) {
  const parts = []
  let cur = []
  for (const p of coords) {
    if (cur.length) {
      const [lat1, lon1] = cur[cur.length - 1]
      const [lat2, lon2] = p
      if (Math.abs(lon2 - lon1) > 180) {
        const edge = lon1 > 0 ? 180 : -180
        const lon2u = lon2 + (lon1 > 0 ? 360 : -360)
        const f = (edge - lon1) / (lon2u - lon1)
        const latX = lat1 + (lat2 - lat1) * f
        cur.push([latX, edge])
        parts.push(cur)
        cur = [[latX, -edge]]
      }
    }
    cur.push(p)
  }
  if (cur.length > 1) parts.push(cur)
  return parts
}

/** gapSec 이내에 있는 이웃 관측점만 상승/하강 판정 기준으로 쓴다. */
const nearby = (p, q, gapSec) => (q && Math.abs(q.ts - p.ts) <= gapSec ? q : null)

/**
 * 저장된 관측점으로 최근 windowSec 동안의 궤적 세그먼트를 만든다.
 * - 관측점이 gapSec 이하 간격으로 이어진 구간: actual (실선)
 * - 관측점 사이 단절 구간, 첫 관측점 이전 구간: inferred (점선)
 * @returns {{ type: 'actual' | 'inferred', coords: [number, number][] }[]}
 */
export function buildTrack(points, { endTs, windowSec, gapSec }) {
  const startTs = endTs - windowSec
  const pts = points.filter((p) => p.ts >= startTs).sort((a, b) => a.ts - b.ts)
  if (!pts.length) return []

  const segments = []
  const first = pts[0]
  if (first.ts - startTs > STEP_SEC) {
    segments.push({ type: 'inferred', coords: extrapolateBack(first, pts[1], startTs) })
  }

  let run = [[first.lat, first.lon]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (b.ts - a.ts > gapSec) {
      if (run.length > 1) segments.push({ type: 'actual', coords: run })
      const aRef = nearby(a, pts[i - 2], gapSec) ?? b
      const bRef = nearby(b, pts[i + 1], gapSec) ?? a
      segments.push({ type: 'inferred', coords: bridgeGap(a, aRef, b, bRef) })
      run = [[b.lat, b.lon]]
    } else {
      run.push([b.lat, b.lon])
    }
  }
  if (run.length > 1) segments.push({ type: 'actual', coords: run })

  return segments.flatMap((s) =>
    splitAntimeridian(s.coords).map((coords) => ({ type: s.type, coords })),
  )
}

/**
 * 최근 sampleSec 동안 연속 관측점의 이동 거리로 궤도 속도(km/h)를 계산한다.
 * API 좌표는 지구에 고정된 좌표계이므로 지구 자전만큼 경도를 되돌려 관성 좌표계 기준 속도로 환산한다.
 * (API timestamp가 초 단위라 짧은 구간은 오차가 커서 최근 2분 구간을 평균낸다.)
 */
export function computeSpeedKmh(points, sampleSec = 120) {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  let recent = points.filter((p) => last.ts - p.ts <= sampleSec)
  if (recent.length < 2) {
    const prev = points[points.length - 2]
    if (last.ts - prev.ts > 600) return null
    recent = [prev, last]
  }
  const t0 = recent[0].ts
  const inertial = recent.map((p) => ({ lat: p.lat, lon: p.lon + EARTH_ROTATION * (p.ts - t0) }))
  const radius = EARTH_RADIUS_KM + ISS_ALTITUDE_KM
  let dist = 0
  for (let i = 1; i < inertial.length; i++) dist += centralAngle(inertial[i - 1], inertial[i]) * radius
  const dt = recent[recent.length - 1].ts - t0
  return dt > 0 ? (dist / dt) * 3600 : null
}
