import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProcessPage } from './pages/ProcessPage'
import { ReviewPage } from './pages/ReviewPage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'
import { useWebSocket } from './hooks/useWebSocket'
import type { WSMessage } from './lib/types'

export default function App() {
  const [notifications, setNotifications] = useState<{ id: number; level: string; message: string }[]>([])
  const [wsEvents, setWsEvents] = useState<WSMessage[]>([])

  const handleWsMessage = useCallback((msg: WSMessage) => {
    setWsEvents(prev => [...prev.slice(-50), msg])

    if (msg.type === 'notification') {
      const id = Date.now()
      setNotifications(prev => [...prev, { id, level: msg.level, message: msg.message }])
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000)
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
