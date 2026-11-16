import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, MapPin, Package, Truck, UserRound, Users, Wallet } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { getPurchasePricing, safeNumber } from '../utils/calculations.js'
import { getCourierFinanceSummary } from '../services/dataService.js'
import { getFilterCounts, getLogisticsPurchaseCategory } from '../utils/statusFilters.js'
import { getRoleLabel } from '../utils/roles.js'
import { EmptyState } from './Shared.jsx'
import CopyButton from './CopyButton.jsx'

const FILTERS = [
  { id: 'all', label: 'Усі' },
  { id: 'active', label: 'Активні' },
  { id: 'action', label: 'Очікують дії' },
  { id: 'completed', label: 'Завершені' },
]

export default function LogisticsView({ purchases = [], orders = [], users = [], user, courierId = '', wallet, onUpdatePurchaseStatus = () => {}, onNavigateToWithdraw = () => {} }) {
  const [activeFilter, setActiveFilter] = useState('all')
  const [submittingPurchaseId, setSubmittingPurchaseId] = useState('')
  const [expandedRecipients, setExpandedRecipients] = useState({})
  const [recipientSearch, setRecipientSearch] = useState({})
  const logisticsPurchases = useMemo(() => purchases.filter((purchase) => getLogisticsPurchaseCategory(purchase)), [purchases])
  const visiblePurchases = logisticsPurchases.filter((purchase) => activeFilter === 'all' || getLogisticsPurchaseCategory(purchase) === activeFilter)
  const counts = getFilterCounts(logisticsPurchases, getLogisticsPurchaseCategory)
  const courierUser = user || { id: courierId }
  const finance = getCourierFinanceSummary(purchases, courierUser, wallet?.payouts)
  const assignedPurchases = purchases.filter((purchase) => (
    purchase.courierId === courierId
    || (courierUser.email && String(purchase.courierEmail || '').toLocaleLowerCase('uk-UA') === String(courierUser.email).toLocaleLowerCase('uk-UA'))
  ))
  const activeDeliveryCount = assignedPurchases.filter((purchase) => purchase.status === 'Доставка').length
  const deliveredPurchases = assignedPurchases.filter((purchase) => ['Точка видачі', 'Завершено'].includes(purchase.status))
  const availableEarnings = finance.availableBalance
  const usersById = new Map(users.map((user) => [user.id, user]))
  const ordersByUserId = new Map(orders.map((order) => [`${order.purchaseId}:${order.userId}`, order]))

  async function updateStatus(purchaseId, status) {
    if (submittingPurchaseId) return
    setSubmittingPurchaseId(purchaseId)
    try {
      await onUpdatePurchaseStatus(purchaseId, status)
    } finally {
      setSubmittingPurchaseId('')
    }
  }


  return (
    <div className="page-content logistics-content">
      <div className="logistics-page-heading">
        <div><span className="eyebrow"><span className="eyebrow-dot" /> {getRoleLabel('courier').toLocaleUpperCase('uk-UA')}</span><p>Приймайте підготовлені партії та оновлюйте етапи доставки.</p></div>
      </div>

      <section className="courier-summary-grid" aria-label="Підсумок доставок">
        <article className="panel courier-summary-card"><span>Активні доставки</span><strong>{activeDeliveryCount}</strong><small>У процесі маршруту</small></article>
        <article className="panel courier-summary-card"><span>Доставлено на точку</span><strong>{deliveredPurchases.length}</strong><small>Очікують підтвердження</small></article>
        <article className="panel courier-summary-card courier-wallet-card">
          <span>Доступно до виплати</span>
          <strong>{formatMoney(availableEarnings)}</strong>
          <div className="courier-kpi-footer"><small>Виплачено: {formatMoney(finance.totalWithdrawn)}</small><button type="button" className="secondary-button courier-payout-trigger" onClick={onNavigateToWithdraw}><Wallet size={18} /> Вивести кошти</button></div>
        </article>
      </section>

      <div className="order-filter-tabs logistics-tabs" role="tablist" aria-label="Фільтр партій">
        {FILTERS.map((filter) => <button key={filter.id} type="button" role="tab" aria-selected={activeFilter === filter.id} className={`order-filter-tab ${activeFilter === filter.id ? 'selected' : ''}`} onClick={() => setActiveFilter(filter.id)}>{filter.label}<span>{counts[filter.id]}</span></button>)}
      </div>

      {visiblePurchases.length ? <section className="logistics-grid" aria-label="Партії для логістики">
        {visiblePurchases.map((purchase) => {
          const participants = Array.isArray(purchase.participants) ? purchase.participants : []
          const packageCount = participants.reduce((total, person) => total + Math.max(0, Number(person.quantity) || 0), 0)
          const reward = safeNumber(purchase.deliveryTotal ?? purchase.delivery)
          const weight = safeNumber(purchase.totalWeightKg)
          const volume = safeNumber(purchase.totalVolumeL)
          const cargoSize = [weight > 0 ? `${weight} кг` : '', volume > 0 ? `${volume} л` : ''].filter(Boolean).join(' · ')
          const pricing = getPurchasePricing(purchase)
          const searchQuery = String(recipientSearch[purchase.id] || '').trim().toLocaleLowerCase('uk-UA')
          const matchingParticipants = searchQuery
            ? participants.filter((person) => {
              const contact = person.email || ordersByUserId.get(`${purchase.id}:${person.userId}`)?.userEmail || usersById.get(person.userId)?.email || ''
              return `${person.name || ''} ${contact}`.toLocaleLowerCase('uk-UA').includes(searchQuery)
            })
            : participants
          const visibleRecipients = expandedRecipients[purchase.id] || searchQuery ? matchingParticipants : matchingParticipants.slice(0, 4)
          const accepted = purchase.status === 'Оформлення'
          const inDelivery = purchase.status === 'Доставка'
          const canCopyDeliveryDetails = ['Доставка', 'Точка видачі', 'delivery', 'pickup'].includes(purchase.status)
          const assignedToOtherCourier = Boolean(purchase.courierId && courierId && purchase.courierId !== courierId)
          return <article key={purchase.id} className="panel logistics-card">
            <header className="logistics-card-heading">
              <div><span className="eyebrow"><span className="eyebrow-dot" /> ПАРТІЯ</span><h3 className="break-words" title={purchase.name}>{purchase.name}</h3></div>
              <span className={`logistics-status ${purchase.status === 'Точка видачі' || purchase.status === 'Завершено' ? 'delivered' : inDelivery ? 'in-delivery' : ''}`}>{purchase.status}</span>
            </header>

            <div className="logistics-facts">
              <div><Package size={18} /><span>Пакунки</span><strong>{packageCount} шт.</strong></div>
              <div><UserRound size={18} /><span>Організатор</span><strong className="break-words leading-snug" title={purchase.organizerName || purchase.organizer}>{purchase.organizerName || purchase.organizer}</strong></div>
              {purchase.supplier && <div><Package size={18} /><span>Магазин / постачальник</span><strong className="break-words leading-snug" title={purchase.supplier}>{purchase.supplier}</strong></div>}
              <div><Truck size={18} /><span>Винагорода кур’єра</span><strong>{formatMoney(reward)}</strong></div>
              {cargoSize && <div><Package size={18} /><span>Вага / обсяг</span><strong>{cargoSize}</strong></div>}
              <div className="logistics-pickup-fact"><MapPin size={18} /><span>Точка видачі</span><strong className="logistics-pickup-address-row" title={purchase.pickupAddress}><span className="break-words">{purchase.pickupAddress}</span>{canCopyDeliveryDetails && purchase.pickupAddress && <CopyButton text={purchase.pickupAddress} label="Копіювати адресу" />}</strong></div>
              <div><Clock3 size={18} /><span>Графік роботи</span><strong className="break-words">{purchase.pickupHours || '09:00 – 21:00'}</strong></div>
            </div>

            <div className="logistics-recipients">
              <div className="logistics-recipients-heading"><h4>Отримувачі</h4><span><Users size={18} /> {participants.length}</span></div>
              {participants.length > 5 && <label className="participant-search-label">Пошук отримувача
                <input type="search" className="text-[13px] sm:text-sm" value={recipientSearch[purchase.id] || ''} onChange={(event) => setRecipientSearch((current) => ({ ...current, [purchase.id]: event.target.value }))} placeholder="Ім’я або email" />
              </label>}
              {participants.length ? <ul>
                {visibleRecipients.map((person) => {
                  const contact = person.email || ordersByUserId.get(`${purchase.id}:${person.userId}`)?.userEmail || usersById.get(person.userId)?.email || ''
                  const validContact = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact)
                  return <li key={person.userId}>
                    <span className="logistics-recipient-main"><strong className="break-words leading-snug" title={person.name}>{person.name}</strong></span>
                    <span className="logistics-recipient-quantity">{person.quantity} шт. · {formatMoney(safeNumber(person.quantity) * pricing.unitPrice)}</span>
                    {validContact && <span className="logistics-recipient-contact w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1.5"><span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-all" title={contact}>{contact}</span>{canCopyDeliveryDetails && <CopyButton text={contact} label="Копіювати email" />}</span>}
                  </li>
                })}
              </ul> : <p>Список отримувачів порожній.</p>}
              {participants.length > 4 && !searchQuery && <button className="participant-list-toggle" type="button" onClick={() => setExpandedRecipients((current) => ({ ...current, [purchase.id]: !current[purchase.id] }))}>
                {expandedRecipients[purchase.id] ? <><ChevronUp size={18} /> Згорнути список</> : <><ChevronDown size={18} /> Показати всіх ({participants.length})</>}
              </button>}
              {searchQuery && matchingParticipants.length === 0 && <p className="participant-search-empty">За цим запитом отримувачів не знайдено.</p>}
            </div>

            {accepted && !assignedToOtherCourier && <button className="primary-button logistics-action" type="button" disabled={Boolean(submittingPurchaseId)} onClick={() => updateStatus(purchase.id, 'Доставка')}>{submittingPurchaseId === purchase.id ? 'Приймаємо партію…' : <>Прийняти в доставку <Truck size={18} /></>}</button>}
            {accepted && assignedToOtherCourier && <div className="logistics-complete-note"><Truck size={18} /> Партію закріплено за іншим кур’єром.</div>}
            {inDelivery && !assignedToOtherCourier && <button className="primary-button logistics-action" type="button" disabled={Boolean(submittingPurchaseId)} onClick={() => updateStatus(purchase.id, 'Точка видачі')}>{submittingPurchaseId === purchase.id ? 'Оновлюємо статус…' : <>Доставлено на точку видачі <MapPin size={18} /></>}</button>}
            {inDelivery && assignedToOtherCourier && <div className="logistics-complete-note"><Truck size={18} /> Партію закріплено за іншим кур’єром.</div>}
            {purchase.status === 'Точка видачі' && <div className="logistics-complete-note"><CheckCircle2 size={18} /> Партію доставлено. Очікується отримання мешканцями.</div>}
            {purchase.status === 'Завершено' && <div className="logistics-complete-note"><CheckCircle2 size={18} /> Усі замовлення отримано.</div>}
          </article>
        })}
      </section> : logisticsPurchases.length === 0 ? <EmptyState title="Немає партій, готових до доставки" message="Партії з’являться тут після оплати всіма учасниками та оформлення організатором." /> : <EmptyState title="У цій категорії партій немає" message="Оберіть інший фільтр або поверніться пізніше." />}

    </div>
  )
}
