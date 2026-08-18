import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)


self.addEventListener('push', event => {
  const data = event.data?.json() || {}

  if (data.type === 'ring') {
    const caller  = data.caller  || 'ההורים'
    const message = data.message || ''
    const ringUrl = `/?ring=1&caller=${encodeURIComponent(caller)}&msg=${encodeURIComponent(message)}`

    event.waitUntil((async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Broadcast to all open tabs so the ring alert appears immediately
      list.forEach(c => c.postMessage({ type: 'ring', caller, message }))

      // Try to bring app to foreground — wrapped in try/catch so a failure here
      // never prevents the notification from showing below
      try {
        const visible = list.find(c => c.visibilityState === 'visible')
        if (visible) await visible.focus()
        else if (list.length > 0) await list[0].focus()
        else await self.clients.openWindow(ringUrl)
      } catch {}

      // Always show the notification — this is what rings on a closed/background device
      await self.registration.showNotification(`📱 ${caller} מחפשים אותך!`, {
        body:               message || 'הקש כדי לעצור את הצלצול',
        icon:               '/icon-192.svg',
        badge:              '/icon-192.svg',
        vibrate:            [500,150,500,150,500,150,500,150,500,150,500],
        requireInteraction: true,
        tag:                'ring',
        renotify:           true,
        data:               { caller, message, ringUrl },
      })
    })())
    return
  }

  if (data.type === 'stop_ring') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(list => {
          list.forEach(c => c.postMessage({ type: 'stop_ring' }))
          return self.registration.getNotifications({ tag: 'ring' })
        })
        .then(notes => notes.forEach(n => n.close()))
    )
    return
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Family Hub 🏠', {
      body:    data.body  || '',
      icon:    '/icon-192.svg',
      badge:   '/icon-192.svg',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  if (event.notification.tag === 'ring') {
    const caller  = event.notification.data?.caller  || ''
    const message = event.notification.data?.message || ''
    const ringUrl = event.notification.data?.ringUrl || `/?ring=1&caller=${encodeURIComponent(caller)}&msg=${encodeURIComponent(message)}`
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        list.forEach(c => c.postMessage({ type: 'ring', caller, message }))
        if (list.length === 0) return self.clients.openWindow(ringUrl)
        const existing = list.find(c => c.visibilityState === 'visible') || list[0]
        return existing.focus()
      })
    )
    return
  }

  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.navigate(url) }
      else self.clients.openWindow(url)
    })
  )
})
