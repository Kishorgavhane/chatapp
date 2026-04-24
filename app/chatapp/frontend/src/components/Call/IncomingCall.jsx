import styles from './IncomingCall.module.css'

export default function IncomingCall({ caller, callType, onAccept, onReject }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.pulse} />

        <div className={styles.avatar}>
          {caller.avatar
            ? <img src={caller.avatar} alt="" />
            : <span>{caller.username?.[0]?.toUpperCase()}</span>}
        </div>

        <div className={styles.info}>
          <span className={styles.name}>{caller.username}</span>
          <span className={styles.callType}>
            {callType === 'video' ? '📹 Incoming video call' : '🎙️ Incoming audio call'}
          </span>
        </div>

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={onReject}>
            <span>📵</span>
            Decline
          </button>
          <button className={styles.acceptBtn} onClick={onAccept}>
            <span>{callType === 'video' ? '📹' : '📞'}</span>
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
