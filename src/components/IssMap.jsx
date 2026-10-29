import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'

// 우주 정거장 모양 아이콘: 중앙 모듈 + 트러스 + 좌우 태양전지판 4쌍
const ISS_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <g stroke="#1e293b" stroke-width="1">
    <rect x="4" y="29" width="56" height="3" rx="1" fill="#cbd5e1"/>
    <g fill="url(#panel)">
      <rect x="6" y="10" width="7" height="17" rx="1"/>
      <rect x="15" y="10" width="7" height="17" rx="1"/>
      <rect x="42" y="10" width="7" height="17" rx="1"/>
      <rect x="51" y="10" width="7" height="17" rx="1"/>
      <rect x="6" y="34" width="7" height="17" rx="1"/>
      <rect x="15" y="34" width="7" height="17" rx="1"/>
      <rect x="42" y="34" width="7" height="17" rx="1"/>
      <rect x="51" y="34" width="7" height="17" rx="1"/>
    </g>
    <rect x="27" y="20" width="10" height="24" rx="3" fill="#f8fafc"/>
    <rect x="24" y="27" width="16" height="7" rx="2" fill="#e2e8f0"/>
    <circle cx="32" cy="30.5" r="2.4" fill="#4f46e5"/>
  </g>
</svg>`

const issIcon = L.divIcon({
  className: 'iss-icon',
  html: ISS_SVG,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
})

const actualStyle = { color: '#4f46e5', weight: 3, opacity: 0.9 }
const inferredStyle = { color: '#06b6d4', weight: 2.5, opacity: 0.9, dashArray: '6 8' }

function FollowIss({ position, follow }) {
  const map = useMap()
  useEffect(() => {
    if (follow && position) map.panTo([position.lat, position.lon], { animate: true })
  }, [map, position, follow])
  return null
}

export default function IssMap({ position, track, follow }) {
  const center = useMemo(() => (position ? [position.lat, position.lon] : [0, 0]), [position])

  return (
    <MapContainer
      className="map"
      center={center}
      zoom={2}
      minZoom={2}
      maxBounds={[[-85, -200], [85, 200]]}
      worldCopyJump={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        noWrap
      />
      {track.map((seg, i) => (
        <Polyline
          key={`${seg.type}-${i}-${seg.coords.length}`}
          positions={seg.coords}
          pathOptions={seg.type === 'actual' ? actualStyle : inferredStyle}
        />
      ))}
      {position && (
        <Marker position={[position.lat, position.lon]} icon={issIcon}>
          <Tooltip direction="top" offset={[0, -24]}>
            ISS · {position.lat.toFixed(2)}°, {position.lon.toFixed(2)}°
          </Tooltip>
        </Marker>
      )}
      <FollowIss position={position} follow={follow} />
    </MapContainer>
  )
}
