# High-Level Sequence Diagrams

The following sequence diagrams illustrate how state flows between the frontend, the backend, and an external LLM connected via MCP.

# User Edits the Plan in the UI

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (App)
    participant AC as APIClient
    participant R as REST Routes (/api)
    participant S as ProjectStore

    U->>F: Add task "Bake cake" in RoadmapGraph
    F->>AC: addTask(parentId, "Bake cake")
    AC->>R: POST /api/tasks/add
    R->>S: store.addTask(parentId, name)
    Note over S: Push undo snapshot<br/>Mutate goal tree<br/>Increment version
    S-->>R: New task
    R-->>AC: { task, state: ProjectState }
    AC-->>F: task + full new state
    F->>F: applyState(state) → PlanManager + inbox + roadmap re-render
```

# External LLM Edits the Plan via MCP

```mermaid
sequenceDiagram
    participant L as Claude Desktop (LLM)
    participant M as MCP Server (/mcp)
    participant S as ProjectStore
    participant R as Realtime Server (/ws)
    participant F as One browser
    participant G as Another browser

    L->>M: tools/call add_task { name: "Buy ingredients" }
    M->>S: runAs(MCP, () => store.addTask("Goal", name))
    Note over S: version: n → n+1
    S-->>R: onChange (coalesced onto the next tick)
    S-->>M: New task id
    M-->>L: { taskId, version: n+1 }

    R->>F: { type: "state", state, author: { id: "mcp", kind: "assistant" } }
    R->>G: { type: "state", state, author: { id: "mcp", kind: "assistant" } }
    F->>F: applyState(state) → UI updates without reload
    G->>G: applyState(state) → UI updates without reload
```

# Saving and Restoring a Project

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant R as REST Routes (/api)
    participant S as ProjectStore
    participant P as Project (persistence)

    U->>F: Click Save, enter filename
    F->>R: POST /api/projects/save { filename }
    R->>S: getState()
    R->>P: saveProject(filename, goal, inbox)
    Note over P: Writes ./projects/filename.txt<br/>{ formatVersion: 2, goal, inbox }
    R->>S: setActiveProject(filename)
    R-->>F: { projects: [...] }

    U->>F: Click Open
    F->>R: POST /api/projects/restore { filename }
    R->>P: restoreProject(filename)
    P-->>R: { goal, inbox }
    R->>S: store.load(goal, inbox, filename)
    R-->>F: ProjectState
    F->>F: applyState(state)
```

# Undo with Two Writers

Undo is global: the store's undo stack records every mutation regardless of author, so a UI Ctrl+Z can revert an MCP edit and the MCP `undo_last_change` tool can revert a UI edit.

```mermaid
sequenceDiagram
    participant L as Claude Desktop (LLM)
    participant U as User (UI)
    participant S as ProjectStore

    L->>S: add_task "Task X" (via /mcp)
    Note over S: Snapshot pushed, version++
    U->>S: POST /api/undo (Ctrl+Z)
    Note over S: Pops snapshot → "Task X" removed<br/>version++
    L->>S: get_project_state
    S-->>L: State without "Task X"
```
