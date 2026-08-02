# High Level Overview

```mermaid
graph TD
    LLM[External chat app e.g. Claude Desktop]
    A[Frontend]
    B[Backend]
    C[Common]

    LLM -->|MCP over HTTP /mcp| B
    A <-->|WebSocket /ws| B
    A -->|REST /api fallback| B
    A -->|Uses| C
    B -->|Uses| C
```

There is no LLM inside the application. Instead, the backend exposes an **MCP (Model Context Protocol) server** so that any external chat application (e.g. Claude Desktop) can act as the conversational interface. The LLM collaborates on the project plan by calling MCP tools; every connected frontend visualizes the same state and is **pushed** each change over a WebSocket as it happens, whoever made it.

## Common Package

The Common package contains the shared domain types (`Task`, `Plan`, `Dependency`, `ProjectState`) plus pure graph logic (`hasCircularDependencies`, `updateTaskStates`) used by both the Frontend and the Backend.

## Backend Package

The Backend is the single source of truth for project state (`ProjectStore`). It exposes the same state through two front doors: a REST API used by the Frontend, and an MCP server used by external chat applications. It also persists projects to disk, driven only by the Frontend, never by MCP.

For details on the API endpoints and MCP tools, refer to the [API Endpoints](./api.md) document.

For more information on the backend architecture, refer to the [Backend Architecture](./backend.md) document.

## Frontend Package

The Frontend visualizes the project plan as a roadmap graph, shows the inbox of raw ideas, allows editing tasks/dependencies, and saving/restoring projects. There is no chat window — conversations happen in the external chat app connected via MCP.

Several people can work on the project at once, from different devices. There are no accounts and nobody is asked for a name: each browser holds an anonymous id in `localStorage` purely so changes can be told apart, and sends its mutations over the same socket it receives them on.

For more information on the frontend architecture, refer to the [Frontend Architecture](./frontend.md) document.

## Sequence Diagrams

For detailed sequence diagrams, see the [Sequence Diagrams](./sequences.md) document.
