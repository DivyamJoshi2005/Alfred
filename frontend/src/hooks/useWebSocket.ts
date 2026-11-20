import { useEffect, useRef, useState } from 'react'
import type { WSMessage } from '../lib/types'

type WSHandler = (msg: WSMessage) => void

export function useWebSocket(onMessage: WSHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket
    let pingInterval: ReturnType<typeof setInterval>
    let reconnectTimeout: ReturnType<typeof setTimeout>

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, 30_000)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WSMessage
          handlerRef.current(msg)
        } catch { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        setConnected(false)
        clearInterval(pingInterval)
        reconnectTimeout = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearInterval(pingInterval)
      clearTimeout(reconnectTimeout)
      ws?.close()
    }
  }, [])

  return { connected }
}
