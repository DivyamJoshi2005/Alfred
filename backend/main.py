"""Alfred Backend — FastAPI application entry point."""

import sys
import argparse
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import SERVER_HOST, SERVER_PORT, ensure_directories
from database import init_db
from routers import accounts, clips, jobs, schedule, settings, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    import asyncio
    from scheduler import scheduler_loop

    # Startup
    ensure_directories()
    await init_db()
    print(f"[Alfred] Database initialized")

    scheduler_task = asyncio.create_task(scheduler_loop())
    print(f"[Alfred] Scheduler background worker launched")
    print(f"[Alfred] Server ready at http://{SERVER_HOST}:{app.state.port}")

    yield

    # Shutdown
    print("[Alfred] Shutting down...")
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass


def create_app(port: int = SERVER_PORT) -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Alfred Backend",
        description="Offline-first AI content repurposing engine",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.state.port = port

    # CORS — allow Tauri webview (localhost dev server)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(ws.router)
    app.include_router(jobs.router)
    app.include_router(clips.router)
    app.include_router(schedule.router)
    app.include_router(accounts.router)
    app.include_router(settings.router)

    # Health check
    @app.get("/api/health")
    async def health_check():
        return {"status": "ok", "version": "0.1.0"}

    # Media streaming for frontend video preview
    @app.get("/api/media")
    async def get_media(path: str):
        from fastapi.responses import FileResponse
        from fastapi import HTTPException
        from pathlib import Path

        file_path = Path(path).resolve()
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="Media file not found")
        return FileResponse(str(file_path))

    # Serve built frontend UI if available
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from fastapi import HTTPException
    from pathlib import Path

    dist_dir = Path(__file__).parent.parent / "dist"
    if dist_dir.exists() and (dist_dir / "index.html").exists():
        if (dist_dir / "assets").exists():
            app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")

        @app.get("/")
        async def serve_index():
            return FileResponse(str(dist_dir / "index.html"))

        # Catch-all for client-side routing (Process, Review, Calendar, Settings)
        @app.get("/{full_path:path}")
        async def catch_all(full_path: str):
            if full_path.startswith(("api", "ws", "docs", "openapi.json")):
                raise HTTPException(status_code=404, detail="Not Found")
            file_candidate = dist_dir / full_path
            if file_candidate.exists() and file_candidate.is_file():
                return FileResponse(str(file_candidate))
            return FileResponse(str(dist_dir / "index.html"))
    else:
        @app.get("/")
        async def root():
            return {
                "name": "Alfred Backend API",
                "version": "0.1.0",
                "status": "running",
                "docs": "/docs",
                "endpoints": {
                    "health": "/api/health",
                    "jobs": "/api/jobs",
                    "clips": "/api/clips",
                    "schedule": "/api/schedule",
                    "accounts": "/api/accounts",
                    "settings": "/api/settings",
                    "media": "/api/media?path=...",
                    "websocket": "/ws",
                },
            }

    return app


def main():
    parser = argparse.ArgumentParser(description="Alfred Backend Server")
    parser.add_argument("--port", type=int, default=SERVER_PORT, help="Port to bind to")
    args = parser.parse_args()

    app = create_app(port=args.port)

    # Write port to file for Tauri to discover
    port_file = __import__("config").ALFRED_DATA_DIR / "port"
    port_file.parent.mkdir(parents=True, exist_ok=True)
    port_file.write_text(str(args.port))

    uvicorn.run(
        app,
        host=SERVER_HOST,
        port=args.port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
