import { useRef, useState, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export function useWebRTC({ send, currentUserId }) {
  const [callState, setCallState] = useState('idle') // idle | calling | ringing | active | ended
  const [callType, setCallType]   = useState('video') // video | audio
  const [remoteUser, setRemoteUser] = useState(null)
  const [isMuted, setIsMuted]       = useState(false)
  const [isCamOff, setIsCamOff]     = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callDuration, setCallDuration]       = useState(0)

  const pc          = useRef(null)  // RTCPeerConnection
  const localStream = useRef(null)
  const screenStream = useRef(null)
  const durationTimer = useRef(null)
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const targetUserIdRef = useRef(null)

  // ── Get user media ────────────────────────────────────────────────────────
  const getMedia = async (type) => {
    const constraints = type === 'video'
      ? { video: { width: 1280, height: 720 }, audio: true }
      : { video: false, audio: true }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    localStream.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }

  // ── Create peer connection ─────────────────────────────────────────────────
  const createPC = (targetId) => {
    const conn = new RTCPeerConnection(ICE_SERVERS)
    targetUserIdRef.current = targetId

    // Add local tracks
    localStream.current?.getTracks().forEach(track => conn.addTrack(track, localStream.current))

    // Remote stream → video element
    conn.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
    }

    // ICE candidates → send to remote
    conn.onicecandidate = (e) => {
      if (e.candidate) {
        send({ type: 'ice_candidate', target_id: targetId, candidate: e.candidate })
      }
    }

    conn.onconnectionstatechange = () => {
      if (conn.connectionState === 'connected') {
        setCallState('active')
        setCallDuration(0)
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000)
      }
      if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
        endCall()
      }
    }

    pc.current = conn
    return conn
  }

  // ── Initiate call (caller side) ──────────────────────────────────────────
  const startCall = useCallback(async (targetUser, type = 'video') => {
    setCallType(type)
    setRemoteUser(targetUser)
    setCallState('calling')

    try {
      await getMedia(type)
      const conn = createPC(targetUser.id)
      const offer = await conn.createOffer()
      await conn.setLocalDescription(offer)
      send({ type: 'call_offer', target_id: targetUser.id, call_type: type, sdp: offer })
    } catch (err) {
      console.error('startCall error:', err)
      cleanup()
    }
  }, [send])

  // ── Accept incoming call (callee side) ───────────────────────────────────
  const acceptCall = useCallback(async (fromUser, sdpOffer, type) => {
    setCallType(type)
    setRemoteUser(fromUser)
    setCallState('active')

    try {
      await getMedia(type)
      const conn = createPC(fromUser.id)
      await conn.setRemoteDescription(new RTCSessionDescription(sdpOffer))
      const answer = await conn.createAnswer()
      await conn.setLocalDescription(answer)
      send({ type: 'call_answer', target_id: fromUser.id, sdp: answer })
    } catch (err) {
      console.error('acceptCall error:', err)
      cleanup()
    }
  }, [send])

  // ── Reject incoming call ─────────────────────────────────────────────────
  const rejectCall = useCallback((fromUserId) => {
    send({ type: 'call_reject', target_id: fromUserId, reason: 'rejected' })
    setCallState('idle')
    setRemoteUser(null)
  }, [send])

  // ── End call ──────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (targetUserIdRef.current) {
      send({ type: 'call_end', target_id: targetUserIdRef.current })
    }
    cleanup()
  }, [send])

  const cleanup = () => {
    pc.current?.close()
    pc.current = null
    localStream.current?.getTracks().forEach(t => t.stop())
    localStream.current = null
    screenStream.current?.getTracks().forEach(t => t.stop())
    screenStream.current = null
    clearInterval(durationTimer.current)
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    setCallState('idle')
    setRemoteUser(null)
    setIsMuted(false)
    setIsCamOff(false)
    setIsScreenSharing(false)
    setCallDuration(0)
    targetUserIdRef.current = null
  }

  // ── Handle incoming ICE candidate ────────────────────────────────────────
  const handleIceCandidate = useCallback(async (candidate) => {
    try {
      await pc.current?.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      console.error('ICE candidate error:', err)
    }
  }, [])

  // ── Handle remote answer ─────────────────────────────────────────────────
  const handleAnswer = useCallback(async (sdp) => {
    try {
      await pc.current?.setRemoteDescription(new RTCSessionDescription(sdp))
    } catch (err) {
      console.error('setRemoteDescription error:', err)
    }
  }, [])

  // ── Toggle mute ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }, [])

  // ── Toggle camera ─────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCamOff(c => !c)
  }, [])

  // ── Screen share ──────────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen share, restore camera
      screenStream.current?.getTracks().forEach(t => t.stop())
      const camTrack = localStream.current?.getVideoTracks()[0]
      if (camTrack && pc.current) {
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video')
        sender?.replaceTrack(camTrack)
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current
      }
      send({ type: 'screen_share_stop', target_id: targetUserIdRef.current })
      setIsScreenSharing(false)
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStream.current = screen
        const screenTrack = screen.getVideoTracks()[0]
        const sender = pc.current?.getSenders().find(s => s.track?.kind === 'video')
        sender?.replaceTrack(screenTrack)
        if (localVideoRef.current) localVideoRef.current.srcObject = screen
        screenTrack.onended = () => toggleScreenShare()
        send({ type: 'screen_share_start', target_id: targetUserIdRef.current })
        setIsScreenSharing(true)
      } catch {}
    }
  }, [isScreenSharing, send])

  const formatDuration = (s) =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor((s % 3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return {
    callState, callType, remoteUser, isMuted, isCamOff, isScreenSharing,
    callDuration: formatDuration(callDuration),
    localVideoRef, remoteVideoRef,
    startCall, acceptCall, rejectCall, endCall,
    handleIceCandidate, handleAnswer,
    toggleMute, toggleCamera, toggleScreenShare,
  }
}
