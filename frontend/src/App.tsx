import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useCallback, useRef } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProcessPage } from './pages/ProcessPage'
import { ReviewPage } from './pages/ReviewPage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'
import { useWebSocket } from './hooks/useWebSocket'
import type { WSMessage } from './lib/types'

interface ToastNotification {
  id: string
  level: string
  message: string
  createdAt: number
}

export default function App() {
  const [notifications, setNotifications] = useState<ToastNotification[]>([])
  const [wsEvents, setWsEvents] = useState<WSMessage[]>([])
  const nextNotificationSeq = useRef(0)

  const handleWsMessage = useCallback((msg: WSMessage) => {
    setWsEvents(prev => [...prev.slice(-50), msg])

    if (msg.type === 'notification') {
      const now = Date.now()
      const seq = ++nextNotificationSeq.current
      const id = `${now}-${seq}-${Math.random().toString(36).slice(2, 8)}`

      setNotifications(prev => {
        // Prevent toast duplication if exact same message arrived within 2 seconds
        const isDuplicate = prev.some(
          n => n.message === msg.message && now - n.createdAt < 2000
        )
        if (isDuplicate) return prev
        return [...prev, { id, level: msg.level, message: msg.message, createdAt: now }]
      })

      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, 5000)
    }
  }, [])

  const { connected } = useWebSocket(handleWsMessage)

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar connected={connected} />

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<ProcessPage wsEvents={wsEvents} />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {/* Toast notifications */}
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`px-4 py-3 rounded-lg shadow-md text-sm font-medium animate-slide-up ${
                n.level === 'error' ? 'bg-error text-white' :
                n.level === 'warning' ? 'bg-warning text-white' :
                'bg-accent text-accent-text'
              }`}
            >
              {n.message}
            </div>
          ))}
        </div>
      </div>
    </BrowserRouter>
  )
}
