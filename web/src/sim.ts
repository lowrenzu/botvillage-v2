import { useSyncExternalStore } from 'react'
import { voteOf, castVote, byVotes, bindVotesNotify } from './votes'
export { voteOf, castVote, byVotes }

export type RoomId = 'grok' | 'build' | 'bot' | 'meeting' | 'competences' | 'skills'
export type BvState = 'idle' | 'walk' | 'work' | 'talk' | 'zzz'

/** Roster/WS state → bvState. zzz is not a live pose. hasTranscript is irrelevant. */
export function canonBv(s?: string): BvState {
  const v = (s || '').trim().toLowerCase()
  if (v === 'work' || v === 'talk' || v === 'walk') return v
  return 'idle'
}
export type AgentAnim = 'work' | 'collab' | 'walk' | 'sleep' | 'idle'
export type PromptPhase = 'idle' | 'sent' | 'acked' | 'silent'

export interface Ev { t: string; a: string; tx: string; c: string; kind?: EvKind }
export type EvKind = 'walk' | 'work' | 'zzz' | 'prompt' | 'talk' | 'other'
export interface Slot { x: number; z: number; f: number; by: Agent | null }
export interface Room {
  id: RoomId; n: string; x: number; z: number; c: string
  t: 'desk' | 'meet' | 'library' | 'lab'; s: number; door: number; slots: Slot[]
}
export interface Agent {
  id: string; name: string; role: string; title: string; goal: string
  color: string; hasAvatar: boolean; home: RoomId
  path: { x: number; z: number }[]
  state: AgentAnim; bvState: BvState; timer: number; yaw: number
  x: number; z: number; slot: Slot; room: Room; log: Ev[]
  tin: number; tout: number; tt: number
  promptPhase: PromptPhase
  talkUntil: number
  /** Short speech text above agent (from WS bubble or collab snippet). */
  bubble: string
  bubbleUntil: number
  /** Peer agent id when paired for talk/collab — drives beams + meetup. */
  partnerId: string | null
  /** Last announced partner — avoid spam-logging the same pair. */
  announcedPartner: string | null
  /** False when no nonempty transcript jsonl — show « no feed » badge. */
  hasTranscript: boolean
}

export interface BotJSON {
  id: string; name: string; title?: string; goal?: string; color?: string
  hasAvatar?: boolean; lastRole?: string; state?: string
  homeX?: number; homeY?: number; x?: number; y?: number
  hasTranscript?: boolean
  /** « Verbe · cible » from a real tool line, or absent. */
  bubble?: string
}

/** Real action bubble only. Chat sentences and status words do not match. */
export function actionLine(text: string | undefined | null): string {
  const raw = (text || '').trim()
  if (/^(Lit|Modifie|Consulte|Recherche) · \S/.test(raw)) return raw
  return ''
}


const NAMED: Record<string, string> = {
  yellow: '#c9a84a', magenta: '#b87a9e', orange: '#c48a5a', blue: '#5e9bd6',
  green: '#5cb98f', kaki: '#8a9260', black: '#4a4d53', cyan: '#58b3ab',
  red: '#b87878', purple: '#8e82b0',
}

export function resolveColor(c?: string): string {
  if (!c) return '#5e9bd6'
  if (c.startsWith('#')) return c
  return NAMED[c] || '#5e9bd6'
}

/** 3 desk zones (ids stable) + Réunion + Compétences (lab) + Skills (library).
 *  Floor etch / UI show zone names only — never agent person names. */
const RD: [RoomId, string, number, number, string, Room['t']][] = [
  ['grok', 'Atelier', -12, -7, '#5e9bd6', 'desk'],
  ['build', 'Prod', 0, -7, '#7f86d9', 'desk'],
  ['bot', 'Ops', 12, -7, '#5cb98f', 'desk'],
  ['meeting', 'Réunion', -12, 7, '#a783d6', 'meet'],
  ['competences', 'Compétences', 0, 7, '#c9a84a', 'lab'],
  ['skills', 'Skills', 12, 7, '#58b3ab', 'library'],
]

export const rooms: Room[] = RD.map(([id, n, x, z, c, t]) => {
  const s = z < 0 ? -1 : 1
  const slots: Slot[] = []
  const S = (sx: number, sz: number, f: number) => slots.push({ x: sx, z: sz, f, by: null })
  if (t === 'desk') [-2.5, 2.5].forEach(dx => [-2.5, 2.5].forEach(dz =>
    S(x + dx, z + dz + (dz < 0 ? 1.5 : -1.5), dz < 0 ? Math.PI : 0)))
  if (t === 'meet') for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.5
    S(x + Math.sin(a) * 2.9, z + Math.cos(a) * 2.9, a + Math.PI)
  }
  if (t === 'library') {
    /* standing spots between shelves */
    ;[[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.6], [1.8, 1.6]].forEach(([dx, dz]) =>
      S(x + dx, z + dz, dz < 0 ? Math.PI : 0))
  }
  if (t === 'lab') {
    /* bench standing positions */
    ;[[-2.4, -1.8], [2.4, -1.8], [-2.4, 1.8], [2.4, 1.8]].forEach(([dx, dz]) =>
      S(x + dx, z + dz, dz < 0 ? Math.PI : 0))
  }
  /* door on corridor-facing wall — matches Doorway at local −s·5 (hall z≈0) */
  return { id, n, x, z, c, t, s, door: z - s * 5, slots }
})

export const RM = Object.fromEntries(rooms.map(r => [r.id, r])) as Record<RoomId, Room>
const HOME_ORDER: RoomId[] = ['grok', 'build', 'bot', 'meeting', 'competences', 'skills']

/** Pointer drag distance before orbit cancels a click (P2). */
export const CLICK_MOVE_MAX = 14

export const feed: Ev[] = []
export const agents: Agent[] = []
export const ui = {
  sel: null as Agent | null,
  follow: false,
  moved: 0,
  promptStatus: '' as string,
  /** soft camera framing request: set on select / Follow */
  frame: null as { x: number; z: number; az: number; el: number; dist: number } | null,
  hoverAgent: null as Agent | null,
  /** Real prompt-ack toast (WS activity after sent) — never a timer fake. */
  toast: '' as string,
  toastUntil: 0,
  /** Room screens: catalog sheets. Names only, no SKILL.md bodies. */
  skillsOpen: false,
  competencesOpen: false,
}

export function setSkillsOpen(open: boolean) {
  if (ui.skillsOpen === open) return
  ui.skillsOpen = open
  if (open) ui.competencesOpen = false
  emit()
}

export function setCompetencesOpen(open: boolean) {
  if (ui.competencesOpen === open) return
  ui.competencesOpen = open
  if (open) ui.skillsOpen = false
  emit()
}

export interface SkillJSON { id: string; name: string; source: string }
export const skillBooks: SkillJSON[] = []
export const SKILL_DISPLAY_CAP = 55
export let link: 'off' | 'live' | 'down' = 'off'
/** True only when server started with --demo; live AGENT_DATA stays honest. */
export let demoMode = false

let version = 0
const subs = new Set<() => void>()
const emit = () => { version++; subs.forEach(f => f()) }
bindVotesNotify(emit)
export const useSim = () => useSyncExternalStore(
  f => { subs.add(f); return () => { subs.delete(f) } },
  () => version,
)

const hm = () => new Date().toTimeString().slice(0, 8)

function classify(tx: string): EvKind {
  const t = tx.toLowerCase()
  /* Frieze must not invent walk/talk/work from keywords in a line.
     Real transcript text is logged with an explicit kind, not guessed here. */
  if (t.startsWith('←') || t.includes('consigne') || t.includes('envoyé') || t === '…?' || t === 'hors ligne') return 'prompt'
  if (t.includes('zzz') || t.includes('dort')) return 'other'
  return 'other'
}

/** Kinds shown on the session day strip — honest logged motion/prompt only.
 *  zzz omitted: classify maps dort/zzz → other, so chips never appear as zzz. */
export const SESSION_KINDS: readonly EvKind[] = ['walk', 'work', 'prompt', 'talk']

function log(a: Agent, tx: string, kind?: EvKind) {
  const e: Ev = { t: hm(), a: a.name, tx, c: a.color, kind: kind ?? classify(tx) }
  feed.unshift(e)
  a.log.unshift(e)
  /* Keep enough for a compact session day strip (chronological chips in UI). */
  feed.length = Math.min(feed.length, 80)
  a.log.length = Math.min(a.log.length, 16)
  emit()
}

/**
 * Chronological (oldest→newest) session chips from live `feed`.
 * Only real walk/work/prompt/talk events — no Idle / Session ouverte / other.
 */
export function sessionDayTimeline(limit = 36): Ev[] {
  const kinds = new Set<EvKind>(SESSION_KINDS)
  const out: Ev[] = []
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i]
    const k = e.kind || 'other'
    if (!kinds.has(k)) continue
    out.push(e)
  }
  return out.length > limit ? out.slice(out.length - limit) : out
}

const free = (r: Room) => {
  const f = r.slots.filter(q => !q.by)
  return f.length ? f[Math.floor(Math.random() * f.length)] : null
}

/** Map live bvState → visual anim. Live: never sleep/zzz pose. */
function animFromBv(a: Agent): AgentAnim {
  if (a.path.length) return 'walk'
  if (a.bvState === 'talk') return 'collab'
  if (a.bvState === 'work') return 'work'
  return 'idle'
}

function arrive(a: Agent) {
  a.state = animFromBv(a)
  if ((a.state === 'collab' || a.bvState === 'talk') && facePartner(a)) {
    /* yaw toward talk partner */
  } else {
    a.yaw = a.slot.f
  }
}

/**
 * Place the agent in a room. No path, no walk pose, no « Rejoint » line.
 * Click, return-home, and talk-to-Réunion must not invent a walk.
 */
export function go(a: Agent, r: Room) {
  /* API work is not a trip: stay put, no walk pose, no journal line. */
  if (a.bvState === 'work') {
    if (!a.path.length) a.state = 'work'
    return
  }
  const q = free(r)
  if (!q) return
  a.path = []
  a.slot.by = null
  q.by = a
  a.slot = q
  a.room = r
  a.x = q.x
  a.z = q.z
  a.yaw = q.f
  a.state = animFromBv(a)
}

function homeForIndex(i: number): RoomId {
  return HOME_ORDER[i % HOME_ORDER.length]
}

function roomForState(a: Agent, state: BvState): Room {
  if (state === 'talk') return RM.meeting
  if (state === 'work' || state === 'walk') {
    const desk = rooms.filter(r => r.t === 'desk')
    return desk[Math.abs(hash(a.id)) % desk.length] || RM[a.home]
  }
  if (state === 'zzz' || state === 'idle') return RM[a.home]
  return RM[a.home]
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function makeAgent(b: BotJSON, index: number): Agent {
  const home = homeForIndex(index)
  const room = RM[home]
  const slot = free(room) || room.slots[0]
  const color = resolveColor(b.color)
  const title = b.title || ''
  const role = b.lastRole || title || 'Agent'
  const a: Agent = {
    id: b.id,
    name: b.name || b.id.slice(0, 8),
    role,
    title,
    goal: b.goal || '',
    color,
    hasAvatar: !!b.hasAvatar,
    home,
    path: [],
    state: 'idle',
    bvState: canonBv(b.state),
    timer: 4 + Math.random() * 6,
    yaw: slot.f,
    x: slot.x,
    z: slot.z,
    slot,
    room,
    log: [],
    tin: 0,
    tout: 0,
    tt: 0,
    promptPhase: 'idle',
    talkUntil: 0,
    /* First /api/bots snapshot is not a live action. Ignore its bubble. */
    bubble: '',
    bubbleUntil: 0,
    partnerId: null,
    announcedPartner: null,
    hasTranscript: !!b.hasTranscript,
  }
  slot.by = a
  a.state = animFromBv(a)
  /* Spawn into room matching API state — work never stays at home/lab/servers. */
  if (a.bvState === 'work' || a.bvState === 'talk' || a.bvState === 'walk') {
    const target = roomForState(a, a.bvState)
    if (a.room !== target) {
      a.slot.by = null
      const q = free(target) || target.slots[0]
      q.by = a
      a.slot = q
      a.room = target
      a.x = q.x
      a.z = q.z
      a.yaw = q.f
      a.path = []
      a.state = animFromBv(a)
    } else if (a.bvState === 'work') {
      a.state = 'work'
    }
  }
  return a
}

function releaseSlot(a: Agent) {
  if (a.slot && a.slot.by === a) a.slot.by = null
}

/**
 * Client roster filter (ids). Empty = show everyone the server sent.
 * Server filter is VILLAGE_ALLOW / VILLAGE_EXCLUDE (see roster.AllowSet).
 * Filled from /api/health.allowedIds when the server publishes a non-empty list.
 */
export const ALLOWED_IDS = new Set<string>()

/** Replace / upsert agents from /api/bots or roster WS. */
export function syncRoster(bots: BotJSON[]) {
  if (ALLOWED_IDS.size > 0) bots = bots.filter(b => ALLOWED_IDS.has(b.id))
  const keep = new Set(bots.map(b => b.id))
  for (let i = agents.length - 1; i >= 0; i--) {
    if (!keep.has(agents[i].id)) {
      releaseSlot(agents[i])
      if (ui.sel === agents[i]) ui.sel = null
      agents.splice(i, 1)
    }
  }
  bots.forEach((b, i) => {
    let a = agents.find(x => x.id === b.id)
    if (!a) {
      a = makeAgent(b, agents.length + i)
      agents.push(a)
      if (!ui.sel) ui.sel = a
      /* No fake « Session ouverte » — WS connect is not an agent event. */
    } else {
      a.name = b.name || a.name
      a.title = b.title || a.title
      a.goal = b.goal || a.goal
      a.color = resolveColor(b.color)
      a.hasAvatar = !!b.hasAvatar
      a.hasTranscript = !!b.hasTranscript
      if (b.lastRole) a.role = b.lastRole
      /* Roster/API refresh is a snapshot, not a new line. Do not apply b.bubble.
         A live bubble arrives only on a later WS message (applyActivity). */
      /* hasTranscript never gates bvState — tag reads API state only. */
      const st = canonBv(b.state)
      if (st !== a.bvState) applyBvState(a, st, false)
      else {
        a.bvState = st
        /* Re-assert desk/meeting even when state unchanged (fixes stuck-at-home). */
        if (st === 'work' && a.room.t !== 'desk' && !a.path.length) {
          applyBvState(a, 'work', false)
        } else if (st === 'talk' && a.room.id !== 'meeting' && !a.path.length) {
          applyBvState(a, 'talk', false)
        } else if (st === 'idle' && a.room.id !== a.home && !a.path.length) {
          applyBvState(a, 'idle', false)
        } else {
          a.state = animFromBv(a)
        }
      }
    }
  })
  if (!ui.sel && agents.length) ui.sel = agents[0]
  emit()
}

function clearBubble(a: Agent) {
  if (actionLine(a.bubble)) return
  a.bubble = ''
  a.bubbleUntil = 0
}

export function applyBvState(a: Agent, state: BvState, announce = true) {
  /* Live: zzz banned — coerce to idle (no sleep pose / Zzz log). */
  if (state === 'zzz') state = 'idle'
  a.bvState = state
  /* Kill sticky Discussion: talkUntil/partner only while bvState===talk. */
  if (state !== 'talk') {
    a.talkUntil = 0
    clearPartner(a)
  }
  if (state === 'idle') {
    clearBubble(a)
    if (a.room.id !== a.home && !a.path.length) go(a, RM[a.home])
    else if (!a.path.length) { a.state = 'idle'; a.yaw = a.slot.f }
    emit()
    return
  }
  const target = roomForState(a, state)
  if (state === 'talk') {
    a.talkUntil = Math.max(a.talkUntil, performance.now() + 7000)
    /* feed = operational status; bubble stays real content only (never invent) */
    if (announce) log(a, a.role ? `Parle · ${a.role}` : 'Parle')
    if (a.room !== target) go(a, target)
    else {
      a.state = 'collab'
      if (!facePartner(a)) a.yaw = a.slot.f
    }
  } else if (state === 'work') {
    clearPartner(a)
    if (announce) log(a, 'Travail' + (a.role ? ` · ${a.role}` : ''))
    /* do not put status into a.bubble — wait for WS tool name / transcript */
    if (a.room.t !== 'desk') go(a, target)
    else { a.state = 'work' }
  } else if (state === 'walk') {
    if (announce) log(a, 'En déplacement')
    if (!a.path.length) go(a, target !== a.room ? target : rooms[Math.abs(hash(a.id + 'w')) % rooms.length])
  }
  emit()
}

export function pushToast(msg: string) {
  ui.toast = msg
  ui.toastUntil = performance.now() + 3200
  emit()
  const until = ui.toastUntil
  window.setTimeout(() => {
    if (ui.toastUntil === until) {
      ui.toast = ''
      emit()
    }
  }, 3300)
}

export function applyActivity(msg: {
  type?: string; agentId?: string; state?: string; role?: string; bubble?: string
}) {
  if (!msg.agentId) return
  const a = agents.find(x => x.id === msg.agentId)
  if (!a) return
  if (msg.role) a.role = msg.role
  let showedBubble = false
  if (msg.bubble) {
    const raw = actionLine(msg.bubble)
    /* Only « Verbe · cible ». A chat sentence is not shown and not relabeled. */
    if (raw) {
      showedBubble = true
      log(a, raw, 'work')
      a.bubble = raw
      a.bubbleUntil = Number.POSITIVE_INFINITY
/* Keep work desk pose — only talk bubbles flip to collab. */
      if (a.bvState === 'talk') {
        a.talkUntil = Math.max(a.talkUntil, performance.now() + 4500)
        if (a.state !== 'walk') a.state = 'collab'
      } else if (a.bvState === 'work') {
        if (a.state !== 'walk') a.state = 'work'
      }
      if (a.promptPhase === 'sent') {
        a.promptPhase = 'acked'
        pushToast(`Ack · ${a.name}`)
      }
    }
  }
  if (msg.state) {
    /* real ack: activity after a sent prompt — never a timer */
    if (a.promptPhase === 'sent') {
      a.promptPhase = 'acked'
      pushToast(`Ack · ${a.name}`)
    }
    /* skip status announce when bubble already mirrored real text into feed */
    applyBvState(a, canonBv(msg.state), !showedBubble)
  }
}

function clearPartner(a: Agent) {
  if (a.partnerId) {
    const o = agents.find(x => x.id === a.partnerId)
    if (o && o.partnerId === a.id) {
      o.partnerId = null
      o.announcedPartner = null
    }
  }
  a.partnerId = null
  a.announcedPartner = null
}

/** Yaw so agent's front (+Z local) points at world (x,z). */
function faceToward(a: Agent, x: number, z: number) {
  const dx = x - a.x, dz = z - a.z
  if (dx * dx + dz * dz < 1e-6) return
  a.yaw = Math.atan2(dx, dz)
}

/** Face talk/collab partner when paired. Returns true if partner found. */
function facePartner(a: Agent): boolean {
  if (!a.partnerId) return false
  const p = agents.find(o => o.id === a.partnerId)
  if (!p) return false
  faceToward(a, p.x, p.z)
  return true
}

/** Standing close enough to prefer facing peer over path/slot. */
function partnerClose(a: Agent, p: Agent) {
  return Math.hypot(p.x - a.x, p.z - a.z) < 2.6
}

function isTalking(a: Agent, _now: number) {
  /* Real talk only — talkUntil is visual grace, not a talk source (no sticky collab). */
  return a.bvState === 'talk'
}

function pairAgents(_a: Agent, _b: Agent, _now: number) {
  /* No local pairing of two API talk bots. */
}

/** Walk toward peer inside the same room (short local path, no door hop). */
function approachPeer(_a: Agent, _b: Agent) {
  /* No invented short walk toward a peer. */
}

/**
 * Pair talk/collab agents, send loners to Réunion, walk peers together.
 * Uses real bvState / talkUntil / collab — no fake progress %.
 */
function resolveMeetups(_now: number) {
  /* Do not pair talk bots, invent a collab pose, or walk them to Réunion. */
}

/** Active talk beams for Scene — unique unordered pairs (local deduction, not transcript). */
export function collabPairs(): [Agent, Agent][] {
  const now = performance.now()
  const out: [Agent, Agent][] = []
  const seen = new Set<string>()
  for (const a of agents) {
    if (!a.partnerId || a.bvState !== 'talk' || !isTalking(a, now)) continue
    const b = agents.find(o => o.id === a.partnerId)
    if (!b || b.bvState !== 'talk' || !isTalking(b, now)) continue
    const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push([a, b])
  }
  return out
}
/** @deprecated use collabPairs */
export const talkPairs = collabPairs


/**
 * Motion tick — mutates agents in place. Does NOT emit React updates;
 * Scene drives transforms via useFrame/refs. UI subscribes via useSim
 * only on discrete events (roster, logs, prompt, select).
 */
export function step(dt: number) {
  dt = Math.min(dt, 0.033)
  const now = performance.now()
  for (const a of agents) {
    if (a.path.length) {
      const w = a.path[0]
      const dx = w.x - a.x, dz = w.z - a.z
      const d = Math.hypot(dx, dz)
      const speed = 2.6 * (d < 0.9 ? 0.45 + 0.55 * (d / 0.9) : 1)
      const st = Math.min(d, speed * dt)
      if (d <= 0.04) {
        a.x = w.x; a.z = w.z; a.path.shift()
        if (!a.path.length) arrive(a)
      } else {
        a.x += dx / d * st; a.z += dz / d * st
        const ty = Math.atan2(dx, dz)
        let dy = ty - a.yaw
        dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        a.yaw += dy * (1 - Math.exp(-dt * 5))
      }
    } else if (a.bvState === 'talk') {
      a.state = 'collab'
      /* Keep yaw locked on partner while standing in talk/collab. */
      if (a.partnerId) facePartner(a)
    } else {
      /* Force pose from bvState every tick — sleep cannot stick. */
      if (a.bvState === 'zzz') a.bvState = 'idle'
      if (a.talkUntil || a.partnerId) {
        a.talkUntil = 0
        clearPartner(a)
      }
      a.state = animFromBv(a)
      /* Work away from a desk stays put. Do not walk them to a desk. */
      /* Demo-only ambient stroll — live never invents motion. */
      if (demoMode) {
        a.timer -= dt
        if (a.timer <= 0) {
          a.timer = 14 + Math.random() * 22
          if (a.bvState !== 'idle' && !a.partnerId && Math.random() < 0.4) {
            const dest = rooms[Math.floor(Math.random() * rooms.length)]
            if (dest !== a.room) go(a, dest)
          }
        }
      }
    }
  }
  resolveMeetups(now)
}

/** Soft ¾ framing of an agent (used by select + Follow). Rig eases az/el/dist. */
export function requestFrame(a: Agent | null, follow = false) {
  if (!a) { ui.frame = null; return }
  ui.frame = {
    x: a.x,
    z: a.z,
    az: 0.88,
    el: 0.42,
    dist: follow ? 13 : 16,
  }
}

export function selectAgent(a: Agent | null) {
  ui.sel = a
  ui.follow = false
  requestFrame(a, false)
  emit()
}

export function toggleFollow() {
  ui.follow = !ui.follow
  if (ui.follow && ui.sel) requestFrame(ui.sel, true)
  else if (!ui.follow) ui.frame = null
  emit()
}


/** HUD jeton in memory only — never localStorage (XSS-readable). Durable auth = opaque HttpOnly village_session cookie. Never the webhook key. */
let hudPromptToken = ''
export function promptToken(): string {
  return hudPromptToken
}
export function setPromptToken(v: string) {
  hudPromptToken = (v || '').trim()
  try { localStorage.removeItem('botvillage.promptToken') } catch { /* private mode */ }
}

export async function sendPrompt(prompt: string, target = ''): Promise<boolean> {
  const a = ui.sel
  if (!a || !prompt.trim()) return false
  const text = prompt.trim()
  log(a, '← ' + (text.length > 48 ? text.slice(0, 48) + '…' : text))
  a.promptPhase = 'sent'
  /* Do NOT invent talk/walk/bubble — wait for gateway isRunning + transcript WS. */
  ui.promptStatus = 'Envoi…'
  emit()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const tok = promptToken()
    if (tok) headers['X-Village-Token'] = tok
    const res = await fetch('/api/prompt', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: a.id, name: a.name, prompt: text, target }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) {
      a.promptPhase = 'silent'
      ui.promptStatus = res.status === 401 ? 'Jeton requis' : (data.detail || data.error || 'Webhook indisponible')
      log(a, '…?')
      emit()
      return false
    }
    /* Stay sent until WS bubble/state proves activity — no fake timer ack. */
    a.promptPhase = 'sent'
    ui.promptStatus = 'Envoyé'
    emit()
    setTimeout(() => {
      if (ui.promptStatus === 'Envoyé') { ui.promptStatus = ''; emit() }
    }, 1800)
    return true
  } catch {
    a.promptPhase = 'silent'
    ui.promptStatus = 'Hors ligne'
    log(a, 'hors ligne')
    emit()
    return false
  }
}

/** Live bridge: roster + activity from botvillage (/api/bots + /ws). */
export function connectLive() {
  fetch('/api/health').then(r => r.json()).then(d => {
    demoMode = !!(d && d.demo)
    ALLOWED_IDS.clear()
    if (d && Array.isArray(d.allowedIds)) {
      for (const id of d.allowedIds) {
        if (typeof id === 'string' && id) ALLOWED_IDS.add(id)
      }
    }
    emit()
  }).catch(() => { demoMode = false })

  const pullBots = () => {
    fetch('/api/bots').then(r => r.json()).then(d => {
      if (d && Array.isArray(d.bots)) syncRoster(d.bots)
    }).catch(() => {})
  }
  pullBots()
  const poll = window.setInterval(pullBots, 2000)

  fetch('/api/skills').then(r => r.json()).then(d => {
    skillBooks.length = 0
    if (d && Array.isArray(d.skills)) {
      const list = d.skills as SkillJSON[]
      /* user → managed → plugin already ordered by API; cap display */
      for (const s of list.slice(0, SKILL_DISPLAY_CAP)) skillBooks.push(s)
    }
    emit()
  }).catch(() => { skillBooks.length = 0; emit() })

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const open = () => {
    ws = new WebSocket(proto + '://' + location.host + '/ws')
    ws.onopen = () => { link = 'live'; emit() }
    ws.onmessage = e => {
      let msg: any
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === 'roster' && Array.isArray(msg.bots)) syncRoster(msg.bots)
      else if (msg.type === 'state') applyActivity(msg)
    }
    ws.onclose = () => {
      link = 'down'
      emit()
      timer = setTimeout(open, 1200)
    }
  }
  open()
  return () => {
    window.clearInterval(poll)
    if (timer) clearTimeout(timer)
    ws?.close()
  }
}
