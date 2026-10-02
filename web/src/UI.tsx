import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  agents, feed, link, ui, useSim, sendPrompt, selectAgent, toggleFollow, promptToken, setPromptToken,
  sessionDayTimeline, byVotes, castVote, voteOf,
  type Agent, type Ev, type EvKind, type PromptPhase,
} from './sim'

const ST: Record<string, string> = {
  work: 'Travaille',
  collab: 'Discussion · déduit',
  walk: 'Marche',
  sleep: 'Idle',
  idle: 'Idle',
}
const BV: Record<string, string> = {
  idle: 'Idle',
  walk: 'Marche',
  work: 'Travaille',
  talk: 'Discussion',
  zzz: 'Idle',
}
const PHASE: Record<PromptPhase, string> = {
  idle: 'Idle',
  sent: 'Sent',
  acked: 'Acked',
  silent: 'Silent',
}
const PHASE_HINT: Record<PromptPhase, string> = {
  idle: 'Aucune consigne en cours',
  sent: 'Consigne envoyée — en attente',
  acked: 'Activité détectée après consigne',
  silent: 'Pas de réponse / webhook KO',
}
const KIND_ICON: Record<EvKind, string> = {
  walk: '→',
  work: '◈',
  zzz: '·',
  prompt: '✦',
  talk: '◎',
  other: '·',
}
const PROMPT_CHIPS = [
  { label: 'Statut ?', text: 'Quel est ton statut actuel ?', target: '' },
  { label: 'Revue', text: 'Fais une brève revue de ta tâche en cours.', target: '' },
  { label: 'Suite', text: 'Quelle est la prochaine étape ?', target: '' },
]

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase()

function friezeLabel(e: Ev): string {
  const k = e.kind || 'other'
  if (k === 'prompt') return 'Consigne'
  if (k === 'zzz') return 'Idle'
  if (k === 'walk') return e.tx.startsWith('Rejoint') ? e.tx.replace('Rejoint : ', '→ ') : 'Marche'
  if (k === 'work') return 'Travaille'
  if (k === 'talk') {
    if (e.tx.startsWith('Discussion avec') || e.tx.startsWith('Collabore avec')) {
      const who = e.tx.replace(/^Discussion avec |^Collabore avec /, '')
      return '◎ ' + (who.length > 12 ? who.slice(0, 10) + '…' : who)
    }
    if (e.tx.startsWith('Parle') || e.tx.startsWith('En discussion')) return 'Parle'
    return e.tx.length > 16 ? e.tx.slice(0, 14) + '…' : e.tx
  }
  return e.tx.length > 14 ? e.tx.slice(0, 14) + '…' : e.tx
}

export function UI() {
  useSim()
  const a = ui.sel
  const [draft, setDraft] = useState('')
  const [railOpen, setRailOpen] = useState(true)
  const [token, setToken] = useState(promptToken)
  /* Honest: only transcript/WS talk partner — never invent collab from shared room. */
  const mates = a && a.partnerId
    ? agents.filter(o => o.id === a.partnerId)
    : []
  /* Counts from live bvState only — never visual anim invented by sim. */
  const working = agents.filter(x => x.bvState === 'work').length
  const collab = agents.filter(x => x.bvState === 'talk').length
  const sleeping = agents.filter(x => x.bvState === 'idle').length
  const live = link === 'live'
  const dayStrip = sessionDayTimeline(36)
  const dayEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dayEndRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' })
  }, [dayStrip.length, dayStrip[dayStrip.length - 1]?.t, dayStrip[dayStrip.length - 1]?.tx])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    if (!ui.sel) {
      const top = byVotes('agents', agents)[0]
      if (!top) return
      selectAgent(top)
    }
    const text = draft
    setDraft('')
    await sendPrompt(text)
  }

  async function onChip(text: string, target = '') {
    if (!ui.sel) {
      const top = byVotes('agents', agents)[0]
      if (!top) return
      selectAgent(top)
    }
    setDraft(text)
    await sendPrompt(text, target)
    setDraft('')
  }

  return (
    <aside className={'hud-rail' + (railOpen ? '' : ' collapsed')} aria-label="Bureau des agents">
      <header className="rail-head">
        <div className="mast-brand">
          <strong>Bureau des agents</strong>
          <em>Botvillage</em>
        </div>
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={railOpen}
          aria-label={railOpen ? 'Réduire le panneau' : 'Ouvrir le panneau'}
          onClick={() => setRailOpen(o => !o)}
        >
          {railOpen ? '▾' : '▴'}
        </button>
        <span className={'live-badge' + (live ? '' : ' off')}>
          <i />
          {live ? 'Live' : link === 'down' ? 'Down' : 'Off'}
        </span>
      </header>

      {railOpen && (
        <>
      <div className="rail-stats">
        <span><i className="dot-live" />{agents.length} roster</span>
        <span>{working} travail</span>
        <span>{collab ? collab + ' discussion' : sleeping + ' idle'}</span>
      </div>

      {agents.length > 0 && (
        <div className={'roster' + (agents.length > 4 ? ' dense' : '')} role="list">
          {byVotes('agents', agents).map(x => (
            <button
              key={x.id}
              type="button"
              role="listitem"
              className={x === a ? 'on' : ''}
              onClick={() => selectAgent(x)}
            >
              {x.hasAvatar ? (
                <img className="av" src={`/avatars/${x.id}`} alt="" style={{ background: x.color }} />
              ) : (
                <span className="av" style={{ background: x.color }}>
                  {initial(x.name)}
                </span>
              )}
              <span className="roster-name">{x.name}</span>
              <span className="vote-n" title="Votes locaux">{voteOf('agents', x.id)}</span>
              <span className="vote-btns">
                <i role="button" aria-label="Plus" onClick={ev => { ev.stopPropagation(); castVote('agents', x.id, 1) }}>+</i>
                <i role="button" aria-label="Moins" onClick={ev => { ev.stopPropagation(); castVote('agents', x.id, -1) }}>−</i>
              </span>
              {!x.hasTranscript ? (
                <em className="roster-nofeed" title="Pas de transcript jsonl — pas de feed bulle/WS">no feed</em>
              ) : null}
              {x.promptPhase !== 'idle' ? (
                <em className={'roster-phase phase-' + x.promptPhase} title={PHASE_HINT[x.promptPhase]}>
                  {PHASE[x.promptPhase]}
                </em>
              ) : null}
              {x === a ? <i className="sel-dot" style={{ background: x.color }} /> : null}
            </button>
          ))}
        </div>
      )}

      <p className="honest-note" title="Arêtes bleues 3D = pairing local (talkUntil), pas un lien transcript.">Arêtes bleues = déduit</p>
      <div className="day-strip" aria-label="Mini timeline de session">
        <div className="day-strip-head">
          <span className="day-strip-title">Session</span>
        </div>
        <div className="frieze day-frieze" role="list">
          {dayStrip.length === 0 ? (
            <span className="frieze-chip kind-other day-empty" role="listitem">
              <b>·</b>
              <span>en attente d’événements réels</span>
            </span>
          ) : (
            dayStrip.map((e, i) => {
              const k = (e.kind || 'other') as EvKind
              return (
                <span
                  key={i + ':' + e.t + ':' + e.a + ':' + e.tx}
                  role="listitem"
                  className={'frieze-chip kind-' + k}
                  title={`${e.t.slice(0, 5)} · ${e.a} · ${e.tx}`}
                >
                  <time>{e.t.slice(0, 5)}</time>
                  <i style={{ background: e.c }} />
                  <b>{KIND_ICON[k]}</b>
                  <em>{e.a.split(' ')[0]}</em>
                  <span>{friezeLabel(e)}</span>
                </span>
              )
            })
          )}
          <div ref={dayEndRef} className="day-strip-end" aria-hidden />
        </div>
      </div>

      <div className="rail-body">
        {a ? <AgentCard a={a} mates={mates} /> : (
          <p className="empty">Sélectionnez un agent pour lui envoyer une consigne.</p>
        )}

        <div className="live">
          <p className="live-title">Activité</p>
          {feed.slice(0, 3).map((e, i) => (
            <p key={i}>
              <i className="fd" style={{ background: e.c }} />
              <span className="body">
                <span className="who">{e.a}</span>
                {' · '}
                <span className="tx">{e.tx}</span>
              </span>
              <time>{e.t.slice(0, 5)}</time>
            </p>
          ))}
          {!feed.length && (
            <p>
              <i className="fd" style={{ background: 'var(--mu)' }} />
              <span className="body"><span className="tx">en attente d’événements</span></span>
              <time>—</time>
            </p>
          )}
        </div>
      </div>

      <div className="prompt-block">
        <form className="prompt" onSubmit={onSubmit}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={2000}
            disabled={!a}
            placeholder={a ? `Demander à ${a.name}…` : 'Sélectionnez un agent…'}
          />
          {ui.promptStatus ? <span className="status">{ui.promptStatus}</span> : null}
          <button className="send" type="submit" disabled={!a || !draft.trim()} aria-label="Envoyer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
              <path d="m21.854 2.147-10.94 10.939" />
            </svg>
          </button>
        </form>
        <label className="token-row">
          <span>Jeton</span>
          <input
            type="password"
            value={token}
            autoComplete="off"
            placeholder="X-Village-Token (mémoire ; cookie opaque après login)"
            onChange={e => { setToken(e.target.value); setPromptToken(e.target.value) }}
          />
        </label>
        <div className="prompt-chips">
          {PROMPT_CHIPS.map(c => (
            <button
              key={c.label}
              type="button"
              className="chip-btn"
              disabled={!a}
              onClick={() => onChip(c.text, c.target || '')}
            >
              {c.label}
            </button>
          ))}
          {a && (/grok build/i.test(a.name) || a.id === 'da2f664d-ea26-4aa9-a74a-6d969b8405b7') ? (
            <button
              type="button"
              className="chip-btn chip-grok-build"
              title="Envoie vers xAI (target grok-build)"
              onClick={() => onChip(draft.trim() || 'Statut ?', 'grok-build')}
            >
              Grok Build
            </button>
          ) : null}
        </div>

      </div>
        </>
      )}
    
      {ui.toast && ui.toastUntil > performance.now() ? (
        <div className="toast-stack" role="status" aria-live="polite">
          <div className="toast ack">{ui.toast}</div>
        </div>
      ) : null}
</aside>
  )
}

function AgentCard({ a, mates }: { a: Agent; mates: Agent[] }) {
  const withWhom = mates.map(m => m.name).join(', ')
  const title = a.title || a.role || 'Agent'
  /* Prefer real API/roster bvState for HUD label. */
  const stateLabel = (BV[a.bvState] || ST[a.state] || a.state)
  return (
    <div className="agent">
      <div className="agent-head">
        {a.hasAvatar ? (
          <img className="agent-av" src={`/avatars/${a.id}`} alt="" style={{ background: a.color }} />
        ) : (
          <div className="agent-av" style={{ background: a.color }}>
            {initial(a.name)}
          </div>
        )}
        <div className="agent-id">
          <h2>{a.name}</h2>
          <p>{title}</p>
        </div>
      </div>

      <div className="room-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span>
          <span className="chip">{stateLabel}</span>
          {' · '}
          {a.room.n}
          {withWhom ? ' · avec ' + withWhom + ' (déduit)' : ''}
        </span>
      </div>

      <div
        className={'phase-badge phase-' + a.promptPhase}
        title={PHASE_HINT[a.promptPhase]}
        role="status"
      >
        <i className="phase-dot" />
        <b>Prompt</b>
        <span className="phase-key">{PHASE[a.promptPhase]}</span>
      </div>

      {/* État réel seulement — plus de % inventé (P0) */}
      <div className="work">
        <div className="lbl">
          <span>État</span>
          <b>{stateLabel}</b>
        </div>
        {a.goal ? (
          <p className="task" title={a.goal}>
            Extrait · {a.goal.length > 48 ? a.goal.slice(0, 48) + '…' : a.goal}
          </p>
        ) : a.title ? (
          <p className="task" title={a.title}>Extrait · {a.title.length > 48 ? a.title.slice(0, 48) + '…' : a.title}</p>
        ) : null}
      </div>

      {a.log.length > 0 && (
        <div className="mini-tl" aria-label="Timeline">
          <p className="live-title">Timeline</p>
          {a.log.slice(0, 4).map((e, i) => (
            <p key={i}>
              <i className="fd" style={{ background: e.c }} />
              <span className="body"><span className="tx">{e.tx}</span></span>
              <time>{e.t.slice(0, 5)}</time>
            </p>
          ))}
        </div>
      )}

      <button type="button" className="cta" onClick={() => toggleFollow()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {ui.follow ? "Vue d'ensemble" : 'Suivre'}
      </button>
    </div>
  )
}
