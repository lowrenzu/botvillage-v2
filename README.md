# botvillage

Live **3D AI office** for Grok Bots — wood/glass rooms, spherical agents, frosted HUD.
Stack: **Go** backend (roster, WebSocket, prompt webhook) + **Vite / React / R3F** frontend embedded via `//go:embed`.

Default listen: `0.0.0.0:8040`.

## Clone

```bash
git clone git@github.com:lowrenzu/botvillage.git
cd botvillage
```

Private repo — you need access to `lowrenzu/botvillage`.

## Demo (no real agents)

```bash
go test ./...
go run . --demo --listen 0.0.0.0:8040
# or: go build -o botvillage . && ./botvillage --demo --listen 0.0.0.0:8040
```

Open http://127.0.0.1:8040/

Demo seeds fake agents under `./demo-data/agents/` and appends JSONL so they walk, work, talk, and sleep.

## Live (real Grok Bot agents)

Point `AGENT_DATA` at a directory that contains `agents/<id>/` (profile.json, optional avatar, optional transcript jsonl):

```bash
AGENT_DATA=/path/to/agent-data go run . --listen 0.0.0.0:8040
```

## Rebuild frontend

```bash
cd web && npm install && npm run build && cd ..
go build -o botvillage .
```

`npm run build` writes into `static/` (embedded by Go). Do not commit `web/node_modules/`.

## Webhook (prompts)

Copy the example and fill real values locally (never commit secrets):

```bash
cp webhook.json.example webhook.json
```

```json
{
  "url": "https://api2.cursor.sh/automations/webhook/YOUR-WEBHOOK-ID",
  "key": "YOUR-WEBHOOK-KEY"
}
```

## Endpoints

| Path | Notes |
|------|--------|
| `GET /` | SPA (3D office) |
| `GET /ws` | live activity |
| `GET /api/bots` | roster JSON |
| `GET /avatars/{id}` | avatar if present |
| `POST /api/prompt` | `{id,name,prompt}` |
| `GET /api/skills` | skill catalog |
| `GET /api/health` | demo / webhook / bot count |

## What is excluded from git

- `webhook.json` (secrets)
- `web/node_modules/`, binaries (`botvillage`)
- `demo-data/`, logs, `.env*`

## License

Private — all rights reserved.
