import styles from './CallWindow.module.css'

export default function CallWindow({
  callState, callType, remoteUser, callDuration,
  isMuted, isCamOff, isScreenSharing,
  localVideoRef, remoteVideoRef,
  onMute, onCamOff, onScreenShare, onEnd,
}) {
  if (callState === 'idle') return null

  const isCalling = callState === 'calling'
  const isRinging = callState === 'ringing'
  const isActive  = callState === 'active'

  return (
    <div className={styles.overlay}>
      <div className={`${styles.window} ${callType === 'audio' ? styles.audioOnly : ''}`}>

        {/* Remote video / avatar */}
        {callType === 'video' ? (
          <video
            ref={remoteVideoRef}
            className={styles.remoteVideo}
            autoPlay playsInline
          />
        ) : (
          <div className={styles.audioAvatar}>
            <div className={styles.bigAvatar}>
              <span>{remoteUser?.username?.[0]?.toUpperCase()}</span>
              {isActive && <div className={styles.audioRings}><span/><span/><span/></div>}
            </div>
          </div>
        )}

        {/* Status overlay */}
        <div className={styles.statusOverlay}>
          <span className={styles.remoteName}>{remoteUser?.username}</span>
          <span className={styles.statusText}>
            {isCalling ? '📞 Calling…'
              : isRinging ? '🔔 Ringing…'
              : isActive ? callDuration
              : ''}
          </span>
          {isScreenSharing && <span className={styles.screenBadge}>🖥️ Sharing screen</span>}
        </div>

        {/* Local video (PiP) */}
        {callType === 'video' && (
          <video
            ref={localVideoRef}
            className={`${styles.localVideo} ${isCamOff ? styles.hidden : ''}`}
            autoPlay playsInline muted
          />
        )}

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={`${styles.ctrlBtn} ${isMuted ? styles.active : ''}`}
            onClick={onMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🎤'}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {callType === 'video' && (
            <button
              className={`${styles.ctrlBtn} ${isCamOff ? styles.active : ''}`}
              onClick={onCamOff}
              title={isCamOff ? 'Show camera' : 'Hide camera'}
            >
              {isCamOff ? '📷' : '📹'}
              <span>{isCamOff ? 'Show cam' : 'Hide cam'}</span>
            </button>
          )}

          {callType === 'video' && isActive && (
            <button
              className={`${styles.ctrlBtn} ${isScreenSharing ? styles.active : ''}`}
              onClick={onScreenShare}
              title="Share screen"
            >
              🖥️
              <span>{isScreenSharing ? 'Stop share' : 'Share'}</span>
            </button>
          )}

          <button className={styles.endBtn} onClick={onEnd} title="End call">
            📵
            <span>End</span>
          </button>
        </div>
      </div>
    </div>
  )
}
