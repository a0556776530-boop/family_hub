export const RINGTONES = [
  { id: 'classic',  label: 'קלאסי',  desc: 'טלפון ביתי ישן' },
  { id: 'modern',   label: 'מודרני', desc: 'סמארטפון' },
  { id: 'musical',  label: 'מוזיקלי', desc: 'מנגינה נעימה' },
  { id: 'beep',     label: 'ביפ',    desc: 'חד וברור' },
  { id: 'urgent',   label: 'דחוף',   desc: 'אזעקה מהירה' },
]

export const RINGTONE_KEY     = 'fh_ringtone'
export const DEFAULT_RINGTONE = 'classic'

export function getSelectedRingtone() {
  return localStorage.getItem(RINGTONE_KEY) || DEFAULT_RINGTONE
}

export function setSelectedRingtone(id) {
  localStorage.setItem(RINGTONE_KEY, id)
}

// loops = 0  → infinite, rings until stop() is called
// loops > 0  → fixed number of repetitions
export function playRingtone(id, loops = 6) {
  try {
    // Reuse the context unlocked during notification-tap open (window.__ringAudioCtx),
    // so audio plays immediately without needing another gesture on mobile.
    let ctx
    if (window.__ringAudioCtx && window.__ringAudioCtx.state !== 'closed') {
      ctx = window.__ringAudioCtx
      delete window.__ringAudioCtx
    } else {
      ctx = new AudioContext()
    }

    // Ensure context is running; if browser blocks autoplay, start on first touch/click
    function ensureRunning() {
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {
          const onGesture = () => {
            ctx.resume().catch(() => {})
            document.removeEventListener('touchstart', onGesture)
            document.removeEventListener('click', onGesture)
          }
          document.addEventListener('touchstart', onGesture, { once: true, passive: true })
          document.addEventListener('click', onGesture, { once: true })
        })
      }
    }

    if (loops === 0) {
      let stopped = false
      let rescheduleTimer = null

      function scheduleNext(startAt) {
        if (stopped) return
        const { notes, totalDuration } = buildSchedule(id, startAt, 1)
        playNotes(ctx, notes)
        const msUntilEnd = (startAt + totalDuration - ctx.currentTime) * 1000 - 150
        rescheduleTimer = setTimeout(
          () => scheduleNext(startAt + totalDuration),
          Math.max(10, msUntilEnd),
        )
      }

      ensureRunning()
      scheduleNext(ctx.currentTime + 0.05)

      return {
        duration: Infinity,
        stop: () => {
          stopped = true
          clearTimeout(rescheduleTimer)
          try { ctx.close() } catch {}
        },
      }
    }

    // Fixed loops — schedule everything upfront
    const schedule = buildSchedule(id, ctx.currentTime + 0.05, loops)
    const nodes    = playNotes(ctx, schedule.notes)
    ensureRunning()
    return {
      duration: schedule.totalDuration,
      stop: () => {
        try { nodes.forEach(n => { try { n.stop() } catch {} }); ctx.close() } catch {}
      },
    }
  } catch {
    return { duration: 10, stop: () => {} }
  }
}

function playNotes(ctx, notes) {
  const nodes = []
  for (const note of notes) {
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, note.start)
    gain.gain.linearRampToValueAtTime(note.vol ?? 0.80, note.start + 0.003) // sharp attack
    gain.gain.setValueAtTime(note.vol ?? 0.80, note.end - 0.015)
    gain.gain.linearRampToValueAtTime(0, note.end)

    const freqs = Array.isArray(note.freq) ? note.freq : [note.freq]
    for (const freq of freqs) {
      const osc = ctx.createOscillator()
      osc.type = note.type || 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      osc.start(note.start)
      osc.stop(note.end)
      nodes.push(osc)
    }
  }
  return nodes
}

function buildSchedule(id, t0, loops) {
  const notes = []
  let t = t0

  if (id === 'classic') {
    const pattern = [
      { on: 0.40, off: 0.20 },
      { on: 0.40, off: 2.00 },
    ]
    for (let i = 0; i < loops; i++) {
      for (const { on, off } of pattern) {
        notes.push({ freq: [400, 450], start: t, end: t + on, vol: 0.82 })
        t += on + off
      }
    }
  }

  else if (id === 'modern') {
    const chord = [523, 659, 784, 1047]
    for (let i = 0; i < loops; i++) {
      for (let j = 0; j < chord.length; j++) {
        notes.push({ freq: chord[j], start: t, end: t + 0.08, vol: 0.78 })
        t += 0.09
      }
      t += 0.55
    }
  }

  else if (id === 'musical') {
    const melody = [784, 659, 523, 587, 784, 659, 523]
    const dur    = 0.18
    for (let i = 0; i < loops; i++) {
      for (const freq of melody) {
        notes.push({ freq, start: t, end: t + dur * 0.85, vol: 0.75, type: 'triangle' })
        t += dur
      }
      t += 0.45
    }
  }

  else if (id === 'beep') {
    for (let i = 0; i < loops * 3; i++) {
      notes.push({ freq: 1100, start: t, end: t + 0.12, vol: 0.88 })
      t += 0.50
    }
  }

  else if (id === 'urgent') {
    const pair = [950, 720]
    for (let i = 0; i < loops * 5; i++) {
      notes.push({ freq: pair[i % 2], start: t, end: t + 0.18, vol: 0.88 })
      t += 0.20
    }
    t += 0.4
  }

  return { notes, totalDuration: t - t0 }
}
