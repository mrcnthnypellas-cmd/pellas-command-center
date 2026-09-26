#!/usr/bin/env bash
# Development run on Linux/macOS: builds the dashboard, then runs the server with a local data folder.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd dashboard && npm ci && npm run build)
export MPS_DATA_DIR="${MPS_DATA_DIR:-$PWD/.data}"
dotnet run --project src/MyPrivateServer.Server
