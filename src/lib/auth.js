const HASH_ITERATIONS = 120_000

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

async function derivePasswordHash(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Безпечне збереження пароля недоступне у цьому браузері.')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: HASH_ITERATIONS, hash: 'SHA-256' }, material, 256)
}

export async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePasswordHash(password, salt)
  return { passwordSalt: toBase64(salt), passwordHash: toBase64(hash) }
}

export async function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) return false
  const hash = await derivePasswordHash(password, fromBase64(user.passwordSalt))
  const actual = new Uint8Array(hash)
  const expected = fromBase64(user.passwordHash)
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index]
  return difference === 0
}
