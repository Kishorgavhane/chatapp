import { useState, useEffect } from 'react'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import styles from './Sidebar.module.css'

export default function Sidebar({ activeChat, onSelectChat, onlineUsers, typingUsers, onOpenSearch, onOpenProfile }) {
  const { user, logout }        = useAuth()
  const [contacts, setContacts] = useState([])
  const [groups, setGroups]     = useState([])
  const [search, setSearch]     = useState('')
  const [searchRes, setSearchRes] = useState([])
  const [tab, setTab]           = useState('chats')

  useEffect(() => {
    axios.get('/api/users/search?q=').then(r => setContacts(r.data)).catch(() => {})
    axios.get('/api/groups/').then(r => setGroups(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!search.trim()) { setSearchRes([]); return }
    const t = setTimeout(() => {
      axios.get(`/api/users/search?q=${encodeURIComponent(search)}`).then(r => setSearchRes(r.data))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const displayList = search ? searchRes : contacts
  const isOnline = (uid) => onlineUsers.includes(uid)
  const isTyping = (uid) => typingUsers[uid]

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.myProfile} onClick={onOpenProfile}>
          <div className={styles.avatar}>
            {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{user?.username?.[0]?.toUpperCase()}</span>}
            <span className={`${styles.dot} ${styles.online}`} />
          </div>
          <span className={styles.myName}>{user?.username}</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.hBtn} onClick={onOpenSearch} title="Search">🔍</button>
          <button className={styles.hBtn} onClick={logout} title="Logout">⏻</button>
        </div>
      </div>

      <div className={styles.searchWrap}>
        <span>🔍</span>
        <input className={styles.searchInput} placeholder="Search users…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className={styles.tabs}>
        <button className={tab === 'chats' ? styles.activeTab : ''} onClick={() => setTab('chats')}>Chats</button>
        <button className={tab === 'groups' ? styles.activeTab : ''} onClick={() => setTab('groups')}>Groups</button>
      </div>

      <div className={styles.list}>
        {tab === 'chats' && displayList.map(u => (
          <div key={u.id}
            className={`${styles.item} ${activeChat?.id === u.id && activeChat?.type === 'user' ? styles.active : ''}`}
            onClick={() => onSelectChat({ id: u.id, type: 'user', name: u.username, avatar: u.avatar_url })}>
            <div className={styles.avatar}>
              {u.avatar_url ? <img src={u.avatar_url} alt="" /> : <span>{u.username[0].toUpperCase()}</span>}
              {isOnline(u.id) && <span className={`${styles.dot} ${styles.online}`} />}
            </div>
            <div className={styles.info}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{u.username}</span>
                <span className={styles.time}>{isOnline(u.id) ? 'online' : formatDistanceToNow(new Date(u.last_seen), { addSuffix: true })}</span>
              </div>
              <span className={styles.preview}>
                {isTyping(u.id) ? <em className={styles.typing}>typing…</em> : isOnline(u.id) ? 'Active now' : 'Offline'}
              </span>
            </div>
          </div>
        ))}

        {tab === 'groups' && groups.map(g => (
          <div key={g.id}
            className={`${styles.item} ${activeChat?.id === g.id && activeChat?.type === 'group' ? styles.active : ''}`}
            onClick={() => onSelectChat({ id: g.id, type: 'group', name: g.name, avatar: '' })}>
            <div className={`${styles.avatar} ${styles.groupAvatar}`}><span>#</span></div>
            <div className={styles.info}>
              <div className={styles.nameRow}><span className={styles.name}>{g.name}</span></div>
              <span className={styles.preview}>{g.description || 'Group chat'}</span>
            </div>
          </div>
        ))}

        {tab === 'chats' && displayList.length === 0 && search && (
          <p className={styles.empty}>No users found</p>
        )}
      </div>
    </aside>
  )
}
