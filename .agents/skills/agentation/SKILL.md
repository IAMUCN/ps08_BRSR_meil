---
name: agentation
description: Visual feedback toolbar for web apps connected to AI coding agents and MCP server
---

# Agentation

Agentation is an agent-agnostic visual feedback tool. Users click elements on the page, add notes, and submit structured annotations that help AI coding agents pinpoint exact code, CSS selectors, and context.

## MCP Server & Tools

When connected via MCP (`agentation-mcp server` on HTTP port 4747 by default), the following tools are available to the agent:
- `agentation_list_sessions`: List active annotation sessions.
- `agentation_get_session`: Retrieve all annotations for a specific session.
- `agentation_get_pending`: Get unacknowledged/unresolved annotations for a session.
- `agentation_get_all_pending`: Retrieve all pending feedback across all sessions.
- `agentation_acknowledge`: Acknowledge an annotation before acting on it.
- `agentation_resolve`: Mark an annotation as addressed/resolved once fixed.
- `agentation_dismiss`: Dismiss an annotation with a reason.
- `agentation_reply`: Send a reply note to an annotation thread.
- `agentation_watch_annotations`: Long-poll for incoming feedback annotations.

## Frontend Usage

```tsx
import { Agentation } from "agentation";

{process.env.NODE_ENV === "development" && (
  <Agentation endpoint="http://localhost:4747" />
)}
```

## Setup & Verification

1. Run `agentation-mcp doctor` to check server health.
2. In the browser, click to add an annotation.
3. The agent retrieves pending annotations via `agentation_get_all_pending` and makes requested edits.
