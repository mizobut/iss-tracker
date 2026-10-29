import { useState } from 'react'
import IssMap from './components/IssMap'
import { useIssTracker, MIN_INTERVAL_MS } from './hooks/useIssTracker'

const fmt = (n, digits = 0) =>
  n == null ? '—' : n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export default function App() {
  const iss = useIssTracker()
  const [follow, setFollow] = useState(true)
  const { position } = iss

  return (
    <>
      <div className="topbar">
        <a className="brand" href="#">🛰️ ISS Tracker</a>
        <nav>
          <a href="#map">실시간 궤적</a>
          <a href="#stats">속도 · Polling</a>
          <a href="#how">동작 방식</a>
        </nav>
      </div>

      <header className="hero">
        <span className="badge">실시간 · Open Notify API · 최근 4시간 궤적</span>
        <h1>국제 우주 정거장은 지금 어디에?</h1>
        <p>
          ISS의 현재 위치를 실시간으로 받아 지도 위에 표시하고, 브라우저 IndexedDB에 저장된
          최근 4시간의 좌표로 궤적을 그립니다.
        </p>
      </header>

      <main>
        <section id="map">
          <div className="section-head">
            <span className="chip">LIVE</span>
            <h2>실시간 위치 궤적</h2>
          </div>

          <div className="card map-card">
            <div className="map-toolbar">
              <div className="legend">
                <span><i className="line solid" />수집된 궤적</span>
                <span><i className="line dashed" />계산/유추 궤적</span>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                ISS 따라가기
              </label>
            </div>
            <IssMap position={position} track={iss.track} follow={follow} />
            <div className="coords">
              {position ? (
                <>
                  위도 <code>{position.lat.toFixed(4)}°</code> · 경도 <code>{position.lon.toFixed(4)}°</code>
                  {' '}· 기준 시각 <code>{new Date(position.ts * 1000).toLocaleTimeString('ko-KR')}</code>
                </>
              ) : (
                '위치 정보를 불러오는 중…'
              )}
              {iss.isFetching && <span className="pulse">● 수신 중</span>}
            </div>
          </div>
        </section>

        <section id="stats">
          <div className="section-head">
            <span className="chip">STATUS</span>
            <h2>이동 속도 · API Polling</h2>
          </div>

          <div className="card">
            <div className="status-grid">
              <div className="status s3">
                <b>{fmt(iss.speedKmh)} km/h</b>
                ISS 이동 속도 ({iss.speedKmh ? fmt(iss.speedKmh / 3600, 2) : '—'} km/s)
              </div>
              <div className="status s2">
                <b>{fmt(iss.intervalMs / 1000, 1)} 초</b>
                API Polling 간격 (최소 {MIN_INTERVAL_MS / 1000}초)
              </div>
              <div className="status s4">
                <b>{fmt(iss.lastResponseMs)} ms</b>
                API 응답 속도 (평균 {fmt(iss.avgResponseMs)} ms)
              </div>
              <div className="status s5">
                <b>{fmt(iss.pointCount)} 개</b>
                IndexedDB 저장 좌표 (4시간)
              </div>
            </div>
            {iss.error && (
              <p className="error">
                ⚠️ API 요청 실패: {iss.error.message} — 연속 실패 {iss.failures}회, 간격을 늘려 재시도합니다.
              </p>
            )}
          </div>
        </section>

        <section id="how">
          <div className="section-head">
            <span className="chip">HOW</span>
            <h2>동작 방식</h2>
          </div>

          <div className="card">
            <h3>🔁 적응형 Polling</h3>
            <p>
              매 요청마다 응답 시간을 측정하고 지수이동평균으로 다듬어 다음 Polling 간격을 계산합니다.
              간격 = <code>5초 + 평균 응답시간 × 5</code>, 요청이 실패하면 2배씩 늘리며 항상 5초 이상을 유지합니다.
            </p>
          </div>

          <div className="card">
            <h3>💾 IndexedDB 궤적 저장</h3>
            <ul>
              <li>수신한 좌표는 API timestamp를 키로 IndexedDB에 저장됩니다.</li>
              <li>저장·조회할 때마다 4시간이 지난 좌표는 자동으로 삭제됩니다.</li>
              <li>앱을 다시 열어도 최근 4시간 이내 좌표가 그대로 이어집니다.</li>
            </ul>
          </div>

          <div className="card">
            <h3>🧮 궤적 계산/유추 (점선)</h3>
            <ol className="steps">
              <li>ISS 궤도를 경사각 51.64°, 주기 약 92.9분의 원 궤도로 근사하고 지구 자전을 반영합니다.</li>
              <li>수집 좌표 사이에 단절된 구간이 있으면, 양 끝 좌표에서 각각 궤도를 계산해 섞어서 이어 줍니다.</li>
              <li>4시간 전까지의 좌표가 없으면 가장 오래된 수집 좌표로부터 거꾸로 4시간 전까지의 위치를 유추합니다.</li>
            </ol>
          </div>
        </section>
      </main>

      <footer>
        데이터: <a href="http://open-notify.org/" target="_blank" rel="noreferrer">Open Notify</a> · 지도:
        OpenStreetMap · React 19 + TanStack Query
      </footer>
    </>
  )
}
