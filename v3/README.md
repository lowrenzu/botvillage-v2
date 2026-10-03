# botvillage v3

Bureau 3D des agents. Pièces, bots, skills, consignes. **V3** = la v2 durcie après audit, sans mode démo, optimisée. Les fichiers originaux de la v2 restent intacts à la racine du dépôt ; la v3 vit dans `v3/` avec son propre module Go.

Stack : Go (roster, WebSocket, webhook, relais Grok Build) + Vite 7 / React / R3F, page embarquée par `//go:embed`.

Écoute par défaut : `127.0.0.1:8040`. Chaque install a ses agents et ses secrets. Rien n’est partagé.

## Quoi de neuf en v3

- **Que du réel** : plus de `--demo` ni de bots factices. Roster = `$AGENT_DATA/agents/`, mouvement = transcripts réels + état gateway réel. Rien n’est inventé.
- **Routage Grok Build explicite** : seul `target: grok-build` (bouton HUD) ou l’UUID `VILLAGE_GROKBUILD_ID` part vers xAI. Jamais par nom d’agent — renommer un agent ne détourne plus ses consignes.
- **Perf** : `GET /api/bots` sert le snapshot mémoire (plus de rescan disque à chaque poll de 2 s) ; le roster WS n’est repoussé que s’il a changé ; le client ne polle qu’en secours quand le WS est down.
- **Durci** : auth avant comptage du rate-limit (un anonyme n’épuise plus le quota du NAT), purge des IP inactives du limiter, `X-Frame-Options: DENY` + `frame-ancestors 'none'` (anti-clickjacking), troncature UTF-8 propre.
- **Deps** : Vite 7 (vuln esbuild dev purgée ; reste `braces` dev-only sans patch amont — aucune exposition runtime, la page servie est statique). `/api/health` expose `version`.

## Installer

```bash
git clone https://github.com/lowrenzu/botvillage-v2.git
cd botvillage-v2/v3
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
- Une consigne vers un agent Cursor part au webhook. Seul un routage **explicite** vise xAI : `target: grok-build` (c’est ce que fait le bouton HUD « Grok Build »), ou l’id d’agent déclaré dans `VILLAGE_GROKBUILD_ID`. Jamais par nom — renommer un agent « Grok … » ne redirige plus ses consignes vers un tiers. L’appel part sur `https://api.x.ai/v1/responses` avec le modèle `grok-4.7`, la réponse est ajoutée au transcript de cet agent.
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
| `VILLAGE_GROKBUILD_ID` | UUID d’agent routé vers xAI même sans `target: grok-build` (optionnel) |

Vide `VILLAGE_ALLOW` = tous les agents ; `VILLAGE_EXCLUDE` les cache côté serveur. Le client ne filtre que si `health.allowedIds` est non vide.

Le jeton HUD n’est pas la clé webhook. Hors loopback, la première page demande le jeton et pose un cookie `village_session` **opaque** (id aléatoire côté serveur — jamais le secret brut), conservé dans le fichier local `.village-sessions` pour survivre aux redémarrages (ce n’est toujours pas la clé webhook). Le champ jeton HUD alimente seulement le header `X-Village-Token` **en mémoire** (pas de localStorage du secret). Auth durable = cookie HttpOnly (+ `Secure` si TLS / `X-Forwarded-Proto: https`). Avec `VILLAGE_LOCAL=1`, le gate est sauté pour **tous** les peers (loopback + Tailscale/LAN) — utile en trust LAN. Sans ce flag, hors loopback la première page demande le jeton. Pose `VILLAGE_PROMPT_TOKEN` (ou un fichier `.prompt-token` gitignoré) dès que tu écoutes `0.0.0.0` sans `VILLAGE_LOCAL=1`.

**⚠️ Reverse proxy local = bypass.** L’auth « loopback ouvert » se base sur l’adresse TCP du pair. Tout reverse proxy sur la même machine (nginx, caddy, `tailscale serve`…) qui forwarde vers `127.0.0.1:8040` fait passer **tout le trafic distant pour du loopback** : plus aucun jeton demandé, et le rate-limit partage un seul seau. Les en-têtes `X-Forwarded-For` ne sont volontairement pas lus. Ne mets jamais un reverse proxy devant botvillage ; expose le port directement avec `VILLAGE_PROMPT_TOKEN`, ou passe par Tailscale sans proxy local.

## Docker

Les secrets ne sont pas dans l’image.

```bash
AGENT_DATA=/home/box/agent-data WEBHOOK_JSON=./webhook.json docker compose up --build
```

Monte aussi `xai.json` si tu l’utilises, ou passe `XAI_API_KEY`.

Pas de mode démo : le bureau n’affiche que les agents réels de `$AGENT_DATA/agents/`, leurs transcripts réels, et l’état réel du gateway. Rien n’est inventé.

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

`webhook.json`, `xai.json`, `wakes.jsonl`, `.env*`, `web/node_modules/`, binaire `botvillage`.

## Licence

MIT. Voir LICENSE.

## Smoke

```bash
bash scripts/smoke.sh http://127.0.0.1:8040
```

GET only (`/api/health`, `/api/bots`, `/api/skills`). Ne POST pas `/api/prompt`.
