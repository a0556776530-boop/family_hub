import { useEffect, useRef, useState } from 'react'

// Classic dual-tone phone ring using Web Audio API
function createRingtone() {
  try {
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()

    // UK-style ring: 400+450 Hz dual-tone, 400ms on / 200ms off / 400ms on / 2s off
    const schedule = []
    const RING_PAIR  = [{ on: 0.40, off: 0.20 }, { on: 0.40, off: 2.00 }]
    const LOOPS      = 8
    let   t          = ctx.currentTime + 0.05

    for (let i = 0; i < LOOPS; i++) {
      for (const { on, off } of RING_PAIR) {
        schedule.push({ start: t, end: t + on })
        t += on + off
      }
    }

    const nodes = []
    for (const { start, end } of schedule) {
      const gain = ctx.createGain()
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.45, start + 0.01)
      gain.gain.setValueAtTime(0.45, end - 0.02)
      gain.gain.linearRampToValueAtTime(0, end)

      for (const freq of [400, 450]) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = freq
        osc.connect(gain)
        osc.start(start)
        osc.stop(end)
        nodes.push(osc)
      }
    }

    return {
      duration: t - ctx.currentTime,
      stop: () => { try { nodes.forEach(n => { try { n.stop() } catch {} }); ctx.close() } catch {} },
    }
  } catch {
    return { duration: 10, stop: () => {} }
  }
}

// Dismiss any SW notification tagged 'ring'
function dismissRingNotification() {
  try {
    navigator.serviceWorker?.ready.then(reg =>
      reg.getNotifications({ tag: 'ring' }).then(list => list.forEach(n => n.close()))
    )
  } catch {}
}

export default function RingAlert({ caller, onStop }) {
  const rtRef  = useRef(null)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    rtRef.current = createRingtone()

    // Haptic feedback on devices that support it
    try { navigator.vibrate?.([500, 200, 500, 200, 500, 200, 500, 200, 500]) } catch {}

    // Pulse animation counter
    const pId = setInterval(() => setPulse(p => p + 1), 800)

    // Auto-stop when ringtone ends
    const tId = setTimeout(() => stop(), (rtRef.current.duration + 0.5) * 1000)

    return () => {
      clearInterval(pId)
      clearTimeout(tId)
      rtRef.current?.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => {
    rtRef.current?.stop()
    try { navigator.vibrate?.(0) } catch {}
    dismissRingNotification()
    onStop()
  }

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

      <button onClick={stop}
        className="relative z-10 bg-white text-blue-700 font-extrabold text-lg px-12 py-4 rounded-3xl shadow-2xl active:scale-95 transition-transform">
        עצור
      </button>
    </div>
  )
}
