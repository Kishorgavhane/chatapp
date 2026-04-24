import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function useWebSocket(onMessage) {
  const { token } = useAuth()
  const ws = useRef(null)
  const [connected, setConnected] = useState(false)
  const pingInterval = useRef(null)

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host     = window.location.host
    const url      = `${protocol}://${host}/ws?token=${token}`

    const connect = () => {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => {
        setConnected(true)
        pingInterval.current = setInterval(() => send({ type: 'ping' }), 25000)
      }

      ws.current.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data)) }
        catch {}
      }

      ws.current.onclose = () => {
        setConnected(false)
        clearInterval(pingInterval.current)
        setTimeout(connect, 3000) // auto-reconnect
      }

      ws.current.onerror = () => ws.current.close()
    }

    connect()
    return () => {
      clearInterval(pingInterval.current)
      ws.current?.close()
    }
  }, [token])

  return { send, connected }
}
