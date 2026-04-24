import { useState } from 'react'
import { format } from 'date-fns'
import VoicePlayer from '../Voice/VoicePlayer'
import styles from './MessageBubble.module.css'

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','🎉','👏']

export default function MessageBubble({ msg, isMine, onReact, onDelete, onEdit }) {
  const [showActions, setShowActions] = useState(false)
  const [editing, setEditing]         = useState(false)
  const [editText, setEditText]       = useState(msg.content)
  const [showEmoji, setShowEmoji]     = useState(false)

  if (msg.is_deleted) return (
    <div className={`${styles.row} ${isMine ? styles.mine : styles.theirs}`}>
      <div className={`${styles.bubble} ${styles.deleted}`}>🚫 This message was deleted</div>
    </div>
  )

  const tickColor = msg.status === 'seen' ? '#60a5fa' : '#94a3b8'
  const ticks = isMine ? (msg.status === 'sent' ? '✓' : '✓✓') : null

  const handleEdit = () => { onEdit(msg.id, editText); setEditing(false) }

  const renderContent = () => {
    if (editing) return (
      <div className={styles.editWrap}>
        <input className={styles.editInput} value={editText}
          onChange={e => setEditText(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter') handleEdit(); if (e.key==='Escape') setEditing(false) }}
          autoFocus />
        <button className={styles.editSave} onClick={handleEdit}>Save</button>
      </div>
    )
    if (msg.msg_type === 'audio') return <VoicePlayer src={msg.content} isMine={isMine} />
    if (msg.msg_type === 'image') return <img src={msg.content} alt="media" className={styles.mediaImg} />
    if (msg.msg_type === 'file')  return <a href={msg.content} className={styles.fileLink} target="_blank" rel="noopener noreferrer">📄 Download file</a>
    return <span className={styles.text}>{msg.content}</span>
  }

  return (
    <div className={`${styles.row} ${isMine ? styles.mine : styles.theirs}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmoji(false) }}>

      {!isMine && msg.sender && <span className={styles.senderName}>{msg.sender.username}</span>}

      <div className={styles.bubbleWrap}>
        {showActions && (
          <div className={`${styles.actions} ${isMine ? styles.actionsLeft : styles.actionsRight}`}>
            <button onClick={() => setShowEmoji(v => !v)}>😊</button>
            {isMine && msg.msg_type === 'text' && !editing && <button onClick={() => setEditing(true)}>✏️</button>}
            {isMine && <button onClick={() => onDelete(msg.id)}>🗑️</button>}
          </div>
        )}

        {showEmoji && (
          <div className={`${styles.emojiPicker} ${isMine ? styles.emojiLeft : styles.emojiRight}`}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => { onReact(msg.id, e); setShowEmoji(false) }}>{e}</button>
            ))}
          </div>
        )}

        <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
          {renderContent()}
          <div className={styles.meta}>
            {msg.is_edited && <span className={styles.edited}>edited</span>}
            <span className={styles.time}>{format(new Date(msg.created_at), 'HH:mm')}</span>
            {isMine && <span className={styles.ticks} style={{ color: tickColor }}>{ticks}</span>}
          </div>
        </div>

        {msg.reactions?.length > 0 && (
          <div className={styles.reactions}>
            {msg.reactions.map((r, i) => <span key={i} className={styles.reaction}>{r.emoji}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}
