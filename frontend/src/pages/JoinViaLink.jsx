import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'

export default function JoinViaLink() {
  const { code } = useParams()
  const { user, loading } = useAuth()
  const { joinFamily, family } = useFamily()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return

    if (!user) {
      sessionStorage.setItem('pending_invite', code)
      navigate('/register', { replace: true })
      return
    }

    if (family) {
      setStatus('already_in_family')
      return
    }

    joinFamily(code)
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/', { replace: true }), 1500)
      })
      .catch(e => {
        setError(e.response?.data?.message || 'קוד ההזמנה לא תקין')
        setStatus('error')
      })
  }, [loading, user, family])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8] px-6">
      <div className="bg-white rounded-2xl p-8 max-w-xs w-full text-center shadow-xl">
        {status === 'loading' && (
          <>
            <p className="text-4xl mb-4 animate-pulse">🏠</p>
            <p className="text-gray-600 font-semibold">מצטרף למשפחה...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <p className="text-4xl mb-4">🎉</p>
            <h2 className="font-extrabold text-gray-800 text-xl mb-2">הצטרפת בהצלחה!</h2>
            <p className="text-gray-500 text-sm">מעביר אותך לאפליקציה...</p>
          </>
        )}
        {status === 'already_in_family' && (
          <>
            <p className="text-4xl mb-4">👨‍👩‍👧‍👦</p>
            <h2 className="font-extrabold text-gray-800 text-xl mb-2">אתה כבר במשפחה</h2>
            <p className="text-gray-500 text-sm mb-5">כדי להצטרף למשפחה אחרת, עזוב קודם את המשפחה הנוכחית בעמוד הפרופיל.</p>
            <button onClick={() => navigate('/', { replace: true })}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform">
              לדף הבית
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-4xl mb-4">😕</p>
            <h2 className="font-extrabold text-gray-800 text-xl mb-2">לא הצלחנו להצטרף</h2>
            <p className="text-red-500 text-sm mb-5">{error}</p>
            <button onClick={() => navigate('/', { replace: true })}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform">
              לדף הבית
            </button>
          </>
        )}
      </div>
    </div>
  )
}
