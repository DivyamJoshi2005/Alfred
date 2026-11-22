#!/usr/bin/env bash
# ==============================================================================
# Alfred — One-Command Native Desktop Launcher
# Starts the local Python AI backend and opens the native Tauri desktop window.
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🎩 Starting Alfred Native Desktop Studio..."

# 1. Check if backend is already running on port 8741
BACKEND_PID=""
if ! curl -s http://127.0.0.1:8741/api/health >/dev/null 2>&1; then
    echo "⚙️  Starting local backend engine (:8741)..."
    "$DIR/backend/.venv/bin/python" "$DIR/backend/main.py" &
    BACKEND_PID=$!

    # Wait for backend to report ready
    for i in {1..20}; do
        if curl -s http://127.0.0.1:8741/api/health >/dev/null 2>&1; then
            echo "✅ Backend engine is ready!"
            break
        fi
        sleep 0.5
    done
else
    echo "✅ Backend engine is already active on port 8741."
fi

# Cleanup backend when desktop window closes
cleanup() {
    if [ -n "$BACKEND_PID" ]; then
        echo "🛑 Closing backend engine..."
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 2. Launch native Tauri desktop window
echo "🖥️  Opening native desktop window..."
npm run tauri dev
