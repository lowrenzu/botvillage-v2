# botvillage island-prompt (automation routine)

Parent should create a Cursor automation/routine that receives POSTs from botvillage
and wakes the named Grok Bot with the user prompt.

## Expected POST body

```json
{ "id": "<agent-uuid>", "name": "<display name>", "prompt": "<user text>" }
```

Probe / health:

```json
{ "action": "skip", "id": "", "name": "", "prompt": "" }
```

When `action` is `skip`, acknowledge and exit without waking anyone.

## Routine behaviour

1. Read `id`, `name`, `prompt` from the webhook JSON body.
2. If `action == "skip"`, return OK and stop.
3. Resolve the target Grok Bot by `id` (preferred) or exact `name`.
4. Deliver `prompt` to that bot as a user message / wake (same effect as chatting in its thread).
5. Do not echo the webhook key. Do not invent agents.

## Wiring webhook.json

After this routine exists and you have a webhook URL + key:

1. Copy `webhook.json.example` → `webhook.json`
2. Fill `url` and `key`
3. `chmod 600 webhook.json`

botvillage reads **only** `webhook.json` next to the binary (cwd). There is **no**
`VILLAGE_WEBHOOK_KEY` (or other) env fallback in code — URL + key must be in that file.

## Auth headers the server sends

- `Authorization: Bearer <key>`
- `X-Automation-Key: <key>`
- `Content-Type: application/json`
