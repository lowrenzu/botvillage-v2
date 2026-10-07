import * as THREE from 'three'

/**
 * Screen-space label layout — pure math, no DOM reads.
 *
 * One pass does three jobs the old per-agent <Html> chips could not do:
 *  1. project every anchor (agents + room chips) to pixels,
 *  2. drop what falls behind the camera, off-screen, too far, or under a HUD panel,
 *  3. resolve the rest greedily by priority — a label that cannot fit falls back to a
 *     coloured dot, and only disappears when even the dot collides.
 *
 * Cheap on purpose: O(n²) AABB tests over ≤ ~40 labels, run at ~10 Hz by the driver.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export type Tier = 'full' | 'dot' | 'hidden'

export interface LabelInput {
  id: string
  /** world anchor */
  x: number; y: number; z: number
  /** full chip size in CSS px (unscaled) */
  w: number; h: number
  /** dot fallback size (collapsed chip) */
  dw: number; dh: number
  /** higher wins the space; ties broken by distance then id */
  priority: number
  /** skip the far-distance cull (selected / hovered stay labelled) */
  keep?: boolean
}

export interface Placement {
  id: string
  x: number; y: number
  scale: number
  tier: Tier
  /** 0…1 opacity hint from distance */
  fade: number
  dist: number
  /** vertical nudge in px applied to a collapsed chip (0 when it sits on the anchor) */
  dy: number
}

export interface LayoutOpts {
  width: number; height: number
  /** screen areas owned by real DOM chrome (HUD rail, status chip) */
  reserved?: Rect[]
  /** outer margin in px — labels outside are dropped */
  margin?: number
  /** gap kept between two labels */
  pad?: number
  /** beyond this world distance a non-kept label is dropped */
  maxDist?: number
  /** below this priority a colliding label is dropped instead of becoming a dot */
  dotMinPriority?: number
}

/* vertical nudge tried by a collapsed chip: on the anchor, above, below */
const DOT_OFFSETS = [0, -26, 26]

const v = new THREE.Vector3()
const clamp = (n: number, a: number, b: number) => (n < a ? a : n > b ? b : n)

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.w && a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h && a.y + a.h + pad > b.y
  )
}

const around = (cx: number, cy: number, w: number, h: number): Rect => ({
  x: cx - w / 2, y: cy - h / 2, w, h,
})

/** Nominal width of a chip from its text — avoids measuring the DOM every frame. */
export function chipWidth(text: string, per = 7.2, base = 26): number {
  return base + Math.ceil(text.length * per)
}

export function layoutLabels(
  inputs: LabelInput[],
  camera: THREE.Camera,
  o: LayoutOpts,
): Map<string, Placement> {
  const W = o.width || 1, H = o.height || 1
  const margin = o.margin ?? 10
  const pad = o.pad ?? 4
  const maxDist = o.maxDist ?? 78
  const dotMin = o.dotMinPriority ?? 40
  const reserved = o.reserved ?? []
  const out = new Map<string, Placement>()

  type Cand = { in: LabelInput; x: number; y: number; s: number; dist: number }
  const cands: Cand[] = []

  for (const it of inputs) {
    v.set(it.x, it.y, it.z)
    const dist = v.distanceTo(camera.position)
    v.project(camera)
    const hide = (): void => {
      out.set(it.id, { id: it.id, x: 0, y: 0, scale: 1, tier: 'hidden', fade: 0, dist, dy: 0 })
    }
    if (v.z > 1 || v.z < -1) { hide(); continue }
    const x = (v.x * 0.5 + 0.5) * W
    const y = (-v.y * 0.5 + 0.5) * H
    if (x < -80 || x > W + 80 || y < -60 || y > H + 60) { hide(); continue }
    if (!it.keep && dist > maxDist) { hide(); continue }
    const s = clamp(1.12 - dist * 0.0062, 0.82, 1.1)
    const fade = clamp(1 - (dist - 26) / 46, 0.5, 1)
    const box = around(x, y, it.w * s, it.h * s)
    /* Under the rail / status chip the label would draw *over* the HUD — always drop it. */
    if (reserved.some(r => overlaps(box, r, pad))) { hide(); continue }
    cands.push({ in: it, x, y, s, dist })
    out.set(it.id, { id: it.id, x, y, scale: s, tier: 'full', fade, dist, dy: 0 })
  }

  cands.sort((a, b) => {
    const d = b.in.priority - a.in.priority
    if (d) return d
    if (a.dist !== b.dist) return a.dist - b.dist
    return a.in.id < b.in.id ? -1 : 1
  })

  const taken: Rect[] = reserved.slice()
  for (const c of cands) {
    const it = c.in
    const fade = clamp(1 - (c.dist - 26) / 46, 0.5, 1)
    const full = around(c.x, c.y, it.w * c.s, it.h * c.s)
    if (!taken.some(r => overlaps(full, r, pad))) {
      taken.push(full)
      out.set(it.id, { id: it.id, x: c.x, y: c.y, scale: c.s, tier: 'full', fade, dist: c.dist, dy: 0 })
      continue
    }
    /* collapsed chip: on the anchor, then just above, then just below */
    let put: Rect | null = null
    let dy = 0
    if (it.priority >= dotMin) {
      for (const off of DOT_OFFSETS) {
        const box = around(c.x, c.y + off, it.dw, it.dh)
        if (!taken.some(r => overlaps(box, r, pad))) { put = box; dy = off; break }
      }
    }
    if (put) {
      taken.push(put)
      out.set(it.id, { id: it.id, x: c.x, y: c.y + dy, scale: c.s, tier: 'dot', fade, dist: c.dist, dy })
      continue
    }
    out.set(it.id, { id: it.id, x: c.x, y: c.y, scale: c.s, tier: 'hidden', fade: 0, dist: c.dist, dy: 0 })
  }

  return out
}
