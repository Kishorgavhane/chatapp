import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import styles from './VoiceRecorder.module.css'

export default function VoiceRecorder({ onSend, onCancel }) {
  const [state, setState]       = useState('idle') // idle | recording | recorded | uploading
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)

  const mediaRecorder = useRef(null)
  const chunks        = useRef([])
  const timerRef      = useRef(null)
  const streamRef     = useRef(null)

  useEffect(() => {
    startRecording()
    return () => {
      stopTimer()
      stopStream()
    }
  }, [])

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  const stopTimer = () => {
    clearInterval(timerRef.current)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorder.current = mr
      chunks.current = []

      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setState('recorded')
        stopStream()
      }

      mr.start(100)
      setState('recording')
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch {
      alert('Microphone permission denied')
      onCancel()
    }
  }

  const stopRecording = () => {
    stopTimer()
    mediaRecorder.current?.stop()
  }

  const handleSend = async () => {
    if (!audioBlob) return
    setState('uploading')
    try {
      const fd = new FormData()
      fd.append('file', audioBlob, `voice_${Date.now()}.webm`)
      const { data } = await axios.post('/api/messages/upload-media', fd)
      onSend(data.url)
    } catch {
      alert('Upload failed')
      setState('recorded')
    }
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={styles.recorder}>
      {state === 'recording' && (
        <>
          <div className={styles.pulse} />
          <span className={styles.timer}>{fmt(duration)}</span>
          <span className={styles.label}>Recording…</span>
          <button className={styles.stopBtn} onClick={stopRecording}>⏹ Stop</button>
          <button className={styles.cancelBtn} onClick={() => { stopRecording(); onCancel() }}>✕</button>
        </>
      )}

      {state === 'recorded' && audioUrl && (
        <>
          <audio controls src={audioUrl} className={styles.player} />
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onCancel}>✕ Cancel</button>
            <button className={styles.rerecordBtn} onClick={() => { setAudioUrl(null); setAudioBlob(null); startRecording() }}>🔄 Re-record</button>
            <button className={styles.sendBtn} onClick={handleSend}>➤ Send</button>
          </div>
        </>
      )}

      {state === 'uploading' && (
        <span className={styles.label}>⏳ Sending…</span>
      )}
    </div>
  )
}
