import { useEffect, useRef, useState } from 'react'
import { playRingtone, getSelectedRingtone } from '../utils/ringtones'
import api from '../api/client'

function dismissRingNotification() {
  try {
    navigator.serviceWorker?.ready.then(reg =>
      reg.getNotifications({ tag: 'ring' }).then(list => list.forEach(n => n.close()))
    )
  } catch {}
}

export default function RingAlert({ caller, onStop }) {
  const rtRef   = useRef(null)
  const stopRef = useRef(null)  // always points to latest stop function
  const [pulse, setPulse] = useState(0)

  // Keep stopRef current on every render
  stopRef.current = () => {
    rtRef.current?.stop()
    try { navigator.vibrate?.(0) } catch {}
    dismissRingNotification()
    api.post('/api/notifications/ring/stop-mine').catch(() => {})  // notify parent to reset UI
    onStop()
  }

  useEffect(() => {
    // Infinite loop — rings until explicitly stopped
    rtRef.current = playRingtone(getSelectedRingtone(), 0)

    // Loop vibration every 3.2 seconds (mirrors ring cadence)
    function vibrateOnce() {
      try { navigator.vibrate?.([500, 200, 500, 200, 500]) } catch {}
    }
    vibrateOnce()
    const vibrateId = setInterval(vibrateOnce, 3200)

    // Pulse animation
    const pId = setInterval(() => setPulse(p => p + 1), 800)

    // Poll backend every 1s — stops when sender presses stop, regardless of push
    const doPoll = async () => {
      try {
        const res = await api.get('/api/notifications/ring/my-status')
        if (res.data.active === false) stopRef.current?.()
      } catch {}
    }
    doPoll()  // immediate — don't wait 1s before first check
    const pollId = setInterval(doPoll, 1000)

    return () => {
      clearInterval(pId)
      clearInterval(vibrateId)
      clearInterval(pollId)
      try { navigator.vibrate?.(0) } catch {}
      rtRef.current?.stop()
    }
  }, [])

  const rings = pulse % 2 === 0

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(175deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)' }}
      dir="rtl">

      {/* Pulsing circles */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3].map(i => (
          <span key={i} className="absolute rounded-full border-2 border-white/20 transition-all duration-700"
            style={{
              width:   `${(rings ? 120 : 100) + i * 70}px`,
              height:  `${(rings ? 120 : 100) + i * 70}px`,
              opacity: rings ? 0.6 / i : 0.2 / i,
            }} />
        ))}
      </div>

      {/* Phone icon */}
      <div className="relative z-10 w-24 h-24 rounded-full bg-white/15 ring-4 ring-white/30 flex items-center justify-center mb-6"
        style={{ transform: rings ? 'rotate(-12deg)' : 'rotate(12deg)', transition: 'transform 0.2s ease' }}>
        <span className="text-5xl select-none">📱</span>
      </div>

      <p className="relative z-10 text-blue-200 text-base mb-1 font-medium">מחפשים אותך!</p>
      <p className="relative z-10 text-white text-2xl font-extrabold mb-12">{caller || 'ההורים'}</p>

      <button onClick={() => stopRef.current?.()}
        className="relative z-10 bg-white text-blue-700 font-extrabold text-lg px-12 py-4 rounded-3xl shadow-2xl active:scale-95 transition-transform">
        עצור
      </button>
    </div>
  )
}
