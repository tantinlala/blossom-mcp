# API Endpoints

## Preconditions

Writes that overwrite text carry a precondition, so one person cannot silently clobber another's edit:

| Command                                         | Precondition   | Why                                                                        |
| ----------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| `goal`, `tasks/update`                          | `baseVersion`  | Text overwrite against a stable, id-addressed target.                      |
| `inbox/update`, `inbox/remove`, `inbox/promote` | `expectedText` | Guards a write that names its row by `index`, which any other write moves. |
| everything else                                 | none           | Additive or commutative.                                                   |

`baseVersion` is captured when the local edit **begins**, not when it is sent — at send time it is always current and would catch nothing. Both are optional; omitting them leaves the write unguarded, so the last one wins.

## Collection ordering

Every collection the server returns has a stated order, so a caller reading one positionally knows what position means.

| Collection                      | Order                                                              |
| ------------------------------- | ------------------------------------------------------------------ |
| `inbox`                         | **Newest first.** A freshly added idea is element 0.               |
| `plan.tasksList`                | The order tasks were added to that plan.                           |
| `plan.dependenciesList`         | The order the edges were added.                                    |
| every batch tool's result array | The order the inputs were supplied, so the caller can zip the two. |

An inbox entry is `{ id, text }`. The `id` addresses that entry for as long as it exists, whatever happens to the ideas around it, and is the documented way to name one.

## REST API (`/api`)

Used by the frontend as the **fallback transport**, while the realtime socket is not open; the socket carries the same commands under the same names (see below). Unless noted otherwise, every mutation returns `{ response: ProjectState }` where `ProjectState = { version, activeProject, goal, inbox }`.

Validation failures return 400, unknown task/project ids return 404, and a refused write returns **409** with `{ error, response }` — `response` being the server's authoritative state, so the client can rebase instead of guessing. A 409 may additionally carry `otherCount` (project switch).

Every error body also carries a `code` drawn from the same `CommandErrorCode` union the socket uses, so a failure means the same thing on either transport. Statuses alone would not: `conflict`, `undo-blocked` and `confirm-required` all return 409.

Mutations may send an `X-Blossom-Author` header (`{ id, kind }`) identifying the browser that made the change. There are no names and no authentication — it only lets undo tell one browser's work from another's.

The three inbox commands take either an `ideaId` or an `index`; `ideaId` wins when both are sent. An `ideaId` the inbox no longer holds returns 404 with code `not-found`.

| Endpoint                  | Method | Input                                            | Description                                                            |
| ------------------------- | ------ | ------------------------------------------------ | ---------------------------------------------------------------------- |
| **/state**                | GET    | None                                             | Returns the full current project state.                                |
| **/state/version**        | GET    | None                                             | Returns `{ version }` — used by the degraded poll while offline.       |
| **/goal**                 | POST   | `{ name, description?, baseVersion? }`           | Sets the goal name/description (creates an empty plan if none exists). |
| **/tasks/add**            | POST   | `{ parentId, name, description? }`               | Adds a task; returns `{ task, state }`.                                |
| **/tasks/update**         | POST   | `{ taskId, name?, description?, baseVersion? }`  | Updates a task's name/description.                                     |
| **/tasks/set-completion** | POST   | `{ taskId, completed }`                          | Sets completion; parent completion propagates automatically.           |
| **/tasks/remove**         | POST   | `{ taskId }`                                     | Deletes a task and any dependencies referencing it.                    |
| **/tasks/create-subplan** | POST   | `{ taskId }`                                     | Gives a task an empty subplan.                                         |
| **/tasks/paste**          | POST   | `{ parentId, tasks, dependencies }`              | Pastes copied tasks with freshly generated ids.                        |
| **/dependencies/add**     | POST   | `{ sourceId, targetId }`                         | Adds a dependency (rejects self-deps and cycles).                      |
| **/dependencies/remove**  | POST   | `{ sourceId, targetId }`                         | Removes a dependency.                                                  |
| **/dependencies/update**  | POST   | `{ oldSource, oldTarget, newSource, newTarget }` | Rewires a dependency.                                                  |
| **/inbox/add**            | POST   | `{ text }`                                       | Prepends an idea to the inbox.                                         |
| **/inbox/update**         | POST   | `{ ideaId?, index?, text, expectedText? }`       | Edits an idea.                                                         |
| **/inbox/remove**         | POST   | `{ ideaId?, index?, expectedText? }`             | Removes an idea.                                                       |
| **/inbox/promote**        | POST   | `{ ideaId?, index?, parentId?, expectedText? }`  | Converts an idea into a task.                                          |
| **/inbox/promote-all**    | POST   | `{ parentId? }`                                  | Converts every idea into a task in one mutation.                       |
| **/undo**                 | POST   | None                                             | Undoes your most recent change; 409 if somebody else changed it since. |
| **/projects**             | GET    | None                                             | Returns `{ projects: string[] }`.                                      |
| **/projects/new**         | POST   | None                                             | Resets to a fresh empty project.                                       |
| **/projects/save**        | POST   | `{ filename }`                                   | Saves current state to disk; returns `{ projects }`.                   |
| **/projects/restore**     | POST   | `{ filename }`                                   | Loads a saved project into the store.                                  |
| **/projects/delete**      | POST   | `{ filename }`                                   | Deletes a saved project's file; returns `{ projects, state }`.         |
| **/projects/active**      | GET    | None                                             | Returns `{ activeProject }`.                                           |

## MCP Server (`/mcp`)

External chat applications connect over Streamable HTTP. Tools mirror the REST surface:

| Tool                  | Params                                            | Returns                                          |
| --------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `get_project_state`   | —                                                 | Full state: goal tree, inbox, version, project.  |
| `get_roadmap`         | `taskId?`                                         | One level of the plan (tasks + dependencies).    |
| `get_next_tasks`      | —                                                 | Actionable (unblocked, incomplete leaf) tasks.   |
| `set_goal`            | `name, description?`                              | `{ taskId, name, description }`                  |
| `add_task`            | `name, description?, parentId?`                   | `{ taskId, name, parentId }`                     |
| `add_tasks`           | `tasks[]`                                         | `{ tasks: [{ taskId, name, parentId }] }`        |
| `update_task`         | `taskId, name?, description?`                     | `{ taskId, name, description }`                  |
| `move_task`           | `taskId, newParentId`                             | `{ taskId, name, parentId }`                     |
| `set_task_completion` | `taskId, completed`                               | `{ taskId, name, completionState }`              |
| `delete_task`         | `taskId`                                          | `{ taskId, name, deleted }`                      |
| `create_subplan`      | `taskId`                                          | `{ taskId, name }`                               |
| `add_dependency`      | `sourceId, targetId`                              | `{ sourceId, sourceName, targetId, targetName }` |
| `add_dependencies`    | `dependencies[]`                                  | `{ dependencies: [ …the same, one per edge ] }`  |
| `remove_dependency`   | `sourceId, targetId`                              | `{ sourceId, sourceName, targetId, targetName }` |
| `add_inbox_idea`      | `text`                                            | `{ ideaId, text, duplicate }`                    |
| `add_inbox_ideas`     | `texts[]`                                         | `{ ideas: [{ ideaId, text, duplicate }] }`       |
| `remove_inbox_idea`   | `ideaId?, index?`                                 | `{ ideaId, text, removed }`                      |
| `promote_inbox_idea`  | `ideaId?, index?, parentId?, name?, description?` | `{ taskId, name, parentId }`                     |
| `promote_inbox_ideas` | `promotions[]`                                    | `{ tasks: [{ taskId, name, parentId }] }`        |
| `undo_last_change`    | —                                                 | `{ undone, reason? }`                            |

Every response also carries `version`. No mutating tool answers with the version alone: each echoes the entity it changed, names and all, so a caller can check that the write did what it meant. That is what catches a task built from the wrong text on the call that built it, rather than a hundred calls later.

Project management — listing, saving, opening, creating, and deleting projects — is deliberately not exposed over MCP; only the user can do that, from the frontend. MCP therefore only ever operates on whichever project is currently active in the store.

### Addressing inbox ideas

`ideaId` is the documented parameter on `remove_inbox_idea` and `promote_inbox_idea`. `index` is accepted and marked deprecated in the tool schema; `ideaId` wins when both are sent. An `ideaId` the inbox no longer holds — because it was removed or already promoted — is an error naming that id, so a call for an idea that has gone cannot land on its neighbour instead.

### Batches

`add_tasks`, `add_dependencies`, `add_inbox_ideas` and `promote_inbox_ideas` each apply as **one** change: one store mutation, one broadcast, one undo step. Every reference is resolved and every name checked before anything is written, so a batch either lands whole or not at all, and the result array is in the order supplied.

`add_dependencies` validates cycles across the whole batch at once, since two edges that are each fine alone can close a loop together. A rejected batch names the offending edge and the path it closes — `"Post flyers" -> "Draft copy" would create a cycle: Draft copy -> Print flyers -> Post flyers -> Draft copy` — and applies none of it.

### Dependency targets

A dependency's target is a sibling of the source, `"Goal"`, or the id of the task that owns the plan the edge lives in. The last two mean the same thing — this edge feeds the plan's goal — and both store as the `"Goal"` sentinel. The response reports the resolved target under the name it landed on, so a caller can tell which goal a `"Goal"` edge reached.

### Name rules

`set_goal`, `add_task`, `add_tasks`, `update_task`, `promote_inbox_idea` and `promote_inbox_ideas` check names in `src/mcp/nameRules.ts` before writing:

- **Refused**: longer than 40 characters, or containing a line break. The error quotes the limit and points at the description field. A name is a label on a fixed-width roadmap node, so these are what decides whether the graph stays readable.
- **Warned**: a name joining two actions with "and", a name ending in `?`, or a single-word name. These come back in a `warnings[]` field on an otherwise successful response. Whether a word is an imperative verb takes a reader to judge, so it is said rather than enforced.

### Workflow steering

The server sends **instructions** in the MCP initialize response (clients like Claude Desktop inject them into the model's context on connect). They lay out the workflow: Phase 1 goal clarification (one question at a time, WHAT/WHY not HOW), Phase 2 comprehensive task ideation, Phase 3 structuring — turn agreed ideas into tasks, group into subgoals past ~8 tasks per level, and wire dependencies into a DAG.

The inbox is offered as a review step: park candidates there when the user should look them over first, and go straight to `add_task` when the user has already agreed the scope or handed over a specification.

A short **naming** paragraph says what a good name looks like — one short imperative action of at most 40 characters, with the specifics, measures, deadlines and rationale in the `description` field the UI shows in the details drawer. The mechanically checkable part of that lives in the tools (see above), so the paragraph stays brief. The same guidance appears in the `generate-plan` prompt and in the `name` parameter descriptions.

Two **MCP prompts** are also registered for explicit invocation from the client's prompt picker:

| Prompt          | Purpose                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `plan-project`  | Start or continue the guided clarification/ideation workflow.            |
| `generate-plan` | Organize the current goal, tasks, and inbox ideas into a dependency DAG. |

### Connecting Claude Desktop

Add to `claude_desktop_config.json` (uses the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) stdio→HTTP proxy):

```json
{
    "mcpServers": {
        "blossom": {
            "command": "npx",
            "args": ["mcp-remote", "http://localhost:3030/mcp"]
        }
    }
}
```

Clients that support remote MCP servers natively can connect directly to `http://localhost:3030/mcp` (Streamable HTTP, stateless).

### Connecting Claude Code

Claude Code connects over Streamable HTTP without a proxy. Register it once at user scope (stored in `~/.claude.json`) so it is available from any directory:

```sh
claude mcp add --scope user --transport http blossom http://localhost:3030/mcp
```

Verify with `claude mcp list`, or the `/mcp` command inside a session.

## Realtime WebSocket (`/ws`)

The primary transport. Message types are defined in `@blossom/common/realtime.ts` and shared by both ends.

**Client → server**

| Frame     | Payload                 | Description                                                  |
| --------- | ----------------------- | ------------------------------------------------------------ |
| `hello`   | `{ author }`            | Identifies the browser on this socket.                       |
| `command` | `{ id, name, payload }` | Runs a mutation. `name` is the same name as the REST path.   |
| `resync`  | None                    | Asks for a fresh snapshot (tab refocused, network returned). |
| `pong`    | None                    | Answers the server's ping.                                   |

**Server → client**

| Frame      | Payload                                | Description                                                                            |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `snapshot` | `{ protocolVersion, serverId, state }` | Sent on connect and on `resync`. Applied unconditionally, bypassing the version guard. |
| `state`    | `{ state, author? }`                   | A change happened, from any writer.                                                    |
| `notice`   | `{ kind, project, author? }`           | The active project changed for everyone; `author` is whoever asked for it.             |
| `result`   | `{ id, result }`                       | A command succeeded. `result` is byte-identical to REST's `response`.                  |
| `error`    | `{ id, error, state }`                 | A command failed; `state` is authoritative so conflicts self-heal.                     |
| `ping`     | None                                   | Heartbeat, every 25s. A socket silent for 60s is terminated.                           |

`serverId` identifies the process. The version counter restarts with it, so a client seeing a new `serverId` trusts the snapshot rather than comparing versions.

WebSocket upgrades bypass CORS, and the server accepts any origin — a deliberate choice for a tool that runs on a trusted local network.
