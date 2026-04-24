import { useState, useRef } from 'react'
import styles from './VoicePlayer.module.css'

export default function VoicePlayer({ src, isMine }) {
  const [playing, setPlaying]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef(null)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else         { a.play();  setPlaying(true) }
  }

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  return (
    <div className={`${styles.player} ${isMine ? styles.mine : styles.theirs}`}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={e => setProgress((e.target.currentTime / e.target.duration) * 100 || 0)}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
      />

      <button className={styles.playBtn} onClick={toggle}>
        {playing ? '⏸' : '▶'}
      </button>

      <div className={styles.waveWrap}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.times}>
          <span>{fmt(audioRef.current?.currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <span className={styles.micIcon}>🎤</span>
    </div>
  )
}
