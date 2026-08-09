function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=')
  const binary = atob(padded)
  const buf = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
  return buf
}

export function isWebAuthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials)
}

export async function registerFingerprint(api) {
  const { data: options } = await api.post('/api/auth/webauthn/register/begin')

  options.challenge = base64urlToBuffer(options.challenge)
  options.user.id   = base64urlToBuffer(options.user.id)
  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map(c => ({
      ...c, id: base64urlToBuffer(c.id),
    }))
  }

  const credential = await navigator.credentials.create({ publicKey: options })

  const credJSON = {
    id:    credential.id,
    rawId: bufferToBase64url(credential.rawId),
    response: {
      clientDataJSON:    bufferToBase64url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64url(credential.response.attestationObject),
    },
    type: credential.type,
  }

  await api.post('/api/auth/webauthn/register/complete', credJSON)
  return true
}

export async function loginWithFingerprint(email, api) {
  const { data: options } = await api.post('/api/auth/webauthn/login/begin', { email })
  const userId = options.user_id

  options.challenge = base64urlToBuffer(options.challenge)
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map(c => ({
      ...c, id: base64urlToBuffer(c.id),
    }))
  }

  const assertion = await navigator.credentials.get({ publicKey: options })

  const assertJSON = {
    id:    assertion.id,
    rawId: bufferToBase64url(assertion.rawId),
    response: {
      authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
      clientDataJSON:    bufferToBase64url(assertion.response.clientDataJSON),
      signature:         bufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bufferToBase64url(assertion.response.userHandle)
        : null,
    },
    type: assertion.type,
  }

  const { data } = await api.post('/api/auth/webauthn/login/complete', {
    user_id:    userId,
    credential: assertJSON,
  })

  return data
}
