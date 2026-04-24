/**
 * Firebase Cloud Messaging (FCM) Push Notifications
 *
 * Setup:
 *  1. Create a Firebase project at console.firebase.google.com
 *  2. Add your config values to .env:
 *     VITE_FIREBASE_API_KEY=...
 *     VITE_FIREBASE_PROJECT_ID=...
 *     VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *     VITE_FIREBASE_APP_ID=...
 *     VITE_FIREBASE_VAPID_KEY=...
 *  3. Place firebase-messaging-sw.js in /public/
 */
import { useEffect } from 'react'
import axios from 'axios'

// Firebase is loaded via CDN in index.html for simplicity.
// In production use: import { initializeApp } from 'firebase/app'

export function usePushNotifications(user) {
  useEffect(() => {
    if (!user) return
    if (!('Notification' in window)) return
    if (!('serviceWorker' in navigator)) return

    const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
    if (!VAPID_KEY) return // FCM not configured

    const initFCM = async () => {
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') return

        // Dynamically import Firebase to avoid breaking builds without config
        const { initializeApp } = await import('firebase/app')
        const { getMessaging, getToken, onMessage } = await import('firebase/messaging')

        const firebaseConfig = {
          apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
          projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId:             import.meta.env.VITE_FIREBASE_APP_ID,
        }

        const app       = initializeApp(firebaseConfig)
        const messaging = getMessaging(app)

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
        })

        if (token) {
          // Send FCM token to backend
          await axios.post('/api/notifications/register-token', { fcm_token: token })
          console.log('[FCM] Token registered')
        }

        // Handle foreground messages
        onMessage(messaging, (payload) => {
          const { title, body } = payload.notification || {}
          if (title && document.hidden) {
            new Notification(title, { body, icon: '/icon.png' })
          }
        })
      } catch (err) {
        console.warn('[FCM] Init failed:', err.message)
      }
    }

    initFCM()
  }, [user])
}
