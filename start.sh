#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"
exec node "$(dirname "${BASH_SOURCE[0]}")/server.js" "$PORT"
