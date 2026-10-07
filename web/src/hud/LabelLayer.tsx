import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { agents, rooms, ui, type Agent } from '../sim'
import { chipWidth, layoutLabels, type LabelInput, type Placement, type Rect } from './labelLayout'
import { reservedRects } from './reserved'

/**
 * Drives in-scene label readability.
 *
 * It owns *no* markup: it styles the chips that already exist in the scene
 * (agent tags from AgentView, room chips from RoomChips) so a v4 merge only has
 * to keep the id conventions `bvtag-<id>` / `roomchip-<id>`.
 *
 * Cost: one projection pass + O(n²) AABB tests at ~11 Hz, no per-frame layout reads.
 */

/* AgentView renders the tag <Html> at y 2.2 inside a group scaled 1.45 → 3.19 world. */
const TAG_Y = 3.19
/* Speech bubble <Html> at y 2.65 × 1.45 → 3.84. */
const BUBBLE_Y = 3.84
const ROOM_Y = 4.7
const DOT = 15
const TAG_H = 24
const ROOM_H = 26

const WORD: Record<string, string> = {
  work: 'Travail', talk: 'Parle', walk: 'Marche', idle: 'Idle', zzz: 'Idle',
}
const stateWord = (a: Agent): string => WORD[a.bvState] || 'Idle'

function priority(a: Agent, dist: number): number {
  let p: number
  if (ui.sel === a) p = 1000
  else if (ui.hoverAgent === a) p = 900
  else if (a.promptPhase !== 'idle') p = 320
  else if (a.bvState === 'talk') p = 240
  else if (a.bvState === 'work') p = 200
  else if (a.bvState === 'walk') p = 170
  else p = a.hasTranscript ? 110 : 80
  if (a.bubble) p += 40
  return p + Math.max(0, 1 - dist / 60) * 40
}

const tmp = new THREE.Vector3()

function projectToScreen(
  x: number, y: number, z: number, camera: THREE.Camera, w: number, h: number,
): { x: number; y: number; dist: number } | null {
  tmp.set(x, y, z)
  const dist = tmp.distanceTo(camera.position)
  tmp.project(camera)
  if (tmp.z > 1 || tmp.z < -1) return null
  return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, dist }
}

interface BubbleBox { w: number; h: number; tx: string; stamp: number }

function applyAgent(a: Agent, p: Placement | undefined) {
  const node = document.getElementById('bvtag-' + a.id)
  const el = (node?.parentElement as HTMLElement | null) || null
  if (!el) return
  if (!p || p.tier === 'hidden') {
    el.style.visibility = 'hidden'
    el.style.opacity = '0'
    return
  }
  el.style.visibility = 'visible'
  el.style.opacity = p.fade.toFixed(2)
  const dot = p.tier === 'dot'
  el.classList.toggle('is-dot', dot)
  /* collapsed chips are nudged off the anchor so a neighbour's word still fits */
  el.style.transform = p.dy ? `translateY(${p.dy}px)` : ''
  el.style.background = dot ? a.color : ''
  el.classList.toggle('hot', ui.hoverAgent === a)
  el.classList.toggle('no-feed', !a.hasTranscript)
  if (el.dataset.state !== a.bvState) el.dataset.state = a.bvState
  if (el.dataset.phase !== a.promptPhase) {
    el.dataset.phase = a.promptPhase
    el.classList.toggle('phase-sent', a.promptPhase === 'sent')
    el.classList.toggle('phase-acked', a.promptPhase === 'acked')
    el.classList.toggle('phase-silent', a.promptPhase === 'silent')
  }
  if (node) {
    const want = stateWord(a)
    if (node.textContent !== want) node.textContent = want
  }
}

function applyRoom(id: string, p: Placement | undefined) {
  const el = document.getElementById('roomchip-' + id)
  if (!el) return
  if (!p || p.tier === 'hidden') {
    el.style.visibility = 'hidden'
    el.style.opacity = '0'
    return
  }
  el.style.visibility = 'visible'
  el.style.opacity = (p.tier === 'dot' ? 0.9 : p.fade).toFixed(2)
  el.classList.toggle('is-dot', p.tier === 'dot')
  el.style.transform = p.dy ? `translateY(${p.dy}px)` : ''
}

export function LabelLayer() {
  const { camera, size } = useThree()
  const acc = useRef(0)
  const bub = useRef(new Map<string, BubbleBox>())
  const booted = useRef(false)

  useFrame((_, dt) => {
    acc.current += dt
    /* ~11 Hz is plenty for label declutter and keeps the main thread free */
    if (booted.current && acc.current < 0.09) return
    acc.current = 0
    booted.current = true

    const now = performance.now()
    const reserved: Rect[] = reservedRects().slice()

    /* A live speech bubble owns its box — the state chip must not sit on top of it. */
    for (const a of agents) {
      const live = !!(a.bubble && a.bubbleUntil > now)
      const cur = bub.current.get(a.id)
      if (!live) { if (cur) bub.current.delete(a.id); continue }
      const el = document.getElementById('bvbubble-' + a.id)
      if (!el) continue
      if (!cur || cur.tx !== a.bubble || now - cur.stamp > 900) {
        const r = el.getBoundingClientRect()
        if (r.width > 1) bub.current.set(a.id, { w: r.width, h: r.height, tx: a.bubble, stamp: now })
      }
      const box = bub.current.get(a.id)
      if (!box) continue
      const s = projectToScreen(a.x, BUBBLE_Y, a.z, camera, size.width, size.height)
      if (!s) continue
      reserved.push({ x: s.x - box.w / 2, y: s.y - box.h / 2, w: box.w, h: box.h })
    }

    const inputs: LabelInput[] = []
    for (const a of agents) {
      const s = projectToScreen(a.x, TAG_Y, a.z, camera, size.width, size.height)
      if (!s) continue
      const labelled = ui.sel === a || ui.hoverAgent === a
      let w = chipWidth(stateWord(a))
      if (labelled) w += chipWidth(a.name, 6.2, 36)
      inputs.push({
        id: 'a:' + a.id,
        x: a.x, y: TAG_Y, z: a.z,
        w, h: TAG_H, dw: DOT, dh: DOT,
        priority: priority(a, s.dist),
        keep: labelled,
      })
    }
    for (const r of rooms) {
      const active = agents.filter(a => a.room === r && (a.bvState === 'work' || a.bvState === 'talk')).length
      inputs.push({
        id: 'r:' + r.id,
        x: r.x, y: ROOM_Y, z: r.z,
        w: 78 + r.n.length * 7, h: ROOM_H, dw: DOT + 3, dh: DOT + 3,
        /* rooms are the visual spine: they outrank an idle chip, not a hovered one */
        priority: 260 + active * 20,
      })
    }

    const placed = layoutLabels(inputs, camera, {
      width: size.width, height: size.height, reserved,
      maxDist: 78, dotMinPriority: 60,
    })

    for (const a of agents) applyAgent(a, placed.get('a:' + a.id))
    for (const r of rooms) applyRoom(r.id, placed.get('r:' + r.id))
  })

  return null
}
