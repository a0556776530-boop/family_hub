import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import Header from '../components/layout/Header'
import BottomNav from '../components/layout/BottomNav'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const NOTE_COLORS = [
  'bg-yellow-100 dark:bg-yellow-900/50 border-yellow-200 dark:border-yellow-700',
  'bg-pink-100 dark:bg-pink-900/50 border-pink-200 dark:border-pink-700',
  'bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-700',
  'bg-green-100 dark:bg-green-900/50 border-green-200 dark:border-green-700',
  'bg-purple-100 dark:bg-purple-900/50 border-purple-200 dark:border-purple-700',
]

function colorForSender(id) {
  let hash = 0
  for (const c of (id || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  return NOTE_COLORS[Math.abs(hash) % NOTE_COLORS.length]
}

export default function FamilyBoard() {
  const { user }  = useAuth()
  const socketRef = useRef(null)
  const bottomRef = useRef(null)

  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [typing, setTyping]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)

  // Load history
  useEffect(() => {
    api.get('/api/chat/messages').then(res => {
      setMessages(res.data.messages)
    }).finally(() => setLoading(false))
  }, [])

  // SocketIO
  useEffect(() => {
    if (!user?.family_id) return
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', { transports: ['websocket'] })
    socketRef.current = socket

    socket.emit('join_family', { family_id: user.family_id })

    socket.on('new_message', msg => {
      setMessages(prev => [...prev, msg])
    })
    socket.on('user_typing', ({ name }) => {
      setTyping(`${name} מקליד...`)
      setTimeout(() => setTyping(''), 2500)
    })

    return () => socket.disconnect()
  }, [user?.family_id])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onTyping = (e) => {
    setInput(e.target.value)
    socketRef.current?.emit('typing', { family_id: user?.family_id, name: user?.name?.split(' ')[0] })
  }

  const send = async (e) => {
    e.preventDefault()
    const content = input.trim()
    if (!content || !socketRef.current) return
    setSending(true)
    socketRef.current.emit('send_message', {
      family_id:   user.family_id,
      sender_id:   user.id,
      sender_name: user.name,
      avatar_url:  user.avatar_url || '',
      content,
    })
    setInput('')
    setSending(false)
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] dark:bg-gray-900 flex flex-col">
      <Header />

      <main className="flex-1 overflow-y-auto pt-16 pb-36" style={{ paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))' }}>
        <div className="px-4 max-w-lg mx-auto pt-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">לוח המשפחה 📌</h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-5">הדלת של המקרר הדיגיטלי שלכם</p>

          {loading ? (
            <div className="flex justify-center py-16"><span className="text-3xl animate-pulse">📌</span></div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <span className="text-5xl">📌</span>
              <p className="text-gray-500 dark:text-gray-400 font-medium">שלחו את ההודעה הראשונה!</p>
            </div>
          ) : (
            <div className="columns-2 gap-3 space-y-0">
              {messages.map(msg => (
                <StickyNote key={msg.id} message={msg} isMe={msg.sender_id === user?.id} />
              ))}
            </div>
          )}

          {typing && (
            <p className="text-gray-400 dark:text-gray-500 text-xs text-center mt-3 animate-pulse">{typing}</p>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
        <form onSubmit={send} className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 overflow-hidden">
            {user?.avatar_url
              ? <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
              : <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{user?.name?.[0]?.toUpperCase()}</span>}
          </div>
          <input
            value={input}
            onChange={onTyping}
            placeholder="כתוב הודעה..."
            className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white placeholder:text-gray-400 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0 active:scale-90 transition-transform disabled:opacity-40">
            <svg className="w-4 h-4 text-white rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}

function StickyNote({ message, isMe }) {
  const color = colorForSender(message.sender_id)
  const time  = message.created_at
    ? new Date(message.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className={`break-inside-avoid mb-3 rounded-2xl border p-3 shadow-sm ${color} ${isMe ? 'ring-2 ring-blue-300 dark:ring-blue-700' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-white/60 dark:bg-black/20 flex items-center justify-center overflow-hidden shrink-0">
          {message.avatar_url
            ? <img src={message.avatar_url} className="w-full h-full object-cover" alt="" />
            : <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{message.sender_name?.[0]?.toUpperCase()}</span>}
        </div>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">
          {isMe ? 'אתה' : message.sender_name?.split(' ')[0]}
        </span>
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{message.content}</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-left">{time}</p>
    </div>
  )
}
