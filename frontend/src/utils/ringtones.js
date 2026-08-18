export const RINGTONES = [
  { id: 'classic',  label: 'קלאסי',  desc: 'טלפון ביתי ישן' },
  { id: 'modern',   label: 'מודרני', desc: 'סמארטפון' },
  { id: 'musical',  label: 'מוזיקלי', desc: 'מנגינה נעימה' },
  { id: 'beep',     label: 'ביפ',    desc: 'חד וברור' },
  { id: 'urgent',   label: 'דחוף',   desc: 'אזעקה מהירה' },
]

export const RINGTONE_KEY    = 'fh_ringtone'
export const DEFAULT_RINGTONE = 'classic'

export function getSelectedRingtone() {
  return localStorage.getItem(RINGTONE_KEY) || DEFAULT_RINGTONE
}

export function setSelectedRingtone(id) {
  localStorage.setItem(RINGTONE_KEY, id)
}

// Returns { stop, duration }
export function playRingtone(id, loops = 6) {
  try {
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    const nodes = []
    let totalDuration = 0

    const schedule = buildSchedule(id, ctx.currentTime + 0.05, loops)
    totalDuration = schedule.totalDuration

    for (const note of schedule.notes) {
      const gain = ctx.createGain()
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0, note.start)
      gain.gain.linearRampToValueAtTime(note.vol ?? 0.45, note.start + 0.01)
      gain.gain.setValueAtTime(note.vol ?? 0.45, note.end - 0.02)
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

    return {
      duration: totalDuration,
      stop: () => { try { nodes.forEach(n => { try { n.stop() } catch {} }); ctx.close() } catch {} },
    }
  } catch {
    return { duration: 10, stop: () => {} }
  }
}

function buildSchedule(id, t0, loops) {
  const notes = []
  let t = t0

  if (id === 'classic') {
    // UK dual-tone: 400+450 Hz, ring-ring...pause
    const pattern = [
      { on: 0.40, off: 0.20 },
      { on: 0.40, off: 2.00 },
    ]
    for (let i = 0; i < loops; i++) {
      for (const { on, off } of pattern) {
        notes.push({ freq: [400, 450], start: t, end: t + on })
        t += on + off
      }
    }
  }

  else if (id === 'modern') {
    // Ascending 4-note chirp repeated
    const chord = [523, 659, 784, 1047] // C5 E5 G5 C6
    for (let i = 0; i < loops; i++) {
      for (let j = 0; j < chord.length; j++) {
        notes.push({ freq: chord[j], start: t, end: t + 0.08, vol: 0.4 })
        t += 0.09
      }
      t += 0.55 // pause between chirps
    }
  }

  else if (id === 'musical') {
    // Simple marimba-style melody: G5 E5 C5 D5 | G5 ...
    const melody = [784, 659, 523, 587, 784, 659, 523]
    const dur    = 0.18
    for (let i = 0; i < loops; i++) {
      for (const freq of melody) {
        notes.push({ freq, start: t, end: t + dur * 0.85, vol: 0.38, type: 'triangle' })
        t += dur
      }
      t += 0.45
    }
  }

  else if (id === 'beep') {
    // Sharp single-tone beep
    for (let i = 0; i < loops * 3; i++) {
      notes.push({ freq: 1000, start: t, end: t + 0.12, vol: 0.55 })
      t += 0.50
    }
  }

  else if (id === 'urgent') {
    // Fast alternating alarm
    const pair = [800, 600]
    for (let i = 0; i < loops * 5; i++) {
      const freq = pair[i % 2]
      notes.push({ freq, start: t, end: t + 0.18, vol: 0.5 })
      t += 0.20
    }
    t += 0.4
  }

  return { notes, totalDuration: t - t0 }
}
