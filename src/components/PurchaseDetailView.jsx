import { useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock3, MapPin, Package, ShieldCheck, Truck, Users } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { calculatePurchaseDeliveryShares, getPurchasePricing, percentOf, safeNumber } from '../utils/calculations.js'
import { formatCountdownHours, purchaseRemainingSeconds } from '../utils/purchaseTimer.js'
import { PRODUCT_ICONS } from '../utils/productVisuals.js'
import { EmptyState, PageIntro } from './Shared.jsx'
import { getAvatarStyle, initials } from '../utils/identity.js'
import CostCalculatorCard from './CostCalculatorCard.jsx'
import CopyButton from './CopyButton.jsx'

export default function PurchaseDetailView({
  purchase = null,
  userRole = 'participant',
  userName = '',
  userId = '',
  userEmail = '',
  theme = 'light',
  now,
  hasOrder = false,
  hasPaid = false,
  onBack = () => {},
  onJoin = () => {},
  onLeave = () => {},
  onCheckout = () => {},
  onManage = () => {},
  onShare = () => {},
}) {
  const [isParticipantListExpanded, setIsParticipantListExpanded] = useState(false)
  if (!purchase) return <div className="page-content"><PageIntro label="Деталі закупівлі" description="Перевірте умови, актуальний прогрес збору та кошторис." /><EmptyState title="Закупівлю не знайдено" message="Поверніться до каталогу та оберіть інший товар." onReset={onBack} /></div>
  const Icon = PRODUCT_ICONS[purchase.icon] || Package
  const percentage = percentOf(purchase.collected, purchase.target)
  const target = safeNumber(purchase.target)
  const collected = safeNumber(purchase.collected)
  const pricing = getPurchasePricing(purchase)
  const targetReached = pricing.targetReached
  const reached = pricing.reached
  const discountFixed = Boolean(purchase.isDiscountFixed ?? purchase.discountFixed)
  const remaining = Math.max(0, target - collected)
  const secondsLeft = purchaseRemainingSeconds(purchase, now)
  const cancelled = purchase.status === 'Скасовано' || (!reached && secondsLeft === 0)
  const remainingMs = secondsLeft * 1000
  const urgent = !reached && !cancelled && remainingMs > 0 && remainingMs < 3600000
  const discountPercent = safeNumber(purchase.retail) > 0 ? Math.max(0, Math.round((safeNumber(purchase.retail) - safeNumber(purchase.wholesale)) / safeNumber(purchase.retail) * 100)) : 0
  const paymentClosed = ['Оформлення', 'Доставка', 'Точка видачі', 'Отримано', 'Завершено'].includes(purchase.status)
  const participants = Array.isArray(purchase.participants) ? purchase.participants : []
  const participant = participants.find((person) => person.userId === userId || person.userId === userEmail)
  const participantCount = participants.length
  const purchaseUnitPrice = pricing.unitPrice
  const participantDeliveryShares = new Map(calculatePurchaseDeliveryShares(purchase, participants.map((person) => ({
    ...person,
    subtotal: Math.max(1, safeNumber(person.quantity)) * purchaseUnitPrice,
  }))).map(({ userId: participantId, deliveryShare }) => [participantId, deliveryShare]))
  const listParticipants = [...participants].reverse()
  const visibleParticipants = isParticipantListExpanded ? listParticipants : listParticipants.slice(0, 4)
  const avatarParticipants = participant
    ? [participant, ...participants.filter((person) => person !== participant)]
    : participants
  const visibleAvatarParticipants = avatarParticipants.slice(0, 6)
  const remainingAvatarCount = Math.max(0, participantCount - visibleAvatarParticipants.length)
  const showEmptyParticipants = participants.length === 0
  const isOrganizer = userRole === 'organizer'
  const isCourier = userRole === 'courier'
  const isOwner = isOrganizer && (purchase.organizerId === userId || purchase.organizerName === userName || purchase.organizer === userName)
  const organizerViewOnly = isOrganizer && !isOwner

  return (
    <div className="page-content detail-content">
      <button className="back-link" onClick={onBack}><ArrowLeft size={18} /> Назад до каталогу</button>
      <PageIntro label="Деталі закупівлі" description="Перевірте умови, актуальний прогрес збору та кошторис." />
      <div className="detail-layout">
        <div className="detail-main-column">
          <section className="panel product-detail-panel">
            <div className={`detail-product-visual art-${purchase.art || 'coffee'}`}><span className="detail-art-category">{purchase.category}</span><div className="product-art-icon"><Icon size={47} strokeWidth={1.4} /></div></div>
            <div className="detail-product-info"><h2 className="break-words whitespace-pre-line leading-relaxed" title={purchase.name}>{purchase.name}</h2><p className="break-words whitespace-pre-line leading-relaxed text-left">{purchase.detail || purchase.description}</p><div className="meta-line"><Users size={18} /><span className="break-words">Організатор: <strong className="break-words" title={purchase.organizerName || purchase.organizer}>{purchase.organizerName || purchase.organizer}</strong></span></div>{purchase.supplier && <div className="meta-line"><Package size={18} /><span className="break-words">Магазин / постачальник: <strong className="break-words" title={purchase.supplier}>{purchase.supplier}</strong></span></div>}<div className="meta-line detail-pickup-line"><MapPin size={18} /><div className="detail-pickup-content"><span className="detail-pickup-label text-xs sm:text-sm text-slate-500 dark:text-slate-400">Точка видачі</span><strong className="detail-pickup-address break-words leading-snug">{purchase.pickupAddress}</strong></div>{purchase.pickupAddress && <CopyButton text={purchase.pickupAddress} label="Копіювати адресу" />}</div><div className="meta-line"><Clock3 size={18} /><span className="break-words">Графік роботи: {purchase.pickupHours || '09:00 – 21:00'}</span></div><div className="detail-price-pair"><div><span>Роздрібна ціна</span><strong>{formatMoney(purchase.retail)}</strong></div><div><span>Гуртова ціна від {formatMoney(purchase.target)}</span><strong className={reached ? 'success-text' : ''}>{formatMoney(purchase.wholesale)} {discountPercent > 0 && <span className="discount-badge">−{discountPercent}%</span>}</strong></div></div>{!reached && !cancelled && <div className="detail-share-button-wrap"><CopyButton text={onShare(purchase)} label="Поділитися збором" /></div>}</div>
          </section>

          <section className="panel collection-panel">
            <div className="collection-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> ПРОГРЕС ЗБОРУ</span><h3><span className="collection-amount">Зібрано {formatMoney(purchase.collected)}</span><span className="collection-target">з {formatMoney(purchase.target)}</span></h3></div><strong className="collection-percent">{percentage}<small>%</small></strong></div>
            <div className={`large-progress ${reached ? 'reached' : ''}`} role="progressbar" aria-label="Прогрес збору" aria-valuenow={percentage} aria-valuemin="0" aria-valuemax="100"><span className="transition-all duration-500 ease-out" style={{ width: `${percentage}%` }} /></div>
            {cancelled ? <p className="collection-message error-text">Час збору вичерпано, гуртова знижка не активована</p> : reached ? <p className="collection-message success-text"><CheckCircle2 size={18} /> {discountFixed ? 'Гуртову ціну зафіксовано. Можна перейти до оплати.' : 'Поріг 100 % досягнуто! Очікуємо підтвердження гуртової ціни організатором.'}</p> : targetReached ? <p className="collection-message discount-pending-note">Суму порогу покрито, але для активації гуртової ціни потрібен щонайменше ще 1 учасник (мінімум 2 учасники у спільній закупівлі).</p> : <p className="collection-message">До гуртової ціни залишилося <strong>{formatMoney(remaining).trim()}</strong>. Збір автоматично оновлюється для всіх учасників.</p>}
            <div className={`purchase-timer-meta ${urgent ? 'urgent critical' : ''} ${cancelled ? 'cancelled' : ''}`}><span><Clock3 size={18} /> {cancelled ? 'Збір скасовано' : reached ? 'Гуртова ціна активована · 100 %' : targetReached ? 'Поріг покрито · потрібен ще 1 учасник' : `Залишилось ${formatCountdownHours(secondsLeft)}`}</span><span>{cancelled ? 'Участь і оплата недоступні' : reached ? 'Таймер зупинено' : urgent ? 'Менше години — дійте швидше' : 'Активний збір за таймером'}</span></div>
          </section>

          <section className="panel participants-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow"><span className="eyebrow-dot" /> СПІЛЬНА ПОКУПКА</span>
                <h3>Учасники <span className="count-badge">{participantCount}</span></h3>
              </div>
              <span className="participants-caption">{participantCount ? 'Сусіди вже долучилися' : 'Станьте першим учасником'}</span>
            </div>

            {showEmptyParticipants ? (
              <p className="participant-empty">Станьте першим учасником</p>
            ) : (
              <>
                {visibleAvatarParticipants.length > 0 ? (
                  <div className="participant-avatar-row" aria-label={`${participantCount} учасників закупівлі`}>
                    {visibleAvatarParticipants.map((person, index) => (
                      <span className={`participant-avatar avatar-tone-${index % 4}`} style={getAvatarStyle(person.name, theme)} key={person.id || `${person.name}-${index}`} title={person.name}>
                        {initials(person.name)}
                      </span>
                    ))}
                    {remainingAvatarCount > 0 && <span className="participant-overflow" aria-label={`Ще ${remainingAvatarCount} учасників`}>+{remainingAvatarCount}</span>}
                  </div>
                ) : (
                  <p className="participant-empty">Сусіди вже долучилися до збору.</p>
                )}

                {participants.length > 0 && (
                  <div className="participant-list">
                    {visibleParticipants.map((person, index) => {
                      const isCurrentUser = userId ? person.userId === userId : Boolean(userEmail && person.userId === userEmail)
                      const quantity = Math.max(1, safeNumber(person.quantity))
                      const amount = reached
                        ? quantity * safeNumber(purchase.wholesale)
                        : person.amount == null
                          ? quantity * safeNumber(purchase.retail)
                          : safeNumber(person.amount)
                      const deliveryShare = participantDeliveryShares.get(person.userId) ?? 0
                      return (
                        <div className="participant-row" key={person.id || `${person.name}-${index}`}>
                          <div className="participant-row-person">
                            <span className={`participant-avatar small-avatar avatar-tone-${index % 4}`} style={getAvatarStyle(person.name, theme)} title={person.name}>{initials(person.name)}</span>
                            <strong className="break-words" title={person.name}>{person.name}</strong>
                            {isCurrentUser && <span className="participant-you-badge">Ви</span>}
                          </div>
                          <span className="participant-row-cost">
                            <span className="participant-row-order">
                              {quantity} шт.<span className="participant-row-order-separator">·</span><b>{formatMoney(amount)}</b>
                            </span>
                            <small>Доставка {formatMoney(deliveryShare)}</small>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {participants.length > 4 && <button className="participant-list-toggle" type="button" onClick={() => setIsParticipantListExpanded((expanded) => !expanded)}>
                  {isParticipantListExpanded ? <><ChevronUp size={18} /> Згорнути список</> : <><ChevronDown size={18} /> Показати всіх ({participants.length})</>}
                </button>}
              </>
            )}
          </section>
        </div>

        {isOwner ? (
          <aside className="panel purchase-access-card"><span className="purchase-access-icon"><ShieldCheck size={20} /></span><div><h3>Ваша закупівля</h3><p>Керуйте збором, учасниками та статусом доставки у панелі організатора.</p></div><button className="primary-button" onClick={() => onManage(purchase.id)}>Перейти до керування закупівлею</button></aside>
        ) : organizerViewOnly ? (
          <aside className="panel purchase-access-card view-only"><span className="purchase-access-icon"><ShieldCheck size={20} /></span><div><h3>Режим перегляду організатора</h3><p>Щоб приєднатися як покупець, увійдіть у ролі Учасника.</p></div></aside>
        ) : isCourier ? (
          <aside className="panel purchase-access-card view-only"><span className="purchase-access-icon"><Truck size={20} /></span><div><h3>Режим перегляду кур’єра</h3><p>Керуйте партіями у розділі «Доставки».</p></div></aside>
        ) : (
          <CostCalculatorCard
            key={`${purchase.id}-${participant?.quantity ?? 1}`}
            purchase={purchase}
            initialQuantity={participant?.quantity ?? 1}
            userId={userId}
            hasJoined={Boolean(participant)}
            hasOrder={hasOrder}
            hasPaid={hasPaid}
            isCancelled={cancelled}
            paymentClosed={paymentClosed}
            onJoin={onJoin}
            onLeave={onLeave}
            onCheckout={onCheckout}
          />
        )}
      </div>
    </div>
  )
}
