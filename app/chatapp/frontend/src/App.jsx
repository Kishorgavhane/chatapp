import { useState, useCallback } from 'react'
import { useAuth } from './context/AuthContext'
import { useWebSocket } from './hooks/useWebSocket'
import { useWebRTC } from './hooks/useWebRTC'
import { usePushNotifications } from './hooks/usePushNotifications'
import AuthPage from './components/Auth/AuthPage'
import Sidebar from './components/Chat/Sidebar'
import ChatWindow from './components/Chat/ChatWindow'
import AIChatWindow from './components/AI/AIChatWindow'
import ProfilePage from './components/Profile/ProfilePage'
import SearchPanel from './components/Search/SearchPanel'
import CallWindow from './components/Call/CallWindow'
import IncomingCall from './components/Call/IncomingCall'
import styles from './App.module.css'

export default function App() {
  const { user, loading }             = useAuth()
  const [activeChat, setActiveChat]   = useState(null)
  const [showAI, setShowAI]           = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [typingUsers, setTypingUsers] = useState({})
  const [showProfile, setShowProfile] = useState(false)
  const [profileUserId, setProfileUserId] = useState(null)
  const [showSearch, setShowSearch]   = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)

  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case 'new_message':
        window._addMessage?.(data.message)
        if (document.hidden && Notification.permission === 'granted') {
          new Notification(data.message.sender?.username || 'New message', {
            body: data.message.msg_type === 'text' ? data.message.content : '📎 Media',
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
      case 'call_offer':
        setIncomingCall({ fromUser: { id: data.from_user_id, username: data.from_username, avatar: data.from_avatar }, sdp: data.sdp, callType: data.call_type })
        break
      case 'call_answer':   webrtc.handleAnswer(data.sdp); break
      case 'call_reject':   webrtc.endCall(); break
      case 'call_end':      webrtc.endCall(); break
      case 'ice_candidate': webrtc.handleIceCandidate(data.candidate); break
      default: break
    }
  }, [])

  const { send, connected } = useWebSocket(handleWsMessage)
  const webrtc = useWebRTC({ send, currentUserId: user?.id })
  usePushNotifications(user)

  const openProfile = (uid) => { setProfileUserId(uid); setShowProfile(true) }

  const handleStartCall = (chatUser, type) => {
    setShowAI(false)
    webrtc.startCall({ id: chatUser.id, username: chatUser.name, avatar: chatUser.avatar }, type)
  }

  const handleSelectChat = (chat) => {
    setActiveChat(chat)
    setShowAI(false)
  }

  const handleOpenAI = () => {
    setShowAI(true)
    setActiveChat(null)
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
        onSelectChat={handleSelectChat}
        onlineUsers={onlineUsers}
        typingUsers={typingUsers}
        onOpenSearch={() => setShowSearch(true)}
        onOpenProfile={() => openProfile(null)}
        onOpenAI={handleOpenAI}
      />

      {/* Main area — AI or Chat */}
      {showAI
        ? <AIChatWindow onClose={() => setShowAI(false)} />
        : <ChatWindow
            activeChat={activeChat}
            send={send}
            typingUsers={typingUsers}
            onlineUsers={onlineUsers}
            onOpenProfile={openProfile}
            onStartCall={handleStartCall}
          />
      }

      {showProfile && <ProfilePage viewUserId={profileUserId} onClose={() => setShowProfile(false)} />}
      {showSearch  && <SearchPanel onClose={() => setShowSearch(false)} onJumpToChat={(chat) => { handleSelectChat(chat); setShowSearch(false) }} />}

      {incomingCall && webrtc.callState === 'idle' && (
        <IncomingCall
          caller={incomingCall.fromUser}
          callType={incomingCall.callType}
          onAccept={() => { webrtc.acceptCall(incomingCall.fromUser, incomingCall.sdp, incomingCall.callType); setIncomingCall(null) }}
          onReject={() => { webrtc.rejectCall(incomingCall.fromUser.id); setIncomingCall(null) }}
        />
      )}

      {webrtc.callState !== 'idle' && (
        <CallWindow
          callState={webrtc.callState} callType={webrtc.callType}
          remoteUser={webrtc.remoteUser} callDuration={webrtc.callDuration}
          isMuted={webrtc.isMuted} isCamOff={webrtc.isCamOff} isScreenSharing={webrtc.isScreenSharing}
          localVideoRef={webrtc.localVideoRef} remoteVideoRef={webrtc.remoteVideoRef}
          onMute={webrtc.toggleMute} onCamOff={webrtc.toggleCamera}
          onScreenShare={webrtc.toggleScreenShare} onEnd={webrtc.endCall}
        />
      )}
    </div>
  )
}
