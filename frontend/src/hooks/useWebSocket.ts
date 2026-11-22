import { useEffect, useRef, useState } from 'react'
import type { WSMessage } from '../lib/types'

type WSHandler = (msg: WSMessage) => void

export function useWebSocket(onMessage: WSHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    let ws: WebSocket | null = null
    let pingInterval: ReturnType<typeof setInterval> | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let isDisposed = false

    function connect() {
      if (isDisposed) return

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        if (isDisposed) {
          ws?.close()
          return
        }
        setConnected(true)
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
        }, 30_000)
      }

      ws.onmessage = (e) => {
        if (isDisposed) return
        try {
          const msg = JSON.parse(e.data) as WSMessage
          handlerRef.current(msg)
        } catch { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        if (isDisposed) return
        setConnected(false)
        reconnectTimeout = setTimeout(connect, 2000)
      }

      ws.onerror = () => {
        if (isDisposed) return
        ws?.close()
      }
    }

    connect()

    return () => {
      isDisposed = true
      if (pingInterval) clearInterval(pingInterval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [])

  return { connected }
}
