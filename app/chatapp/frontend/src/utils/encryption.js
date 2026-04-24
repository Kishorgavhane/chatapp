/**
 * End-to-End Encryption — AES-256-GCM via Web Crypto API
 *
 * Flow:
 *  1. Each user generates an ECDH key pair on first load (stored in sessionStorage)
 *  2. Users exchange public keys via the API
 *  3. Derive a shared AES-256-GCM key using ECDH
 *  4. Encrypt/decrypt messages locally — server never sees plaintext
 *
 * For the demo, keys are per-session and stored in sessionStorage.
 * In production: store private key in IndexedDB, exchange public keys on auth.
 */

const ALGO = 'AES-GCM'
const KEY_LENGTH = 256

// ── Encode / Decode helpers ───────────────────────────────────────────────────
const encode = (str) => new TextEncoder().encode(str)
const decode = (buf) => new TextDecoder().decode(buf)
const toB64  = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))

// ── Generate ECDH key pair ────────────────────────────────────────────────────
export async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
  const pub = await crypto.subtle.exportKey('spki', kp.publicKey)
  return { keyPair: kp, publicKeyB64: toB64(pub) }
}

// ── Import remote public key ───────────────────────────────────────────────────
export async function importPublicKey(b64) {
  const raw = fromB64(b64)
  return crypto.subtle.importKey('spki', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

// ── Derive shared AES key from ECDH ──────────────────────────────────────────
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

// ── Encrypt a string ──────────────────────────────────────────────────────────
export async function encryptMessage(text, sharedKey) {
  const iv         = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, sharedKey, encode(text))
  return JSON.stringify({ iv: toB64(iv), ct: toB64(ciphertext) })
}

// ── Decrypt a string ──────────────────────────────────────────────────────────
export async function decryptMessage(payload, sharedKey) {
  try {
    const { iv, ct } = JSON.parse(payload)
    const plaintext  = await crypto.subtle.decrypt({ name: ALGO, iv: fromB64(iv) }, sharedKey, fromB64(ct))
    return decode(plaintext)
  } catch {
    return '[Encrypted message — cannot decrypt]'
  }
}

// ── Session key store (per conversation partner) ──────────────────────────────
const keyStore = new Map() // userId → CryptoKey

export async function initE2E(myKeyPair, theirPublicKeyB64, theirUserId) {
  const theirPub = await importPublicKey(theirPublicKeyB64)
  const shared   = await deriveSharedKey(myKeyPair.privateKey, theirPub)
  keyStore.set(theirUserId, shared)
  return shared
}

export function getSharedKey(userId) {
  return keyStore.get(userId) || null
}

// ── Convenience: encrypt if key exists, else return plaintext ─────────────────
export async function safeEncrypt(text, userId) {
  const key = getSharedKey(userId)
  if (!key) return text
  return encryptMessage(text, key)
}

export async function safeDecrypt(text, userId) {
  const key = getSharedKey(userId)
  if (!key) return text
  // Only decrypt if it looks like our JSON format
  if (!text.startsWith('{')) return text
  return decryptMessage(text, key)
}
