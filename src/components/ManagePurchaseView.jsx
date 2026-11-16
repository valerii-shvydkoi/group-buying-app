import { useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck, Truck, Users, XCircle, Clock3, PackageCheck } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { calculatePurchaseDeliveryShares, percentOf, safeNumber } from '../utils/calculations.js'
import { formatCountdown, purchaseRemainingSeconds } from '../utils/purchaseTimer.js'
import { getPurchaseTransition, haveAllParticipantsPaid } from '../utils/purchaseWorkflow.js'
import { getFilterCounts, getOrganizerPurchaseCategory } from '../utils/statusFilters.js'
import { ConditionRow, EmptyState, PageIntro } from './Shared.jsx'
import CopyButton from './CopyButton.jsx'
import CustomSelect from './CustomSelect.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import { formatCourierStatusHistoryMessage } from '../services/dataService.js'

const MANAGE_STATUS_LABELS = ['Збір учасників', 'Оплата', 'Оформлення', 'Доставка', 'Точка видачі']
const MANAGE_STATUS_STEPS = Object.fromEntries(MANAGE_STATUS_LABELS.map((status, index) => [status, index + 1]))
const PURCHASE_FILTERS = [
  { id: 'all', label: 'Усі' },
  { id: 'active', label: 'Активні' },
  { id: 'action', label: 'Очікують дії' },
  { id: 'completed', label: 'Завершені' },
]

export default function ManagePurchaseView({ items = [], orders = [], ownerId = '', ownerName = '', selectedId = null, now, onSelect = () => {}, onCreateNew = () => {}, onFixDiscount = () => {}, onCancelPurchase = () => {}, onUpdatePurchaseStatus = () => {} }) {
  const [isParticipantListExpanded, setIsParticipantListExpanded] = useState(false)
  const [participantSearch, setParticipantSearch] = useState('')
  const [confirmCancelId, setConfirmCancelId] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [purchaseFilter, setPurchaseFilter] = useState('all')
  const ownedItems = items.filter((item) => ownerId ? item.organizerId === ownerId : item.organizerName === ownerName || item.organizer === ownerName)
  const filteredItems = ownedItems.filter((item) => purchaseFilter === 'all' || getOrganizerPurchaseCategory(item, orders) === purchaseFilter)
  const purchase = filteredItems.find((item) => item.id === selectedId) || filteredItems[0]
  const purchaseCounts = getFilterCounts(ownedItems, (item) => getOrganizerPurchaseCategory(item, orders))
  const purchaseFilterTabs = PURCHASE_FILTERS.map((filter) => ({ ...filter, count: purchaseCounts[filter.id] }))
  const activePurchaseCount = purchaseCounts.active
  const actionPurchaseCount = purchaseCounts.action
  const discountReadyCount = ownedItems.filter((item) => item.status === 'Збір учасників' && !(item.isDiscountFixed ?? item.discountFixed) && safeNumber(item.target) > 0 && safeNumber(item.collected) >= safeNumber(item.target)).length
  if (!purchase) return <div className="page-content manage-content">
    <PageIntro label="Мої закупівлі" description="Керуйте власними зборами та відстежуйте їхній статус." />
    <section className="organizer-kpi-grid" aria-label="Показники закупівель">
      <article className="panel organizer-kpi-card"><span><PackageCheck size={19} /> Активні збори</span><strong>{activePurchaseCount}</strong></article>
      <article className="panel organizer-kpi-card"><span><Clock3 size={19} /> Очікують дії</span><strong>{actionPurchaseCount}</strong></article>
      <article className="panel organizer-kpi-card"><span><CheckCircle2 size={19} /> Готові до фіксації знижки</span><strong>{discountReadyCount}</strong></article>
    </section>
    {ownedItems.length > 0 && <div className="order-filter-tabs organizer-filter-tabs" role="tablist" aria-label="Фільтр закупівель">{purchaseFilterTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={purchaseFilter === tab.id} className={`order-filter-tab ${purchaseFilter === tab.id ? 'selected' : ''}`} onClick={() => setPurchaseFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>}
    <EmptyState title={ownedItems.length ? 'У цій категорії закупівель немає' : 'Ви ще не створили жодної закупівлі'} message={ownedItems.length ? 'Оберіть інший фільтр, щоб переглянути закупівлі.' : 'Створіть закупівлю, щоб учасники могли долучитися до спільного замовлення.'} onReset={ownedItems.length ? () => setPurchaseFilter('all') : onCreateNew} resetLabel={ownedItems.length ? 'Показати всі закупівлі' : 'Нова закупівля'} />
  </div>

  const percentage = percentOf(purchase.collected, purchase.target)
  const reached = safeNumber(purchase.target) > 0 && safeNumber(purchase.collected) >= safeNumber(purchase.target)
  const secondsLeft = purchaseRemainingSeconds(purchase, now)
  const completed = purchase.status === 'Завершено'
  const cancelled = purchase.status === 'Скасовано' || (!reached && secondsLeft === 0)
  const urgent = !reached && !cancelled && !completed && secondsLeft < 3 * 60 * 60
  const discountFixed = Boolean(purchase.isDiscountFixed ?? purchase.discountFixed)
  const currentStep = MANAGE_STATUS_STEPS[purchase.status]
    || Math.max(1, Math.min(MANAGE_STATUS_LABELS.length, safeNumber(purchase.currentStep) || safeNumber(purchase.statusIndex) + 1))
  const participants = purchase.participants ?? []
  const hasPaidOrders = orders.some((order) => order.purchaseId === purchase.id
    && (order.paymentStatus === 'Оплачено' || order.status === 'Отримано'))
    || participants.some((person) => ['Оплачено', 'Отримано'].includes(person.payment))
  const canCancelPurchase = purchase.status === 'Збір учасників' && !discountFixed && !hasPaidOrders
  const allParticipantsPaid = haveAllParticipantsPaid(purchase, orders)
  const canFixDiscount = getPurchaseTransition({
    action: 'fix_discount',
    role: 'organizer',
    userId: ownerId || purchase.organizerId,
    purchase,
  }) === 'Оплата'
  const participantSubtotal = (person) => Math.max(1, safeNumber(person.quantity)) * safeNumber(reached ? purchase.wholesale : purchase.retail)
  const deliveryShares = new Map(calculatePurchaseDeliveryShares(purchase, participants.map((person) => ({ ...person, subtotal: participantSubtotal(person) }))).map(({ userId, deliveryShare }) => [userId, deliveryShare]))
  const participantDelivery = (person) => deliveryShares.get(person.userId) || 0
  const matchingParticipants = participantSearch.trim()
    ? participants.filter((person) => {
      const participantOrder = orders.find((order) => order.purchaseId === purchase?.id && order.userId === person.userId)
      return `${person.name || ''} ${person.email || person.userEmail || participantOrder?.userEmail || ''}`.toLocaleLowerCase('uk-UA').includes(participantSearch.trim().toLocaleLowerCase('uk-UA'))
    })
    : participants
  const visibleParticipants = participantSearch.trim() || isParticipantListExpanded ? matchingParticipants : matchingParticipants.slice(0, 4)
  const totalParticipantAmount = participants.reduce((total, person) => total + participantSubtotal(person), 0)
  const totalParticipantDelivery = participants.reduce((total, person) => total + participantDelivery(person), 0)
  function toggleParticipantList() {
    setIsParticipantListExpanded((expanded) => !expanded)
  }

  async function runAction(key, action) {
    if (busyAction) return
    setBusyAction(key)
    try {
      await action()
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="page-content manage-content">
      <div className="manage-page-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-dot" /> ПАНЕЛЬ ОРГАНІЗАТОРА</span>
          <h2 className="break-words text-base sm:text-xl font-bold leading-snug" title={purchase.name}><span className="break-words">{purchase.name}</span> <span>· керування</span></h2>
          <p>Контролюйте прогрес збору та частки доставки учасників.</p>
        </div>
        <label className="manage-select-label">Обрана закупівля
          <CustomSelect value={purchase.id} onChange={(id) => { setIsParticipantListExpanded(false); setParticipantSearch(''); onSelect(id) }} options={filteredItems.map((item) => ({ value: item.id, label: item.name }))} aria-label="Обрати закупівлю для керування" />
        </label>
      </div>

      <section className="organizer-kpi-grid" aria-label="Показники закупівель">
        <article className="panel organizer-kpi-card"><span><PackageCheck size={19} /> Активні збори</span><strong>{activePurchaseCount}</strong></article>
        <article className="panel organizer-kpi-card"><span><Clock3 size={19} /> Очікують дії</span><strong>{actionPurchaseCount}</strong></article>
        <article className="panel organizer-kpi-card"><span><CheckCircle2 size={19} /> Готові до фіксації знижки</span><strong>{discountReadyCount}</strong></article>
      </section>
      <div className="order-filter-tabs organizer-filter-tabs" role="tablist" aria-label="Фільтр закупівель">
        {purchaseFilterTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={purchaseFilter === tab.id} className={`order-filter-tab ${purchaseFilter === tab.id ? 'selected' : ''}`} onClick={() => { setPurchaseFilter(tab.id); setIsParticipantListExpanded(false); setParticipantSearch('') }}>{tab.label}<span>{tab.count}</span></button>)}
      </div>

      <div className="manage-layout">
        <div className="manage-main-column">
          <section className="panel manage-progress-panel">
            <div className="collection-heading">
              <div>
                <span className="eyebrow"><span className="eyebrow-dot" /> ПРОГРЕС ЗБОРУ</span>
                <h3><span className="collection-amount">Зібрано {formatMoney(purchase.collected)}</span><span className="collection-target">з {formatMoney(purchase.target)}</span></h3>
              </div>
              <strong className="collection-percent">{percentage}<small>%</small></strong>
            </div>
            <div className={`large-progress ${reached ? 'reached' : ''}`} role="progressbar" aria-label="Прогрес закупівлі організатора" aria-valuenow={percentage} aria-valuemin="0" aria-valuemax="100">
              <span className="transition-all duration-500 ease-out" style={{ width: `${percentage}%` }} />
            </div>
            <p className={`collection-message ${cancelled ? 'error-text' : reached ? 'success-text' : ''}`}>
              {completed ? <><CheckCircle2 size={18} /> Закупівлю успішно закрито.</> : cancelled ? 'Час збору вичерпано, поріг не досягнуто' : reached ? <><CheckCircle2 size={18} /> Поріг 100 % досягнуто! Очікуємо підтвердження гуртової ціни організатором.</> : <>Нові учасники можуть приєднатись ще на <strong>{formatMoney(purchase.target - purchase.collected).trim()}</strong>.</>}
            </p>
            {!completed && !cancelled && <div className="manage-actions">
              {purchase.status === 'Збір учасників' && <button className="primary-button lock-discount-button" disabled={!canFixDiscount || Boolean(busyAction)} onClick={() => runAction('discount', () => onFixDiscount(purchase.id))}>
                {busyAction === 'discount' ? 'Фіксуємо знижку…' : discountFixed ? <><CheckCircle2 size={18} /> Знижку зафіксовано</> : <>Зафіксувати знижку та перейти до оплати <ArrowRight size={18} /></>}
              </button>}
              {purchase.status === 'Оплата' && <button className="primary-button lock-discount-button" disabled={!allParticipantsPaid || Boolean(busyAction)} onClick={() => runAction('batch', () => onUpdatePurchaseStatus(purchase.id, 'Оформлення'))}>
                {busyAction === 'batch' ? 'Оформлюємо партію…' : <>Оформити партію та передати кур’єру <ArrowRight size={18} /></>}
              </button>}
              {['Оформлення', 'Доставка', 'Точка видачі'].includes(purchase.status) && <div className="manage-logistics-note"><Truck size={18} /> {purchase.status === 'Оформлення' ? 'Партію підготовлено — незабаром її прийме кур’єр.' : formatCourierStatusHistoryMessage(purchase.status, purchase.courierName, purchase.pickupAddress)}</div>}
            </div>}
            <p className="manage-progress-footnote"><ShieldCheck size={18} /> {purchase.status === 'Оплата' ? 'Партію можна оформити після оплати часток усіма учасниками.' : 'Після досягнення порогу організатор фіксує гуртову знижку.'}</p>
          </section>

          <section className="panel participant-table-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow"><span className="eyebrow-dot" /> УЧАСНИКИ</span>
                <h3>Учасники і частки доставки</h3>
              </div>
              <span className="count-badge">{participants.length}</span>
            </div>
            {participants.length ? <>
              {participants.length > 5 && <label className="participant-search-label">Пошук учасника
                <input type="search" className="text-[13px] sm:text-sm" value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="Ім’я або email" />
              </label>}
              <div className="participant-table-wrap">
                <table className="participant-table">
                  <thead><tr><th>Учасник</th><th>К-сть</th><th>Сума</th><th>Доставка</th><th>Оплата</th></tr></thead>
                  <tbody>
                    {visibleParticipants.map((person) => {
                      const matchingOrder = orders.find((order) => order.purchaseId === purchase.id && order.userId === person.userId)
                      const email = String(person.email || person.userEmail || matchingOrder?.userEmail || '').trim()
                      const validEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
                      const contactIsActive = !['Завершено', 'Скасовано', 'Отримано', 'received', 'cancelled'].includes(purchase.status)
                        && !['Отримано', 'Скасовано', 'received', 'cancelled'].includes(person.payment)
                      return <tr key={person.id}>
                        <td>
                          <strong className="break-words" title={person.name}>{person.name}</strong>
                          {validEmail && <div className="manage-participant-contact w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1.5">
                            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-all" title={email}>{email}</span>
                            {contactIsActive && <CopyButton text={email} label="Копіювати email" />}
                          </div>}
                        </td>
                        <td>{person.quantity}</td>
                        <td>{formatMoney(participantSubtotal(person))}</td>
                        <td>{formatMoney(participantDelivery(person))}</td>
                        <td><span className={`payment-status ${person.payment === 'Отримано' ? 'received' : ''}`}>{person.payment || 'Очікує'}</span></td>
                      </tr>
                    })}
                  </tbody>
                  <tfoot><tr><td>Разом</td><td>{participants.reduce((total, person) => total + safeNumber(person.quantity), 0)}</td><td>{formatMoney(totalParticipantAmount)}</td><td>{formatMoney(totalParticipantDelivery)}</td><td>{completed ? 'Отримано' : reached ? 'Поріг 100%' : `${percentage}%`}</td></tr></tfoot>
                </table>
              </div>
              {matchingParticipants.length > 4 && !participantSearch.trim() && <button className="participant-list-toggle" type="button" onClick={toggleParticipantList}>
                {isParticipantListExpanded ? <><ChevronUp size={18} /> Згорнути список</> : <><ChevronDown size={18} /> Показати всіх ({participants.length})</>}
              </button>}
              {participantSearch.trim() && matchingParticipants.length === 0 && <p className="participant-search-empty">За цим запитом учасників не знайдено.</p>}
            </> : <div className="table-empty"><Users size={20} /><span>Учасники з’являться тут після приєднання.</span></div>}
          </section>
        </div>

        <aside className="manage-side-column">
          <section className="panel conditions-panel">
            <div className="section-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> УМОВИ</span><h3>Умови закупівлі</h3></div></div>
            <ConditionRow label="Роздрібна ціна" value={formatMoney(purchase.retail)} />
            <ConditionRow label="Гуртова ціна" value={formatMoney(purchase.wholesale)} success />
            <ConditionRow label="Мінімальний поріг" value={formatMoney(purchase.target)} />
            <ConditionRow label="Доставка" value={formatMoney(purchase.delivery)} />
            {purchase.pickupAddress && <div className="manage-pickup-condition"><span className="manage-pickup-label">Точка видачі</span><span className="manage-pickup-address">{purchase.pickupAddress}</span></div>}
            <ConditionRow label="Таймер" value={completed ? 'Збір завершено · 100 %' : cancelled ? 'Скасовано' : reached ? 'Збір завершено · 100 %' : formatCountdown(secondsLeft)} urgent={urgent} />
            {canCancelPurchase && <div className="manage-cancel-condition"><p>Скасування закриє збір і повідомить учасників.</p><button type="button" className="cancel-purchase-button" disabled={Boolean(busyAction)} onClick={() => setConfirmCancelId(purchase.id)}><XCircle size={18} /> Скасувати закупівлю</button></div>}
          </section>

          <section className="panel manage-status-panel">
            <div className="section-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> ЕТАП ЗАКУПІВЛІ</span><h3>Статус</h3></div></div>
            {completed ? <div className="manage-finished-callout"><CheckCircle2 size={19} /><strong>Усі учасники отримали замовлення · Закупівлю успішно закрито</strong></div> : cancelled ? <div className="manage-logistics-note error-text">Закупівлю скасовано: час збору вичерпано, поріг не досягнуто.</div> : <>
              <div className="manage-status-list">
                {MANAGE_STATUS_LABELS.map((status, index) => <span key={status} className={`manage-status-chip ${currentStep === index + 1 ? 'active' : ''} ${currentStep > index + 1 ? 'completed' : ''}`}>{status}</span>)}
              </div>
              <p>{purchase.status === 'Збір учасників' && reached
                  ? 'Поріг 100 % досягнуто! Очікуємо підтвердження гуртової ціни організатором.'
                  : purchase.status === 'Оплата' && !allParticipantsPaid
                    ? 'Очікується оплата від усіх учасників.'
                    : purchase.status === 'Оплата' && allParticipantsPaid
                      ? 'Усі частки сплачено — можна оформити партію та передати кур’єру.'
                      : `Поточний етап: ${purchase.status}.`}</p>
            </>}
          </section>

        </aside>
      </div>
      <ConfirmModal
        open={confirmCancelId === purchase.id}
        title="Скасувати закупівлю?"
        message="Збір буде закрито, а неоплачені замовлення учасників скасовано. Цю дію не можна буде скасувати."
        confirmLabel="Так, скасувати"
        cancelLabel="Залишити закупівлю"
        danger
        busy={busyAction === 'cancel'}
        onClose={() => setConfirmCancelId(null)}
        onConfirm={() => runAction('cancel', async () => { await onCancelPurchase(purchase.id); setConfirmCancelId(null) })}
      />
    </div>
  )
}
