# Blossom

This application allows you to use generative AI to create an easy to visualize project plan.

There is no built-in chat window or LLM: the backend exposes an MCP (Model Context Protocol) server, and you collaborate on the plan through an external chat application (e.g. Claude Desktop) connected to it. The web UI visualizes the roadmap live and picks up the LLM's edits automatically.

## Setup Environment

```sh
brew install node
npm install --global yarn
```

## Installation

To install this package, run the following in the root directory of the repo:

```sh
yarn install
```

## Environment Configuration

### Backend Configuration

Create a `.env` file in the `packages/backend` directory with the following:

```sh
PORT=3030
```

- `PORT` - The port the backend server will run on (defaults to 3030 if not set)

### Frontend Configuration

The frontend uses environment files in `packages/frontend`:

- `.env.development` - Development configuration
- `.env.production` - Production configuration
- `.env.example` - Template file

The frontend will automatically use the correct environment file based on whether you're running in development (`yarn start`) or building for production (`yarn build`).

#### GitHub Codespaces

If you are working in GitHub Codespaces, ensure that the port visibility for the backend is set to **public**. This allows the frontend to communicate with the backend server.

## Adding New Dependencies

To add new dependencies for a specific package, use:

```sh
yarn workspace @blossom/<package-name> add <dependency-name>
```

For example, to add a development dependency to the `@blossom/backend` package:

```sh
yarn workspace @blossom/backend add domexception --dev
```

To install a dependency across all packages, run the following in the root directory:

```sh
yarn add <dependency-name>
```

This will add the dependency to all packages in the monorepo.

## Running Application in Development Environment

Ensure you have created the `.env` file in the backend directory as described in the Environment Configuration section above.

Then run:

```sh
yarn start
```

## Connecting a Chat Application via MCP

The backend serves an MCP server at `http://localhost:3030/mcp` (Streamable HTTP). Any MCP-capable chat app can connect and collaborate on your project plan — adding tasks and dependencies, and managing the inbox. Saving, opening, and creating projects stay user-only in the web UI. The web UI polls for changes and updates within a few seconds.

For Claude Desktop, add this to `claude_desktop_config.json` (uses the `mcp-remote` proxy):

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

Make sure `yarn start` is running, then restart Claude Desktop and ask it e.g. "Add the tasks for launching my website to my blossom roadmap."

For **Claude Code**, register the server once at user scope so it is available from any directory (it speaks Streamable HTTP directly, so no proxy is needed):

```sh
claude mcp add --scope user --transport http blossom http://localhost:3030/mcp
```

Check the connection with `claude mcp list` or the `/mcp` command inside a session.

The full tool list is documented in [docs/architecture/api.md](./docs/architecture/api.md).

## Understanding the Codebase

For an overview of the architecture, refer to the [Architecture](./docs/architecture/) folder, starting with the [overview](./docs/architecture/overview.md)
