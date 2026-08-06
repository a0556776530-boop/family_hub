import { useEffect } from 'react'
import api from '../api/client'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications(user) {
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    const setup = async () => {
      try {
        const { data } = await api.get('/api/notifications/vapid-public-key')
        const publicKey = data.public_key
        if (!publicKey) return

        const reg = await navigator.serviceWorker.ready
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          })
        }
        await api.post('/api/notifications/subscribe', { subscription: sub.toJSON() })
      } catch {
        // silent — push not critical
      }
    }

    setup()
  }, [user?.id])
}
