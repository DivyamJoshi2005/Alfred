"""Alfred Backend — WebSocket connection manager and router."""

import json
from typing import Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]):
        """Send a JSON message to all connected clients."""
        data = json.dumps(message)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def send_progress(
        self,
        job_id: str,
        phase: str,
        progress: float,
        message: str,
        clip_index: int | None = None,
        clip_total: int | None = None,
    ):
        """Send a pipeline progress update."""
        payload: dict[str, Any] = {
            "type": "progress",
            "job_id": job_id,
            "phase": phase,
            "progress": round(progress, 1),
            "message": message,
        }
        if clip_index is not None:
            payload["clip_index"] = clip_index
        if clip_total is not None:
            payload["clip_total"] = clip_total
        await self.broadcast(payload)

    async def send_job_status(self, job_id: str, status: str, error: str | None = None):
        """Send a job status change event."""
        payload: dict[str, Any] = {
            "type": "job_status",
            "job_id": job_id,
            "status": status,
        }
        if error:
            payload["error"] = error
        await self.broadcast(payload)

    async def send_upload_status(self, post_id: str, status: str, error: str | None = None):
        """Send an upload status change event."""
        payload: dict[str, Any] = {
            "type": "upload_status",
            "post_id": post_id,
            "status": status,
        }
        if error:
            payload["error"] = error
        await self.broadcast(payload)

    async def send_notification(self, level: str, message: str):
        """Send a system notification."""
        await self.broadcast({
            "type": "notification",
            "level": level,
            "message": message,
        })


# Singleton instance
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, listen for pings
            data = await websocket.receive_text()
            # Client can send pings; we just acknowledge
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
