import { useState } from 'react'
import { Check, CheckCircle2, MapPin, ShoppingBag, Wallet, XCircle } from 'lucide-react'
import { STATUS_LABELS } from '../data/statuses.js'
import { formatMoney } from '../lib/money.js'
import { newestOrderHistoryFirst, normalizeOrders } from '../lib/orders.js'
import { getFilterCounts, getParticipantOrderCategory } from '../utils/statusFilters.js'
import { Notice, PageIntro } from './Shared.jsx'
import CopyButton from './CopyButton.jsx'

function eventCountLabel(count) {
  const lastTwo = count % 100
  const lastDigit = count % 10
  if (lastDigit === 1 && lastTwo !== 11) return `${count} подія`
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} події`
  return `${count} подій`
}

function isCancelledOrder(order) {
  return Boolean(order.cancelled || ['Скасовано', 'cancelled'].includes(order.status))
}

function historyTone(status = '') {
  if (status.includes('Скасовано')) return 'red'
  if (status.includes('Оплачено') || status.includes('Отримано') || status.includes('Готово')) return 'green'
  return 'neutral'
}

function visibleOrderCode(id = '') {
  let hash = 0
  for (const character of String(id)) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0
  return `#GB-${(hash >>> 0).toString(36).toUpperCase().padStart(6, '0')}`
}

export default function OrdersView({ orders = [], totalSavings = 0, activeOrderId = null, notice = '', onDismissNotice = () => {}, onSelectOrder = () => {}, onCheckout = () => {}, onConfirmReceipt = () => {}, onNavigateToCatalog = () => {} }) {
  const [otherOrdersFilter, setOtherOrdersFilter] = useState('all')
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false)
  const safeOrders = normalizeOrders(orders)
  const selectedOrder = safeOrders.find((order) => order.id === activeOrderId)
  const activeOrder = selectedOrder
    || [...safeOrders].reverse().find((order) => !isCancelledOrder(order) && order.status !== 'Отримано')
    || safeOrders[safeOrders.length - 1]
    || null
  const currentStep = activeOrder ? Math.max(1, Math.min(STATUS_LABELS.length, Number(activeOrder.currentStep) || activeOrder.statusIndex + 1)) : 1
  const activeStatusIndex = currentStep - 1
  const cancelled = activeOrder ? isCancelledOrder(activeOrder) : false
  const received = ['Отримано', 'received'].includes(activeOrder?.status)
  const activeOrderCode = activeOrder ? visibleOrderCode(activeOrder.id) : ''
  const activeStatusBadge = cancelled
    ? activeOrder.statusBadge || 'Скасовано · Час збору вичерпано'
    : activeOrder?.statusBadge || STATUS_LABELS[activeStatusIndex]
  const history = newestOrderHistoryFirst(activeOrder?.history, {
    courierName: activeOrder?.courierName,
    pickupAddress: activeOrder?.pickupAddress,
  })
  const otherOrders = safeOrders.filter((order) => order.id !== activeOrder?.id).map((order) => {
    const orderCancelled = isCancelledOrder(order)
    return {
      id: order.id,
      name: `${order.name} · ${order.quantity} шт.`,
      status: orderCancelled ? order.statusBadge || 'Скасовано · Час збору вичерпано' : order.statusBadge || STATUS_LABELS[(Number(order.currentStep) || order.statusIndex + 1) - 1],
      tone: orderCancelled ? 'red' : order.status === 'Отримано' || order.paymentStatus === 'Оплачено' ? 'green' : 'blue',
      category: getParticipantOrderCategory(order),
      order,
    }
  })
  const otherOrderCounts = getFilterCounts(otherOrders, (order) => order.category)
  const otherOrderTabs = [
    { id: 'all', label: 'Усі' },
    { id: 'active', label: 'Активні' },
    { id: 'action', label: 'Очікують дії' },
    { id: 'completed', label: 'Завершені' },
  ].map((tab) => ({ ...tab, count: otherOrderCounts[tab.id] }))
  const visibleOtherOrders = otherOrders.filter((order) => otherOrdersFilter === 'all' || order.category === otherOrdersFilter)
  const visibleHistory = isHistoryExpanded ? history : history.slice(0, 3)

  async function confirmReceipt() {
    if (!activeOrder || confirmingReceipt) return
    setConfirmingReceipt(true)
    try {
      await onConfirmReceipt(activeOrder.purchaseId)
    } finally {
      setConfirmingReceipt(false)
    }
  }

  return (
    <div className="page-content orders-content">
      {notice && <Notice message={notice} onClose={onDismissNotice} />}
      <PageIntro label="Мої замовлення" description="Відстежуйте оплату, доставку та історію кожної закупівлі." />
      <section className="participant-kpi-grid" aria-label="Підсумок замовлень">
        <article className="panel participant-kpi-card"><span><Wallet size={19} /> Заощаджено на закупівлях</span><strong>{formatMoney(totalSavings)}</strong></article>
        <article className="panel participant-kpi-card"><span><ShoppingBag size={19} /> Мої замовлення</span><strong>{safeOrders.length}</strong></article>
      </section>
      <div className={`orders-layout ${safeOrders.length === 0 ? 'orders-layout-empty' : ''}`}>
        <section className="panel order-tracker-panel">
          {activeOrder ? <>
            <div className="order-card-heading">
              <span className="eyebrow"><span className="eyebrow-dot" /> ВАШЕ ЗАМОВЛЕННЯ</span>
              <div className="order-title-primary-row">
                <h2 className="break-words" title={`${activeOrder.name} · ${activeOrder.quantity} шт.`}>{activeOrder.name} <span>· {activeOrder.quantity} шт.</span></h2>
                <strong className="order-total-label">{formatMoney(activeOrder.total)}</strong>
              </div>
              <div className="order-title-badges"><span className="order-number-pill">{activeOrderCode}</span><CopyButton text={activeOrderCode} label="Копіювати номер" /><b className={`order-status-pill ${cancelled ? 'red' : currentStep >= 2 ? 'green' : 'blue'}`}>{activeStatusBadge}</b></div>
            </div>

            {cancelled ? (
              <div className="order-cancelled-callout" role="status">
                <XCircle size={19} />
                <div><strong>Закупівлю скасовано</strong><p>Час збору вичерпано, поріг не досягнуто. Оплата не проводилася.</p></div>
              </div>
            ) : (
              <div className="status-tracker" role="list" aria-label="Статус замовлення">
                {STATUS_LABELS.map((status, index) => {
                  const complete = received || index < activeStatusIndex
                  const current = !received && index === activeStatusIndex
                  return <div key={status} className={`status-step ${complete ? 'complete' : ''} ${current ? 'current' : ''}`} role="listitem" aria-current={current ? 'step' : undefined}>
                    <span className="status-step-number">{complete ? <Check size={18} /> : index + 1}</span>
                    <span className="status-step-label">{status}</span>
                  </div>
                })}
              </div>
            )}

            {!cancelled && <div className="pickup-banner">
              <span><MapPin size={18} /></span>
              <div className="pickup-banner-content">
                <strong>{received ? 'Замовлення отримано' : currentStep === 5 ? 'Ваше замовлення очікує на видачі' : currentStep === 2 && activeOrder.paymentStatus === 'Оплачено' ? 'Частку сплачено' : `Статус: ${activeStatusBadge}`}</strong>
                {currentStep === 5 && !received ? <div className="order-pickup-details">
                  <div className="order-pickup-address-copy">
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Точка видачі</span>
                    {activeOrder.pickupAddress && <p className="break-words leading-snug">{activeOrder.pickupAddress}</p>}
                  </div>
                  {activeOrder.pickupAddress && <CopyButton text={activeOrder.pickupAddress} label="Копіювати адресу" />}
                  <p className="order-pickup-hours">Графік роботи: {activeOrder.pickupHours || '09:00 – 21:00'}</p>
                </div> : <p className="break-words">{received ? 'Замовлення отримано. Кошти з гарантійного рахунку перераховано організатору.' : currentStep === 2 && activeOrder.paymentStatus === 'Оплачено' ? 'Очікуємо, поки організатор сформує партію.' : 'Після оплати кошти утримуються на гарантійному рахунку до отримання товару.'}</p>}
                <div className="pickup-banner-actions">
                  {currentStep === 2 && activeOrder.paymentStatus !== 'Оплачено' && <button className="primary-button receipt-confirm-button" onClick={() => onCheckout(activeOrder.purchaseId)}>Перейти до оплати частки</button>}
                  {currentStep === 5 && !received && <button className="primary-button receipt-confirm-button" disabled={confirmingReceipt} onClick={confirmReceipt}>{confirmingReceipt ? 'Підтверджуємо…' : 'Підтвердити отримання'}</button>}
                </div>
              </div>
            </div>}

            <div className="order-history">
              <div className="section-heading">
                <div><span className="eyebrow"><span className="eyebrow-dot" /> ОНОВЛЕННЯ</span><h3>Історія змін</h3></div>
                <span className="history-count">{eventCountLabel(history.length)}</span>
              </div>
              <div className="history-list">
                {visibleHistory.map((entry, index) => <div className="history-entry" key={`${entry.timestamp || entry.time}-${entry.status}-${index}`}>
                  <div className="history-entry-heading">
                    <strong className={`history-entry-status ${historyTone(entry.status)}`}>{entry.status}</strong>
                    <time>{entry.time}</time>
                  </div>
                  <p>{entry.message}</p>
                </div>)}
              </div>
              {history.length > 3 && <button className="participant-list-toggle" type="button" onClick={() => setIsHistoryExpanded((expanded) => !expanded)}>
                {isHistoryExpanded ? 'Згорнути список' : `Показати всіх (${history.length})`}
              </button>}
            </div>
            <div className="tracker-hint"><CheckCircle2 size={18} /> Статус та історія оновлюються організатором і кур’єром.</div>
          </> : <div className="orders-empty"><div className="empty-icon"><ShoppingBag size={23} /></div><h2>У вас поки немає замовлень</h2><p className="max-w-[460px] text-balance">Приєднайтеся до закупівлі, щоб відстежувати її тут.</p><button className="primary-button" onClick={onNavigateToCatalog}>Перейти до каталогу</button></div>}
        </section>

        {safeOrders.length > 0 && <aside className="panel other-orders-panel">
          <div className="section-heading other-orders-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> ОГЛЯД</span><h3>Інші замовлення</h3></div><span className="count-badge">{otherOrders.length}</span></div>
          <div className="order-filter-tabs" role="tablist" aria-label="Фільтр замовлень">
            {otherOrderTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={otherOrdersFilter === tab.id} className={`order-filter-tab ${otherOrdersFilter === tab.id ? 'selected' : ''}`} onClick={() => setOtherOrdersFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
          </div>
          <div className="other-orders-list">
            {visibleOtherOrders.map((item) => <button key={item.id} type="button" className={`other-order ${item.order ? 'clickable' : ''} ${item.id === activeOrder?.id ? 'selected' : ''}`} onClick={() => { if (item.order) { setIsHistoryExpanded(false); onSelectOrder(item.order.id) } }} disabled={!item.order}><span><strong className="break-words leading-snug" title={item.name}>{item.name}</strong><b className={`order-status-pill ${item.tone}`}>{item.status}</b></span></button>)}
            {!visibleOtherOrders.length && <p className="other-orders-empty">У цій категорії замовлень немає.</p>}
          </div>
        </aside>}
      </div>
    </div>
  )
}
