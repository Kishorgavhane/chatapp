// public/firebase-messaging-sw.js
// Background push notification handler for Firebase Cloud Messaging

importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js')

// TODO: Replace with your actual Firebase config
firebase.initializeApp({
  apiKey:            self.FIREBASE_API_KEY            || 'YOUR_API_KEY',
  authDomain:        self.FIREBASE_AUTH_DOMAIN        || 'YOUR_PROJECT.firebaseapp.com',
  projectId:         self.FIREBASE_PROJECT_ID         || 'YOUR_PROJECT_ID',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId:             self.FIREBASE_APP_ID             || 'YOUR_APP_ID',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}
  self.registration.showNotification(title || 'ChatApp', {
    body:  body || 'New message',
    icon:  '/icon.png',
    badge: '/badge.png',
    data:  payload.data,
    actions: [
      { action: 'open',    title: 'Open'    },
      { action: 'dismiss', title: 'Dismiss' },
    ]
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action !== 'dismiss') {
    clients.openWindow('/')
  }
})
