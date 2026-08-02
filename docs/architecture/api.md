# API Endpoints

## Preconditions

Writes that overwrite text carry a precondition, so one person cannot silently clobber another's edit:

| Command                                         | Precondition   | Why                                                                               |
| ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `goal`, `tasks/update`                          | `baseVersion`  | Text overwrite against a stable, id-addressed target.                             |
| `inbox/update`, `inbox/remove`, `inbox/promote` | `expectedText` | Inbox rows are index-addressed and adding an idea unshifts, renumbering them all. |
| everything else                                 | none           | Additive or commutative.                                                          |

`baseVersion` is captured when the local edit **begins**, not when it is sent — at send time it is always current and would catch nothing. Both are optional; omitting them leaves the write unguarded, so the last one wins.

## REST API (`/api`)

Used by the frontend as the **fallback transport**, while the realtime socket is not open; the socket carries the same commands under the same names (see below). Unless noted otherwise, every mutation returns `{ response: ProjectState }` where `ProjectState = { version, activeProject, goal, inbox }`.

Validation failures return 400, unknown task/project ids return 404, and a refused write returns **409** with `{ error, response }` — `response` being the server's authoritative state, so the client can rebase instead of guessing. A 409 may additionally carry `otherCount` (project switch).

Every error body also carries a `code` drawn from the same `CommandErrorCode` union the socket uses, so a failure means the same thing on either transport. Statuses alone would not: `conflict`, `undo-blocked` and `confirm-required` all return 409.

Mutations may send an `X-Blossom-Author` header (`{ id, kind }`) identifying the browser that made the change. There are no names and no authentication — it only lets undo tell one browser's work from another's.

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
| **/inbox/update**         | POST   | `{ index, text, expectedText? }`                 | Edits an idea.                                                         |
| **/inbox/remove**         | POST   | `{ index, expectedText? }`                       | Removes an idea.                                                       |
| **/inbox/promote**        | POST   | `{ index, parentId?, expectedText? }`            | Converts an idea into a task.                                          |
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

| Tool                  | Params                          | Description                                                  |
| --------------------- | ------------------------------- | ------------------------------------------------------------ |
| `get_project_state`   | —                               | Full state: goal tree, inbox, version, active project.       |
| `get_roadmap`         | `taskId?`                       | One level of the plan (tasks + dependencies) for a scope.    |
| `get_next_tasks`      | —                               | Actionable (unblocked, incomplete leaf) tasks.               |
| `set_goal`            | `name, description?`            | Set the project goal.                                        |
| `add_task`            | `name, description?, parentId?` | Add a task; returns its id.                                  |
| `update_task`         | `taskId, name?, description?`   | Edit a task.                                                 |
| `set_task_completion` | `taskId, completed`             | Mark complete/incomplete.                                    |
| `delete_task`         | `taskId`                        | Delete a task and its subplan.                               |
| `create_subplan`      | `taskId`                        | Give a task an empty subplan.                                |
| `add_dependency`      | `sourceId, targetId`            | Source must finish before target ("Goal" allowed as target). |
| `remove_dependency`   | `sourceId, targetId`            | Remove a dependency.                                         |
| `add_inbox_idea`      | `text`                          | Add a raw idea.                                              |
| `remove_inbox_idea`   | `index`                         | Remove an idea.                                              |
| `promote_inbox_idea`  | `index, parentId?`              | Turn an idea into a task.                                    |
| `undo_last_change`    | —                               | Undo the most recent change (global).                        |

Project management — listing, saving, opening, creating, and deleting projects — is deliberately not exposed over MCP; only the user can do that, from the frontend. MCP therefore only ever operates on whichever project is currently active in the store.

### Workflow steering

The server sends **instructions** in the MCP initialize response (clients like Claude Desktop inject them into the model's context on connect). They lay out the workflow: Phase 1 goal clarification (one question at a time, WHAT/WHY not HOW), Phase 2 comprehensive task ideation into the inbox, Phase 3 structuring — promote ideas to tasks, group into subgoals past ~8 tasks per level, and wire dependencies into a DAG.

The instructions also carry a **naming** rule: every goal and task name must start with an imperative verb and read as one actionable item ("Sign software engineering offer", not "Resume" or a full sentence), and it is a label on a graph node, so it stays under ~40 characters. All specifics, measures, deadlines and rationale go in the `description` field the UI shows in the details drawer. The same guidance is repeated in the `generate-plan` prompt and in the `set_goal`/`add_task`/`update_task` parameter descriptions, and inbox ideas are phrased as imperative actions too, since a promoted idea takes its full text as the task name and otherwise needs rewriting afterwards.

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
