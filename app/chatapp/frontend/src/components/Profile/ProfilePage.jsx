import { useState, useRef } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import styles from './ProfilePage.module.css'

export default function ProfilePage({ onClose, viewUserId }) {
  const { user, login }      = useAuth()
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({ username: '', bio: '' })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const fileRef = useRef(null)

  // Load profile on open
  useState(() => {
    const uid = viewUserId || user?.id
    if (!uid) return
    axios.get(`/api/users/${uid}`).then(r => {
      setProfile(r.data)
      setForm({ username: r.data.username, bio: r.data.bio || '' })
    })
  }, [viewUserId, user])

  const isSelf = !viewUserId || viewUserId === user?.id

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { data } = await axios.patch('/api/users/me', form)
      setProfile(data)
      setEditing(false)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const { data } = await axios.post('/api/users/me/avatar', fd)
      setProfile(data)
    } catch {
      setError('Avatar upload failed')
    }
    e.target.value = ''
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  if (!profile) return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.loading}>Loading profile…</div>
      </div>
    </div>
  )

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <h2>{isSelf ? 'My Profile' : `${profile.username}'s Profile`}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Avatar */}
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrap}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" className={styles.avatar} />
              : <div className={styles.avatarPlaceholder}>{profile.username[0].toUpperCase()}</div>
            }
            {isSelf && (
              <button className={styles.changeAvatarBtn} onClick={() => fileRef.current?.click()} title="Change photo">
                📷
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

          <div className={styles.statusBadge}>
            <span className={`${styles.dot} ${profile.is_online ? styles.online : styles.offline}`} />
            {profile.is_online ? 'Online' : 'Offline'}
          </div>
        </div>

        {/* Info */}
        {editing ? (
          <div className={styles.editForm}>
            <div className={styles.field}>
              <label>Username</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label>Bio</label>
              <textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Tell something about yourself…"
                rows={3}
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.editActions}>
              <button className={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.infoSection}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Username</span>
              <span className={styles.infoValue}>@{profile.username}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>{profile.email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Bio</span>
              <span className={styles.infoValue}>{profile.bio || <em className={styles.empty}>No bio yet</em>}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Last seen</span>
              <span className={styles.infoValue}>
                {profile.is_online ? '🟢 Right now' : formatDate(profile.last_seen)}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Member since</span>
              <span className={styles.infoValue}>{formatDate(profile.created_at)}</span>
            </div>

            {isSelf && (
              <button className={styles.editBtn} onClick={() => setEditing(true)}>
                ✏️ Edit Profile
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
