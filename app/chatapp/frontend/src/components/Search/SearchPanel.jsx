import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import styles from './SearchPanel.module.css'

export default function SearchPanel({ onClose, onJumpToChat }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('users') // users | messages
  const debounce = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        if (tab === 'users') {
          const { data } = await axios.get(`/api/users/search?q=${encodeURIComponent(query)}`)
          setResults(data)
        } else {
          const { data } = await axios.get(`/api/messages/search?q=${encodeURIComponent(query)}`)
          setResults(data)
        }
      } catch { setResults([]) }
      setLoading(false)
    }, 350)
    return () => clearTimeout(debounce.current)
  }, [query, tab])

  const highlight = (text, q) => {
    if (!q) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className={styles.highlight}>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>

        <div className={styles.searchBar}>
          <span className={styles.icon}>🔍</span>
          <input
            autoFocus
            className={styles.input}
            placeholder="Search users or messages…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button className={tab === 'users' ? styles.active : ''} onClick={() => setTab('users')}>👤 Users</button>
          <button className={tab === 'messages' ? styles.active : ''} onClick={() => setTab('messages')}>💬 Messages</button>
        </div>

        <div className={styles.results}>
          {loading && <div className={styles.loading}>Searching…</div>}

          {!loading && results.length === 0 && query && (
            <div className={styles.empty}>No {tab} found for "{query}"</div>
          )}

          {!loading && tab === 'users' && results.map(u => (
            <div key={u.id} className={styles.userRow}
              onClick={() => { onJumpToChat({ id: u.id, type: 'user', name: u.username, avatar: u.avatar_url }); onClose() }}>
              <div className={styles.avatar}>
                {u.avatar_url ? <img src={u.avatar_url} alt="" /> : <span>{u.username[0].toUpperCase()}</span>}
                {u.is_online && <span className={styles.onlineDot} />}
              </div>
              <div className={styles.info}>
                <span className={styles.name}>{highlight(u.username, query)}</span>
                <span className={styles.sub}>{u.email}</span>
              </div>
              <span className={styles.arrow}>→</span>
            </div>
          ))}

          {!loading && tab === 'messages' && results.map(m => (
            <div key={m.id} className={styles.msgRow}
              onClick={() => {
                if (m.receiver_id) onJumpToChat({ id: m.sender_id, type: 'user', name: m.sender?.username, avatar: m.sender?.avatar_url })
                else onJumpToChat({ id: m.group_id, type: 'group', name: m.group?.name, avatar: '' })
                onClose()
              }}>
              <div className={styles.msgMeta}>
                <span className={styles.msgSender}>{m.sender?.username}</span>
                <span className={styles.msgTime}>{format(new Date(m.created_at), 'dd MMM, HH:mm')}</span>
              </div>
              <p className={styles.msgContent}>{highlight(m.content, query)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
