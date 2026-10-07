import type { Rect } from './labelLayout'

/**
 * Screen rectangles owned by DOM chrome (HUD rail, status chip).
 * Cached: the rig used to call getBoundingClientRect() on the rail *every frame*,
 * which forced a layout flush per frame. Refreshed on resize / mutation / 500 ms.
 */

let cache: Rect[] = []
let stamp = 0
let railWidth = 360
let observers: (() => void) | null = null

const rectOf = (el: Element): Rect | null => {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

function refresh() {
  const out: Rect[] = []
  const sels = ['.hud-rail', '.scene-status', '.toast-stack', '.skills-sheet']
  for (const sel of sels) {
    document.querySelectorAll(sel).forEach(el => {
      const r = rectOf(el)
      if (r) out.push(r)
    })
  }
  cache = out
  const rail = document.querySelector('.hud-rail')
  if (rail) {
    const r = rail.getBoundingClientRect()
    railWidth = Math.max(48, r.width + (window.innerWidth - r.right) + 14)
  }
  stamp = performance.now()
}

function ensureWatchers() {
  if (observers || typeof window === 'undefined') return
  const on = () => { stamp = 0 }
  window.addEventListener('resize', on)
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    const obs = new ResizeObserver(on)
    document.querySelectorAll('.hud-rail, .scene-status').forEach(el => obs.observe(el))
    ro = obs
  }
  /* The rail collapses and sheets/toasts mount without a resize.
     childList only: watching attributes in the subtree would fire on every
     label class/style write the layout driver itself does. */
  const mo = new MutationObserver(on)
  if (document.body) mo.observe(document.body, { subtree: true, childList: true })
  for (const sel of ['.hud-rail', '.scene-status']) {
    const el = document.querySelector(sel)
    if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] })
  }
  observers = () => {
    window.removeEventListener('resize', on)
    if (ro) ro.disconnect()
    mo.disconnect()
  }
}

export function reservedRects(maxAgeMs = 500): Rect[] {
  ensureWatchers()
  if (!cache.length || performance.now() - stamp > maxAgeMs) refresh()
  return cache
}

/** Cached width of the right-hand HUD rail (incl. its margin) — for camera view offset. */
export function hudRailWidth(): number {
  reservedRects()
  return railWidth
}
