/**
 * Mock backend for front-only work (no Go toolchain needed in the sandbox).
 * Serves the built single-file page + the same API/WS contract as botvillage,
 * with a roster that moves on its own so in-scene HUD work can be judged live.
 *
 *   node scripts/mock-village.mjs 8040
 *
 * Dev only. Not part of the Go binary, not shipped in the Docker image.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { extname, join, normalize } from 'node:path'

const PORT = Number(process.argv[2] || 8040)
const ROOT = new URL('..', import.meta.url).pathname
const STATIC = join(ROOT, 'static')

const BOTS = [
  ['grok-build', 'Grok Build', '#5e9bd6', 'grok'],
  ['atlas', 'Atlas', '#c9a84a', 'build'],
  ['forge', 'Forge', '#7f86d9', 'build'],
  ['sable', 'Sable', '#5cb98f', 'bot'],
  ['echo', 'Echo', '#58b3ab', 'skills'],
  ['quartz', 'Quartz', '#b87a9e', 'meeting'],
  ['pixel', 'Pixel', '#c48a5a', 'competences'],
  ['nimbus', 'Nimbus', '#8e82b0', 'bot'],
  ['cinder', 'Cinder', '#b87878', 'grok'],
  ['delta', 'Delta', '#8a9260', 'meeting'],
  ['vertex', 'Vertex', '#4a4d53', 'build'],
  ['lumen', 'Lumen', '#5e9bd6', 'skills'],
]

const VERBS = ['Lit', 'Modifie', 'Consulte', 'Recherche']
const TARGETS = ['main.go', 'Scene.tsx', 'hub/live.go', 'SKILL.md', 'roster.json', 'sim.ts', 'style.css']
const STATES = ['work', 'work', 'work', 'talk', 'talk', 'idle', 'idle', 'walk']

const state = new Map(
  BOTS.map(([id], i) => [id, {
    id,
    state: STATES[i % STATES.length],
    bubble: Math.random() < 0.5 ? `${VERBS[i % VERBS.length]} · ${TARGETS[i % TARGETS.length]}` : '',
  }]),
)

function botsPayload() {
  return {
    bots: BOTS.map(([id, name, color, home], i) => ({
      id,
      name,
      title: ['Build', 'Ops', 'Recherche'][i % 3] + ' · ' + home,
      goal: 'Tenir le bureau lisible',
      color,
      hasAvatar: false,
      lastRole: ['Build', 'Ops', 'Recherche'][i % 3],
      state: state.get(id).state,
      hasTranscript: i % 4 !== 0,
      bubble: state.get(id).bubble,
      homeX: 0, homeY: 0,
    })),
  }
}

const SKILLS = [
  ['veille', 'Veille', 'user'], ['redaction', 'Rédaction', 'user'], ['code-review', 'Code review', 'user'],
  ['go-build', 'Go build', 'managed'], ['release', 'Release', 'managed'], ['docker', 'Docker', 'managed'],
  ['front-3d', 'Front 3D', 'managed'], ['i18n', 'i18n', 'plugin'], ['a11y', 'Accessibilité', 'plugin'],
  ['tests', 'Tests', 'plugin'], ['ci', 'CI', 'plugin'], ['docs', 'Docs', 'plugin'],
]

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }

async function serveStatic(path, res) {
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '')
  try {
    const buf = await readFile(join(STATIC, rel))
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' })
    res.end(buf)
  } catch {
    res.writeHead(404).end('not found')
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  const json = (body, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  if (p === '/api/health') return json({ ok: true, demo: true, webhook: true, grokBuild: true, bots: BOTS.length, allowedIds: [] })
  if (p === '/api/bots') return json(botsPayload())
  if (p === '/api/skills') return json({ skills: SKILLS.map(([id, name, source]) => ({ id, name, source })) })
  if (p === '/api/prompt' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      let id = ''
      try { id = JSON.parse(body || '{}').id || '' } catch { /* ignore */ }
      if (id && state.has(id)) {
        state.get(id).state = 'work'
        state.get(id).bubble = 'Lit · consigne'
        broadcast({ type: 'state', agentId: id, state: 'work', bubble: 'Lit · consigne' })
      }
      json({ ok: true })
    })
    return
  }
  return serveStatic(p, res)
})

/* —— minimal WebSocket (server→client text frames only) —— */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const clients = new Set()

function frame(text) {
  const payload = Buffer.from(text, 'utf8')
  const len = payload.length
  let head
  if (len < 126) { head = Buffer.from([0x81, 0x80 | len]) }
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(len, 2) }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(len), 2) }
  /* no mask from server */
  return Buffer.concat([head, payload])
}

function broadcast(obj) {
  const buf = frame(JSON.stringify(obj))
  for (const ws of clients) { try { ws.write(buf) } catch { /* drop */ } }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (!key) return socket.destroy()
  const accept = createHash('sha1').update(key + GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  socket.setNoDelay(true)
  clients.add(socket)
  socket.write(frame(JSON.stringify({ type: 'roster', bots: botsPayload().bots })))
  socket.on('data', buf => {
    /* client frames are ignored (ping/pong/close are enough for a mock) */
    if (buf.length && (buf[0] & 0x0f) === 0x8) { clients.delete(socket); socket.destroy() }
  })
  socket.on('close', () => clients.delete(socket))
  socket.on('error', () => clients.delete(socket))
})

setInterval(() => {
  const [id] = BOTS[Math.floor(Math.random() * BOTS.length)]
  const s = state.get(id)
  s.state = STATES[Math.floor(Math.random() * STATES.length)]
  s.bubble = s.state === 'work' && Math.random() < 0.75
    ? `${VERBS[Math.floor(Math.random() * VERBS.length)]} · ${TARGETS[Math.floor(Math.random() * TARGETS.length)]}`
    : ''
  broadcast({ type: 'state', agentId: id, state: s.state, bubble: s.bubble })
}, 1600)

server.listen(PORT, '0.0.0.0', () => console.log(`mock village on http://0.0.0.0:${PORT} (${BOTS.length} bots)`))
