// IndexedDB 저장소: ISS 좌표를 timestamp(초) 키로 저장하고 최근 4시간만 유지한다.
const DB_NAME = 'iss-tracker'
const STORE = 'positions'
const VERSION = 1

export const RETENTION_SEC = 4 * 60 * 60

let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'ts' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** cutoffTs(초) 이전의 좌표를 삭제한다. */
export async function prunePositions(cutoffTs = Date.now() / 1000 - RETENTION_SEC) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(IDBKeyRange.upperBound(cutoffTs, true))
  await done(tx)
}

/** 4시간이 지난 좌표를 삭제한 뒤, 남은 좌표를 시간순으로 반환한다. */
export async function loadPositions() {
  const cutoff = Date.now() / 1000 - RETENTION_SEC
  await prunePositions(cutoff)
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).getAll()
  await done(tx)
  return req.result
}

/** 좌표 하나를 저장하고 오래된 좌표를 정리한 뒤 전체 목록을 반환한다. */
export async function savePosition(position) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(position)
  await done(tx)
  return loadPositions()
}
