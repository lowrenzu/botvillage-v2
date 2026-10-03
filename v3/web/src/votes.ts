/** Local +/− votes (agents & skills) — browser localStorage only. */

type VoteBag = { agents: Record<string, number>; skills: Record<string, number> }
const VOTE_KEY = 'botvillage.votes'

function loadVotes(): VoteBag {
  try {
    const raw = localStorage.getItem(VOTE_KEY)
    if (!raw) return { agents: {}, skills: {} }
    const p = JSON.parse(raw)
    return { agents: p.agents || {}, skills: p.skills || {} }
  } catch {
    return { agents: {}, skills: {} }
  }
}

let votes: VoteBag = loadVotes()
let notify: () => void = () => {}

/** Wire sim emit so castVote refreshes React subscribers. */
export function bindVotesNotify(fn: () => void) {
  notify = fn
}

export function voteOf(kind: 'agents' | 'skills', id: string) {
  return votes[kind][id] || 0
}

export function castVote(kind: 'agents' | 'skills', id: string, delta: number) {
  const n = Math.max(0, (votes[kind][id] || 0) + delta)
  if (n === 0) delete votes[kind][id]
  else votes[kind][id] = n
  try { localStorage.setItem(VOTE_KEY, JSON.stringify(votes)) } catch { /* private mode */ }
  notify()
}

export function byVotes<T extends { id: string }>(kind: 'agents' | 'skills', list: T[]): T[] {
  return [...list].sort((a, b) => (votes[kind][b.id] || 0) - (votes[kind][a.id] || 0) || a.id.localeCompare(b.id))
}
