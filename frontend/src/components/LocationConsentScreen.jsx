import { useState } from 'react'

const STEPS = [
  {
    icon: '📍',
    title: 'שיתוף מיקום עם ההורים',
    desc: 'כדי שההורים שלך יוכלו לראות איפה אתה נמצא, עוזר המשפחה צריך גישה למיקום שלך. במסך הבא תתבקש/י לאשר גישה למיקום.',
    confirmLabel: 'הבנתי, המשך',
  },
  {
    icon: '🔒',
    title: 'גישה גם כשהאפליקציה סגורה',
    desc: 'כדי שהמיקום יתעדכן גם כשהאפליקציה סגורה או המסך כבוי, במסך הבא צריך לבחור "אפשר תמיד" (Always Allow). אפשר לבטל את השיתוף בכל רגע דרך ההגדרות.',
    confirmLabel: 'אפשר תמיד',
  },
]

export default function LocationConsentScreen({ onAllow, onDecline }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  const handleConfirm = () => {
    if (isLast) onAllow()
    else setStep(s => s + 1)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl text-white"
        style={{ background: 'linear-gradient(175deg,#0c1445 0%,#1a2f7a 50%,#2563eb 100%)' }}>

        <div className="flex justify-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>

        <div className="text-5xl mb-3">{current.icon}</div>
        <h3 className="text-lg font-extrabold mb-2">{current.title}</h3>
        <p className="text-sm text-blue-100 leading-relaxed mb-6">{current.desc}</p>

        <div className="flex flex-col gap-2.5">
          <button onClick={handleConfirm}
            className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-sm active:scale-95 transition-transform">
            {current.confirmLabel}
          </button>
          <button onClick={onDecline} className="w-full text-blue-200 text-sm py-2">
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  )
}
