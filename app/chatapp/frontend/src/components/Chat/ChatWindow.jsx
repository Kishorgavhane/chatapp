import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import EmojiPicker from 'emoji-picker-react'
import { useAuth } from '../../context/AuthContext'
import MessageBubble from './MessageBubble'
import VoiceRecorder from '../Voice/VoiceRecorder'
import styles from './ChatWindow.module.css'

export default function ChatWindow({ activeChat, send, typingUsers, onlineUsers, onOpenProfile, onStartCall }) {
  const { user }                = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [showEmoji, setShowEmoji]   = useState(false)
  const [showVoice, setShowVoice]   = useState(false)
  const [uploading, setUploading]   = useState(false)
  const bottomRef   = useRef(null)
  const typingTimer = useRef(null)
  const fileRef     = useRef(null)

  useEffect(() => {
    if (!activeChat) return
    setMessages([]); setShowEmoji(false); setShowVoice(false)
    const url = activeChat.type === 'user'
      ? `/api/messages/conversation/${activeChat.id}`
      : `/api/messages/group/${activeChat.id}`
    axios.get(url).then(r => setMessages(r.data)).catch(() => {})
    if (activeChat.type === 'user') send({ type: 'mark_seen', sender_id: activeChat.id })
  }, [activeChat])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const addMessage = useCallback((msg) => {
    const belongs = activeChat?.type === 'user'
      ? (msg.sender_id === activeChat.id || msg.receiver_id === activeChat.id)
      : msg.group_id === activeChat?.id
    if (belongs) setMessages(prev => [...prev, msg])
  }, [activeChat])

  useEffect(() => { window._addMessage = addMessage }, [addMessage])
  useEffect(() => { window._updateMessage = (fn) => setMessages(prev => prev.map(fn)) }, [])

  const handleTyping = () => {
    const p = activeChat.type === 'user'
      ? { type: 'typing', receiver_id: activeChat.id, is_typing: true }
      : { type: 'typing', group_id: activeChat.id, is_typing: true }
    send(p)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => send({ ...p, is_typing: false }), 1500)
  }

  const handleSend = () => {
    if (!text.trim()) return
    send({ type: 'send_message', content: text.trim(), msg_type: 'text',
      ...(activeChat.type === 'user' ? { receiver_id: activeChat.id } : { group_id: activeChat.id }) })
    setText(''); setShowEmoji(false)
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const { data } = await axios.post('/api/messages/upload-media', fd)
      send({ type: 'send_message', content: data.url,
        msg_type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file',
        ...(activeChat.type === 'user' ? { receiver_id: activeChat.id } : { group_id: activeChat.id }) })
    } catch {}
    setUploading(false); e.target.value = ''
  }

  const handleVoiceSend = (url) => {
    send({ type: 'send_message', content: url, msg_type: 'audio',
      ...(activeChat.type === 'user' ? { receiver_id: activeChat.id } : { group_id: activeChat.id }) })
    setShowVoice(false)
  }

  if (!activeChat) return (
    <div className={styles.empty}>
      <div className={styles.emptyInner}>
        <span className={styles.emptyIcon}>💬</span>
        <h2>Select a chat to start messaging</h2>
        <p>Search for users in the sidebar</p>
      </div>
    </div>
  )

  const isTyping = activeChat.type === 'user' ? typingUsers[activeChat.id] : false
  const isOnline = activeChat.type === 'user' && onlineUsers.includes(activeChat.id)

  return (
    <div className={styles.window}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft} onClick={() => onOpenProfile?.(activeChat.type === 'user' ? activeChat.id : null)}>
          <div className={styles.headerAvatar}>
            {activeChat.avatar ? <img src={activeChat.avatar} alt="" /> : <span>{activeChat.name[0].toUpperCase()}</span>}
            {activeChat.type === 'user' && <span className={`${styles.dot} ${isOnline ? styles.online : styles.offline}`} />}
          </div>
          <div className={styles.headerInfo}>
            <span className={styles.headerName}>{activeChat.name}</span>
            <span className={styles.headerStatus}>
              {isTyping ? <em className={styles.typing}>typing…</em> : isOnline ? 'Online' : activeChat.type === 'group' ? 'Group chat' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Call buttons — only for 1-to-1 */}
        {activeChat.type === 'user' && (
          <div className={styles.callBtns}>
            <button className={styles.callBtn} onClick={() => onStartCall(activeChat, 'audio')} title="Audio call">🎙️</button>
            <button className={styles.callBtn} onClick={() => onStartCall(activeChat, 'video')} title="Video call">📹</button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messages} onClick={() => setShowEmoji(false)}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isMine={msg.sender_id === user.id}
            onReact={(id, emoji) => axios.post(`/api/messages/${id}/react?emoji=${encodeURIComponent(emoji)}`)}
            onDelete={(id) => axios.delete(`/api/messages/${id}`).then(() =>
              setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true, content: 'This message was deleted' } : m)))}
            onEdit={(id, content) => axios.patch(`/api/messages/${id}`, { content }).then(r =>
              setMessages(prev => prev.map(m => m.id === id ? r.data : m)))}
          />
        ))}
        {isTyping && <div className={styles.typingBubble}><span /><span /><span /></div>}
        <div ref={bottomRef} />
      </div>

      {showEmoji && (
        <div className={styles.emojiWrap}>
          <EmojiPicker theme="dark" width="100%" height={340} onEmojiClick={e => setText(t => t + e.emoji)} lazyLoadEmojis />
        </div>
      )}

      {/* Input */}
      <div className={styles.inputBar}>
        {showVoice ? (
          <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setShowVoice(false)} />
        ) : (
          <>
            <button className={styles.iconBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>📎</button>
            <input type="file" ref={fileRef} onChange={handleFileUpload} style={{ display:'none' }} accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.zip" />
            <button className={styles.iconBtn} onClick={() => setShowEmoji(v => !v)}>😊</button>
            <textarea className={styles.input} placeholder="Type a message…" value={text}
              onChange={e => { setText(e.target.value); handleTyping() }}
              onKeyDown={handleKeyDown} rows={1} />
            <button className={styles.iconBtn} onClick={() => setShowVoice(true)}>🎤</button>
            <button className={styles.sendBtn} onClick={handleSend} disabled={!text.trim()}>➤</button>
          </>
        )}
      </div>
    </div>
  )
}
