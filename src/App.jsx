import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import useLocalStorage from './hooks/useLocalStorage.js'
import useTabSession from './hooks/useTabSession.js'
import { STORAGE_KEYS, INITIAL_PURCHASES, INITIAL_ORDERS, CATEGORIES } from './data/initialData.js'
import { STATUS_LABELS } from './data/statuses.js'
import { createPasswordRecord, verifyPassword } from './lib/auth.js'
import { normalizeOrders } from './lib/orders.js'
import { readStorage, removeStorage, writeStorage } from './lib/storage.js'
import { formatMoney } from './lib/money.js'
import { calculatePurchaseDeliveryShare, calculateSavings, getPurchasePricing, safeNumber } from './utils/calculations.js'
import { createTimestamp } from './utils/date.js'
import { categoryVisual } from './utils/productVisuals.js'
import { isValidEmail, isValidPassword, parseNonNegativeInteger, validateOrganizerForm } from './utils/validation.js'
import { isValidPersonName, sanitizePersonName } from './utils/personName.js'
import { getPurchaseStatusAfterReceipt, getPurchaseTransition, haveAllParticipantsPaid, normalizeQuantity } from './utils/purchaseWorkflow.js'
import { sanitizeImageUrl } from './utils/safeUrl.js'
import { getSynchronizedNow } from './utils/serverClock.js'
import { localizeErrorMessage } from './utils/errorMessages.js'
import {
  createCloudPurchase,
  calculatePurchaseDeliveryShares,
  getCourierFinanceSummary,
  formatCourierStatusHistoryMessage,
  getCloudSession,
  isCloudMode,
  loadCloudData,
  loginCloudUser,
  logoutCloudUser,
  loadCourierWallet,
  performCloudAction,
  requestCourierPayout,
  registerCloudUser,
  resetPassword,
  subscribeCloudChanges,
  subscribeCourierWallet,
  tabId,
  watchCloudAuth,
} from './services/dataService.js'
const AuthScreen = lazy(() => import('./components/AuthScreen.jsx'))
const CatalogView = lazy(() => import('./components/CatalogView.jsx'))
const CheckoutView = lazy(() => import('./components/CheckoutView.jsx'))
const CreatePurchaseView = lazy(() => import('./components/CreatePurchaseView.jsx'))
const ManagePurchaseView = lazy(() => import('./components/ManagePurchaseView.jsx'))
const OrdersView = lazy(() => import('./components/OrdersView.jsx'))
const PurchaseDetailView = lazy(() => import('./components/PurchaseDetailView.jsx'))
const LogisticsView = lazy(() => import('./components/LogisticsView.jsx'))
const WithdrawFundsView = lazy(() => import('./components/WithdrawFundsView.jsx'))
import { Toast } from './components/Shared.jsx'
import { SkeletonForPage } from './components/Skeletons.jsx'
const WorkspaceLayout = lazy(() => import('./components/WorkspaceLayout.jsx'))
import './App.css'
import './Features.css'

const PURCHASE_STATUS_ALIASES = { 'Збір коштів': 'Збір учасників', 'В дорозі': 'Доставка' }
const publicUser = ({ id, email, firstName, lastName, name, role }) => ({ id, email, firstName, lastName, name, role })
const EMPTY_COURIER_WALLET = { payouts: [], totalPaid: 0 }
const normalizeTheme = (value) => value === 'dark' ? 'dark' : 'light'
const themeStorageKey = (userId) => userId ? `gb_theme_${userId}` : 'gb_theme_guest'
const tabThemeStorageKey = (id) => `gb_tab_theme_${id}`

function readTheme(key) {
  try {
    return normalizeTheme(window.localStorage.getItem(key))
  } catch {
    return 'light'
  }
}

function readTabTheme(tabKey, userKey) {
  try {
    const storedTabTheme = window.sessionStorage.getItem(tabKey)
    if (storedTabTheme) return normalizeTheme(storedTabTheme)
    const initialTheme = readTheme(userKey)
    window.sessionStorage.setItem(tabKey, initialTheme)
    return initialTheme
  } catch {
    return readTheme(userKey)
  }
}

function normalizeUsers(value) {
  if (!Array.isArray(value)) return []
  const validUsers = value.filter((user) => user && typeof user === 'object'
    && typeof user.id === 'string' && user.id
    && typeof user.email === 'string' && user.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
    && typeof user.name === 'string' && user.name.trim().length >= 3
    && ['participant', 'organizer', 'courier'].includes(user.role)
    && (isCloudMode() || (typeof user.passwordHash === 'string' && typeof user.passwordSalt === 'string')))
    .map((user) => {
      const nameParts = user.name.trim().split(/\s+/)
      const firstName = typeof user.firstName === 'string' && user.firstName.trim() ? user.firstName.trim() : nameParts[0] || ''
      const lastName = typeof user.lastName === 'string' && user.lastName.trim() ? user.lastName.trim() : nameParts.slice(1).join(' ')
      return {
        ...user,
        firstName,
        lastName,
        email: user.email.trim().toLowerCase(),
        name: `${firstName} ${lastName}`.trim(),
      }
    })
    .filter((user) => user.firstName.length <= 25 && user.lastName.length <= 25
      && isValidPersonName(user.firstName) && isValidPersonName(user.lastName)
      && user.email.length <= 254 && user.name.length <= 51)
  return [...new Map(validUsers.map((user) => [user.email, user])).values()]
}

function normalizePurchases(value) {
  if (!Array.isArray(value)) return []
  return value.filter((purchase) => purchase && typeof purchase === 'object'
    && typeof purchase.id === 'string' && purchase.id
    && typeof purchase.organizerId === 'string' && purchase.organizerId
    && typeof purchase.organizerName === 'string' && purchase.organizerName.trim()
    && typeof purchase.name === 'string' && purchase.name.trim().length >= 3 && purchase.name.trim().length <= 80
    && CATEGORIES.includes(purchase.category) && purchase.category !== 'Усі'
    && safeNumber(purchase.retail) > 0
    && safeNumber(purchase.retail) <= 999999999
    && safeNumber(purchase.wholesale) > 0
    && safeNumber(purchase.wholesale) <= 999999999
    && safeNumber(purchase.wholesale) < safeNumber(purchase.retail)
    && safeNumber(purchase.delivery) >= 0
    && safeNumber(purchase.delivery) <= 999999999
    && safeNumber(purchase.target) > 0
    && safeNumber(purchase.target) <= 999999999)
    .map((purchase) => {
      const durationSeconds = Number(purchase.durationSeconds)
      const parsedDeadline = Number(purchase.expiresAt ?? purchase.deadlineAt)
      const validDuration = [30, 10800, 86400, 259200, 604800, 1209600].includes(durationSeconds)
      const validDeadline = validDuration && Number.isFinite(parsedDeadline) && parsedDeadline > 0
        && parsedDeadline <= getSynchronizedNow() + durationSeconds * 1000 + 60000
        ? parsedDeadline
        : 0
      const participantRecords = (Array.isArray(purchase.participants) ? purchase.participants.slice(0, 5000) : [])
        .filter((person) => person && typeof person.userId === 'string' && person.userId)
        .map((person) => {
          const quantity = Math.max(1, Math.min(100, Math.floor(Number(person.quantity) || 1)))
          return {
            ...person,
            id: typeof person.id === 'string' ? person.id : `participant-${purchase.id}-${person.userId}`,
            name: typeof person.name === 'string' ? person.name.trim() : '',
            quantity,
            amount: quantity * safeNumber(purchase.retail),
            payment: ['Очікує', 'Оплачено', 'Отримано'].includes(person.payment) ? person.payment : 'Очікує',
          }
        })
        .filter((person) => person.name.length >= 2)
      const participantsByUser = new Map(participantRecords.map((person) => [person.userId, person]))
      const participants = [...participantsByUser.values()]
      const collected = participants.reduce((sum, person) => sum + person.amount, 0)
      return {
        ...purchase,
        name: purchase.name.trim().slice(0, 80),
        imageUrl: sanitizeImageUrl(purchase.imageUrl ?? purchase.image_url),
        organizer: purchase.organizerName,
        supplier: typeof purchase.supplier === 'string' ? purchase.supplier.trim().slice(0, 80) : '',
        description: typeof purchase.description === 'string' ? purchase.description.slice(0, 300) : '',
        detail: typeof purchase.detail === 'string' ? purchase.detail.slice(0, 300) : '',
        pickupAddress: typeof purchase.pickupAddress === 'string' ? purchase.pickupAddress.trim().slice(0, 90) : '',
        pickupHours: typeof purchase.pickupHours === 'string' && purchase.pickupHours.trim()
          ? purchase.pickupHours.trim().slice(0, 40)
          : '09:00 – 21:00',
        deliveryTotal: Math.min(999999999, Math.max(0, safeNumber(purchase.deliveryTotal ?? purchase.delivery))),
        totalWeightKg: Math.min(999999999, Math.max(0, safeNumber(purchase.totalWeightKg))),
        totalVolumeL: Math.min(999999999, Math.max(0, safeNumber(purchase.totalVolumeL))),
        participants,
        collected,
        durationSeconds: validDuration ? durationSeconds : 0,
        durationMs: validDuration ? durationSeconds * 1000 : 0,
        isDiscountFixed: Boolean(purchase.isDiscountFixed),
        status: PURCHASE_STATUS_ALIASES[purchase.status] || (typeof purchase.status === 'string' ? purchase.status : 'Збір учасників'),
        expiresAt: validDeadline,
        deadlineAt: validDeadline,
      }
    })
}

function resolveId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function progressStep(order = {}) {
  return Math.max(1, Math.min(STATUS_LABELS.length, Math.trunc(safeNumber(order.currentStep)) || Math.trunc(safeNumber(order.statusIndex)) + 1))
}

function orderHistory(status, message, time = createTimestamp()) {
  return { status, message, time, timestamp: new Date().toISOString() }
}

function App() {
  const [users, setUsers] = useLocalStorage(STORAGE_KEYS.users, [], normalizeUsers, !isCloudMode(), false)
  const [session, setSession] = useTabSession()
  const [purchases, setPurchases] = useLocalStorage(STORAGE_KEYS.purchases, INITIAL_PURCHASES, normalizePurchases, !isCloudMode())
  const [orders, setOrders] = useLocalStorage(STORAGE_KEYS.orders, INITIAL_ORDERS, normalizeOrders, !isCloudMode())
  const [cloudReady, setCloudReady] = useState(!isCloudMode())
  const [cloudError, setCloudError] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const expiryRequests = useRef(new Set())
  const sharedPurchaseHandled = useRef(false)
  const user = recoveryMode ? null : users.find((entry) => entry.id === session?.id) || null
  const [courierWalletState, setCourierWalletState] = useState({ courierId: '', wallet: EMPTY_COURIER_WALLET, loaded: false })
  useEffect(() => {
    if (user?.role !== 'courier') return undefined
    let active = true
    const refresh = () => {
      void loadCourierWallet(user.id)
        .then((wallet) => { if (active) setCourierWalletState({ courierId: user.id, wallet, loaded: true }) })
        .catch(() => { if (active) setCourierWalletState({ courierId: user.id, wallet: EMPTY_COURIER_WALLET, loaded: false }) })
    }
    refresh()
    const unsubscribe = subscribeCourierWallet(user.id, refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [user?.id, user?.role])
  const courierWalletReady = courierWalletState.courierId === user?.id && courierWalletState.loaded
  const courierWallet = courierWalletReady ? courierWalletState.wallet : EMPTY_COURIER_WALLET
  const courierFinanceSummary = user?.role === 'courier'
    ? getCourierFinanceSummary(purchases, user, courierWalletReady ? courierWallet.payouts : undefined)
    : { totalEarned: 0, totalWithdrawn: 0, availableBalance: 0 }
  const courierEarnedTotal = courierFinanceSummary.totalEarned
  const courierAvailableBalance = courierFinanceSummary.availableBalance
  const activeThemeKey = themeStorageKey(user?.id || session?.id)
  const activeTabThemeKey = tabThemeStorageKey(tabId)
  const [theme, setTheme] = useState(() => readTabTheme(activeTabThemeKey, activeThemeKey))
  const defaultPage = user?.role === 'organizer' ? 'manage' : user?.role === 'courier' ? 'logistics' : 'catalog'
  const [navigation, setNavigation] = useState(() => ({ userId: user?.id || null, page: defaultPage }))
  const activePage = navigation.userId === (user?.id || null) ? navigation.page : defaultPage
  function replaceRouteQuery({ purchaseId = '', checkoutId = '' } = {}) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.delete('purchase')
    url.searchParams.delete('checkout')
    if (purchaseId) url.searchParams.set('purchase', purchaseId)
    if (checkoutId) url.searchParams.set('checkout', checkoutId)
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
  }

  function setActivePage(page, context = {}) {
    const purchaseId = context.purchaseId ?? selectedPurchaseId
    const draft = context.checkoutDraft ?? checkoutDraft
    setNavigation({ userId: user?.id || null, page })
    if (page === 'purchase') replaceRouteQuery({ purchaseId })
    else if (page === 'checkout') replaceRouteQuery({ checkoutId: draft?.purchaseId || '' })
    else replaceRouteQuery()
  }
  function checkoutContextKey(userId = user?.id) {
    return userId ? `gb_checkout_context_${tabId}_${userId}` : ''
  }
  function clearCheckoutResume(userId = user?.id) {
    const key = checkoutContextKey(userId)
    if (!key) return
    try { window.sessionStorage.removeItem(key) } catch { /* Session resume is optional if storage is blocked. */ }
  }
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null)
  const [checkoutDraft, setCheckoutDraft] = useState(null)
  const [checkoutSourcePage, setCheckoutSourcePage] = useState('purchase')
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [toast, setToast] = useState(null)
  const [now, setNow] = useState(() => getSynchronizedNow())

  const userOrders = user?.role === 'participant' ? orders.filter((order) => order.userId === user.id) : []
  const ownedPurchases = user?.role === 'organizer' ? purchases.filter((purchase) => purchase.organizerId === user.id) : []
  const participantSavings = userOrders.reduce((total, order) => {
    const purchase = purchases.find((item) => item.id === order.purchaseId)
    if (!purchase?.isDiscountFixed || order.cancelled) return total
    return total + calculateSavings(purchase.retail, purchase.wholesale, order.quantity)
  }, 0)
  const activePurchase = purchases.find((purchase) => purchase.id === selectedPurchaseId) || null
  const activeOrder = userOrders.find((order) => order.id === activeOrderId)
    || [...userOrders].reverse().find((order) => !order.cancelled && order.status !== 'Отримано')
    || [...userOrders].reverse()[0]
    || null

  const participantStatusSnapshot = useRef({ userId: null, statuses: new Map() })
  useEffect(() => {
    if (user?.role !== 'participant') {
      participantStatusSnapshot.current = { userId: user?.id || null, statuses: new Map() }
      return
    }

    const currentStatuses = new Map(userOrders.map((order) => [order.id, order.status]))
    const previousSnapshot = participantStatusSnapshot.current
    if (previousSnapshot.userId !== user.id) {
      participantStatusSnapshot.current = { userId: user.id, statuses: currentStatuses }
      return
    }

    const pickupStatuses = new Set(['Точка видачі', 'pickup'])
    const newlyReady = userOrders.filter((order) => {
      const previousStatus = previousSnapshot.statuses.get(order.id)
      return previousStatus != null && !pickupStatuses.has(previousStatus) && pickupStatuses.has(order.status)
    })
    participantStatusSnapshot.current = { userId: user.id, statuses: currentStatuses }
    if (!newlyReady.length) return

    showToast('Ваше замовлення очікує на видачі')
    for (const order of newlyReady) {
      const purchase = purchases.find((entry) => entry.id === order.purchaseId)
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
        try {
          new window.Notification('Group Buying', {
            body: purchase?.name ? `Ваше замовлення «${purchase.name}» очікує на видачі.` : 'Ваше замовлення очікує на видачі.',
          })
        } catch {
          // Browser notifications are optional; the in-app toast remains available.
        }
      }
    }
  }, [user?.id, user?.role, userOrders, purchases])

  function showToast(message) {
    setToast({ id: resolveId('toast'), message })
  }

  function sharePurchase(purchase) {
    if (!purchase || typeof window === 'undefined') return ''
    const retail = safeNumber(purchase.retail)
    const wholesale = safeNumber(purchase.wholesale)
    const discountPercent = retail > 0 ? Math.max(0, Math.round((retail - wholesale) / retail * 100)) : 0
    const remaining = Math.max(0, safeNumber(purchase.target) - safeNumber(purchase.collected))
    const shareUrl = new URL(window.location.href)
    shareUrl.searchParams.set('purchase', purchase.id)
    const invitation = [
      `Приєднуйтеся до спільної закупівлі «${purchase.name}» у Group Buying!`,
      `Гуртова ціна: ${formatMoney(wholesale)} за одиницю (економія ${discountPercent}%).`,
      remaining > 0 ? `До порогу 100% залишилося зібрати ${formatMoney(remaining)}.` : 'Поріг збору вже досягнуто.',
      shareUrl.toString(),
    ].join('\n')

    return invitation
  }

  async function withdrawCourierEarnings({ recipientType = 'card', cardNumber = '', cardLast4 = '', cardBrand = '', iban = '', ibanLast4 = '', holderName = '', amount, method = 'instant' }) {
    if (user?.role !== 'courier') throw new Error('Вивести кошти може лише кур’єр.')
    const payout = await requestCourierPayout({ courierId: user.id, recipientType, cardNumber, cardLast4, cardBrand, iban, ibanLast4, holderName, amount, method, earnedTotal: courierEarnedTotal })
    showToast(`Виплату ${formatMoney(payout.amount)} підтверджено.`)
    return payout
  }

  const refreshCloudData = useCallback(async () => {
    const snapshot = await loadCloudData()
    setPurchases(normalizePurchases(snapshot.purchases))
    setOrders(normalizeOrders(snapshot.orders))
    return snapshot
  }, [setPurchases, setOrders])

  const runCloudAction = useCallback(async (action, payload) => {
    const result = await performCloudAction(action, payload)
    const snapshot = await refreshCloudData()
    return { result, snapshot }
  }, [refreshCloudData])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (sharedPurchaseHandled.current || !user || !cloudReady) return
    const url = new URL(window.location.href)
    const params = url.searchParams
    const hasCheckout = params.has('checkout')
    const hasPurchase = params.has('purchase')
    if (!hasCheckout && !hasPurchase) {
      sharedPurchaseHandled.current = true
      return
    }
    const clearRoute = () => {
      params.delete('purchase')
      params.delete('checkout')
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
    }

    if (hasCheckout) {
      const checkoutId = String(params.get('checkout') || '').trim()
      let savedContext = null
      try {
        savedContext = JSON.parse(window.sessionStorage.getItem(`gb_checkout_context_${tabId}_${user.id}`) || 'null')
      } catch {
        savedContext = null
      }
      const purchase = purchases.find((entry) => entry.id === checkoutId)
      const order = userOrders.find((entry) => entry.purchaseId === checkoutId && entry.userId === user.id)
      const canResume = Boolean(checkoutId && user.role === 'participant' && purchase && order
        && purchase.isDiscountFixed && getPurchasePricing(purchase).reached
        && progressStep(order) === 2 && order.paymentStatus !== 'Оплачено' && !order.cancelled)
      if (!canResume) {
        sharedPurchaseHandled.current = true
        clearRoute()
        showToast('Оплату не вдалося відновити. Відкрийте замовлення та спробуйте ще раз.')
        return
      }
      const share = deliverySharesForPurchase(purchase).get(user.id) ?? order.deliveryShare
      const subtotal = safeNumber(order.quantity) * getPurchasePricing(purchase).unitPrice
      const draft = {
        purchaseId: purchase.id,
        name: purchase.name,
        supplier: purchase.supplier || '',
        quantity: order.quantity,
        unitPrice: getPurchasePricing(purchase).unitPrice,
        subtotal,
        deliveryShare: share,
        total: subtotal + share,
        pickupAddress: purchase.pickupAddress,
        pickupHours: purchase.pickupHours || '09:00 – 21:00',
      }
      sharedPurchaseHandled.current = true
      setSelectedPurchaseId(purchase.id)
      setActiveOrderId(order.id)
      setCheckoutDraft(draft)
      setCheckoutSourcePage(savedContext?.sourcePage === 'purchase' ? 'purchase' : 'orders')
      setNavigation({ userId: user.id, page: 'checkout' })
      return
    }

    const sharedPurchaseId = String(params.get('purchase') || '').trim()
    const sharedPurchase = sharedPurchaseId ? purchases.find((purchase) => purchase.id === sharedPurchaseId) : null
    if (!sharedPurchase) {
      sharedPurchaseHandled.current = true
      clearRoute()
      showToast('Закупівлю не знайдено')
      return
    }
    sharedPurchaseHandled.current = true
    setSelectedPurchaseId(sharedPurchase.id)
    setNavigation({ userId: user.id, page: 'purchase' })
  }, [user, cloudReady, purchases, userOrders])

  useEffect(() => {
    if (!isCloudMode()) return undefined

    let active = true
    let refreshQueued = false
    let realtimeConnected = false
    let stopRealtimeSubscription = () => {}
    const refresh = () => {
      if (!active || refreshQueued) return
      refreshQueued = true
      window.setTimeout(() => {
        void loadCloudData()
          .then((snapshot) => {
            if (!active) return
            setPurchases(normalizePurchases(snapshot.purchases))
            setOrders(normalizeOrders(snapshot.orders))
            setCloudError('')
          })
          .catch((error) => setCloudError(localizeErrorMessage(error, 'Не вдалося синхронізувати дані.')))
          .finally(() => { refreshQueued = false })
      }, 0)
    }
    const connectRealtime = () => {
      if (!active || realtimeConnected) return
      stopRealtimeSubscription = subscribeCloudChanges(refresh)
      realtimeConnected = true
    }

    void getCloudSession()
      .then(async (profile) => {
        if (!active) return
        if (profile) {
          setUsers([profile])
          setSession({ id: profile.id })
          connectRealtime()
          await refreshCloudData()
        }
        else {
          setUsers([])
          setSession(null)
          setPurchases([])
          setOrders([])
        }
        setCloudReady(true)
      })
      .catch((error) => {
        if (!active) return
        setCloudError(localizeErrorMessage(error, 'Не вдалося під’єднатися до Supabase.'))
        setCloudReady(true)
      })

    const stopAuth = watchCloudAuth((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setCloudReady(true)
        connectRealtime()
        refresh()
      } else if (event === 'SIGNED_OUT') {
        stopRealtimeSubscription()
        stopRealtimeSubscription = () => {}
        realtimeConnected = false
        setRecoveryMode(false)
        setUsers([])
        setSession(null)
        setPurchases([])
        setOrders([])
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        connectRealtime()
        refresh()
      }
    })

    return () => {
      active = false
      stopRealtimeSubscription()
      stopAuth()
    }
  }, [refreshCloudData, setUsers, setSession, setPurchases, setOrders])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(getSynchronizedNow()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    // Remove legacy keys from earlier application schemas.
    ;['group-buying.auth', 'group-buying.purchases', 'group-buying.orders', 'group-buying.managed-purchases', 'gb_managed_purchases_v1'].forEach(removeStorage)
  }, [])

  useEffect(() => {
    if (!cloudReady) return
    const expired = purchases.filter((purchase) => getPurchaseTransition({ action: 'expire_purchase', purchase, now }) === 'Скасовано')
    if (!expired.length) return
    if (isCloudMode()) {
      expired.forEach((purchase) => {
        if (expiryRequests.current.has(purchase.id)) return
        expiryRequests.current.add(purchase.id)
        void performCloudAction('expire_purchase', { purchase_id: purchase.id })
          .then(() => refreshCloudData())
          .catch((error) => showToast(localizeErrorMessage(error, 'Не вдалося скасувати закупівлю за таймером.')))
          .finally(() => expiryRequests.current.delete(purchase.id))
      })
      return
    }
    const expiredIds = new Set(expired.map((purchase) => purchase.id))
    const time = createTimestamp()
    setPurchases((items) => items.map((purchase) => expiredIds.has(purchase.id)
      ? { ...purchase, status: 'Скасовано', statusBadge: 'Скасовано', collectionCancelled: true, cancelledAt: time }
      : purchase))
    setOrders((items) => items.map((order) => {
      if (!expiredIds.has(order.purchaseId) || progressStep(order) >= STATUS_LABELS.length || order.cancelled) return order
      return {
        ...order,
        status: 'Скасовано',
        statusBadge: 'Скасовано · Час збору вичерпано',
        cancelled: true,
        cancelledAt: time,
        history: [...order.history, orderHistory('Скасовано', 'Система скасувала збір: час таймера вичерпано, поріг не досягнуто.', time)],
      }
    }))
  }, [now, purchases, setPurchases, setOrders, cloudReady, refreshCloudData])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  async function registerUser({ firstName, lastName, email, role, password }) {
    const normalizedFirstName = sanitizePersonName(firstName)
    const normalizedLastName = sanitizePersonName(lastName)
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedPassword = String(password || '')
    if (normalizedFirstName.length < 2 || normalizedFirstName.length > 25 || !isValidPersonName(normalizedFirstName)) return 'Перевірте ім’я.'
    if (normalizedLastName.length < 2 || normalizedLastName.length > 25 || !isValidPersonName(normalizedLastName)) return 'Перевірте прізвище.'
    if (normalizedEmail.length > 60 || !isValidEmail(normalizedEmail)) return 'Введіть коректну електронну пошту.'
    if (!isValidPassword(normalizedPassword)) return 'Пароль має містити від 8 до 64 символів.'
    if (!['participant', 'organizer', 'courier'].includes(role)) return 'Оберіть роль.'
    const registeredUsers = isCloudMode() ? users : normalizeUsers(readStorage(STORAGE_KEYS.users, users))
    if (registeredUsers.some((entry) => entry.email.toLowerCase() === normalizedEmail)) return 'Ця електронна пошта вже зареєстрована.'
    try {
      if (isCloudMode()) {
        const result = await registerCloudUser({ firstName: normalizedFirstName, lastName: normalizedLastName, email: normalizedEmail, role, password: normalizedPassword })
        const nextSession = { id: result.user.id }
        setUsers([result.user])
        setSession(nextSession)
        await refreshCloudData()
        setNavigation({ userId: result.user.id, page: role === 'organizer' ? 'manage' : role === 'courier' ? 'logistics' : 'catalog' })
        setCloudError('')
        return null
      }

      const credentials = await createPasswordRecord(normalizedPassword)
      const newUser = {
        id: resolveId('user'),
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        name: `${normalizedFirstName} ${normalizedLastName}`,
        initials: `${normalizedFirstName[0]}${normalizedLastName[0]}`.toUpperCase(),
        email: normalizedEmail,
        role,
        ...credentials,
        createdAt: new Date().toISOString(),
      }
      const nextUsers = [...registeredUsers, newUser]
      setUsers(nextUsers)
      writeStorage(STORAGE_KEYS.users, nextUsers)
      const nextSession = { id: newUser.id }
      setSession(nextSession)
      setNavigation({ userId: newUser.id, page: role === 'organizer' ? 'manage' : role === 'courier' ? 'logistics' : 'catalog' })
      return null
    } catch (error) {
      return localizeErrorMessage(error, 'Не вдалося створити акаунт.')
    }
  }

  async function loginUser({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedPassword = String(password || '')
    if (normalizedEmail.length > 60 || !isValidEmail(normalizedEmail)) return 'Введіть коректну електронну пошту.'
    if (!normalizedPassword || normalizedPassword.length > 64) return 'Перевірте електронну пошту та пароль.'
    if (isCloudMode()) {
      try {
        const found = await loginCloudUser({ email: normalizedEmail, password: normalizedPassword })
        const nextSession = { id: found.id }
        setUsers([found])
        setSession(nextSession)
        await refreshCloudData()
        setNavigation({ userId: found.id, page: found.role === 'organizer' ? 'manage' : found.role === 'courier' ? 'logistics' : 'catalog' })
        setRecoveryMode(false)
        setCloudError('')
        return null
      } catch (error) {
        return localizeErrorMessage(error, 'Перевірте електронну пошту та пароль.')
      }
    }
    const registeredUsers = normalizeUsers(readStorage(STORAGE_KEYS.users, users))
    const found = registeredUsers.find((entry) => entry.email.toLowerCase() === normalizedEmail)
    if (!found || !(await verifyPassword(normalizedPassword, found))) return 'Перевірте електронну пошту та пароль.'
    setUsers(registeredUsers)
    const nextSession = { id: found.id }
    setSession(nextSession)
    setNavigation({ userId: found.id, page: found.role === 'organizer' ? 'manage' : found.role === 'courier' ? 'logistics' : 'catalog' })
    return null
  }

  async function resetUserPassword({ email, firstName, lastName, newPassword }) {
    try {
      const result = await resetPassword({ email, firstName, lastName, newPassword })
      if (result?.users) setUsers(result.users)
      setRecoveryMode(false)
      showToast('Пароль успішно оновлено')
      return null
    } catch (error) {
      return localizeErrorMessage(error, 'Не вдалося оновити пароль.')
    }
  }

  function signOut() {
    if (isCloudMode()) void logoutCloudUser().catch((error) => showToast(localizeErrorMessage(error, 'Не вдалося вийти з акаунта.')))
    clearCheckoutResume()
    setSession(null)
    setSelectedPurchaseId(null)
    setCheckoutDraft(null)
    setActiveOrderId(null)
    setActivePage('catalog')
  }

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    try {
      window.sessionStorage.setItem(activeTabThemeKey, nextTheme)
      window.localStorage.setItem(activeThemeKey, nextTheme)
    } catch {
      // Keep the current tab responsive when browser storage is unavailable.
    }
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
  }

  function openPurchase(id) {
    setSelectedPurchaseId(id)
    setActivePage('purchase', { purchaseId: id })
  }

  function deliverySharesForPurchase(purchase) {
    const unitPrice = getPurchasePricing(purchase).unitPrice
    return new Map(calculatePurchaseDeliveryShares(purchase, (purchase.participants || []).map((person) => ({
      ...person,
      subtotal: Math.max(1, safeNumber(person.quantity)) * unitPrice,
    }))).map(({ userId, deliveryShare }) => [userId, deliveryShare]))
  }

  function orderForParticipant(purchase, person, previous = null, deliveryShareOverride) {
    const pricing = getPurchasePricing(purchase)
    const reached = pricing.reached
    const unitPrice = pricing.unitPrice
    const subtotal = person.quantity * unitPrice
    const deliveryShare = deliveryShareOverride ?? calculatePurchaseDeliveryShare(purchase, subtotal)
    const step = purchase.isDiscountFixed ? 2 : 1
    const badge = STATUS_LABELS[step - 1]
    const time = createTimestamp()
    const changedPrice = previous && previous.unitPrice !== unitPrice
    const changedQuantity = previous && previous.quantity !== person.quantity
    const history = previous?.history || []
    const nextHistory = [...history]
    if (changedQuantity) nextHistory.push(orderHistory('Частку оновлено', `Учасник ${person.name} змінив кількість на ${person.quantity} шт.`, time))
    if (changedPrice) nextHistory.push(orderHistory(badge, reached
      ? 'Система застосувала гуртову ціну після досягнення порогу.'
      : 'Система повернула роздрібну ціну після зміни збору.', time))
    return {
      ...previous,
      id: previous?.id || `order-${purchase.id}-${person.userId}`,
      purchaseId: purchase.id,
      userId: person.userId,
      userName: person.name,
      userEmail: person.email || previous?.userEmail || '',
      name: purchase.name,
      supplier: purchase.supplier || '',
      quantity: person.quantity,
      unitPrice,
      subtotal,
      deliveryShare,
      total: subtotal + deliveryShare,
      pickupAddress: purchase.pickupAddress,
      pickupHours: purchase.pickupHours || '09:00 – 21:00',
      status: badge,
      currentStep: step,
      statusIndex: step - 1,
      statusBadge: badge,
      paymentStatus: previous?.paymentStatus || 'Очікує',
      cancelled: false,
      createdAt: previous?.createdAt || new Date().toISOString(),
      history: previous
        ? nextHistory
        : [orderHistory(badge, `Учасник ${person.name} приєднався до закупівлі.`, time)],
    }
  }

  async function joinPurchase(purchaseId, quantity) {
    if (user?.role !== 'participant') return
    const purchase = purchases.find((item) => item.id === purchaseId)
    if (getPurchaseTransition({ action: 'join_purchase', role: user.role, userId: user.id, purchase, now }) !== 'Збір учасників') return
    if (isCloudMode()) {
      try {
        const safeQuantity = normalizeQuantity(quantity, 100)
        const { snapshot } = await runCloudAction('join_purchase', { purchase_id: purchaseId, quantity: safeQuantity })
        const order = snapshot.orders.find((entry) => entry.purchaseId === purchaseId && entry.userId === user.id)
        setActiveOrderId(order?.id || null)
        setSelectedPurchaseId(purchaseId)
        showToast('Ви приєдналися до закупівлі. Замовлення з’явилося у вашому списку.')
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося приєднатися до закупівлі.'))
      }
      return
    }
    const qty = normalizeQuantity(quantity, 100)
    const previousPerson = purchase.participants.find((person) => person.userId === user.id)
    if (!previousPerson && purchase.participants.length >= 5000) {
      showToast('У цій закупівлі вже досягнуто максимальної кількості учасників.')
      return
    }
    const person = {
      ...(previousPerson || {}),
      id: previousPerson?.id || `participant-${purchase.id}-${user.id}`,
      userId: user.id,
      name: user.name,
      email: user.email,
      quantity: qty,
      amount: qty * safeNumber(purchase.retail),
      payment: previousPerson?.payment || 'Очікує',
    }
    const participants = previousPerson
      ? purchase.participants.map((entry) => entry.userId === user.id ? person : entry)
      : [...purchase.participants, person]
    const updatedPurchase = {
      ...purchase,
      participants,
      collected: participants.reduce((sum, entry) => sum + entry.amount, 0),
      deadlineAt: purchase.deadlineAt,
      expiresAt: purchase.expiresAt ?? purchase.deadlineAt,
    }
    const currentOrders = orders.filter((order) => order.purchaseId !== purchase.id)
    const deliveryShares = deliverySharesForPurchase(updatedPurchase)
    const nextOrdersForPurchase = participants.map((entry) => {
      const previousOrder = orders.find((order) => order.purchaseId === purchase.id && order.userId === entry.userId)
      return orderForParticipant(updatedPurchase, entry, previousOrder, deliveryShares.get(entry.userId))
    })
    setPurchases((items) => items.map((item) => item.id === purchase.id ? updatedPurchase : item))
    setOrders([...currentOrders, ...nextOrdersForPurchase])
    const userOrder = nextOrdersForPurchase.find((order) => order.userId === user.id)
    setActiveOrderId(userOrder?.id || null)
    if (activePurchase?.id === purchase.id || selectedPurchaseId === purchase.id) setSelectedPurchaseId(purchase.id)
    showToast(previousPerson ? 'Вашу частку оновлено.' : 'Ви приєдналися до закупівлі. Замовлення з’явилося у вашому списку.')
  }

  async function leavePurchase(purchaseId) {
    if (user?.role !== 'participant') return
    const purchase = purchases.find((item) => item.id === purchaseId)
    const currentOrder = orders.find((item) => item.purchaseId === purchaseId && item.userId === user.id)
    if (getPurchaseTransition({ action: 'leave_purchase', role: user.role, userId: user.id, purchase, order: currentOrder, now }) !== 'Збір учасників') return
    if (isCloudMode()) {
      try {
        await runCloudAction('leave_purchase', { purchase_id: purchaseId })
        setActiveOrderId(null)
        showToast('Ви вийшли зі збору. Вашу частку прибрано.')
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося вийти зі збору.'))
      }
      return
    }
    const order = currentOrder
    if (!purchase || !order || purchase.isDiscountFixed || progressStep(order) >= 2) return
    const participants = purchase.participants.filter((person) => person.userId !== user.id)
    const updatedPurchase = { ...purchase, participants, collected: participants.reduce((sum, person) => sum + person.amount, 0) }
    const keptOrders = orders.filter((item) => !(item.purchaseId === purchaseId && item.userId === user.id))
    const deliveryShares = deliverySharesForPurchase(updatedPurchase)
    const nextOrders = keptOrders.map((item) => {
      if (item.purchaseId !== purchaseId || progressStep(item) > 1) return item
      const person = participants.find((entry) => entry.userId === item.userId)
      return person ? orderForParticipant(updatedPurchase, person, item, deliveryShares.get(person.userId)) : item
    })
    setPurchases((items) => items.map((item) => item.id === purchaseId ? updatedPurchase : item))
    setOrders(nextOrders)
    setActiveOrderId(null)
    showToast('Ви вийшли зі збору. Вашу частку прибрано.')
  }

  function startCheckout(purchase, sourcePage = activePage) {
    if (user?.role !== 'participant' || !purchase || !purchase.isDiscountFixed
      || !getPurchasePricing(purchase).reached) return
    const order = orders.find((item) => item.purchaseId === purchase.id && item.userId === user.id)
    if (!order || progressStep(order) !== 2 || order.paymentStatus === 'Оплачено' || order.cancelled) return
    const unitPrice = getPurchasePricing(purchase).unitPrice
    const subtotal = safeNumber(order.quantity) * unitPrice
    const deliveryShare = deliverySharesForPurchase(purchase).get(user.id) ?? order.deliveryShare
    const draft = {
      purchaseId: purchase.id,
      name: purchase.name,
      supplier: purchase.supplier || '',
      quantity: order.quantity,
      unitPrice,
      subtotal,
      deliveryShare,
      total: subtotal + deliveryShare,
      pickupAddress: purchase.pickupAddress,
      pickupHours: purchase.pickupHours || '09:00 – 21:00',
    }
    setCheckoutDraft(draft)
    setCheckoutSourcePage(sourcePage)
    try {
      window.sessionStorage.setItem(checkoutContextKey(), JSON.stringify({ purchaseId: purchase.id, sourcePage }))
    } catch { /* The current checkout still works when session storage is blocked. */ }
    setActivePage('checkout', { checkoutDraft: draft })
  }

  function returnFromCheckout() {
    clearCheckoutResume()
    const sourcePage = checkoutSourcePage
    const purchaseId = checkoutDraft?.purchaseId
    setCheckoutDraft(null)
    setActivePage(sourcePage, { purchaseId })
  }

  async function completePayment(purchaseId) {
    if (user?.role !== 'participant' || !checkoutDraft || purchaseId !== checkoutDraft.purchaseId) return
    if (isCloudMode()) {
      try {
        const { snapshot } = await runCloudAction('pay_order', { purchase_id: purchaseId })
        const paidOrder = snapshot.orders.find((item) => item.purchaseId === purchaseId && item.userId === user.id)
        setActiveOrderId(paidOrder?.id || null)
        clearCheckoutResume()
        setCheckoutDraft(null)
        setActivePage('orders')
        showToast('Оплату прийнято. Кошти захищені до отримання товару.')
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося прийняти оплату.'))
      }
      return
    }
    const purchase = purchases.find((item) => item.id === purchaseId)
    const order = orders.find((item) => item.purchaseId === purchaseId && item.userId === user.id)
    const person = purchase?.participants.find((entry) => entry.userId === user.id)
    if (!purchase || !person || !order || !purchase.isDiscountFixed || progressStep(order) !== 2 || order.paymentStatus === 'Оплачено') return
    const time = createTimestamp()
    const paidOrder = {
      ...order,
      status: STATUS_LABELS[1],
      currentStep: 2,
      statusIndex: 1,
      statusBadge: STATUS_LABELS[1],
      paymentStatus: 'Оплачено',
      paidAt: time,
      history: [...order.history, orderHistory('Оплата', `Учасник ${user.name} сплатив ${formatMoney(checkoutDraft.total)}. Кошти утримуються на гарантійному рахунку.`, time)],
    }
    const updatedPurchase = {
      ...purchase,
      participants: purchase.participants.map((entry) => entry.userId === user.id ? { ...entry, payment: 'Оплачено' } : entry),
    }
    setPurchases((items) => items.map((item) => item.id === purchaseId ? updatedPurchase : item))
    setOrders((items) => items.map((item) => item.id === order.id ? paidOrder : item))
    setActiveOrderId(paidOrder.id)
    clearCheckoutResume()
    setCheckoutDraft(null)
    setActivePage('orders')
    showToast('Оплату прийнято. Кошти захищені до отримання товару.')
  }

  async function createPurchase(values) {
    if (user?.role !== 'organizer') return false
    if (Object.values(validateOrganizerForm(values)).some(Boolean)) return false
    const retail = parseNonNegativeInteger(values.retail)
    const wholesale = parseNonNegativeInteger(values.wholesale)
    const target = parseNonNegativeInteger(values.target)
    const delivery = parseNonNegativeInteger(values.delivery)
    const durationSeconds = parseNonNegativeInteger(values.timer)
    if ([retail, wholesale, target, delivery, durationSeconds].some((value) => value === null)) return false
    const visual = categoryVisual(values.category)
    const purchase = {
      id: resolveId('purchase'),
      name: values.name.trim(),
      category: values.category,
      organizerId: user.id,
      organizerName: user.name,
      organizer: user.name,
      supplier: String(values.supplier || '').trim(),
      description: values.description.trim(),
      detail: values.description.trim() || 'Закупівля від мешканців спільноти.',
      collected: 0,
      target,
      status: 'Збір учасників',
      currentStep: 1,
      statusIndex: 0,
      statusBadge: 'Збір учасників',
      isDiscountFixed: false,
      retail,
      wholesale,
      delivery,
      participants: [],
      durationSeconds,
      durationMs: durationSeconds * 1000,
      expiresAt: now + durationSeconds * 1000,
      deadlineAt: now + durationSeconds * 1000,
      icon: visual.icon,
      art: visual.art,
      pickupAddress: values.pickupAddress.trim(),
      pickupHours: values.pickupHours.trim() || '09:00 – 21:00',
      deliveryTotal: delivery,
      totalWeightKg: Math.min(999999999, Math.max(0, Number(String(values.totalWeightKg || '').replace(',', '.')) || 0)),
      totalVolumeL: Math.min(999999999, Math.max(0, Number(String(values.totalVolumeL || '').replace(',', '.')) || 0)),
    }
    if (isCloudMode()) {
      try {
        await createCloudPurchase(purchase)
        await refreshCloudData()
        setSelectedPurchaseId(purchase.id)
        setActivePage('manage')
        showToast(`Закупівлю «${purchase.name}» створено.`)
        return true
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося створити закупівлю.'))
        return false
      }
    }
    setPurchases((items) => [purchase, ...items])
    setSelectedPurchaseId(purchase.id)
    setActivePage('manage')
    showToast(`Закупівлю «${purchase.name}» створено.`)
    return true
  }

  async function fixDiscount(purchaseId) {
    if (user?.role !== 'organizer') return false
    const purchase = purchases.find((item) => item.id === purchaseId)
    if (getPurchaseTransition({ action: 'fix_discount', role: user.role, userId: user.id, purchase, now }) !== 'Оплата') return false
    if (isCloudMode()) {
      try {
        await runCloudAction('fix_discount', { purchase_id: purchaseId })
        showToast('Гуртову знижку зафіксовано. Учасники можуть оплатити частки.')
        return true
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося зафіксувати знижку.'))
        return false
      }
    }
    const updated = { ...purchase, isDiscountFixed: true, status: 'Оплата', currentStep: 2, statusIndex: 1, statusBadge: 'Оплата' }
    const deliveryShares = deliverySharesForPurchase(updated)
    setPurchases((items) => items.map((item) => item.id === purchaseId ? updated : item))
    setOrders((items) => items.map((order) => {
      if (order.purchaseId !== purchaseId || progressStep(order) !== 1 || order.cancelled) return order
      const person = updated.participants.find((entry) => entry.userId === order.userId)
      if (!person) return order
      const unitPrice = safeNumber(updated.wholesale)
      const subtotal = safeNumber(person.quantity) * unitPrice
      const deliveryShare = deliveryShares.get(order.userId) ?? calculatePurchaseDeliveryShare(updated, subtotal)
      const entry = orderHistory('Оплата', `Організатор ${user.name} зафіксував гуртову знижку. Можна сплатити свою частку.`)
      return {
        ...order,
        status: STATUS_LABELS[1],
        currentStep: 2,
        statusIndex: 1,
        statusBadge: STATUS_LABELS[1],
        paymentStatus: 'Очікує',
        unitPrice,
        subtotal,
        deliveryShare,
        total: subtotal + deliveryShare,
        history: [...order.history, entry],
      }
    }))
    showToast('Гуртову знижку зафіксовано. Учасники можуть оплатити частки.')
    return true
  }

  async function cancelPurchase(purchaseId) {
    if (user?.role !== 'organizer') return false
    const purchase = purchases.find((item) => item.id === purchaseId && item.organizerId === user.id)
    const hasPaidOrders = orders.some((order) => order.purchaseId === purchaseId
      && (order.paymentStatus === 'Оплачено' || order.status === 'Отримано'))
      || purchase?.participants?.some((participant) => ['Оплачено', 'Отримано'].includes(participant.payment))
    if (getPurchaseTransition({ action: 'cancel_purchase', role: user.role, userId: user.id, purchase, hasPaidOrders, now }) !== 'Скасовано') {
      showToast('Цю закупівлю вже не можна скасувати на етапі збору.')
      return false
    }

    if (isCloudMode()) {
      try {
        await runCloudAction('cancel_purchase', { purchase_id: purchaseId })
        showToast('Закупівлю скасовано. Пов’язані неоплачені замовлення оновлено.')
        return true
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося скасувати закупівлю.'))
        return false
      }
    }

    const time = createTimestamp()
    setPurchases((items) => items.map((item) => item.id === purchaseId
      ? { ...item, status: 'Скасовано', statusBadge: 'Скасовано', collectionCancelled: true, cancelledAt: time }
      : item))
    setOrders((items) => items.map((order) => {
      if (order.purchaseId !== purchaseId || order.paymentStatus === 'Оплачено' || order.status === 'Отримано' || order.cancelled) return order
      return {
        ...order,
        status: 'Скасовано',
        statusBadge: 'Скасовано · Організатор скасував закупівлю',
        cancelled: true,
        cancelledAt: time,
        history: [...order.history, orderHistory('Скасовано', `Організатор ${user.name} скасував закупівлю. Оплату не проводили.`, time)],
      }
    }))
    showToast('Закупівлю скасовано. Пов’язані неоплачені замовлення оновлено.')
    return true
  }

  async function updatePurchaseStatus(purchaseId, newStatus) {
    if (!user) return false
    const transitionPurchase = purchases.find((item) => item.id === purchaseId)
    const transitionOrder = orders.find((item) => item.purchaseId === purchaseId && item.userId === user.id)
    const transitionAllPaid = haveAllParticipantsPaid(transitionPurchase, orders)
    const transitionAction = {
      Оформлення: 'form_batch',
      Доставка: 'accept_delivery',
      Точка_видачі: 'deliver_to_pickup',
      Отримано: 'confirm_receipt',
    }[newStatus.replaceAll(' ', '_')]
    if (getPurchaseTransition({ action: transitionAction, role: user.role, userId: user.id, purchase: transitionPurchase, order: transitionOrder, allParticipantsPaid: transitionAllPaid, now }) !== newStatus) return false
    if (isCloudMode()) {
      const actionByStatus = {
        Оформлення: 'form_batch',
        Доставка: 'accept_delivery',
        Точка_видачі: 'deliver_to_pickup',
        Отримано: 'confirm_receipt',
      }
      const action = actionByStatus[newStatus.replaceAll(' ', '_')]
      if (!action) return false
      try {
        await runCloudAction(action, { purchase_id: purchaseId })
        showToast(newStatus === 'Отримано' ? 'Замовлення отримано. Кошти з гарантійного рахунку перераховано організатору.' : 'Статус закупівлі оновлено.')
        return true
      } catch (error) {
        showToast(localizeErrorMessage(error, 'Не вдалося оновити статус закупівлі.'))
        return false
      }
    }
    const time = createTimestamp()
    if (user.role === 'participant' && newStatus === 'Отримано') {
      const purchase = purchases.find((item) => item.id === purchaseId)
      const order = orders.find((item) => item.purchaseId === purchaseId && item.userId === user.id)
      if (!purchase || purchase.status !== 'Точка видачі' || !order || progressStep(order) !== 5 || order.status === 'Отримано') return false
      const time = createTimestamp()
      const nextOrders = orders.map((item) => item.id === order.id
        ? { ...item, status: 'Отримано', currentStep: 5, statusIndex: 4, statusBadge: 'Отримано', history: [...item.history, orderHistory('Отримано', `Учасник ${user.name} підтвердив отримання товару. Замовлення закрито.`, time)] }
        : item)
      const allReceived = purchase.participants.length > 0 && purchase.participants.every((participant) => nextOrders.some((item) => item.purchaseId === purchaseId && item.userId === participant.userId && item.status === 'Отримано'))
      const finalPurchaseStatus = getPurchaseStatusAfterReceipt(purchase, allReceived)
      setOrders(nextOrders)
      setPurchases((items) => items.map((item) => item.id === purchaseId
        ? { ...item, status: finalPurchaseStatus, currentStep: allReceived ? 6 : item.currentStep, statusIndex: allReceived ? 5 : item.statusIndex, statusBadge: finalPurchaseStatus, participants: item.participants.map((participant) => participant.userId === user.id ? { ...participant, payment: 'Отримано' } : participant) }
        : item))
      showToast('Замовлення отримано. Кошти з гарантійного рахунку перераховано організатору.')
      return true
    }

    if (user.role === 'organizer' && newStatus === 'Оформлення') {
      const purchase = purchases.find((item) => item.id === purchaseId && item.organizerId === user.id)
      const allPaid = haveAllParticipantsPaid(purchase, orders)
      if (!purchase || purchase.status !== 'Оплата' || !purchase.isDiscountFixed) return false
      if (!allPaid) {
        showToast('Очікується оплата від усіх учасників.')
        return false
      }
      const updatedPurchase = { ...purchase, status: 'Оформлення', currentStep: 3, statusIndex: 2, statusBadge: 'Оформлення' }
      setPurchases((items) => items.map((item) => item.id === purchaseId ? updatedPurchase : item))
      setOrders((items) => items.map((order) => {
        if (order.purchaseId !== purchaseId || order.cancelled || order.paymentStatus !== 'Оплачено') return order
        return {
          ...order,
          status: STATUS_LABELS[2],
          currentStep: 3,
          statusIndex: 2,
          statusBadge: STATUS_LABELS[2],
          history: [...order.history, orderHistory(STATUS_LABELS[2], `Усі учасники сплатили частки. Організатор ${user.name} сформував партію та передав її кур’єру.`, time)],
        }
      }))
      showToast('Партію оформлено та передано кур’єру.')
      return true
    }

    if (user.role !== 'courier') return false
    const purchase = purchases.find((item) => item.id === purchaseId)
    const accepting = newStatus === 'Доставка' && purchase?.status === 'Оформлення'
    const delivering = newStatus === 'Точка видачі' && purchase?.status === 'Доставка'
    if (!purchase || (!accepting && !delivering)) return false
    if (purchase.courierId && purchase.courierId !== user.id) {
      showToast('Цю партію вже прийняв інший кур’єр.')
      return false
    }
    const allPaid = haveAllParticipantsPaid(purchase, orders)
    if (!allPaid) return false
    const nextStep = accepting ? 4 : 5
    const message = formatCourierStatusHistoryMessage(newStatus, user.name, purchase.pickupAddress)
    const updatedPurchase = {
      ...purchase,
      status: newStatus,
      currentStep: nextStep,
      statusIndex: nextStep - 1,
      statusBadge: newStatus,
      courierId: user.id,
      courierName: user.name,
      courierEmail: user.email,
    }
    setPurchases((items) => items.map((item) => item.id === purchaseId ? updatedPurchase : item))
    setOrders((items) => items.map((order) => {
      if (order.purchaseId !== purchaseId || order.cancelled || order.paymentStatus !== 'Оплачено') return order
      return {
        ...order,
        status: STATUS_LABELS[nextStep - 1],
        currentStep: nextStep,
        statusIndex: nextStep - 1,
        statusBadge: STATUS_LABELS[nextStep - 1],
        history: [...order.history, orderHistory(STATUS_LABELS[nextStep - 1], message, time)],
      }
    }))
    showToast(accepting ? 'Партію прийнято в доставку.' : 'Партію доставлено на точку видачі.')
    return true
  }

  const pageTitles = {
    catalog: 'Каталог закупівель',
    purchase: activePurchase?.name || 'Закупівля',
    checkout: 'Оплата частки',
    orders: 'Мої замовлення',
    create: 'Нова закупівля',
    manage: 'Мої закупівлі',
    logistics: 'Доставки',
    withdraw: 'Вивести кошти',
  }

  return (
    <div className="app-shell" data-theme={theme}>
      {!cloudReady ? <SkeletonForPage page={defaultPage} /> : <Suspense fallback={<SkeletonForPage page={activePage} />}>{user ? <WorkspaceLayout
        user={publicUser(user)}
        courierBalance={courierAvailableBalance}
        purchases={purchases}
        wallet={courierWalletReady ? courierWallet : undefined}
        theme={theme}
        activePage={activePage}
        pageTitle={pageTitles[activePage]}
        onNavigate={setActivePage}
        onToggleTheme={toggleTheme}
        onSignOut={signOut}
      >
        {activePage === 'catalog' && <CatalogView purchases={purchases} now={now} userRole={user.role} userId={user.id} onOpenPurchase={openPurchase} onCreatePurchase={() => setActivePage('create')} />}
        {activePage === 'purchase' && <PurchaseDetailView key={selectedPurchaseId} purchase={activePurchase} now={now} theme={theme} userRole={user.role} userName={user.name} userId={user.id} hasOrder={userOrders.some((order) => order.purchaseId === selectedPurchaseId)} hasPaid={userOrders.some((order) => order.purchaseId === selectedPurchaseId && order.paymentStatus === 'Оплачено')} onBack={() => setActivePage('catalog')} onJoin={joinPurchase} onLeave={leavePurchase} onCheckout={(purchase) => startCheckout(purchase, 'purchase')} onManage={(id) => { setSelectedPurchaseId(id); setActivePage('manage') }} onShare={sharePurchase} />}
        {activePage === 'checkout' && <CheckoutView draft={checkoutDraft} onBack={returnFromCheckout} onPay={completePayment} />}
        {activePage === 'orders' && <OrdersView orders={userOrders.map((order) => { const purchase = purchases.find((item) => item.id === order.purchaseId); return { ...order, courierName: order.courierName || purchase?.courierName || '', pickupAddress: order.pickupAddress || purchase?.pickupAddress || '', pickupHours: order.pickupHours || purchase?.pickupHours || '09:00 – 21:00' } })} totalSavings={participantSavings} activeOrderId={activeOrder?.id || null} onSelectOrder={setActiveOrderId} onCheckout={(purchaseId) => { const purchase = purchases.find((item) => item.id === purchaseId); if (purchase) startCheckout(purchase, 'orders') }} onConfirmReceipt={(purchaseId) => updatePurchaseStatus(purchaseId, 'Отримано')} onNavigateToCatalog={() => setActivePage('catalog')} />}
        {activePage === 'create' && <CreatePurchaseView organizer={user.name} onCreate={createPurchase} />}
        {activePage === 'manage' && <ManagePurchaseView items={ownedPurchases} orders={orders} ownerId={user.id} ownerName={user.name} selectedId={selectedPurchaseId} now={now} onSelect={setSelectedPurchaseId} onCreateNew={() => setActivePage('create')} onFixDiscount={fixDiscount} onCancelPurchase={cancelPurchase} onUpdatePurchaseStatus={updatePurchaseStatus} />}
        {activePage === 'logistics' && user.role === 'courier' && <LogisticsView purchases={purchases} orders={orders} users={users} user={user} courierId={user.id} wallet={courierWalletReady ? courierWallet : undefined} onUpdatePurchaseStatus={updatePurchaseStatus} onNavigateToWithdraw={() => setActivePage('withdraw')} />}
        {activePage === 'withdraw' && user.role === 'courier' && <WithdrawFundsView key={user.id} user={user} purchases={purchases} courierId={user.id} courierName={user.name} wallet={courierWalletReady ? courierWallet : undefined} onWithdraw={withdrawCourierEarnings} />}
      </WorkspaceLayout> : <AuthScreen theme={theme} recoveryMode={recoveryMode} serverMessage={cloudError} onToggleTheme={toggleTheme} onLogin={loginUser} onRegister={registerUser} onResetPassword={resetUserPassword} />}</Suspense>}
      {toast && <Toast key={toast.id} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  )
}

export default App
