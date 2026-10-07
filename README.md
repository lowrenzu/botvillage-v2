# botvillage-v2

Bureau 3D des agents. Pièces, bots, skills, consignes. Le dépôt public est celui-ci. La v1 (`lowrenzu/botvillage`) est privée.

Stack : Go (roster, WebSocket, webhook, relais Grok Build) + Vite / React / R3F, page embarquée par `//go:embed`.

Écoute par défaut : `127.0.0.1:8040`. Chaque install a ses agents et ses secrets. Rien n’est partagé.

## Installer

```bash
git clone https://github.com/lowrenzu/botvillage-v2.git
cd botvillage-v2
cd web && npm install && npm run build && cd ..
go build -o botvillage .
```

Puis, sans les committer :

```bash
cp webhook.json.example webhook.json   # url + clé Cursor
cp xai.json.example xai.json           # clé xAI, ou export XAI_API_KEY
```

Lancer avec tes agents :

```bash
AGENT_DATA=/home/box/agent-data ./botvillage
```

Ouvre http://127.0.0.1:8040/api/health. Attendu : `ok` true, `grokBuild` true si la clé xAI est lue, et ton nombre de bots. Ne bind pas `0.0.0.0` sans `VILLAGE_PROMPT_TOKEN`.

`git status` ne doit pas montrer `webhook.json` ni `xai.json`.

## Ce que fait le bureau

- Le roster vient de `$AGENT_DATA/agents/<id>/`. Filtre optionnel : `VILLAGE_ALLOW` / `VILLAGE_EXCLUDE` (ids CSV).
- Une consigne vers un agent Cursor part au webhook. Une consigne avec `target: grok-build`, l’id Grok Build, le nom « Grok Build » / « Grok », ou le bouton HUD « Grok Build », appelle `https://api.x.ai/v1/responses` avec le modèle `grok-4.7`. La réponse est ajoutée au transcript de cet agent.
- Le vote `+` / `−` reste dans le navigateur. Il classe le roster et les panneaux Skills / Compétences. Sans agent choisi, la consigne part au mieux classé.
- Le trait bleu entre deux bots est une déduction : le transcript ne dit pas qui parle à qui.

## Secrets

| Fichier | Rôle |
|---|---|
| `webhook.json` | url + clé de l’automation Cursor |
| `xai.json` ou `XAI_API_KEY` | clé api.x.ai, jamais envoyée au navigateur |
| `VILLAGE_PROMPT_TOKEN` | jeton si le port sort de la machine |
| `VILLAGE_ALLOW` | ids d’agents autorisés (CSV) ; vide = tous |
| `VILLAGE_EXCLUDE` | ids à cacher (CSV) |
| `VILLAGE_LOCAL=1` | **no token required** (loopback + Tailscale/LAN remotes) |

Vide `VILLAGE_ALLOW` = tous les agents ; `VILLAGE_EXCLUDE` les cache côté serveur. Le client ne filtre que si `health.allowedIds` est non vide.

Le jeton HUD n’est pas la clé webhook. Hors loopback, la première page demande le jeton et pose un cookie `village_session` **opaque** (id aléatoire côté serveur — jamais le secret brut), conservé dans le fichier local `.village-sessions` pour survivre aux redémarrages (ce n’est toujours pas la clé webhook). Le champ jeton HUD alimente seulement le header `X-Village-Token` **en mémoire** (pas de localStorage du secret). Auth durable = cookie HttpOnly (+ `Secure` si TLS / `X-Forwarded-Proto: https`). Avec `VILLAGE_LOCAL=1`, le gate est sauté pour **tous** les peers (loopback + Tailscale/LAN) — utile en trust LAN. Sans ce flag, hors loopback la première page demande le jeton. Pose `VILLAGE_PROMPT_TOKEN` (ou un fichier `.prompt-token` gitignoré) dès que tu écoutes `0.0.0.0` sans `VILLAGE_LOCAL=1`.

## Docker

Les secrets ne sont pas dans l’image.

```bash
AGENT_DATA=/home/box/agent-data WEBHOOK_JSON=./webhook.json docker compose up --build
```

Monte aussi `xai.json` si tu l’utilises, ou passe `XAI_API_KEY`.

## Démo sans agents

```bash
go run . --demo
```

Ouvre http://127.0.0.1:8040/

## Accès distant / jeton

| Accès | Auth |
|---|---|
| Loopback (`127.0.0.1` / `::1`) | ouvert (toujours) |
| Tailscale / LAN + `VILLAGE_LOCAL=1` | **ouvert** — no token required |
| Tailscale / LAN / `0.0.0.0` (sans `VILLAGE_LOCAL`) | **jeton requis** (`VILLAGE_PROMPT_TOKEN` ou `.prompt-token`) |

`VILLAGE_LOCAL=1` saute le gate pour remotes (dev/trust LAN/Tailscale). Cookie opaque + session file restent utilisés quand le flag est off. Exemple :

```bash
export AGENT_DATA=/home/box/agent-data
export VILLAGE_LOCAL=1
export VILLAGE_PROMPT_TOKEN="$(cat .prompt-token)"
./botvillage --listen 0.0.0.0:8040
```

Sur un tailnet, ouvre `http://<machine>.<tailnet>.ts.net:8040` et, si l’Origin WS ne correspond pas :

```bash
export VILLAGE_WS_ORIGINS="http://ma-machine.tailnet.ts.net:8040"
```

Ne commit pas le nom Tailscale. TLS optionnel : `VILLAGE_TLS_CERT` et `VILLAGE_TLS_KEY`.

## Rebuild du front

```bash
cd web && npm run build && cd ..
go build -o botvillage .
```

Le build écrit `static/`. Ne commit pas `web/node_modules/`.

## Lisibilité in-scène

Les chips 3D ne se marchent plus dessus. Un seul passe décide, en espace écran, qui garde son mot.

| Module | Rôle |
|---|---|
| `web/src/hud/labelLayout.ts` | projection + résolution des chevauchements (calcul pur, testable) |
| `web/src/hud/LabelLayer.tsx` | pilote les chips existantes à ~11 Hz : visibilité, fondu de distance, mode point |
| `web/src/hud/RoomChips.tsx` | pastille par salle : nom + compteurs travail / parle (bvState seulement) |
| `web/src/hud/SceneStatus.tsx` | bandeau Live / Down / Off + compteurs, hors du rail |
| `web/src/hud/reserved.ts` | rectangles HUD mis en cache — plus de `getBoundingClientRect()` par frame |

Conventions d’id (le pilote ne crée pas de markup, il style l’existant) : `bvtag-<id>` (mot d’état), `bvbubble-<id>` (bulle), `roomchip-<id>` (salle).

Ordre de priorité : sélectionné → survol → consigne en cours → Parle → Travail → Marche → Idle. Une chip qui ne tient pas devient un point à la couleur du roster, posé sur l’ancre puis juste au-dessus ou en dessous. Sous le rail ou le bandeau, elle disparaît au lieu de passer devant le HUD. Une salle vide s’estompe, une salle active garde son liseré.

## Aperçu front sans Go

Le bureau a besoin d’un backend pour le roster. À défaut de binaire Go :

```bash
node scripts/mock-village.mjs 8040   # /api/health, /api/bots, /api/skills, /ws — 12 bots qui bougent
cd web && npx vite                   # proxy /api, /ws, /avatars → 127.0.0.1:8040
```

`scripts/mock-village.mjs` sert `static/` et ment sur les états : pratique pour juger le HUD, inutile en prod.

## Endpoints

| Chemin | Rôle |
|---|---|
| `GET /` | bureau |
| `GET /ws` | activité |
| `GET /api/bots` | roster |
| `GET /api/skills` | dossier skills |
| `GET /avatars/{id}` | avatar |
| `POST /api/prompt` | `{id,name,prompt,target}` — `target: grok-build` vise xAI |
| `GET /api/health` | loopback/authed: `ok`, `webhook`, `grokBuild`, `bots`, `allowedIds` ; remote anonyme: `{ok:true}` seulement |

## Hors git

`webhook.json`, `xai.json`, `wakes.jsonl`, `.env*`, `demo-data/`, `web/node_modules/`, binaire `botvillage`.

## Licence

MIT. Voir LICENSE.

## Smoke

```bash
bash scripts/smoke.sh http://127.0.0.1:8040
```

GET only (`/api/health`, `/api/bots`, `/api/skills`). Ne POST pas `/api/prompt`.
