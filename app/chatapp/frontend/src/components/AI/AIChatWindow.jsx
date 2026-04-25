import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import styles from './AIChatWindow.module.css'

const SYSTEM_PROMPTS = {
  assistant: "You are a helpful AI assistant inside ChatApp. Be concise, friendly, and helpful.",
  coder:     "You are an expert software engineer. Give clean, well-commented code examples. Be precise.",
  teacher:   "You are a patient teacher. Explain concepts simply, use analogies, give examples.",
  creative:  "You are a creative writer. Be imaginative, expressive, and inspiring.",
}

export default function AIChatWindow({ onClose }) {
  const [messages, setMessages]   = useState([
    { role: 'assistant', content: '👋 Hi! I am your AI assistant powered by **Llama**. How can I help you today?', time: new Date() }
  ])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [streaming, setStreaming] = useState('')
  const [models, setModels]       = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedMode, setSelectedMode]   = useState('assistant')
  const [aiStatus, setAiStatus]   = useState('checking') // checking | ok | error
  const bottomRef = useRef(null)
  const abortRef  = useRef(null)

  // Load models on mount
  useEffect(() => {
    axios.get('/api/ai/models')
      .then(r => {
        setModels(r.data.models || [])
        setSelectedModel(r.data.default || 'llama3.2')
        setAiStatus(r.data.models?.length > 0 ? 'ok' : 'error')
      })
      .catch(() => setAiStatus('error'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMsg = { role: 'user', content: input.trim(), time: new Date() }
    const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setStreaming('')

    try {
      // Use streaming endpoint
      const resp = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: userMsg.content,
          model: selectedModel,
          history,
          system_prompt: SYSTEM_PROMPTS[selectedMode]
        })
      })

      if (!resp.ok) throw new Error('AI request failed')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.error) {
              fullText = `❌ ${data.error}`
              break
            }
            if (data.content) {
              fullText += data.content
              setStreaming(fullText)
            }
            if (data.done) break
          } catch {}
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: fullText, time: new Date() }])
      setStreaming('')

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Could not connect to AI. Make sure Ollama is running (`docker compose up`)',
        time: new Date(),
        isError: true
      }])
    } finally {
      setLoading(false)
      setStreaming('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: '🔄 Chat cleared! How can I help you?', time: new Date() }])
  }

  const renderContent = (text) => {
    // Simple markdown: **bold**, `code`, ```codeblock```
    return text
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className={styles.window}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.aiAvatar}>🤖</div>
          <div>
            <div className={styles.title}>AI Assistant</div>
            <div className={`${styles.status} ${aiStatus === 'ok' ? styles.online : styles.offline}`}>
              {aiStatus === 'checking' ? '⏳ Connecting…'
                : aiStatus === 'ok' ? `✅ Ollama • ${selectedModel}`
                : '❌ Ollama offline'}
            </div>
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Model selector */}
          {models.length > 0 && (
            <select className={styles.select} value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          <button className={styles.clearBtn} onClick={clearChat} title="Clear chat">🗑️</button>
          {onClose && <button className={styles.closeBtn} onClick={onClose}>✕</button>}
        </div>
      </div>

      {/* Mode selector */}
      <div className={styles.modeBar}>
        {Object.keys(SYSTEM_PROMPTS).map(mode => (
          <button key={mode}
            className={`${styles.modeBtn} ${selectedMode === mode ? styles.modeActive : ''}`}
            onClick={() => setSelectedMode(mode)}>
            {mode === 'assistant' ? '🤖' : mode === 'coder' ? '💻' : mode === 'teacher' ? '📚' : '✨'} {mode}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.msgRow} ${msg.role === 'user' ? styles.user : styles.ai}`}>
            {msg.role === 'assistant' && <div className={styles.msgAvatar}>🤖</div>}
            <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble} ${msg.isError ? styles.errorBubble : ''}`}>
              <div
                className={styles.msgContent}
                dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
              />
              <div className={styles.msgTime}>{format(msg.time, 'HH:mm')}</div>
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streaming && (
          <div className={`${styles.msgRow} ${styles.ai}`}>
            <div className={styles.msgAvatar}>🤖</div>
            <div className={`${styles.bubble} ${styles.aiBubble}`}>
              <div className={styles.msgContent}
                dangerouslySetInnerHTML={{ __html: renderContent(streaming) }} />
              <span className={styles.cursor}>▊</span>
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {loading && !streaming && (
          <div className={`${styles.msgRow} ${styles.ai}`}>
            <div className={styles.msgAvatar}>🤖</div>
            <div className={`${styles.bubble} ${styles.aiBubble} ${styles.thinking}`}>
              <span/><span/><span/>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Offline warning */}
      {aiStatus === 'error' && (
        <div className={styles.offlineBar}>
          ⚠️ Ollama not running. Run: <code>docker compose up ollama</code>
        </div>
      )}

      {/* Input */}
      <div className={styles.inputBar}>
        <textarea
          className={styles.input}
          placeholder="Ask AI anything… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || loading}
        >
          {loading ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  )
}
