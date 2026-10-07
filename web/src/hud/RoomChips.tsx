import { Html } from '@react-three/drei'
import { agents, rooms, useSim } from '../sim'

/**
 * Room chips — the visual spine of the floor plan.
 *
 * One floating pill per room: name + live head-count (work / talk from bvState only).
 * A room with nobody active dims itself, so the eye lands on where the work is.
 * Declutter / distance fade is handled by LabelLayer.
 */
export function RoomChips() {
  useSim()
  return <>{rooms.map(r => {
    const here = agents.filter(a => a.room === r)
    const work = here.filter(a => a.bvState === 'work').length
    const talk = here.filter(a => a.bvState === 'talk').length
    const active = work + talk
    return (
      <Html
        key={r.id}
        position={[r.x, 4.7, r.z]}
        center
        zIndexRange={[26, 18]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          id={'roomchip-' + r.id}
          className={'room-chip' + (active ? ' active' : ' quiet')}
          style={{ borderColor: active ? r.c : undefined }}
        >
          <i className="room-dot" style={{ background: r.c }} />
          <b>{r.n}</b>
          <em>
            {here.length}
            <span className="room-sep" />
            {work}<span className="room-ic">◈</span>
            {talk}<span className="room-ic">◎</span>
          </em>
        </div>
      </Html>
    )
  })}</>
}
