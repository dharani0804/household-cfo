#!/usr/bin/env bash
# Calls one tool on the MCP server, the way a client would:
# initialize, then "initialized", then tools/call, all in one session.
#
# Usage: deploy/mcp-call.sh <tool> '<json arguments>'
# Needs MCP_URL. Add BEARER_TOKEN when the server requires sign-in (AgentCore does).
set -euo pipefail

tool="$1"
args="${2:-}"
if [[ -z "$args" ]]; then args="{}"; fi
: "${MCP_URL:?Set MCP_URL to the MCP endpoint first}"

headers=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
if [[ -n "${BEARER_TOKEN:-}" ]]; then
  headers+=(-H "Authorization: Bearer $BEARER_TOKEN")
fi

session=$(curl -s -D - -o /dev/null -X POST "$MCP_URL" "${headers[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"mcp-call","version":"1"}}}' \
  | grep -i '^mcp-session-id:' | awk '{print $2}' | tr -d '\r' || true)
if [[ -z "$session" ]]; then
  echo "No session ID came back. Is the URL right and the token fresh?" >&2
  exit 1
fi

headers+=(-H "mcp-session-id: $session" -H "mcp-protocol-version: 2025-11-25")
curl -s -X POST "$MCP_URL" "${headers[@]}" -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

curl -s -X POST "$MCP_URL" "${headers[@]}" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}" \
  | sed -n 's/^data: //p' | jq -r '.result.content[0].text // .error.message // .'
