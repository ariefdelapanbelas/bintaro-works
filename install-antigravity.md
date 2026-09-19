# Antigravity CLI (`agy`) Setup & MCP Configuration Guide

This guide provides setup instructions for the **Google Antigravity CLI (`agy`)**, focusing on Model Context Protocol (MCP) server configuration, file paths, and architecture-compatible setup options.

---

## 1. Configuration File Locations for Antigravity CLI

The Antigravity CLI uses dedicated configuration paths distinct from the IDE. You can configure MCP servers globally or on a per-workspace basis:

| Scope | Path | Description |
| :--- | :--- | :--- |
| **Global Configuration** | `~/.gemini/antigravity-cli/mcp_config.json` | User-level configuration; applies to all sessions and directories. |
| **Workspace Configuration** | `.agents/mcp_config.json` | Project-level configuration; scoped to the repository root. |

> [!NOTE]
> **Precedence**: Workspace configurations (`.agents/mcp_config.json`) override or merge with Global configurations (`~/.gemini/antigravity-cli/mcp_config.json`) for conflicting server names.

---

## 2. Configuration Setup Options

Antigravity CLI supports both **Remote (HTTP/SSE)** and **Local (stdio)** MCP architectures.

### Option 1: Remote Server Configuration (HTTP / SSE)

Used for cloud-hosted and remote MCP endpoints that communicate over HTTP/SSE. Authentication tokens and custom headers can be defined in the `headers` object.

```json
{
  "mcpServers": {
    "github": {
      "serverUrl": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer YOUR_GITHUB_PAT"
      }
    },
    "vercel": {
      "serverUrl": "https://mcp.vercel.com"
    }
  }
}
```

#### Parameters for Remote Servers:
- `serverUrl` *(string, required)*: The HTTP/HTTPS endpoint of the remote MCP server.
- `headers` *(object, optional)*: Key-value map of HTTP headers (e.g. `Authorization`, `x-api-key`).

---

### Option 2: Local Server Configuration (Stdio)

Used for local processes, binaries, npm packages, Python packages, or containerized tools communicating via standard input/output (`stdio`).

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ],
      "env": {}
    },
    "github-docker": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_PAT"
      }
    }
  }
}
```

#### Parameters for Local Servers:
- `command` *(string, required)*: Executable command (`npx`, `node`, `python`, `docker`, etc.).
- `args` *(array of strings, optional)*: Arguments passed to the executable.
- `env` *(object, optional)*: Environment variables exposed to the spawned process.

---

## 3. Quick Setup Workflow

### Setting up Globally (CLI User Scope)
1. Create the global directory if it doesn't already exist:
   ```bash
   # Linux / macOS
   mkdir -p ~/.gemini/antigravity-cli

   # Windows PowerShell
   New-Item -ItemType Directory -Force -Path "$HOME\.gemini\antigravity-cli"
   ```
2. Create or edit `~/.gemini/antigravity-cli/mcp_config.json` with your server configuration.

### Setting up Workspace Scoped (Repository Scope)
1. In your repository root, create the `.agents/` folder:
   ```bash
   mkdir -p .agents
   ```
2. Add `.agents/mcp_config.json` with project-specific MCP servers.
3. If this file contains sensitive tokens, remember to add it to `.gitignore`:
   ```bash
   echo ".agents/mcp_config.json" >> .gitignore
   ```

---

## 4. Verification

1. Start the CLI by running:
   ```bash
   agy
   ```
2. Check available MCP tools and servers via `/mcp` or by asking the agent to list available tools.
