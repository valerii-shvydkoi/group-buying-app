import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDeliveryShare,
  calculatePurchaseDeliveryShare,
  calculateSavings,
  getPurchasePricing,
} from '../src/utils/calculations.js'
import { isValidEmail, isValidPassword, parseNonNegativeInteger, validateOrganizerForm } from '../src/utils/validation.js'
import { fullNameMatchesEitherOrder, isValidPersonName, namesMatchEitherOrder, sanitizePersonName } from '../src/utils/personName.js'
import { purchaseRemainingSeconds, PURCHASE_TIMER_OPTIONS } from '../src/utils/purchaseTimer.js'
import { getRoleLabel } from '../src/utils/roles.js'
import { sanitizeImageUrl } from '../src/utils/safeUrl.js'
import { localizeAuthError } from '../src/utils/authErrors.js'
import { formatBinLastFourPreview, formatPaymentCardInput, formatSavedCardNumber, getPaymentCardBrand } from '../src/utils/paymentCard.js'
import { calculateCourierAvailableBalance, calculateCourierEarnings } from '../src/utils/courierWallet.js'
import { formatIbanPreview, formatSavedIban, formatUkrainianIban, isValidUkrainianIban, normalizeIbanInput, normalizeUkrainianIban } from '../src/utils/iban.js'
import { newestOrderHistoryFirst, normalizeOrderHistory, normalizeOrders } from '../src/lib/orders.js'
import { calculatePurchaseDeliveryShares, formatCourierStatusHistoryMessage, getCourierFinanceSummary, requestCourierPayout, saveCourierCard, saveCourierIban } from '../src/services/dataService.js'
import { getFilterCounts, getLogisticsPurchaseCategory, getOrganizerPurchaseCategory, getParticipantOrderCategory } from '../src/utils/statusFilters.js'
import {
  getPurchaseStatusAfterReceipt,
  getPurchaseTransition,
  haveAllParticipantsPaid,
  normalizeQuantity,
} from '../src/utils/purchaseWorkflow.js'

test('пропорційна доставка розподіляється відповідно до 25% і 75%', () => {
  assert.equal(calculateDeliveryShare(1000, 2500, 10000, 10000), 250)
  assert.equal(calculateDeliveryShare(1000, 7500, 10000, 10000), 750)
})

test('один учасник, який покрив поріг, сплачує всю доставку за гуртовою ціною', () => {
  const purchase = {
    retail: 1000,
    wholesale: 800,
    target: 10000,
    collected: 10000,
    delivery: 5000,
    participants: [{ userId: 'user-1', quantity: 10 }],
  }
  const pricing = getPurchasePricing(purchase)
  assert.equal(pricing.reached, true)
  assert.equal(pricing.unitPrice, 800)
  assert.equal(calculatePurchaseDeliveryShare(purchase, 8000), 5000)
  assert.equal(calculateSavings(1000, 800, 10), 2000)
})

test('розподіл доставки коригує округлення так, щоб сума дорівнювала вартості партії', () => {
  const participants = Array.from({ length: 7 }, (_, index) => ({ userId: `user-${index}`, quantity: 1, subtotal: 80 }))
  const shares = calculatePurchaseDeliveryShares({
    retail: 100,
    wholesale: 80,
    target: 700,
    collected: 700,
    deliveryTotal: 100,
    participants,
  }, participants)

  assert.equal(shares.reduce((sum, item) => sum + item.deliveryShare, 0), 100)
  assert.equal(shares[0].deliveryShare, 16)
  assert.ok(shares.slice(1).every((item) => item.deliveryShare === 14))
})

test('доставка розподіляється без втрат для закупівель із 1, 3 та 10 учасниками', () => {
  for (const quantities of [[10], [3, 3, 4], Array(10).fill(1)]) {
    const participants = quantities.map((quantity, index) => ({ userId: `buyer-${index}`, quantity }))
    const totalQuantity = quantities.reduce((sum, quantity) => sum + quantity, 0)
    const deliveryTotal = 1001
    const purchase = {
      retail: 100,
      wholesale: 80,
      target: totalQuantity * 100,
      collected: totalQuantity * 100,
      deliveryTotal,
      participants,
    }
    const shares = calculatePurchaseDeliveryShares(purchase, participants)
    assert.equal(shares.length, quantities.length)
    assert.equal(shares.reduce((sum, entry) => sum + entry.deliveryShare, 0), deliveryTotal)
    assert.ok(shares.every((entry) => entry.deliveryShare >= 0))
  }
})

test('фільтри закупівель, замовлень і доставок мають взаємовиключні категорії та точні лічильники', () => {
  const purchases = [
    { status: 'collecting', collected: 400, target: 800 },
    { status: 'Збір учасників', collected: 800, target: 800 },
    { status: 'Скасовано' },
  ]
  const organizerCategories = purchases.map((purchase) => getOrganizerPurchaseCategory(purchase))
  const organizerCounts = getFilterCounts(purchases, (purchase) => getOrganizerPurchaseCategory(purchase))
  assert.deepEqual(organizerCategories, ['active', 'action', 'completed'])
  assert.equal(organizerCounts.all, purchases.length)
  for (const category of ['active', 'action', 'completed']) {
    assert.equal(organizerCounts[category], organizerCategories.filter((value) => value === category).length)
  }

  const orders = [
    { status: 'Оплата', currentStep: 2, paymentStatus: 'Очікує' },
    { status: 'Доставка', currentStep: 4, paymentStatus: 'Оплачено' },
    { status: 'Отримано', currentStep: 5, paymentStatus: 'Оплачено' },
  ]
  assert.deepEqual(orders.map(getParticipantOrderCategory), ['action', 'active', 'completed'])

  const logistics = [{ status: 'Оформлення' }, { status: 'Доставка' }, { status: 'pickup' }]
  const logisticsCategories = logistics.map(getLogisticsPurchaseCategory)
  const logisticsCounts = getFilterCounts(logistics, getLogisticsPurchaseCategory)
  assert.deepEqual(logisticsCategories, ['action', 'active', 'completed'])
  assert.equal(logisticsCounts.all, logistics.length)
  assert.equal(logisticsCounts.action + logisticsCounts.active + logisticsCounts.completed, logistics.length)
})

test('історія кур’єра формує зрозумілий текст з ім’ям та адресою, а список прибирає дублікати й сортує час', () => {
  assert.equal(
    formatCourierStatusHistoryMessage('Доставка', 'Іван Петренко', 'вул. Садова, 10'),
    'Кур’єр Іван Петренко прийняв замовлення на доставку та вирушив до точки видачі.',
  )
  assert.equal(
    formatCourierStatusHistoryMessage('Точка видачі', 'Іван Петренко', 'вул. Садова, 10'),
    'Кур’єр Іван Петренко доставив замовлення на точку видачі (вул. Садова, 10). Товар очікує на отримання.',
  )
  const history = normalizeOrderHistory([
    { status: 'Доставка', message: 'Кур’єр прийняв партію.', timestamp: '2026-01-02T10:00:00.000Z' },
    { status: 'Оплата', message: 'Оплата пройшла.', timestamp: '2026-01-01T10:00:00.000Z' },
    { status: 'Доставка', message: 'Кур’єр прийняв партію.', timestamp: '2026-01-02T10:00:00.000Z' },
  ])
  assert.deepEqual(history.map((entry) => entry.status), ['Оплата', 'Доставка'])
  const legacy = normalizeOrderHistory([
    { status: 'Доставка', message: 'Етап доставки «Доставка» оновлюється кур’єром у розділі «Доставки».', timestamp: '2026-01-02T10:00:00.000Z' },
    { status: 'Точка видачі', message: 'Етап доставки «Точка видачі» оновлюється кур’єром у розділі «Доставки».', timestamp: '2026-01-03T10:00:00.000Z' },
  ], { courierName: 'Іван Петренко', pickupAddress: 'вул. Садова, 10' })
  assert.deepEqual(legacy.map((entry) => entry.message), [
    'Кур’єр Іван Петренко прийняв замовлення на доставку та вирушив до точки видачі.',
    'Кур’єр Іван Петренко доставив замовлення на точку видачі (вул. Садова, 10). Товар очікує на отримання.',
  ])
  assert.deepEqual(newestOrderHistoryFirst(legacy).map((entry) => entry.status), ['Точка видачі', 'Доставка'])
  const restoredOrder = normalizeOrders([{
    id: 'order-legacy',
    purchaseId: 'purchase-legacy',
    userId: 'participant-1',
    name: 'Тестовий товар',
    status: 'Точка видачі',
    courierName: 'Іван Петренко',
    pickupAddress: 'вул. Садова, 10',
    history: [{ status: 'Точка видачі', message: 'Етап доставки «Точка видачі» оновлюється кур’єром у розділі «Доставки».', timestamp: '2026-01-03T10:00:00.000Z' }],
  }])[0]
  assert.equal(restoredOrder.history[0].message, legacy[1].message)
  const migratedFromLegacyStorage = normalizeOrders([{
    id: 'order-legacy-storage', purchaseId: 'purchase-legacy', userId: 'participant-1', name: 'Тестовий товар',
    status: 'Доставка', history: [{ status: 'Доставка', message: 'Етап доставки «Доставка» оновлюється кур’єром у розділі «Доставки».', timestamp: '2026-01-02T10:00:00.000Z' }],
  }])[0]
  const hydratedOrder = normalizeOrders([{ ...migratedFromLegacyStorage, courierName: 'Іван Петренко', pickupAddress: 'вул. Садова, 10' }])[0]
  assert.equal(hydratedOrder.history[0].message, legacy[0].message)
  assert.match(formatCourierStatusHistoryMessage('Доставка', '', ''), /Кур’єр сервісу/)
})

test('дохід кур’єра враховує лише його доставлені партії', () => {
  const purchases = [
    { courierId: 'courier-1', status: 'Точка видачі', deliveryTotal: 1200 },
    { courierId: 'courier-1', status: 'Завершено', deliveryTotal: 800 },
    { courierId: 'courier-1', status: 'Отримано', deliveryTotal: 250 },
    { courierId: 'courier-1', status: 'Доставка', deliveryTotal: 500 },
    { courierId: 'courier-2', status: 'Завершено', deliveryTotal: 900 },
  ]

  assert.equal(calculateCourierEarnings(purchases, 'courier-1'), 2250)
  assert.equal(calculateCourierEarnings(purchases, 'courier-2'), 900)
})

test('доступний баланс віднімає лише підтверджені виплати від усіх доставлених партій', () => {
  const purchases = [
    { courierId: 'courier-1', status: 'Точка видачі', deliveryTotal: 1200 },
    { courierId: 'courier-1', status: 'Завершено', deliveryTotal: 800 },
    { courierId: 'courier-1', status: 'Отримано', deliveryTotal: 500 },
    { courierId: 'courier-1', status: 'Доставка', deliveryTotal: 500 },
  ]
  const payouts = [
    { amount: 300, status: 'Виплачено' },
    { amount: 200, status: 'В обробці' },
  ]
  assert.equal(calculateCourierAvailableBalance(purchases, 'courier-1', payouts), 2200)
})

test('зведення фінансів кур’єра одразу враховує партію на точці та підтверджені виплати', () => {
  const user = { id: 'courier-1', email: 'courier@example.com' }
  const purchases = [{ courierId: user.id, courierEmail: user.email, status: 'pickup', deliveryCost: 250 }]
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const storage = new Map()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key) => storage.get(key) ?? null } },
  })
  try {
    assert.deepEqual(getCourierFinanceSummary(purchases, user), {
      totalEarned: 250,
      totalWithdrawn: 0,
      availableBalance: 250,
    })
    storage.set('gb_courier_payouts_v1', JSON.stringify([
      { userId: user.id, amount: 100, status: 'Виплачено' },
      { userId: 'other-courier', amount: 900, status: 'Виплачено' },
      { userId: user.id, amount: 80, status: 'В обробці' },
    ]))
    assert.deepEqual(getCourierFinanceSummary(purchases, user), {
      totalEarned: 250,
      totalWithdrawn: 100,
      availableBalance: 150,
    })
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
  }
})

test('український IBAN нормалізується, форматується та перевіряє UA + 27 цифр', () => {
  const iban = 'UA213223130000026007233566001'
  assert.equal(iban.length, 29)
  assert.equal(normalizeUkrainianIban('ua21 3223 1300 0002 6007 2335 6600 1'), iban)
  assert.equal(formatUkrainianIban(iban), 'UA21 3223 1300 0002 6007 2335 6600 1')
  assert.equal(isValidUkrainianIban(iban), true)
  assert.equal(isValidUkrainianIban('UA21322313000002600723356600'), false)
  assert.equal(isValidUkrainianIban('GB213223130000026007233566001'), false)
})

test('ввід IBAN додає UA, підтримує вставлення без префікса та дозволяє стерти префікс', () => {
  assert.equal(normalizeIbanInput('2132 2313 0000 0260 0723 3566 001'), 'UA213223130000026007233566001')
  assert.equal(normalizeIbanInput('ua21 3223 1300 0002 6007 2335 6600 1'), 'UA213223130000026007233566001')
  assert.equal(normalizeIbanInput('2'), 'UA2')
  assert.equal(normalizeIbanInput('UA', { deleting: true }), '')
  assert.equal(normalizeIbanInput('U', { deleting: true }), '')
  assert.equal(normalizeIbanInput('A', { deleting: true }), '')
  assert.equal(normalizeIbanInput('', { deleting: true }), '')
})

test('IBAN previews mask middle digits and only expose a saved account suffix', () => {
  const iban = 'UA213223130000026007233566001'
  assert.equal(formatIbanPreview(iban), 'UA21 •••• •••• •••• 6001')
  assert.equal(formatIbanPreview('UA2132'), 'UA21 •••• •••• •••• ••••')
  assert.equal(formatSavedIban('6001'), 'IBAN •••• 6001')
})

test('історія замовлення прибирає дублікати та показує події у хронологічному порядку', () => {
  const [order] = normalizeOrders([{
    id: 'order-1',
    purchaseId: 'purchase-1',
    userId: 'user-1',
    name: 'Кава',
    history: [
      { status: 'Оплата', message: 'Частку сплачено.', time: '16.11, 10:01', timestamp: '2026-11-16T10:01:00.000Z' },
      { status: 'Оплата', message: 'Частку сплачено.', time: '16.11, 10:01', timestamp: '2026-11-16T10:01:02.000Z' },
      { status: 'Точка видачі', message: 'Партію доставлено.', time: '16.11, 10:02', timestamp: '2026-11-16T10:02:00.000Z' },
    ],
  }])

  assert.deepEqual(order.history.map((entry) => entry.status), ['Оплата', 'Точка видачі'])
})

test('гуртова ціна вмикається рівно на порозі, економія рахується за кількістю', () => {
  assert.equal(getPurchasePricing({ retail: 500, wholesale: 400, target: 10000, collected: 9999 }).reached, false)
  assert.equal(getPurchasePricing({ retail: 500, wholesale: 400, target: 10000, collected: 10000 }).unitPrice, 400)
  assert.equal(calculateSavings(500, 400, 4), 400)
})

test('життєвий цикл переходить між етапами тільки з потрібною роллю та умовами', () => {
  let purchase = { id: 'p1', organizerId: 'org1', status: 'Збір учасників', collected: 10000, target: 10000, isDiscountFixed: false, participants: [] }
  assert.equal(getPurchaseTransition({ action: 'fix_discount', role: 'participant', userId: 'org1', purchase }), null)
  assert.equal(getPurchaseTransition({ action: 'fix_discount', role: 'organizer', userId: 'org2', purchase }), null)
  assert.equal(getPurchaseTransition({ action: 'fix_discount', role: 'organizer', userId: 'org1', purchase: { ...purchase, collected: 9999 } }), null)
  assert.equal(getPurchaseTransition({ action: 'fix_discount', role: 'organizer', userId: 'org1', purchase }), 'Оплата')

  purchase = { ...purchase, status: 'Оплата', isDiscountFixed: true }
  assert.equal(getPurchaseTransition({ action: 'form_batch', role: 'organizer', userId: 'org1', purchase, allParticipantsPaid: false }), null)
  assert.equal(getPurchaseTransition({ action: 'form_batch', role: 'organizer', userId: 'org1', purchase, allParticipantsPaid: true }), 'Оформлення')

  purchase = { ...purchase, status: 'Оформлення' }
  assert.equal(getPurchaseTransition({ action: 'accept_delivery', role: 'participant', userId: 'buyer1', purchase, allParticipantsPaid: true }), null)
  assert.equal(getPurchaseTransition({ action: 'accept_delivery', role: 'courier', userId: 'courier1', purchase, allParticipantsPaid: false }), null)
  assert.equal(getPurchaseTransition({ action: 'accept_delivery', role: 'courier', userId: 'courier1', purchase, allParticipantsPaid: true }), 'Доставка')

  purchase = { ...purchase, status: 'Доставка', courierId: 'courier1' }
  assert.equal(getPurchaseTransition({ action: 'deliver_to_pickup', role: 'courier', userId: 'courier2', purchase }), null)
  assert.equal(getPurchaseTransition({ action: 'deliver_to_pickup', role: 'courier', userId: 'courier1', purchase }), 'Точка видачі')

  purchase = { ...purchase, status: 'Точка видачі' }
  const order = { userId: 'buyer1', status: 'Точка видачі', currentStep: 5 }
  assert.equal(getPurchaseTransition({ action: 'confirm_receipt', role: 'organizer', userId: 'buyer1', purchase, order }), null)
  assert.equal(getPurchaseTransition({ action: 'confirm_receipt', role: 'participant', userId: 'buyer2', purchase, order }), null)
  assert.equal(getPurchaseTransition({ action: 'confirm_receipt', role: 'participant', userId: 'buyer1', purchase, order }), 'Отримано')
  assert.equal(getPurchaseStatusAfterReceipt(purchase, false), 'Точка видачі')
  assert.equal(getPurchaseStatusAfterReceipt(purchase, true), 'Завершено')
})

test('партію можна оформити лише коли сплатили всі її учасники', () => {
  const purchase = {
    id: 'p1',
    participants: [{ userId: 'u1', payment: 'Оплачено' }, { userId: 'u2', payment: 'Оплачено' }],
  }
  const orders = [
    { purchaseId: 'p1', userId: 'u1', paymentStatus: 'Оплачено' },
    { purchaseId: 'p1', userId: 'u2', paymentStatus: 'Очікує' },
  ]
  assert.equal(haveAllParticipantsPaid(purchase, orders), false)
  assert.equal(haveAllParticipantsPaid(purchase, orders.map((order) => ({ ...order, paymentStatus: 'Оплачено' }))), true)
})

test('прострочений збір скасовується, але досягнутий поріг не скасовується', () => {
  const expired = { status: 'Збір учасників', collected: 999, target: 1000, expiresAt: 1000 }
  assert.equal(getPurchaseTransition({ action: 'expire_purchase', purchase: expired, now: 1000 }), 'Скасовано')
  assert.equal(getPurchaseTransition({ action: 'expire_purchase', purchase: { ...expired, collected: 1000 }, now: 1000 }), null)
  assert.equal(getPurchaseTransition({ action: 'expire_purchase', purchase: expired, now: 999 }), null)
  assert.equal(purchaseRemainingSeconds({ expiresAt: 1000 }, 1000), 0)
  assert.deepEqual(PURCHASE_TIMER_OPTIONS.map(({ seconds }) => seconds), [30, 10800, 86400, 259200, 604800, 1209600])
})

test('участь дозволена лише покупцю до фіксації знижки та до кінця таймера', () => {
  const purchase = { status: 'Збір учасників', collected: 100, target: 1000, expiresAt: 5000, isDiscountFixed: false }
  assert.equal(getPurchaseTransition({ action: 'join_purchase', role: 'organizer', userId: 'org1', purchase, now: 1000 }), null)
  assert.equal(getPurchaseTransition({ action: 'join_purchase', role: 'participant', userId: 'buyer1', purchase, now: 1000 }), 'Збір учасників')
  assert.equal(getPurchaseTransition({ action: 'join_purchase', role: 'participant', userId: 'buyer1', purchase, now: 5000 }), null)
  assert.equal(getPurchaseTransition({ action: 'leave_purchase', role: 'participant', userId: 'buyer1', purchase, order: { userId: 'buyer1', currentStep: 1, paymentStatus: 'Очікує' } }), 'Збір учасників')
  assert.equal(getPurchaseTransition({ action: 'leave_purchase', role: 'participant', userId: 'buyer1', purchase: { ...purchase, isDiscountFixed: true }, order: { userId: 'buyer1', currentStep: 1, paymentStatus: 'Очікує' } }), null)
  assert.equal(getPurchaseTransition({ action: 'join_purchase', role: 'participant', userId: 'buyer1', purchase: { ...purchase, status: 'Оплата', isDiscountFixed: true } }), null)
  assert.equal(getPurchaseTransition({ action: 'leave_purchase', role: 'participant', userId: 'buyer1', purchase: { ...purchase, status: 'Оплата', isDiscountFixed: true }, order: { userId: 'buyer1', currentStep: 2, paymentStatus: 'Очікує' } }), null)
})

test('ролі мають окремі дозволи, а назви відображаються однозначно', () => {
  const purchase = { organizerId: 'org1', status: 'Збір учасників', target: 10, collected: 10 }
  assert.equal(getPurchaseTransition({ action: 'fix_discount', role: 'organizer', userId: 'org1', purchase }), 'Оплата')
  assert.equal(getPurchaseTransition({ action: 'fix_discount', role: 'participant', userId: 'org1', purchase }), null)
  assert.equal(getPurchaseTransition({ action: 'cancel_purchase', role: 'organizer', userId: 'other', purchase }), null)
  assert.equal(getRoleLabel('participant'), 'Учасник')
  assert.equal(getRoleLabel('organizer'), 'Організатор')
  assert.equal(getRoleLabel('courier'), 'Кур’єр')
})

test('URL зображень приймають лише HTTP(S)', () => {
  assert.equal(sanitizeImageUrl('javascript:alert(1)'), '')
  assert.equal(sanitizeImageUrl('data:image/svg+xml,<svg onload=alert(1)>'), '')
  assert.equal(sanitizeImageUrl('https://images.example/item.png'), 'https://images.example/item.png')
  assert.equal(sanitizeImageUrl('http://images.example/item.png'), 'http://images.example/item.png')
})

test('валідатор закупівлі відхиляє некоректні ціни й приймає повний коректний лот', () => {
  const valid = {
    name: 'Кава зернова', category: 'Продукти', supplier: 'Метро', retail: '500', wholesale: '400',
    target: '10000', delivery: '1000', timer: '86400', pickupAddress: 'ЖК Сонячний',
    pickupHours: '', description: '',
  }
  assert.deepEqual(Object.values(validateOrganizerForm(valid)), Array(Object.keys(validateOrganizerForm(valid)).length).fill(''))
  assert.equal(validateOrganizerForm({ ...valid, wholesale: '500' }).wholesale, 'Має бути нижчою за роздрібну')
  assert.equal(validateOrganizerForm({ ...valid, retail: 'NaN' }).retail !== '', true)
  assert.equal(parseNonNegativeInteger('-1'), null)
  assert.equal(parseNonNegativeInteger('Infinity'), null)
  assert.equal(parseNonNegativeInteger('1e3'), null)
})

test('кількість завжди ціла та обмежена діапазоном 1–100', () => {
  assert.equal(normalizeQuantity(4.9), 4)
  assert.equal(normalizeQuantity(0), 1)
  assert.equal(normalizeQuantity(-10), 1)
  assert.equal(normalizeQuantity(Number.NaN), 1)
  assert.equal(normalizeQuantity(Number.POSITIVE_INFINITY), 1)
  assert.equal(normalizeQuantity(101), 100)
  assert.equal(normalizeQuantity(1001), 100)
  assert.equal(normalizeOrders([{ id: 'order-quantity', purchaseId: 'purchase-1', userId: 'user-1', name: 'Кава', quantity: 101 }])[0].quantity, 100)
})

test('виплата та збережені реквізити не записують повний номер картки або IBAN', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const storage = new Map()
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage, dispatchEvent() {} },
  })
  try {
    const cardNumber = '4149000000000000'
    const iban = 'UA213223130000026007233566001'
    const savedCard = saveCourierCard({ courierId: 'courier-test', cardNumber, holderName: 'Андрій Мельник' })
    const savedIban = saveCourierIban({ courierId: 'courier-test', iban, holderName: 'Андрій Мельник' })
    const payout = await requestCourierPayout({
      courierId: 'courier-test', recipientType: 'card', cardNumber, holderName: 'Андрій Мельник', amount: 100, earnedTotal: 250,
    })

    assert.equal(savedCard.last4, '0000')
    assert.equal(savedIban.last4, '6001')
    assert.equal(payout.amount, 100)
    assert.equal(payout.last4, '0000')
    assert.equal(payout.type, 'card')
    for (const [key, value] of storage) {
      if (key.includes('courier_cards') || key.includes('courier_ibans') || key.includes('courier_payouts')) {
        assert.equal(String(value).includes(cardNumber), false, `PAN must not be stored in ${key}`)
        assert.equal(String(value).includes(iban), false, `IBAN must not be stored in ${key}`)
      }
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
  }
})

test('маски імені, email та пароля відхиляють некоректні значення', () => {
  assert.equal(sanitizePersonName('4марія@'), 'Марія')
  assert.equal(isValidPersonName('Оля'), true)
  assert.equal(isValidPersonName('A1'), false)
  assert.equal(isValidPersonName("Jean-Luc"), true)
  assert.equal(isValidEmail('user@example.com'), true)
  assert.equal(isValidEmail('user@localhost'), false)
  assert.equal(isValidEmail('bad email@example.com'), false)
  assert.equal(isValidPassword('12345678'), true)
  assert.equal(isValidPassword('short'), false)
  assert.equal(isValidPassword('x'.repeat(65)), false)
})

test('перевірка профілю допускає ім’я та прізвище в обох порядках', () => {
  assert.equal(namesMatchEitherOrder('Олена', 'Коваль', 'Олена', 'Коваль'), true)
  assert.equal(namesMatchEitherOrder('Олена', 'Коваль', 'Коваль', 'Олена'), true)
  assert.equal(fullNameMatchesEitherOrder('Олена Коваль', 'Коваль', 'Олена'), true)
  assert.equal(fullNameMatchesEitherOrder('Олена Коваль', 'Олена', 'Іваненко'), false)
})

test('системні помилки авторизації відображаються українською', () => {
  const translations = [
    ['Invalid login credentials', 'Невірний email або пароль'],
    ['invalid_credentials', 'Невірний email або пароль'],
    ['User already registered', 'Користувач із такою електронною поштою вже зареєстрований'],
    ['Email not confirmed', 'Електронну пошту не підтверджено'],
    ['Password should be at least 8 characters', 'Пароль має містити щонайменше 8 символів'],
    ['Unable to validate email address: Invalid email', 'Введіть коректну адресу електронної пошти'],
    ['For security purposes, you can only request this after 60 seconds', 'Забагато спроб. Зачекайте трохи та спробуйте ще раз'],
    ['Failed to fetch', 'Помилка з’єднання з сервером. Перевірте інтернет-підключення'],
    ['Could not find the function public.reset_user_password(p_email, p_first_name, p_last_name, p_new_password) in the schema cache', 'Оновіть SQL-функцію reset_user_password у Supabase SQL Editor'],
    ['function public.reset_user_password(text, text, text, text) does not exist', 'Оновіть SQL-функцію reset_user_password у Supabase SQL Editor'],
  ]

  for (const [message, expected] of translations) {
    assert.equal(localizeAuthError(message), expected)
  }
  assert.equal(localizeAuthError(new Error('Невірний email або пароль')), 'Невірний email або пароль')
  assert.equal(localizeAuthError('Акаунт із такою електронною поштою не знайдено'), 'Акаунт із такою електронною поштою не знайдено')
  assert.equal(localizeAuthError('Ім’я або прізвище не збігаються з даними профілю'), 'Ім’я або прізвище не збігаються з даними профілю')
  assert.equal(localizeAuthError('Unexpected server response'), 'Не вдалося виконати операцію. Перевірте введені дані')
})

test('номер картки показує лише перші чотири та останні чотири цифри в прев’ю', () => {
  assert.equal(formatPaymentCardInput('4149 49ab'), '4149 49')
  assert.equal(formatBinLastFourPreview(''), '•••• •••• •••• ••••')
  assert.equal(formatBinLastFourPreview('414949'), '4149 •••• •••• ••••')
  assert.equal(formatBinLastFourPreview('41494912345656'), '4149 •••• •••• 56••')
  assert.equal(formatBinLastFourPreview('4149491234565678'), '4149 •••• •••• 5678')
  assert.equal(formatSavedCardNumber('5678'), '•••• •••• •••• 5678')
})

test('бренд платіжної картки визначається з першої цифри', () => {
  assert.equal(getPaymentCardBrand('4'), 'Visa')
  assert.equal(getPaymentCardBrand('5 375'), 'Mastercard')
  assert.equal(getPaymentCardBrand('2'), 'Mastercard')
  assert.equal(getPaymentCardBrand('9'), 'Простір')
  assert.equal(getPaymentCardBrand(''), 'Банківська картка')
})
