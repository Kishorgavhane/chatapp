import { useState } from 'react'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import styles from './Auth.module.css'

export default function AuthPage() {
  const { login } = useAuth()
  const [mode, setMode]       = useState('login')
  const [form, setForm]       = useState({ email: '', username: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const url  = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : form
      const { data } = await axios.post(url, body)
      login(data.access_token, { id: data.user_id, username: data.username, email: data.email })
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>💬</span>
          <h1>ChatApp</h1>
          <p>Connect with anyone, anywhere</p>
        </div>

        <div className={styles.tabs}>
          <button className={mode === 'login' ? styles.active : ''} onClick={() => setMode('login')}>Sign In</button>
          <button className={mode === 'register' ? styles.active : ''} onClick={() => setMode('register')}>Sign Up</button>
        </div>

        <form onSubmit={handle} className={styles.form}>
          <div className={styles.field}>
            <label>Email</label>
            <input type="email" placeholder="you@example.com" required
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>

          {mode === 'register' && (
            <div className={styles.field}>
              <label>Username</label>
              <input type="text" placeholder="cooluser123" required
                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
          )}

          <div className={styles.field}>
            <label>Password</label>
            <input type="password" placeholder="••••••••" required
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
