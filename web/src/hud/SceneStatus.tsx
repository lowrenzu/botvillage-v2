import { agents, link, useSim } from '../sim'

/**
 * In-scene status strip (plain DOM, bottom-left, outside the rail).
 * Honest counters only: roster size, live bvState counts, WS link state.
 * It also declares its own rectangle to LabelLayer, so chips never hide under it.
 */
export function SceneStatus() {
  useSim()
  const work = agents.filter(a => a.bvState === 'work').length
  const talk = agents.filter(a => a.bvState === 'talk').length
  const nofeed = agents.filter(a => !a.hasTranscript).length
  const live = link === 'live'
  return (
    <div className={'scene-status' + (live ? '' : ' off')} aria-label="État du bureau">
      <span className={'ss-link' + (live ? ' on' : link === 'down' ? ' down' : '')}>
        <i />
        {live ? 'Live' : link === 'down' ? 'Down' : 'Off'}
      </span>
      <span><b>{agents.length}</b> agents</span>
      <span><b>{work}</b> travail</span>
      <span><b>{talk}</b> parle</span>
      {nofeed ? <span className="ss-mute" title="Pas de transcript jsonl — pas de bulle ni de fil"><b>{nofeed}</b> sans fil</span> : null}
    </div>
  )
}
