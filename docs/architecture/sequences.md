# High-Level Sequence Diagrams

The following sequence diagrams illustrate how state flows between the frontend, the backend, and an external LLM connected via MCP.

# User Edits the Plan in the UI

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend (App)
    participant AC as APIClient
    participant R as REST Routes (/api)
    participant W as Workspace
    participant S as ProjectStore (trip)

    U->>F: Add task "Bake cake" in the "trip" lane
    F->>AC: addTask("trip", parentId, "Bake cake")
    AC->>R: POST /api/tasks/add { projectKey: "trip", ... }
    R->>W: resolve "trip"
    W-->>R: its ProjectStore
    R->>S: store.addTask(parentId, name)
    Note over S: Push undo snapshot<br/>Mutate goal tree<br/>Increment version
    S-->>R: New task
    R-->>AC: { task, state: ProjectState }
    AC-->>F: task + that project's full new state
    F->>F: applyProject(state) → WorkspaceManager + inbox + board re-render
```

# Two Sessions Looking at Different Boards

A `state` frame reaches only the sessions whose view holds the project that changed.

```mermaid
sequenceDiagram
    participant A as Browser A (view: trip)
    participant B as Browser B (view: house, trip)
    participant C as Browser C (view: house)
    participant R as Realtime Server (/ws)
    participant W as Workspace

    A->>R: hello { author, view: ["trip"] }
    R-->>A: snapshot { view: { projects: [trip] } }
    B->>R: hello { author, view: ["house", "trip"] }
    R-->>B: snapshot { view: { projects: [house, trip] } }
    C->>R: hello { author, view: ["house"] }
    R-->>C: snapshot { view: { projects: [house] } }

    A->>R: command { name: "goal", payload: { projectKey: "trip", ... } }
    R->>W: dispatch → trip's store
    W-->>R: onChange("trip") (coalesced onto the next tick)
    R-->>A: result { ...trip's new state }
    R->>B: state { state: trip }
    Note over C: Not looking at "trip", so hears nothing
```

# External LLM Edits the Plan via MCP

The assistant works on the one project a person chose for it in the web UI.

```mermaid
sequenceDiagram
    participant L as Claude Desktop (LLM)
    participant M as MCP Server (/mcp)
    participant W as Workspace
    participant S as ProjectStore (trip)
    participant R as Realtime Server (/ws)
    participant F as A browser looking at "trip"
    participant G as A browser looking at "house"

    L->>M: tools/call add_task { name: "Buy ingredients" }
    M->>W: assistantStore()
    W-->>M: trip's ProjectStore
    M->>S: runAs(MCP, () => store.addTask("Goal", name))
    Note over S: version: n → n+1
    S-->>W: onChange
    W-->>R: onChange("trip") (coalesced onto the next tick)
    S-->>M: New task id
    M-->>L: { taskId, version: n+1 }

    R->>F: state { state: trip, author: { id: "mcp", kind: "assistant" } }
    F->>F: applyProject(state) → the "trip" lane updates without reload
    Note over G: Not looking at "trip", so hears nothing
```

# Saving a Project Under a New Name

Writing a project to disk puts it under the filename it was written to, so every session looking at it is told which key to use from then on.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant R as REST Routes (/api)
    participant W as Workspace
    participant P as Project (persistence)
    participant RT as Realtime Server (/ws)
    participant G as Another browser looking at it

    U->>F: Click Save, enter "q3-roadmap"
    F->>R: POST /api/projects/save { projectKey: "Untitled", filename: "q3-roadmap" }
    R->>W: save("Untitled", "q3-roadmap", author)
    W->>P: saveProject("q3-roadmap", goal, inbox)
    Note over P: Writes ./projects/q3-roadmap.txt<br/>{ formatVersion: 3, goal, inbox }
    Note over W: Re-keys the project<br/>savedToDisk: true
    W-->>RT: onRename("Untitled", "q3-roadmap", author)
    R-->>F: { projects: [...], state: { key: "q3-roadmap", ... } }
    F->>F: The board follows it, and so does the link
    RT->>G: notice { kind: "project-renamed", from: "Untitled", to: "q3-roadmap", author }
```

# Opening a Project onto One Board

Opening a project is a per-session act: it puts the project on the board of the browser that asked and leaves every other board alone.

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant R as REST Routes (/api)
    participant W as Workspace
    participant P as Project (persistence)
    participant RT as Realtime Server (/ws)
    participant G as Another browser

    U->>F: Tick "house" in the projects menu
    F->>R: POST /api/projects/open { filename: "house" }
    R->>W: open("house")
    W->>P: restoreProject("house")
    P-->>W: { goal, inbox }
    Note over W: New ProjectStore, keyed "house"
    R-->>F: ProjectState
    F->>F: addProject(state) → a second lane on the board
    F->>RT: subscribe { view: ["trip", "house"] }
    RT-->>F: snapshot { view: { projects: [trip, house] } }
    Note over G: Its own board is untouched
```

# Undo with Two Writers

Undo is per project: each store's undo stack records every mutation to that project regardless of author, so a UI Ctrl+Z can revert an MCP edit and the MCP `undo_last_change` tool can revert a UI edit — within the one project each is working on.

```mermaid
sequenceDiagram
    participant L as Claude Desktop (LLM)
    participant U as User (UI)
    participant S as ProjectStore (trip)

    L->>S: add_task "Task X" (via /mcp)
    Note over S: Snapshot pushed, version++
    U->>S: POST /api/undo { projectKey: "trip" } (Ctrl+Z)
    Note over S: Pops snapshot → "Task X" removed<br/>version++
    L->>S: get_project_state
    S-->>L: State without "Task X"
```
