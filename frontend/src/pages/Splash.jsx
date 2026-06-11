import { useNavigate } from 'react-router-dom'

export default function Splash() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-8">
        <div className="text-8xl mb-4 animate-bounce">🏠</div>
        <h1 className="text-4xl font-extrabold text-white mb-2">Family Hub</h1>
        <p className="text-blue-200 text-lg">כל המשפחה, מקום אחד</p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <button onClick={() => navigate('/login')} className="w-full bg-white text-blue-700 font-bold py-3.5 rounded-2xl text-base shadow-lg active:scale-95 transition-transform">
          התחברות
        </button>
        <button onClick={() => navigate('/register')} className="w-full bg-white/20 text-white font-bold py-3.5 rounded-2xl text-base border border-white/30 active:scale-95 transition-transform">
          הרשמה
        </button>
      </div>
      <p className="text-blue-300 text-xs mt-8">ניהול בית חכם למשפחה המודרנית</p>
    </div>
  )
}
