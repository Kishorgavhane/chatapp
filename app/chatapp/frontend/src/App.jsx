import { useState, useCallback } from 'react'
import { useAuth } from './context/AuthContext'
import { useWebSocket } from './hooks/useWebSocket'
import { useWebRTC } from './hooks/useWebRTC'
import { usePushNotifications } from './hooks/usePushNotifications'
import AuthPage from './components/Auth/AuthPage'
import Sidebar from './components/Chat/Sidebar'
import ChatWindow from './components/Chat/ChatWindow'
import ProfilePage from './components/Profile/ProfilePage'
import SearchPanel from './components/Search/SearchPanel'
import CallWindow from './components/Call/CallWindow'
import IncomingCall from './components/Call/IncomingCall'
import styles from './App.module.css'

export default function App() {
  const { user, loading }             = useAuth()
  const [activeChat, setActiveChat]   = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [typingUsers, setTypingUsers] = useState({})
  const [showProfile, setShowProfile] = useState(false)
  const [profileUserId, setProfileUserId] = useState(null)
  const [showSearch, setShowSearch]   = useState(false)

  // Incoming call state (before accept/reject)
  const [incomingCall, setIncomingCall] = useState(null) // { fromUser, sdp, callType }

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case 'new_message':
        window._addMessage?.(data.message)
        // Browser notification when chat not active
        if (document.hidden && Notification.permission === 'granted') {
          new Notification(`${data.message.sender?.username || 'New message'}`, {
            body: data.message.msg_type === 'text' ? data.message.content : `📎 Media`,
            icon: '/icon.png',
          })
        }
        break
      case 'typing':
        setTypingUsers(prev => ({ ...prev, [data.user_id]: data.is_typing }))
        if (data.is_typing) setTimeout(() => setTypingUsers(prev => ({ ...prev, [data.user_id]: false })), 3000)
        break
      case 'status_change':
        setOnlineUsers(prev => data.is_online ? [...new Set([...prev, data.user_id])] : prev.filter(id => id !== data.user_id))
        break
      case 'online_list':
        setOnlineUsers(data.users)
        break
      case 'seen_update':
        window._updateMessage?.(msg => msg.receiver_id === data.by_user_id ? { ...msg, status: 'seen' } : msg)
        break
      case 'reaction':
        window._updateMessage?.(msg => {
          if (msg.id !== data.message_id) return msg
          const filtered = (msg.reactions || []).filter(r => r.user_id !== data.user_id)
          return { ...msg, reactions: [...filtered, { emoji: data.emoji, user_id: data.user_id }] }
        })
        break

      // ── WebRTC events ──
      case 'call_offer':
        setIncomingCall({
          fromUser: { id: data.from_user_id, username: data.from_username, avatar: data.from_avatar },
          sdp: data.sdp,
          callType: data.call_type,
        })
        break
      case 'call_answer':
        webrtc.handleAnswer(data.sdp)
        break
      case 'call_reject':
        webrtc.endCall()
        alert(`${data.from_user_id} declined the call.`)
        break
      case 'call_end':
        webrtc.endCall()
        break
      case 'ice_candidate':
        webrtc.handleIceCandidate(data.candidate)
        break
      case 'screen_share_start':
        console.log('Remote started screen sharing')
        break
      case 'screen_share_stop':
        console.log('Remote stopped screen sharing')
        break
      default: break
    }
  }, [])

  const { send, connected } = useWebSocket(handleWsMessage)

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const webrtc = useWebRTC({ send, currentUserId: user?.id })

  // ── Push Notifications ─────────────────────────────────────────────────────
  usePushNotifications(user)

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openProfile = (uid) => { setProfileUserId(uid); setShowProfile(true) }

  const handleStartCall = (chatUser, type) => {
    webrtc.startCall({ id: chatUser.id, username: chatUser.name, avatar: chatUser.avatar }, type)
  }

  const handleAcceptCall = () => {
    if (!incomingCall) return
    webrtc.acceptCall(incomingCall.fromUser, incomingCall.sdp, incomingCall.callType)
    setIncomingCall(null)
  }

  const handleRejectCall = () => {
    if (!incomingCall) return
    webrtc.rejectCall(incomingCall.fromUser.id)
    setIncomingCall(null)
  }

  if (loading) return (
    <div className={styles.splash}>
      <span className={styles.splashIcon}>💬</span>
      <p>Loading…</p>
    </div>
  )

  if (!user) return <AuthPage />

  return (
    <div className={styles.layout}>
      {!connected && <div className={styles.reconnecting}>🔄 Reconnecting…</div>}

      <Sidebar
        activeChat={activeChat}
        onSelectChat={setActiveChat}
        onlineUsers={onlineUsers}
        typingUsers={typingUsers}
        onOpenSearch={() => setShowSearch(true)}
        onOpenProfile={() => openProfile(null)}
      />

      <ChatWindow
        activeChat={activeChat}
        send={send}
        typingUsers={typingUsers}
        onlineUsers={onlineUsers}
        onOpenProfile={openProfile}
        onStartCall={handleStartCall}
      />

      {/* Profile modal */}
      {showProfile && (
        <ProfilePage viewUserId={profileUserId} onClose={() => setShowProfile(false)} />
      )}

      {/* Search modal */}
      {showSearch && (
        <SearchPanel onClose={() => setShowSearch(false)}
          onJumpToChat={(chat) => { setActiveChat(chat); setShowSearch(false) }} />
      )}

      {/* Incoming call notification */}
      {incomingCall && webrtc.callState === 'idle' && (
        <IncomingCall
          caller={incomingCall.fromUser}
          callType={incomingCall.callType}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Active call window */}
      {webrtc.callState !== 'idle' && (
        <CallWindow
          callState={webrtc.callState}
          callType={webrtc.callType}
          remoteUser={webrtc.remoteUser}
          callDuration={webrtc.callDuration}
          isMuted={webrtc.isMuted}
          isCamOff={webrtc.isCamOff}
          isScreenSharing={webrtc.isScreenSharing}
          localVideoRef={webrtc.localVideoRef}
          remoteVideoRef={webrtc.remoteVideoRef}
          onMute={webrtc.toggleMute}
          onCamOff={webrtc.toggleCamera}
          onScreenShare={webrtc.toggleScreenShare}
          onEnd={webrtc.endCall}
        />
      )}
    </div>
  )
}
