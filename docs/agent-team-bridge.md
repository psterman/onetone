# OneTone Team Bridge

The bridge is disabled by default. Start it from the Tauri command surface:

```json
{"port":8797,"token":"a-local-secret"}
```

The start result contains the loopback URL and token. External orchestrators must send
`X-OneTone-Team-Token` on every request.

## Endpoints

```text
GET  /health
POST /v1/team/snapshot       { teamId }
POST /v1/team/start          StartTeamRequest
POST /v1/team/confirm-plan   TeamConfirmPlanRequest
POST /v1/team/dispatch-read-only TeamDispatchRequest
POST /v1/team/advance        TeamAdvanceRequest
POST /v1/team/tasks/list     { teamId }
POST /v1/team/tasks/get      { nodeId }
POST /v1/team/tasks/create   { teamId, subject, description, role, dependsOn, writeScopes }
POST /v1/team/tasks/update   TeamNodeStatusRequest
POST /v1/team/artifacts      TeamArtifactRequest
POST /v1/team/events         { teamId, after?, limit? }
GET  /v1/team/events/stream?teamId=...&after=...  Server-Sent Events
```

The bridge only exposes the durable task board. It does not expose shell, filesystem,
provider credentials, or arbitrary Tauri commands. Implementer writes still go through
the existing OneTone approval path.

DeepSeek-style mapping:

```text
task id        -> nodeId
ownerId        -> ownerId
revision       -> expectedRevision / revision
blockedBy      -> dependsOn
writeScopes    -> writeScopes
task result    -> Artifact
```

## Lead-driven loop

Default start is Lead-only (`autoPlan: false`). Lead creates tasks, spawns teammates,
and closes the team via ATR Team tools. Fixed-role `dispatch_read_only` / `advance`
remain available as legacy helpers, not the primary Home path.

Home panel SSE uses **fetch ReadableStream** (not `EventSource`) so it can send
`X-OneTone-Team-Token`. The bridge stream lasts ~60s; clients reconnect with the last
event id in `after`.

### Event kinds (user-facing stream)

```text
team_started
task_created / task_claimed / task_status_changed / task_reassigned
teammate_spawned / teammate_interrupted
artifact_added
message_added
plan_ready / approval_required
team_completed / team_failed
```

Older aliases such as `node_created` / `artifact_created` may still appear and should
be treated as synonyms.

A stale revision is rejected instead of overwriting a newer owner update. Long-running
worker calls are handled on separate bridge threads so board reads remain responsive.
