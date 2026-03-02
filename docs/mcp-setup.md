# Obsidian MCP Setup

Use this setup when you want Obsidian to be the central context layer for Claude Desktop, Claude Code, Cursor, or any MCP-compatible client.

## 1) Install Obsidian Local REST API plugin

1. In Obsidian, install and enable **Local REST API** community plugin.
2. Generate an API key in the plugin settings.
3. Keep the default API port (`27123`) unless you already use it.

## 2) Install an Obsidian MCP server

Recommended server: `obsidian-mcp-server` (community TypeScript implementation).

```bash
npx -y obsidian-mcp-server
```

## 3) Add MCP server config to your client

Use this in your MCP client configuration (Claude Desktop / Cursor):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-mcp-server"],
      "env": {
        "OBSIDIAN_API_KEY": "your_local_rest_api_key",
        "OBSIDIAN_API_PORT": "27123"
      }
    }
  }
}
```

## 4) Recommended operating model

- Keep this plugin as your **context ingestion pipeline** (Granola, Linear, Figma, Slack, GitHub, Google Drive).
- Use MCP clients as **context consumers** for open-ended questions and workflows.
- Keep repeatable routines inside Obsidian commands (`weekly digest`, `top customer asks`, etc.).

## 5) Example prompts

- "Find the top 10 customer asks from the last 30 days across sales and CS meetings."
- "Summarize product risks mentioned by customers in the last two weeks."
- "List all open asks tied to Verizon and Servco with supporting note links."
