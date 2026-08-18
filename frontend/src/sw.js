import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', event => {
  const data = event.data?.json() || {}

  if (data.type === 'ring') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(list => list.forEach(c => c.postMessage({ type: 'ring', caller: data.caller || '' })))
        .then(() => self.registration.showNotification(
          `📱 ${data.caller || 'ההורים'} מחפשים אותך!`,
          {
            body:             'הקש כדי לעצור את הצלצול',
            icon:             '/icon-192.svg',
            badge:            '/icon-192.svg',
            vibrate:          [500,150,500,150,500,150,500,150,500,150,500],
            requireInteraction: true,
            tag:              'ring',
            renotify:         true,
          }
        ))
    )
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
    // Broadcast ring to any open clients so they start ringing,
    // and open the app if it wasn't open
    const caller = event.notification.body ? '' : ''
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        list.forEach(c => c.postMessage({ type: 'ring', caller }))
        if (list.length === 0) return self.clients.openWindow('/')
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
