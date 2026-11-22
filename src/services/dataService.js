import { createClient } from '@supabase/supabase-js'
import { STORAGE_KEYS } from '../data/initialData.js'
import { createPasswordRecord } from '../lib/auth.js'
import { readStorage, writeStorage } from '../lib/storage.js'
import { fullNameMatchesEitherOrder, isValidPersonName, namesMatchEitherOrder } from '../utils/personName.js'
import { localizeAuthError } from '../utils/authErrors.js'
import { isValidEmail, isValidPassword } from '../utils/validation.js'
import { getPaymentCardBrand } from '../utils/paymentCard.js'
import { calculateConfirmedCourierPayouts, calculateCourierFinanceSummary } from '../utils/courierWallet.js'
import { isValidUkrainianIban, normalizeUkrainianIban } from '../utils/iban.js'
import { recordServerTimeSample } from '../utils/serverClock.js'
import { localizeErrorMessage } from '../utils/errorMessages.js'

export { calculatePurchaseDeliveryShares } from '../utils/calculations.js'

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL?.trim()
// Supabase JS accepts both legacy anon JWTs and the newer sb_publishable_ keys here.
const supabasePublicKey = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim()
const cloudConfigured = Boolean(supabaseUrl && supabasePublicKey)

const ACTIVE_TAB_USER_KEY = 'activeTabUserId'
const LAST_USER_KEY = 'lastUserId'
const LAST_AUTH_SESSION_KEY = 'gb-last-auth-session'
const COURIER_PAYOUTS_CHANGED_EVENT = 'gb-courier-payouts-changed'
const COURIER_CARDS_CHANGED_EVENT = 'gb-courier-cards-changed'
const COURIER_IBANS_CHANGED_EVENT = 'gb-courier-ibans-changed'
let passwordRecoveryRedirectPending = false

async function fetchWithServerClock(...args) {
  const requestStartedAt = Date.now()
  const requestStartedMonotonic = globalThis.performance?.now?.()
  const response = await globalThis.fetch(...args)
  const responseReceivedAt = Date.now()
  const responseReceivedMonotonic = globalThis.performance?.now?.()
  const serverDate = response.headers?.get?.('date')
  if (serverDate) recordServerTimeSample(serverDate, requestStartedAt, responseReceivedAt, requestStartedMonotonic, responseReceivedMonotonic)
  return response
}

function validateAuthInput({ firstName, lastName, email, role, password }) {
  const normalizedEmail = String(email || '').trim()
  const normalizedFirstName = String(firstName || '').trim()
  const normalizedLastName = String(lastName || '').trim()
  const normalizedPassword = String(password || '')
  if (!isValidEmail(normalizedEmail)) throw new Error('Введіть коректну електронну пошту.')
  if (normalizedFirstName.length < 2 || normalizedFirstName.length > 25 || !isValidPersonName(normalizedFirstName)) throw new Error('Перевірте ім’я.')
  if (normalizedLastName.length < 2 || normalizedLastName.length > 25 || !isValidPersonName(normalizedLastName)) throw new Error('Перевірте прізвище.')
  if (!['participant', 'organizer', 'courier'].includes(role)) throw new Error('Оберіть роль.')
  if (!isValidPassword(normalizedPassword)) throw new Error('Пароль має містити від 8 до 64 символів.')
  return { email: normalizedEmail.toLowerCase(), firstName: normalizedFirstName, lastName: normalizedLastName, password: normalizedPassword }
}

function createTabId() {
  if (typeof window === 'undefined') return 'server'
  try {
    let tabId = window.sessionStorage.getItem('gb_tab_id')
    if (!tabId) {
      tabId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      window.sessionStorage.setItem('gb_tab_id', tabId)
      const lastSession = window.localStorage.getItem(LAST_AUTH_SESSION_KEY)
        || window.sessionStorage.getItem('gb-tab-auth-session')
      if (lastSession) window.sessionStorage.setItem(`gb-auth-${tabId}`, lastSession)
    }
    return tabId
  } catch {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export const tabId = createTabId()
const tabAuthStorageKey = `gb-auth-${tabId}`

function mirrorAuthSession(session) {
  if (!session || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_AUTH_SESSION_KEY, JSON.stringify(session))
  } catch {
    // The active tab keeps its Supabase session even if the fallback is unavailable.
  }
}

function clearTabAuthSession() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(tabAuthStorageKey)
    window.sessionStorage.removeItem(ACTIVE_TAB_USER_KEY)
    window.localStorage.removeItem(LAST_AUTH_SESSION_KEY)
    window.localStorage.removeItem(LAST_USER_KEY)
  } catch {
    // The tab is still signed out in memory if browser storage is unavailable.
  }
}

export const supabase = cloudConfigured
  ? createClient(supabaseUrl, supabasePublicKey, {
      global: { fetch: fetchWithServerClock },
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        multiTab: false, // Per-tab storageKey provides the actual auth isolation in this SDK.
        persistSession: true,
        storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
        storageKey: tabAuthStorageKey,
      },
    })
  : null

export const isCloudMode = () => cloudConfigured

export function getCourierFinanceSummary(purchases, user, payoutsOverride) {
  let payouts = payoutsOverride
  if (!Array.isArray(payouts)) {
    const stored = readStorage(STORAGE_KEYS.courierPayouts, [])
    const courierId = String(user?.id || '')
    payouts = Array.isArray(stored)
      ? stored.filter((payout) => String(payout?.userId || payout?.courierId || payout?.courier_id || '') === courierId)
      : []
  }
  return calculateCourierFinanceSummary(purchases, user, payouts, !cloudConfigured)
}

export function formatCourierStatusHistoryMessage(status, courierName, pickupAddress) {
  const courier = String(courierName || '').trim()
  const courierLabel = courier ? `Кур’єр ${courier}` : 'Кур’єр сервісу'
  if (['Доставка', 'delivery'].includes(status)) {
    return `${courierLabel} прийняв замовлення на доставку та вирушив до точки видачі.`
  }
  if (['Точка видачі', 'pickup'].includes(status)) {
    const address = String(pickupAddress || '').trim() || 'адресу не вказано'
    return `${courierLabel} доставив замовлення на точку видачі (${address}). Товар очікує на отримання.`
  }
  return 'Статус доставки оновлено.'
}

function throwIfError(error) {
  if (error) throw new Error(localizeErrorMessage(error, 'Помилка під час обміну даними із сервером.'))
}

function isMissingPayoutMetadataSchema(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42703'
    || error?.code === 'PGRST204'
    || ((message.includes('recipient_type') || message.includes('holder_name')) && (message.includes('column') || message.includes('schema cache')))
}

function isMissingPayoutRpc(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST202' || (message.includes('gb_withdraw_courier_earnings') && (message.includes('could not find') || message.includes('does not exist')))
}

function mapProfile(profile) {
  if (!profile) return null
  const roleMap = {
    'Учасник': 'participant',
    'Організатор': 'organizer',
    'Кур’єр': 'courier',
    participant: 'participant',
    organizer: 'organizer',
    courier: 'courier',
  }
  return {
    id: profile.id,
    email: profile.email || '',
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    name: profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    role: roleMap[profile.role] || 'participant',
    createdAt: profile.created_at,
  }
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('gb_users')
    .select('id,email,first_name,last_name,name,role,created_at')
    .eq('id', userId)
    .maybeSingle()
  throwIfError(error)
  return mapProfile(data)
}

export async function getCloudSession() {
  if (!cloudConfigured) return null
  if (typeof window !== 'undefined' && window.location.hash) {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (params.get('type') === 'recovery' && accessToken && refreshToken) {
      passwordRecoveryRedirectPending = true
      const { data: recoveryData, error: recoveryError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (recoveryError) {
        passwordRecoveryRedirectPending = false
        throwIfError(recoveryError)
      }
      mirrorAuthSession(recoveryData.session)
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
    }
  }
  const { data, error } = await supabase.auth.getSession()
  throwIfError(error)
  const authUser = data.session?.user
  if (!authUser) return null
  const profile = await getProfile(authUser.id)
  if (!profile) throw new Error('Профіль користувача не знайдено. Перевірте тригер gb_users у схемі Supabase.')
  return profile
}

export async function loadCloudData() {
  const [purchaseResult, orderResult] = await Promise.all([
    supabase.from('gb_purchases').select('id,data,organizer_id,courier_id').order('updated_at', { ascending: false }),
    supabase.from('gb_orders').select('id,data,purchase_id,user_id').order('updated_at', { ascending: false }),
  ])
  throwIfError(purchaseResult.error)
  throwIfError(orderResult.error)

  return {
    purchases: (purchaseResult.data || []).map((row) => ({ ...row.data, id: row.id, organizerId: row.organizer_id, courierId: row.courier_id || row.data?.courierId })),
    orders: (orderResult.data || []).map((row) => ({ ...row.data, id: row.id, purchaseId: row.purchase_id, userId: row.user_id })),
  }
}

export async function registerCloudUser({ firstName, lastName, email, role, password }) {
  try {
    const validated = validateAuthInput({ firstName, lastName, email, role, password })
    const { data, error } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: { data: { first_name: validated.firstName, last_name: validated.lastName, role } },
    })
    throwIfError(error)
    if (!data.user || !data.session) {
      throw new Error('Миттєвий вхід після реєстрації недоступний. У налаштуваннях Supabase вимкніть Confirm email для провайдера Email.')
    }
    mirrorAuthSession(data.session)
    const profile = await getProfile(data.user.id)
    if (!profile) throw new Error('Реєстрація пройшла, але профіль ще не створено. Перевірте SQL-тригер gb_users.')
    return { user: profile }
  } catch (error) {
    throw new Error(localizeAuthError(error))
  }
}

export async function loginCloudUser({ email, password }) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    throwIfError(error)
    mirrorAuthSession(data.session)
    const profile = await getProfile(data.user.id)
    if (!profile) throw new Error('Профіль користувача не знайдено.')
    return profile
  } catch (error) {
    throw new Error(localizeAuthError(error))
  }
}

const RESET_EMAIL_NOT_FOUND = 'Акаунт із такою електронною поштою не знайдено'
const RESET_NAME_MISMATCH = 'Ім’я або прізвище не збігаються з даними профілю'

export async function resetPassword({ email, firstName, lastName, newPassword }) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedFirstName = String(firstName || '').trim()
    const normalizedLastName = String(lastName || '').trim()
    const password = String(newPassword || '')

    if (!isValidPassword(password)) {
      throw new Error('Пароль має містити від 8 до 64 символів.')
    }
    if (!isValidEmail(normalizedEmail)
      || normalizedFirstName.length < 2 || normalizedFirstName.length > 25 || !isValidPersonName(normalizedFirstName)
      || normalizedLastName.length < 2 || normalizedLastName.length > 25 || !isValidPersonName(normalizedLastName)) {
      throw new Error('Перевірте email, ім’я та прізвище.')
    }

    if (cloudConfigured) {
      const { data, error } = await supabase.rpc('reset_user_password', {
        p_email: normalizedEmail,
        p_first_name: normalizedFirstName,
        p_last_name: normalizedLastName,
        p_new_password: password,
      })
      throwIfError(error)
      if (data !== true) throw new Error(RESET_NAME_MISMATCH)
      return null
    }

    const storedUsers = readStorage(STORAGE_KEYS.users, [])
    const localUsers = Array.isArray(storedUsers) ? storedUsers : []
    const matchingUser = localUsers.find((user) => user
      && String(user.email || '').trim().toLowerCase() === normalizedEmail)
    if (!matchingUser) throw new Error(RESET_EMAIL_NOT_FOUND)

    const fullNames = [matchingUser.name, matchingUser.fullName]
      .map((name) => String(name || '').trim())
      .filter(Boolean)
    const hasSeparateNames = Boolean(matchingUser.firstName || matchingUser.lastName)
    const separateNamesMatch = !hasSeparateNames || namesMatchEitherOrder(
      matchingUser.firstName,
      matchingUser.lastName,
      normalizedFirstName,
      normalizedLastName,
    )
    const fullNamesMatch = fullNames.every((name) => fullNameMatchesEitherOrder(
      name,
      normalizedFirstName,
      normalizedLastName,
    ))
    if ((!hasSeparateNames && fullNames.length === 0) || !separateNamesMatch || !fullNamesMatch) {
      throw new Error(RESET_NAME_MISMATCH)
    }

    const credentials = await createPasswordRecord(password)
    const updatedUsers = localUsers.map((user) => user.id === matchingUser.id ? { ...user, ...credentials } : user)
    if (!writeStorage(STORAGE_KEYS.users, updatedUsers)) {
      throw new Error('Не вдалося зберегти новий пароль у цьому браузері.')
    }
    return { users: updatedUsers }
  } catch (error) {
    throw new Error(localizeAuthError(error))
  }
}

export async function logoutCloudUser() {
  if (!cloudConfigured) return
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  clearTabAuthSession()
  throwIfError(error)
}

export function watchCloudAuth(callback) {
  if (!cloudConfigured) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event) && session) {
      mirrorAuthSession(session)
    } else if (event === 'SIGNED_OUT') {
      clearTabAuthSession()
    }
    if (event === 'SIGNED_IN' && passwordRecoveryRedirectPending) {
      passwordRecoveryRedirectPending = false
      callback('PASSWORD_RECOVERY', session?.user || null)
      return
    }
    callback(event, session?.user || null)
  })
  return () => data.subscription.unsubscribe()
}

export function subscribeCloudChanges(callback) {
  if (!cloudConfigured) return () => {}
  const channel = supabase
    .channel('gb-workspace-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gb_purchases' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gb_orders' }, callback)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export async function performCloudAction(action, payload = {}) {
  if (!cloudConfigured) throw new Error('Supabase не налаштований.')
  const { data, error } = await supabase.rpc('gb_perform_action', {
    action_name: action,
    action_payload: payload,
  })
  throwIfError(error)
  return data
}

export async function createCloudPurchase(purchase) {
  return performCloudAction('create_purchase', { purchase })
}

function normalizePayout(record = {}) {
  const amount = Number(record.amount)
  const cardBrand = record.cardBrand || record.card_brand || record.brand
  const type = record.type === 'iban' || record.recipient_type === 'iban' || cardBrand === 'IBAN' ? 'iban' : 'card'
  const last4 = String(record.last4 || record.cardLast4 || record.card_last4 || '').replace(/\D/g, '').slice(-4)
  return {
    id: String(record.id || ''),
    userId: String(record.userId || record.courier_id || ''),
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
    type,
    last4,
    cardLast4: last4,
    cardBrand: type === 'iban' ? 'IBAN' : ['Visa', 'Mastercard', 'Простір'].includes(cardBrand) ? cardBrand : 'Банківська картка',
    holderName: String(record.holderName || record.holder_name || '').trim().slice(0, 60),
    method: record.method === 'standard' || record.payout_method === 'standard' ? 'standard' : 'instant',
    status: record.status === 'В обробці' ? 'В обробці' : 'Виплачено',
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
  }
}

export { isValidUkrainianIban, normalizeUkrainianIban }

function normalizeCourierCard(card = {}) {
  const last4 = String(card.last4 || card.cardLast4 || '').replace(/\D/g, '').slice(-4)
  if (!last4) return null
  return {
    id: String(card.id || ''),
    brand: ['Visa', 'Mastercard', 'Простір'].includes(card.brand) ? card.brand : 'Банківська картка',
    holderName: String(card.holderName || card.holder || '').trim().slice(0, 60),
    last4,
    createdAt: card.createdAt || new Date().toISOString(),
  }
}

function courierCardsStorageKey(courierId) {
  return `${STORAGE_KEYS.courierCards}:${encodeURIComponent(courierId)}`
}

function courierIbansStorageKey(courierId) {
  return `gb_courier_ibans:${encodeURIComponent(courierId)}`
}

function normalizeCourierIban(account = {}) {
  const last4 = String(account.last4 || '').replace(/\D/g, '').slice(-4)
  const id = String(account.id || '')
  const holderName = String(account.holderName || '').trim().slice(0, 60)
  if (!id || !/^\d{4}$/.test(last4) || holderName.length < 2) return null
  return {
    id,
    type: 'iban',
    brand: 'IBAN',
    holderName,
    last4,
    createdAt: account.createdAt || new Date().toISOString(),
  }
}

function migrateLegacyCourierCards() {
  const legacyCards = readStorage(STORAGE_KEYS.courierCards, null)
  if (!Array.isArray(legacyCards)) return

  const grouped = new Map()
  for (const oldCard of legacyCards) {
    if (!oldCard?.userId) continue
    const courierId = String(oldCard.userId)
    const normalized = normalizeCourierCard(oldCard)
    if (!normalized?.id) continue
    if (!grouped.has(courierId)) grouped.set(courierId, [])
    grouped.get(courierId).push(normalized)
  }

  let migrated = true
  for (const [courierId, cards] of grouped) {
    const key = courierCardsStorageKey(courierId)
    const existing = readStorage(key, [])
    const merged = [...(Array.isArray(existing) ? existing : []), ...cards]
    const unique = [...new Map(merged.map((card) => {
      const normalized = normalizeCourierCard(card)
      return [normalized?.id, normalized]
    }).filter(([id, card]) => id && card)).values()]
    migrated = writeStorage(key, unique) && migrated
  }

  if (migrated) {
    try { window.localStorage.removeItem(STORAGE_KEYS.courierCards) } catch { /* Legacy data remains masked if storage is unavailable. */ }
  }
}

export async function loadCourierWallet(courierId) {
  if (!courierId) return { payouts: [], totalPaid: 0 }

  let rows
  if (cloudConfigured) {
    let result = await supabase
      .from('gb_courier_payouts')
      .select('id,courier_id,amount,card_last4,card_brand,recipient_type,holder_name,payout_method,created_at')
      .eq('courier_id', courierId)
      .order('created_at', { ascending: false })
    if (isMissingPayoutMetadataSchema(result.error)) {
      result = await supabase
        .from('gb_courier_payouts')
        .select('id,courier_id,amount,card_last4,card_brand,payout_method,created_at')
        .eq('courier_id', courierId)
        .order('created_at', { ascending: false })
    }
    throwIfError(result.error)
    rows = Array.isArray(result.data) ? result.data : []
  } else {
    const stored = readStorage(STORAGE_KEYS.courierPayouts, [])
    rows = Array.isArray(stored) ? stored.filter((record) => record?.userId === courierId) : []
  }

  const payouts = rows.map(normalizePayout).filter((record) => record.id && record.amount > 0)
  return {
    payouts: payouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    totalPaid: calculateConfirmedCourierPayouts(payouts),
  }
}

export function loadCourierCards(courierId) {
  if (!courierId) return []
  migrateLegacyCourierCards()
  const stored = readStorage(courierCardsStorageKey(courierId), [])
  return (Array.isArray(stored) ? stored : [])
    .map(normalizeCourierCard)
    .filter((card) => card?.id)
}

export function loadCourierIbans(courierId) {
  if (!courierId) return []
  const stored = readStorage(courierIbansStorageKey(courierId), [])
  return (Array.isArray(stored) ? stored : []).map(normalizeCourierIban).filter(Boolean)
}

export function saveCourierIban({ courierId, iban, holderName }) {
  const normalizedIban = normalizeUkrainianIban(iban)
  const normalizedHolder = String(holderName || '').trim().slice(0, 60)
  if (!courierId) throw new Error('Не вдалося визначити профіль кур’єра.')
  if (!isValidUkrainianIban(normalizedIban)) throw new Error('Введіть коректний український IBAN: UA та 27 цифр.')
  if (normalizedHolder.length < 2) throw new Error('Введіть ПІБ отримувача.')

  const key = courierIbansStorageKey(courierId)
  const stored = readStorage(key, [])
  const accounts = Array.isArray(stored) ? stored : []
  const last4 = normalizedIban.slice(-4)
  const existing = accounts.find((account) => account?.last4 === last4 && account?.holderName === normalizedHolder)
  if (existing) return normalizeCourierIban(existing)
  const account = normalizeCourierIban({
    id: globalThis.crypto?.randomUUID?.() || `iban-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'iban',
    brand: 'IBAN',
    holderName: normalizedHolder,
    last4,
    createdAt: new Date().toISOString(),
  })
  if (!writeStorage(key, [...accounts.map(normalizeCourierIban).filter(Boolean), account])) {
    throw new Error('Не вдалося зберегти IBAN у цьому браузері.')
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COURIER_IBANS_CHANGED_EVENT, { detail: { courierId } }))
  return account
}

export function deleteCourierIban({ courierId, ibanId }) {
  if (!courierId || !ibanId) return false
  const key = courierIbansStorageKey(courierId)
  const stored = readStorage(key, [])
  const accounts = Array.isArray(stored) ? stored : []
  const next = accounts.filter((account) => account?.id !== ibanId)
  if (next.length === accounts.length) return false
  if (!writeStorage(key, next.map(normalizeCourierIban).filter(Boolean))) throw new Error('Не вдалося видалити IBAN.')
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COURIER_IBANS_CHANGED_EVENT, { detail: { courierId } }))
  return true
}

export function subscribeCourierIbans(courierId, callback) {
  if (!courierId || typeof callback !== 'function' || typeof window === 'undefined') return () => {}
  const key = courierIbansStorageKey(courierId)
  const onStorage = (event) => { if (event.key === key) callback() }
  const onLocalChange = (event) => { if (event.detail?.courierId === courierId) callback() }
  window.addEventListener('storage', onStorage)
  window.addEventListener(COURIER_IBANS_CHANGED_EVENT, onLocalChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(COURIER_IBANS_CHANGED_EVENT, onLocalChange)
  }
}

export function saveCourierCard({ courierId, cardNumber, holderName, holder }) {
  const digits = String(cardNumber || '').replace(/\D/g, '')
  const normalizedHolder = String(holderName || holder || '').trim().slice(0, 60)
  if (!courierId) throw new Error('Не вдалося визначити профіль кур’єра.')
  if (!/^\d{16}$/.test(digits)) throw new Error('Введіть усі 16 цифр номера картки.')
  if (normalizedHolder.length < 2) throw new Error('Введіть ім’я власника картки.')
  migrateLegacyCourierCards()
  const key = courierCardsStorageKey(courierId)
  const stored = readStorage(key, [])
  const cards = Array.isArray(stored) ? stored : []
  const last4 = digits.slice(-4)
  const brand = getPaymentCardBrand(digits)
  const existing = cards.find((card) => String(card.last4) === last4 && card.brand === brand && (card.holderName || card.holder) === normalizedHolder)
  if (existing) return normalizeCourierCard(existing)
  const card = normalizeCourierCard({
    id: globalThis.crypto?.randomUUID?.() || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brand,
    holderName: normalizedHolder,
    last4,
    createdAt: new Date().toISOString(),
  })
  if (!writeStorage(key, [...cards.map(normalizeCourierCard).filter(Boolean), card])) throw new Error('Не вдалося зберегти картку в цьому браузері.')
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COURIER_CARDS_CHANGED_EVENT, { detail: { courierId } }))
  return card
}

export function deleteCourierCard({ courierId, cardId }) {
  if (!courierId || !cardId) return false
  migrateLegacyCourierCards()
  const key = courierCardsStorageKey(courierId)
  const stored = readStorage(key, [])
  const cards = Array.isArray(stored) ? stored : []
  const nextCards = cards.filter((card) => card?.id !== cardId)
  if (nextCards.length === cards.length) return false
  if (!writeStorage(key, nextCards.map(normalizeCourierCard).filter(Boolean))) throw new Error('Не вдалося видалити збережену картку.')
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COURIER_CARDS_CHANGED_EVENT, { detail: { courierId } }))
  return true
}

export function subscribeCourierCards(courierId, callback) {
  if (!courierId || typeof callback !== 'function' || typeof window === 'undefined') return () => {}
  const onStorage = (event) => { if (event.key === courierCardsStorageKey(courierId) || event.key === STORAGE_KEYS.courierCards) callback() }
  const onLocalChange = (event) => { if (event.detail?.courierId === courierId) callback() }
  window.addEventListener('storage', onStorage)
  window.addEventListener(COURIER_CARDS_CHANGED_EVENT, onLocalChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(COURIER_CARDS_CHANGED_EVENT, onLocalChange)
  }
}

export function subscribeCourierWallet(courierId, callback) {
  if (!courierId || typeof callback !== 'function') return () => {}
  if (cloudConfigured) {
    const channel = supabase
      .channel(`gb-courier-wallet-${courierId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gb_courier_payouts',
        filter: `courier_id=eq.${courierId}`,
      }, callback)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }

  if (typeof window === 'undefined') return () => {}
  const onStorage = (event) => {
    if (event.key === STORAGE_KEYS.courierPayouts) callback()
  }
  const onLocalChange = (event) => {
    if (event.detail?.courierId === courierId) callback()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(COURIER_PAYOUTS_CHANGED_EVENT, onLocalChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(COURIER_PAYOUTS_CHANGED_EVENT, onLocalChange)
  }
}

export async function requestCourierPayout({ courierId, recipientType = 'card', cardNumber = '', cardLast4 = '', cardBrand = '', iban = '', ibanLast4 = '', holderName = '', amount: requestedAmount, method = 'instant', earnedTotal }) {
  const cardDigits = String(cardNumber || '').replace(/\D/g, '')
  const normalizedLast4 = String(cardLast4 || '').replace(/\D/g, '').slice(-4)
  const normalizedIban = normalizeUkrainianIban(iban)
  const payoutType = recipientType === 'iban' || method === 'standard' ? 'iban' : 'card'
  const payoutLast4 = payoutType === 'iban'
    ? String(ibanLast4 || normalizedIban.slice(-4)).replace(/\D/g, '').slice(-4)
    : /^\d{16}$/.test(cardDigits) ? cardDigits.slice(-4) : normalizedLast4
  const normalizedBrand = payoutType === 'iban'
    ? 'IBAN'
    : cardDigits ? getPaymentCardBrand(cardDigits) : ['Visa', 'Mastercard', 'Простір'].includes(cardBrand) ? cardBrand : 'Банківська картка'
  const normalizedHolder = String(holderName || '').trim().slice(0, 60)
  if (!courierId) throw new Error('Не вдалося визначити профіль кур’єра.')
  if (!/^\d{4}$/.test(payoutLast4)) throw new Error(payoutType === 'iban' ? 'Введіть коректний український IBAN.' : 'Введіть усі 16 цифр номера картки.')
  if (payoutType === 'iban' && normalizedIban && !isValidUkrainianIban(normalizedIban)) throw new Error('Введіть коректний український IBAN: UA та 27 цифр.')
  if (payoutType === 'card' && cardDigits && !/^\d{16}$/.test(cardDigits)) throw new Error('Введіть усі 16 цифр номера картки.')
  if (normalizedHolder.length < 2) throw new Error('Введіть ПІБ отримувача.')
  const payoutMethod = method === 'standard' ? 'standard' : 'instant'
  if ((payoutType === 'iban') !== (payoutMethod === 'standard')) throw new Error('Спосіб переказу не відповідає типу рахунку.')
  const rawAmount = Number(requestedAmount)
  if (!Number.isFinite(rawAmount) || rawAmount < 50) throw new Error('Мінімальна сума виплати — 50 грн.')
  const payoutAmount = Math.round(rawAmount)

  if (cloudConfigured) {
    const { data, error } = await supabase.rpc('gb_withdraw_courier_earnings', {
      p_card_last4: payoutLast4,
      p_card_brand: normalizedBrand,
      p_amount: payoutAmount,
      p_method: payoutMethod,
      p_recipient_type: payoutType,
      p_holder_name: normalizedHolder,
    })
    if (isMissingPayoutRpc(error)) {
      throw new Error('Оновіть схему виплат у Supabase SQL Editor, щоб увімкнути перекази карткою та IBAN.')
    }
    throwIfError(error)
    return normalizePayout({ ...data, userId: courierId, type: payoutType, holderName: normalizedHolder })
  }

  const createPayout = () => {
    const stored = readStorage(STORAGE_KEYS.courierPayouts, [])
    const payouts = Array.isArray(stored) ? stored : []
    const totalPaid = calculateConfirmedCourierPayouts(payouts.filter((record) => record?.userId === courierId).map(normalizePayout))
    const available = Math.max(0, Math.round((Number(earnedTotal) || 0) - totalPaid))
    const amount = payoutAmount
    if (available < 50) throw new Error('Мінімальна сума виплати — 50 грн.')
    if (amount > available) throw new Error('Сума виплати перевищує доступний баланс.')

    const payout = normalizePayout({
      id: globalThis.crypto?.randomUUID?.() || `payout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId: courierId,
      amount,
      type: payoutType,
      cardLast4: payoutLast4,
      cardBrand: normalizedBrand,
      holderName: normalizedHolder,
      method: payoutMethod,
      createdAt: new Date().toISOString(),
    })
    if (!writeStorage(STORAGE_KEYS.courierPayouts, [...payouts, payout])) {
      throw new Error('Не вдалося зберегти виплату в цьому браузері.')
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(COURIER_PAYOUTS_CHANGED_EVENT, { detail: { courierId } }))
    }
    return payout
  }

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(`gb-courier-payout-${courierId}`, createPayout)
  }
  return createPayout()
}

