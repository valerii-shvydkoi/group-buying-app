import { useState } from 'react'
import { ArrowLeft, ArrowRight, CreditCard, MapPin, ShieldCheck } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { expiryIsValid } from '../utils/validation.js'
import { EmptyState, PageIntro } from './Shared.jsx'

export default function CheckoutView({ draft = null, onBack = () => {}, onPay = () => {} }) {
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touched, setTouched] = useState({})
  const cardValid = /^\d{4}(?: \d{4}){3}$/.test(cardNumber)
  const expiryValid = expiryIsValid(expiry)
  const cvvValid = /^\d{3}$/.test(cvv)
  const canPay = cardValid && expiryValid && cvvValid
  const cardError = attempted || touched.cardNumber
    ? !cardNumber.replace(/\D/g, '').length ? 'Введіть номер картки' : !cardValid ? 'Вкажіть усі 16 цифр картки' : ''
    : ''
  const expiryError = attempted || touched.expiry
    ? !String(expiry).trim() ? 'Введіть строк дії' : !expiryValid ? 'Некоректний строк (ММ/РР)' : ''
    : ''
  const cvvError = attempted || touched.cvv
    ? !String(cvv).trim() ? 'Введіть CVV' : !cvvValid ? 'Вкажіть 3 цифри CVV' : ''
    : ''

  if (!draft) return <div className="page-content"><PageIntro label="Оплата частки" description="Перевірте суму та завершіть оплату через гарантійний рахунок." /><EmptyState title="Немає активної оплати" message="Поверніться до каталогу й оберіть закупівлю, яка досягла порогу." onReset={onBack} /></div>

  function updateCardNumber(event) {
    const input = event.currentTarget
    const rawValue = input.value
    const cursorPosition = input.selectionStart ?? rawValue.length
    let digits = rawValue.replace(/\D/g, '').slice(0, 16)
    let digitsBeforeCursor = rawValue.slice(0, cursorPosition).replace(/\D/g, '').length

    // If Backspace removed a group separator, remove the preceding digit too.
    const removedSeparator = event.nativeEvent.inputType === 'deleteContentBackward'
      && cursorPosition === digitsBeforeCursor
      && digitsBeforeCursor > 0
      && digitsBeforeCursor % 4 === 0
    if (removedSeparator) {
      digits = `${digits.slice(0, digitsBeforeCursor - 1)}${digits.slice(digitsBeforeCursor)}`
      digitsBeforeCursor -= 1
    }

    const formatted = digits.match(/.{1,4}/g)?.join(' ') || ''
    setCardNumber(formatted)
    setTouched((current) => ({ ...current, cardNumber: true }))
    const formattedCursor = digitsBeforeCursor > 0 ? digitsBeforeCursor + Math.floor((digitsBeforeCursor - 1) / 4) : 0
    window.requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(formattedCursor, formattedCursor)
    })
  }

  function updateExpiry(rawValue) {
    const digits = rawValue.replace(/\D/g, '').slice(0, 4)
    setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits)
    setTouched((current) => ({ ...current, expiry: true }))
  }

  function updateCvv(rawValue) {
    const digits = rawValue.replace(/\D/g, '').slice(0, 3)
    setCvv(digits.slice(0, 3))
    setTouched((current) => ({ ...current, cvv: true }))
  }

  async function submit(event) {
    event.preventDefault()
    setAttempted(true)
    setTouched({ cardNumber: true, expiry: true, cvv: true })
    if (!canPay || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onPay(draft.purchaseId)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page-content checkout-content"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> Назад до кошторису</button><PageIntro label="Оплата частки" description="Перевірте суму та завершіть оплату через гарантійний рахунок." /><div className="checkout-layout">
      <div className="checkout-summary-column"><section className="panel checkout-summary"><div className="checkout-summary-heading"><span className="eyebrow"><span className="eyebrow-dot" /> ВАШЕ ЗАМОВЛЕННЯ</span><h2>{draft.name} <span>· {draft.quantity} шт.</span></h2></div>{draft.supplier && <div className="checkout-line"><span>Магазин / постачальник</span><strong>{draft.supplier}</strong></div>}<div className="checkout-line"><span>Товар за гуртовою ціною: {draft.quantity} × {formatMoney(draft.unitPrice)}</span><strong>{formatMoney(draft.subtotal)}</strong></div><div className="checkout-line"><span>Частка доставки</span><strong>{formatMoney(draft.deliveryShare)}</strong></div><div className="checkout-total"><span>Разом</span><strong>{formatMoney(draft.total)}</strong></div></section><div className="escrow-notice"><span className="escrow-icon"><ShieldCheck size={19} /></span><div><strong>Оплата захищена гарантійним рахунком</strong><p>Кошти утримуються до моменту, коли ви отримаєте товар на точці видачі.</p></div></div><section className="panel pickup-summary"><span className="pickup-icon"><MapPin size={18} /></span><div><strong>Точка видачі</strong><p>{draft.pickupAddress}</p><span>Графік роботи: {draft.pickupHours || '09:00 – 21:00'}</span></div></section></div>
      <form className="panel payment-form" onSubmit={submit} noValidate><div className="payment-form-heading"><span className="payment-icon"><CreditCard size={20} /></span><div><h2>Спосіб оплати</h2><p>Введіть дані банківської картки</p></div></div>
        <label className="form-field"><span>Номер картки <i className="required-mark">*</i></span><div className={`payment-input-wrap card-number-wrap ${cardError ? 'invalid' : ''}`}><CreditCard className="payment-leading-icon" size={18} aria-hidden="true" /><input className="card-number-input text-[13px] sm:text-sm" aria-label="Номер картки" inputMode="numeric" autoComplete="cc-number" required disabled={isSubmitting} aria-invalid={Boolean(cardError)} aria-describedby="checkout-card-message" value={cardNumber} maxLength={19} onBlur={() => setTouched((current) => ({ ...current, cardNumber: true }))} onChange={updateCardNumber} placeholder="0000 0000 0000 0000" /></div><small id="checkout-card-message" className="form-message-slot" aria-live="polite">{cardError}</small><small className="field-help">Дані картки не зберігаються у застосунку.</small></label>
        <div className="payment-field-row"><label className="form-field"><span>Строк дії <i className="required-mark">*</i></span><div className={`payment-input-wrap ${expiryError ? 'invalid' : ''}`}><input className="text-[13px] sm:text-sm" aria-label="Строк дії картки" inputMode="numeric" autoComplete="cc-exp" required disabled={isSubmitting} aria-invalid={Boolean(expiryError)} aria-describedby="checkout-expiry-message" value={expiry} maxLength={5} onBlur={() => setTouched((current) => ({ ...current, expiry: true }))} onChange={(event) => updateExpiry(event.target.value)} placeholder="ММ/РР" /></div><small id="checkout-expiry-message" className="form-message-slot" aria-live="polite">{expiryError}</small></label><label className="form-field"><span>CVV <i className="required-mark">*</i></span><div className={`payment-input-wrap ${cvvError ? 'invalid' : ''}`}><input className="text-[13px] sm:text-sm" aria-label="CVV картки" inputMode="numeric" autoComplete="cc-csc" required disabled={isSubmitting} aria-invalid={Boolean(cvvError)} aria-describedby="checkout-cvv-message" value={cvv} maxLength={3} onBlur={() => setTouched((current) => ({ ...current, cvv: true }))} onChange={(event) => updateCvv(event.target.value)} placeholder="CVV" /></div><small id="checkout-cvv-message" className="form-message-slot" aria-live="polite">{cvvError}</small></label></div>
        <button type="submit" className="primary-button pay-button" disabled={!canPay || isSubmitting}>{isSubmitting ? 'Обробляємо оплату…' : <>Сплатити {formatMoney(draft.total)} <ArrowRight size={18} /></>}</button><p className="payment-secure-caption"><ShieldCheck size={18} /> Карткові дані не записуються у профіль.</p>
      </form>
    </div></div>
  )
}
