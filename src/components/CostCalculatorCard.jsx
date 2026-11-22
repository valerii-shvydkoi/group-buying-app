import { useState } from 'react'
import { ArrowRight, BadgePercent, CheckCircle2, Minus, Package, Plus, ShieldCheck, X } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { calculatePurchaseDeliveryShares, calculateSavings, getPurchasePricing, safeNumber } from '../utils/calculations.js'
import { PRODUCT_ICONS } from '../utils/productVisuals.js'
import ConfirmModal from './ConfirmModal.jsx'

const MAX_PURCHASE_QUANTITY = 100

function normalizePurchaseQuantity(value) {
  const parsed = Number(value)
  return Math.max(1, Math.min(MAX_PURCHASE_QUANTITY, Number.isFinite(parsed) ? Math.floor(parsed) || 1 : 1))
}

export default function CostCalculatorCard({
  purchase = null,
  initialQuantity = 2,
  userId = '',
  hasJoined = false,
  hasOrder = false,
  hasPaid = false,
  isCancelled = false,
  paymentClosed = false,
  onJoin = () => {},
  onLeave = () => {},
  onCheckout = () => {},
}) {
  const [quantity, setQuantity] = useState(normalizePurchaseQuantity(initialQuantity))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  if (!purchase) return null

  const Icon = PRODUCT_ICONS[purchase.icon] || Package
  const target = safeNumber(purchase.target)
  const pricing = getPurchasePricing(purchase)
  const collected = safeNumber(purchase.collected)
  const targetReached = pricing.targetReached
  const isGoalReached = pricing.reached
  const isDiscountFixed = Boolean(purchase.isDiscountFixed ?? purchase.discountFixed)
  const currentParticipants = Array.isArray(purchase.participants) ? purchase.participants : []
  const prospectiveParticipants = currentParticipants.filter((person) => person.userId !== userId)
  prospectiveParticipants.push({
    userId: userId || '__prospective_participant__',
    quantity,
  })
  const prospectiveCollected = prospectiveParticipants.reduce((total, person) => total + Math.max(1, safeNumber(person.quantity)) * safeNumber(purchase.retail), 0)
  const estimatePurchase = { ...purchase, participants: prospectiveParticipants, collected: prospectiveCollected }
  const estimatePricing = getPurchasePricing(estimatePurchase)
  const estimateReached = estimatePricing.reached
  const unitPrice = estimatePricing.unitPrice
  const subtotal = safeNumber(quantity) * unitPrice
  const prospectiveAllocations = calculatePurchaseDeliveryShares(estimatePurchase, prospectiveParticipants.map((person) => ({
    ...person,
    subtotal: Math.max(1, safeNumber(person.quantity)) * unitPrice,
  })))
  const deliveryShare = prospectiveAllocations.find((allocation) => allocation.userId === (userId || '__prospective_participant__'))?.deliveryShare ?? 0
  const deliveryBase = estimatePricing.deliveryBase
  const savings = calculateSavings(purchase.retail, purchase.wholesale, quantity)
  const remaining = Math.max(0, target - collected)
  const ownCollected = hasJoined ? normalizePurchaseQuantity(initialQuantity) * safeNumber(purchase.retail) : 0
  const neededQuantity = safeNumber(purchase.retail) > 0
    ? Math.max(1, Math.min(MAX_PURCHASE_QUANTITY, Math.ceil(Math.max(0, target - Math.max(0, collected - ownCollected)) / safeNumber(purchase.retail))))
    : 1
  const goalIsClose = !targetReached && target - Math.max(0, collected - ownCollected) <= safeNumber(purchase.retail) * 5
  const membershipLocked = isCancelled || paymentClosed || hasPaid || isDiscountFixed

  async function handlePrimaryAction() {
    if (isSubmitting || membershipLocked && !(hasJoined && isGoalReached && isDiscountFixed)) return
    setIsSubmitting(true)
    try {
      if (hasJoined && isGoalReached && isDiscountFixed) await onCheckout(purchase, quantity)
      else if (isGoalReached && !hasJoined) return
      else await onJoin(purchase.id, quantity)
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateQuantity(value) {
    const rawValue = String(value)
    if (!/^\d*$/.test(rawValue)) return
    const digits = rawValue.slice(0, 3).replace(/^0+(?=\d)/, '')
    setQuantity(normalizePurchaseQuantity(digits))
  }

  async function handleLeave() {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onLeave(purchase.id)
      setConfirmLeave(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <aside className="panel estimate-panel">
      <div className="estimate-head"><span className="eyebrow"><span className="eyebrow-dot" /> ВАШЕ ЗАМОВЛЕННЯ</span><h3>Мій кошторис</h3></div>
      <div className="estimate-product"><div className={`estimate-thumb art-${purchase.art || 'coffee'}`}><Icon size={22} /></div><div><strong className="break-words" title={purchase.name}>{purchase.name}</strong><span>{isGoalReached ? 'Гуртова пропозиція активна' : targetReached ? 'Суму порогу покрито · потрібен ще 1 учасник' : 'Ваш кошторис'}</span></div></div>
      <div className="quantity-selection-block pb-4 mb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="quantity-control"><div><span>Кількість одиниць</span><small>Від 1 до 100 шт.</small></div><div className="quantity-stepper"><button type="button" aria-label="Зменшити кількість" disabled={membershipLocked || isSubmitting || quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus size={18} /></button><input className="quantity-value" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-label="Кількість товару" value={quantity} disabled={membershipLocked || isSubmitting} onChange={(event) => updateQuantity(event.target.value)} /><button type="button" aria-label="Збільшити кількість" disabled={membershipLocked || isSubmitting || quantity >= MAX_PURCHASE_QUANTITY} onClick={() => setQuantity((value) => Math.min(MAX_PURCHASE_QUANTITY, value + 1))}><Plus size={18} /></button></div></div>
        <div className="quantity-shortcuts" aria-label="Швидка зміна кількості">{[1, 3, 5].map((amount) => <button type="button" key={amount} disabled={membershipLocked || isSubmitting || quantity >= MAX_PURCHASE_QUANTITY} onClick={() => setQuantity((value) => normalizePurchaseQuantity(value + amount))}>+{amount}</button>)}{goalIsClose && <button className="goal-shortcut" type="button" disabled={membershipLocked || isSubmitting} onClick={() => setQuantity(neededQuantity)}>Добрати до 100 % знижки</button>}</div>
      </div>
      <div className="estimate-lines"><div><span>Товари · {quantity} шт.</span><strong>{formatMoney(subtotal)}</strong></div><div><span>Ціна за одиницю</span><strong className={estimateReached ? 'success-text' : ''}>{formatMoney(unitPrice)} · {estimateReached ? 'гуртова' : 'роздрібна'}</strong></div><div><span>Частка доставки</span><strong>{formatMoney(deliveryShare)}</strong></div></div>
      <p className="delivery-formula">{deliveryBase > 0 ? <>Доставка {formatMoney(purchase.delivery)} × {formatMoney(subtotal)} / {formatMoney(deliveryBase)}</> : 'Частка доставки розрахується після появи першого кошика.'}</p>
      {!targetReached && <div className="estimate-unlock"><span>Ще до порогу</span><strong>{formatMoney(remaining)}</strong></div>}
      <div className="estimate-total"><span>До сплати</span><strong>{formatMoney(subtotal + deliveryShare)}</strong></div>
      {estimateReached && <div className="savings-message"><BadgePercent className="w-4 h-4 text-[#007A53] dark:text-emerald-400 shrink-0" /><span>Ваша економія <strong>{formatMoney(savings)}</strong> завдяки гуртовій ціні після приєднання</span></div>}
      {targetReached && !isGoalReached && <p className="estimate-footnote discount-pending-note">Суму порогу покрито, але для активації гуртової ціни потрібен щонайменше ще 1 учасник (мінімум 2 учасники у спільній закупівлі).</p>}
      {isCancelled ? (
        <div className="estimate-cancelled-note">Час збору вичерпано, поріг не досягнуто</div>
      ) : paymentClosed && !hasPaid ? (
        <div className="estimate-unavailable-note">Закупівля вже перейшла до етапу доставки.</div>
      ) : hasPaid ? (
        <div className="estimate-paid-note"><CheckCircle2 size={18} /> Ви вже сплатили свою частку. Стежте за доставкою у «Моїх замовленнях».</div>
      ) : isGoalReached && !hasJoined ? (
        <button className="primary-button estimate-submit" disabled>Приєднання до збору завершено</button>
      ) : (
        <>
          <button className="primary-button estimate-submit" disabled={isSubmitting || (membershipLocked && !(hasJoined && isGoalReached && isDiscountFixed))} onClick={handlePrimaryAction}>
            {isSubmitting ? 'Обробляємо…' : hasJoined && isGoalReached && isDiscountFixed ? <>Перейти до оплати <ArrowRight size={18} /></> : hasJoined || hasOrder ? 'Оновити мою частку' : 'Приєднатися до закупівлі'}
          </button>
          {hasJoined && !isDiscountFixed && !hasPaid && !isCancelled && !paymentClosed && <button className="secondary-button estimate-leave" disabled={isSubmitting} onClick={() => setConfirmLeave(true)}><X size={18} /> Вийти зі збору</button>}
        </>
      )}
      {isGoalReached && !isDiscountFixed && hasJoined && !hasPaid && <p className="estimate-footnote discount-pending-note">Поріг 100 % досягнуто! Організатор має зафіксувати знижку, щоб відкрити оплату.</p>}
      {!isCancelled && !targetReached && <p className="estimate-footnote"><ShieldCheck size={18} /> Оплата відкриється після досягнення порогу та фіксації знижки організатором.</p>}
      {isGoalReached && !isDiscountFixed && !hasJoined && <p className="estimate-footnote discount-pending-note">Поріг досягнуто. Після приєднання очікуйте фіксації знижки організатором.</p>}
      {isGoalReached && isDiscountFixed && hasJoined && !hasPaid && !paymentClosed && <p className="estimate-footnote"><ShieldCheck size={18} /> Знижку зафіксовано — можна сплатити гуртову частку.</p>}
      <ConfirmModal open={confirmLeave} title="Вийти зі збору?" message="Ваше замовлення буде видалено із закупівлі. Ви зможете приєднатися знову, доки організатор не зафіксував знижку." confirmLabel="Так, вийти зі збору" cancelLabel="Залишитися" danger busy={isSubmitting} onClose={() => setConfirmLeave(false)} onConfirm={handleLeave} />
    </aside>
  )
}
