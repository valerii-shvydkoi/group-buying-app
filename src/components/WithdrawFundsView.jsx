import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, Building2, Check, CheckCircle2, Clock3, CreditCard, Eye, EyeOff, Landmark, LockKeyhole, ReceiptText, ShieldCheck, Trash2, Wallet, X } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { deleteCourierCard, deleteCourierIban, getCourierFinanceSummary, isValidUkrainianIban, loadCourierCards, loadCourierIbans, normalizeUkrainianIban, saveCourierCard, saveCourierIban, subscribeCourierCards, subscribeCourierIbans } from '../services/dataService.js'
import { formatIbanPreview, formatSavedIban, formatUkrainianIban, normalizeIbanInput } from '../utils/iban.js'
import { formatBinLastFourPreview, formatPaymentCardInput, formatSavedCardNumber, getPaymentCardBrand, getPaymentCardBrandLabel } from '../utils/paymentCard.js'
import { EmptyState, PageIntro } from './Shared.jsx'
import CustomSelect from './CustomSelect.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import CopyButton from './CopyButton.jsx'

const PAYMENT_METHODS = [
  { value: 'instant', label: 'Миттєвий переказ на банківську картку (0% комісії)' },
  { value: 'standard', label: 'Стандартний переказ за реквізитами (0% комісії)' },
]
const HISTORY_FILTERS = [
  { id: 'all', label: 'Усі' },
  { id: 'paid', label: 'Виплачено' },
  { id: 'processing', label: 'В обробці' },
]

function normalizePayoutAmountInput(value = '') {
  const normalized = String(value).trim().replace(/[\s\u00a0]/g, '').replace(',', '.')
  if (!normalized) return ''
  if (/[eE+-]/.test(normalized) || !/^\d+(?:\.\d{0,2})?$/.test(normalized)) return ''
  return normalized.slice(0, 12)
}

function payoutReference(payout) {
  const shortId = String(payout.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || 'ОПЕРАЦІЯ'
  return `WD-${shortId}`
}

function payoutDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function payoutOperationLabel(count) {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} операцій`
  if (last === 1) return `${count} операція`
  if (last >= 2 && last <= 4) return `${count} операції`
  return `${count} операцій`
}

function payoutDestination(payout) {
  if (payout.type === 'iban' || payout.cardBrand === 'IBAN') return formatSavedIban(payout.last4 || payout.cardLast4)
  return `${getPaymentCardBrandLabel(payout.cardBrand)} · ${formatSavedCardNumber(payout.last4 || payout.cardLast4)}`
}

function ReceiptRow({ label, children, className = '' }) {
  return <div className={`withdraw-receipt-row ${className}`}>
    <span className="withdraw-receipt-label shrink-0 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">{label}</span>
    <div className="withdraw-receipt-value min-w-0 text-right font-medium break-words leading-snug">{children}</div>
  </div>
}

export default function WithdrawFundsView({ user, purchases = [], courierId = '', courierName = '', wallet, onWithdraw = async () => {} }) {
  const [savedCards, setSavedCards] = useState(() => loadCourierCards(courierId))
  const [savedIbans, setSavedIbans] = useState(() => loadCourierIbans(courierId))
  const [selectedCardId, setSelectedCardId] = useState('new')
  const [selectedIbanId, setSelectedIbanId] = useState('new')
  const [amountInput, setAmountInput] = useState('')
  const [method, setMethod] = useState('instant')
  const [cardNumber, setCardNumber] = useState('')
  const [showCardNumber, setShowCardNumber] = useState(true)
  const [showIban, setShowIban] = useState(true)
  const [cardholder, setCardholder] = useState(courierName)
  const [ibanNumber, setIbanNumber] = useState('')
  const ibanInputRef = useRef(null)
  const [ibanHolder, setIbanHolder] = useState(courierName)
  const [saveCard, setSaveCard] = useState(true)
  const [saveIban, setSaveIban] = useState(true)
  const [formError, setFormError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [filter, setFilter] = useState('all')
  const [receipt, setReceipt] = useState(null)
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState(null)
  const [confirmDeleteIbanId, setConfirmDeleteIbanId] = useState(null)
  const finance = getCourierFinanceSummary(purchases, user || { id: courierId }, wallet?.payouts)
  const numericBalance = Math.max(0, Math.round(Number(finance.availableBalance) || 0))
  const totalEarned = finance.totalEarned
  const totalWithdrawn = finance.totalWithdrawn
  const rawAmount = amountInput ? Number(amountInput) : Number.NaN
  const amount = Math.round(rawAmount || 0)
  const cardDigits = cardNumber.replace(/\D/g, '')
  const availableCards = savedCards
  const effectiveSelectedCardId = availableCards.some((card) => card.id === selectedCardId) ? selectedCardId : 'new'
  const selectedCard = availableCards.find((card) => card.id === effectiveSelectedCardId) || null
  const availableIbans = savedIbans
  const effectiveSelectedIbanId = availableIbans.some((account) => account.id === selectedIbanId) ? selectedIbanId : 'new'
  const selectedIban = availableIbans.find((account) => account.id === effectiveSelectedIbanId) || null
  const isIbanMethod = method === 'standard'
  const ibanDigits = normalizeUkrainianIban(ibanNumber)
  const payouts = Array.isArray(wallet?.payouts) ? wallet.payouts : []
  const filteredPayouts = payouts.filter((payout) => filter === 'all' || (filter === 'paid' ? true : payout.status === 'В обробці'))
  const counts = {
    all: payouts.length,
    paid: payouts.length,
    processing: payouts.filter((payout) => payout.status === 'В обробці').length,
  }
  const chosenBrand = isIbanMethod ? 'IBAN' : selectedCard?.brand || getPaymentCardBrand(cardDigits)
  const cardNumberError = !isIbanMethod && formError.includes('цифр картки')
  const cardholderError = !isIbanMethod && formError.includes('власника картки')
  const ibanNumberError = isIbanMethod && formError.includes('IBAN')
  const ibanHolderError = isIbanMethod && formError.includes('ПІБ')
  const amountError = amountInput && (!Number.isFinite(rawAmount) || rawAmount < 50 || rawAmount > numericBalance)
    ? rawAmount < 50 ? 'Мінімальна сума виплати — 50 грн.' : 'Сума не може перевищувати доступний баланс.'
    : ''
  const paymentValid = isIbanMethod ? Boolean(selectedIban || isValidUkrainianIban(ibanDigits)) : Boolean(selectedCard || cardDigits.length === 16)
  const hasValidHolder = isIbanMethod ? Boolean(selectedIban || ibanHolder.trim().length >= 2) : Boolean(selectedCard || cardholder.trim().length >= 2)
  const canSubmit = !submitting && rawAmount >= 50 && rawAmount <= numericBalance && paymentValid && hasValidHolder

  useEffect(() => {
    const refresh = () => setSavedCards(loadCourierCards(courierId))
    return subscribeCourierCards(courierId, refresh)
  }, [courierId])

  useEffect(() => {
    const refresh = () => setSavedIbans(loadCourierIbans(courierId))
    return subscribeCourierIbans(courierId, refresh)
  }, [courierId])

  useEffect(() => {
    if (!receipt) return undefined
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event) {
      if (event.key === 'Escape') setReceipt(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousBodyOverflow
    }
  }, [receipt])

  function setQuickAmount(percent) {
    setAmountInput(String(Math.round(numericBalance * percent)))
    setFormError('')
  }

  function setCard(value) {
    setCardNumber(formatPaymentCardInput(value))
    setSelectedCardId('new')
    setFormError('')
  }

  function handleIbanFocus() {
    if (ibanNumber) return
    setIbanNumber('UA')
    requestAnimationFrame(() => {
      const input = ibanInputRef.current
      if (input && document.activeElement === input) input.setSelectionRange(2, 2)
    })
  }

  function handleIbanChange(event) {
    const input = event.currentTarget
    const value = input.value
    const selectionStart = input.selectionStart ?? value.length
    const rawValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const rawBeforeCaret = value.slice(0, selectionStart).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const deleting = String(event.nativeEvent?.inputType || '').startsWith('delete')
    const nextValue = normalizeIbanInput(value, { deleting })
    const prefixAdded = nextValue.startsWith('UA') && !rawValue.startsWith('UA') && rawValue !== 'U' ? 2 : 0
    let charactersBeforeCaret = rawBeforeCaret.length + prefixAdded
    if (rawValue === 'U' && !deleting) charactersBeforeCaret = 2
    if (deleting && ['', 'U', 'UA', 'A'].includes(rawValue)) charactersBeforeCaret = 0
    const formattedValue = formatUkrainianIban(nextValue)
    setIbanNumber(nextValue)
    setSelectedIbanId('new')
    setFormError('')
    requestAnimationFrame(() => {
      if (!input.isConnected || document.activeElement !== input) return
      let offset = 0
      let seen = 0
      while (offset < formattedValue.length && seen < charactersBeforeCaret) {
        if (/[A-Z0-9]/.test(formattedValue[offset])) seen += 1
        offset += 1
      }
      if (formattedValue[offset] === ' ') offset += 1
      input.setSelectionRange(offset, offset)
    })
  }

  function removeCard(cardId) {
    try {
      deleteCourierCard({ courierId, cardId })
      setSavedCards(loadCourierCards(courierId))
      if (selectedCardId === cardId) setSelectedCardId('new')
      setConfirmDeleteCardId(null)
      setFormError('')
      return true
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не вдалося видалити картку.')
      return false
    }
  }

  function removeIban(ibanId) {
    try {
      deleteCourierIban({ courierId, ibanId })
      setSavedIbans(loadCourierIbans(courierId))
      if (selectedIbanId === ibanId) setSelectedIbanId('new')
      setConfirmDeleteIbanId(null)
      setFormError('')
      return true
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не вдалося видалити IBAN.')
      return false
    }
  }

  async function submitPayout(event) {
    event.preventDefault()
    if (submittingRef.current) return
    setFeedback('')
    setFormError('')
    if (!Number.isFinite(rawAmount)) { setFormError('Введіть суму виплати.'); return }
    if (rawAmount < 50) { setFormError('Мінімальна сума виплати — 50 грн.'); return }
    if (rawAmount > numericBalance) { setFormError('Сума не може перевищувати доступний баланс.'); return }
    if (isIbanMethod) {
      if (!selectedIban && !isValidUkrainianIban(ibanDigits)) { setFormError('Введіть коректний український IBAN: UA та 27 цифр.'); return }
      if (!selectedIban && ibanHolder.trim().length < 2) { setFormError('Введіть ПІБ отримувача.'); return }
    } else {
      if (!selectedCard && cardDigits.length !== 16) { setFormError('Вкажіть усі 16 цифр картки.'); return }
      if (!selectedCard && cardholder.trim().length < 2) { setFormError('Введіть ім’я власника картки.'); return }
    }
    submittingRef.current = true
    setSubmitting(true)
    try {
      const recipientHolder = isIbanMethod
        ? selectedIban?.holderName || ibanHolder
        : selectedCard?.holderName || cardholder
      const payout = await onWithdraw({
        amount,
        method,
        recipientType: isIbanMethod ? 'iban' : 'card',
        cardNumber: isIbanMethod || selectedCard ? '' : cardNumber,
        cardLast4: !isIbanMethod ? selectedCard?.last4 || '' : '',
        cardBrand: chosenBrand,
        iban: isIbanMethod && !selectedIban ? ibanDigits : '',
        ibanLast4: isIbanMethod ? selectedIban?.last4 || '' : '',
        holderName: recipientHolder,
      })
      if (isIbanMethod && !selectedIban && saveIban) {
        try {
          saveCourierIban({ courierId, iban: ibanDigits, holderName: ibanHolder })
          setSavedIbans(loadCourierIbans(courierId))
        } catch {
          setFeedback('Виплату підтверджено. Рахунок не вдалося зберегти для наступних виплат.')
        }
      } else if (!isIbanMethod && !selectedCard && saveCard) {
        try {
          saveCourierCard({ courierId, cardNumber, holderName: cardholder })
          setSavedCards(loadCourierCards(courierId))
        } catch {
          setFeedback('Виплату підтверджено. Картку не вдалося зберегти для наступних виплат.')
        }
      }
      setReceipt({ ...payout, type: payout.type || (isIbanMethod ? 'iban' : 'card'), holderName: payout.holderName || recipientHolder, cardBrand: payout.cardBrand || chosenBrand })
      setAmountInput('')
      setCardNumber('')
      setIbanNumber('')
      setShowCardNumber(true)
      setShowIban(true)
      setCardholder(courierName)
      setIbanHolder(courierName)
      if (!isIbanMethod && !selectedCard) setSelectedCardId('new')
      if (isIbanMethod && !selectedIban) setSelectedIbanId('new')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не вдалося підтвердити виплату.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const historyContent = filteredPayouts.length ? <>
    <div className="withdraw-history-mobile">
      {filteredPayouts.map((payout) => <article className="withdraw-history-card" key={payout.id}>
        <div className="withdraw-history-card-heading"><strong>{payoutReference(payout)}</strong><span className="payout-status-pill">Виплачено</span></div>
        <span>{payoutDate(payout.createdAt)}</span>
        <div className="withdraw-history-card-footer"><span>{payoutDestination(payout)}</span><strong>{formatMoney(payout.amount)}</strong><button type="button" className="withdraw-receipt-link" onClick={() => setReceipt(payout)}>Квитанція</button></div>
      </article>)}
    </div>
    <div className="withdraw-history-table-wrap"><table className="withdraw-history-table">
      <thead><tr><th>ID операції</th><th>Дата й час</th><th>Реквізити</th><th>Сума</th><th>Статус</th><th>Квитанція</th></tr></thead>
      <tbody>{filteredPayouts.map((payout) => <tr key={payout.id}>
        <td>{payoutReference(payout)}</td><td>{payoutDate(payout.createdAt)}</td><td>{payoutDestination(payout)}</td><td className="tabular-nums">{formatMoney(payout.amount)}</td><td><span className="payout-status-pill">Виплачено</span></td><td><button type="button" className="withdraw-receipt-link" onClick={() => setReceipt(payout)}>Квитанція</button></td>
      </tr>)}</tbody>
    </table></div>
  </> : <EmptyState title={filter === 'processing' ? 'Немає виплат в обробці' : 'Історія виплат порожня'} message={filter === 'processing' ? 'Тут з’являться виплати, щойно вони будуть опрацьовуватися.' : 'Підтверджені виплати відображатимуться тут разом із квитанціями.'} />

  return <div className="page-content withdraw-content">
    <PageIntro label="Кур’єр" description="Керування балансом, платіжними картками та історією виплат за виконані доставки." />

    <section className="withdraw-kpi-grid" aria-label="Баланс кур’єра">
      <article className="panel withdraw-kpi-card withdraw-kpi-available"><span>Доступно до виплати</span><strong>{formatMoney(numericBalance)}</strong><small>Баланс до виводу (мін. 50 грн)</small></article>
      <article className="panel withdraw-kpi-card"><span>Зароблено за доставки</span><strong>{formatMoney(totalEarned)}</strong><small>Усього нараховано за доставлені партії</small></article>
      <article className="panel withdraw-kpi-card"><span>Усього виплачено</span><strong>{formatMoney(totalWithdrawn)}</strong><small>Виведено на картку чи IBAN ({payoutOperationLabel(payouts.length)})</small></article>
    </section>

    <div className="withdraw-workspace">
      <section className="panel withdraw-form-panel">
        <div className="withdraw-section-heading"><span className="withdraw-section-icon"><Wallet size={22} /></span><div><h2>Форма виводу коштів</h2><p>Виплата проводиться з балансу за виконані доставки.</p></div></div>
        <form className="withdraw-form" onSubmit={submitPayout} noValidate>
          <div className="form-field">
            <label htmlFor="withdraw-amount">Сума виводу, грн <span className="required-mark">*</span></label>
            <input id="withdraw-amount" type="text" inputMode="decimal" autoComplete="off" value={amountInput} onChange={(event) => { setAmountInput(normalizePayoutAmountInput(event.target.value)); setFormError('') }} placeholder="Сума виплати" aria-invalid={Boolean(amountError)} />
            <span className={`field-error ${amountError ? 'is-visible' : ''}`} role={amountError ? 'alert' : undefined}>{amountError}</span>
            <div className="withdraw-amount-presets" aria-label="Швидкий вибір суми">
              <button type="button" onClick={() => setQuickAmount(.25)} disabled={numericBalance <= 0 || numericBalance < 50}>25%</button>
              <button type="button" onClick={() => setQuickAmount(.5)} disabled={numericBalance <= 0 || numericBalance < 50}>50%</button>
              <button type="button" onClick={() => { setAmountInput(String(numericBalance)); setFormError('') }} disabled={numericBalance <= 0 || numericBalance < 50}>Уся сума</button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="withdraw-method">Спосіб виплати <span className="required-mark">*</span></label>
            <CustomSelect id="withdraw-method" value={method} onChange={(value) => { setMethod(value); setCardNumber(''); setIbanNumber(''); setShowCardNumber(true); setShowIban(true); setFormError(''); setFeedback('') }} options={PAYMENT_METHODS} aria-label="Спосіб виплати" />
          </div>

          <fieldset key={method} className="withdraw-card-fieldset">
            <legend>{isIbanMethod ? 'Рахунок IBAN одержувача' : 'Картка одержувача'} <span className="required-mark">*</span></legend>
            {isIbanMethod ? <>
              {availableIbans.length > 0 && <div className="withdraw-saved-cards">
                {availableIbans.map((account) => <div className={`withdraw-saved-card ${effectiveSelectedIbanId === account.id ? 'selected' : ''}`} key={account.id}>
                  <button type="button" className="withdraw-saved-card-select" role="radio" aria-checked={effectiveSelectedIbanId === account.id} onClick={() => { setIbanNumber(''); setSelectedIbanId(account.id); setFormError('') }}>
                    <span className="withdraw-card-brand-icon"><Landmark size={20} /></span><span className="withdraw-saved-card-copy"><strong>{formatSavedIban(account.last4)}</strong><small>{account.holderName}</small></span>{effectiveSelectedIbanId === account.id && <Check className="withdraw-card-check" size={18} />}
                  </button>
                  <button type="button" className="withdraw-card-delete" aria-label={`Видалити IBAN із номером ${account.last4}`} onClick={() => setConfirmDeleteIbanId(account.id)}><Trash2 size={17} /></button>
                </div>)}
              </div>}
                  <button type="button" className={`withdraw-new-card-choice ${effectiveSelectedIbanId === 'new' ? 'selected' : ''}`} role="radio" aria-checked={effectiveSelectedIbanId === 'new'} onClick={() => { setIbanNumber(''); setShowIban(true); setSelectedIbanId('new'); setFormError('') }}><span className="withdraw-radio-dot" /> Новий рахунок IBAN</button>
              {!selectedIban && <div className="withdraw-new-card-fields">
                <div className="form-field withdraw-iban-field">
                  <label htmlFor="withdraw-iban">Номер рахунку IBAN <span className="required-mark">*</span></label>
                  <div className="withdraw-card-number-wrap">
                    <input ref={ibanInputRef} id="withdraw-iban" className="withdraw-iban-input withdraw-card-number-input" type="text" inputMode="numeric" autoComplete="off" spellCheck="false" maxLength={36} readOnly={!showIban} value={showIban ? formatUkrainianIban(ibanNumber) : (ibanDigits ? formatIbanPreview(ibanDigits) : '')} onFocus={handleIbanFocus} onChange={handleIbanChange} placeholder="UA00 0000…" aria-invalid={ibanNumberError || undefined} aria-label="Номер рахунку IBAN" />
                    <button className="withdraw-card-number-toggle" type="button" aria-label={showIban ? 'Приховати IBAN' : 'Показати IBAN'} aria-pressed={!showIban} onPointerDown={(event) => event.preventDefault()} onClick={() => setShowIban((visible) => !visible)}><span className="sr-only">{showIban ? 'Приховати IBAN' : 'Показати IBAN'}</span>{showIban ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
                  </div>
                  <span className={`field-error ${ibanNumberError ? 'is-visible' : ''}`} role={ibanNumberError ? 'alert' : undefined}>{ibanNumberError ? formError : ''}</span>
                  <p className="withdraw-iban-security-note">Формат: UA та 27 цифр. Повний IBAN потрібен для виплати й не зберігається.</p>
                </div>
                <div className="form-field">
                  <label htmlFor="withdraw-iban-holder">ПІБ отримувача <span className="required-mark">*</span></label>
                  <input id="withdraw-iban-holder" type="text" autoComplete="name" maxLength={60} value={ibanHolder} onChange={(event) => { setIbanHolder(event.target.value); setFormError('') }} placeholder="ПІБ отримувача" aria-invalid={ibanHolderError || undefined} />
                  <span className={`field-error ${ibanHolderError ? 'is-visible' : ''}`} role={ibanHolderError ? 'alert' : undefined}>{ibanHolderError ? formError : ''}</span>
                </div>
                <label className="withdraw-save-card"><input type="checkbox" checked={saveIban} onChange={(event) => setSaveIban(event.target.checked)} /><span>Зберегти рахунок IBAN для наступних виплат</span></label>
                <p className="withdraw-card-storage-note">Зберігаються лише тип рахунку, ПІБ отримувача та останні 4 цифри. Повний номер IBAN не зберігається.</p>
              </div>}
            </> : <>
              {availableCards.length > 0 && <div className="withdraw-saved-cards">
                {availableCards.map((card) => <div className={`withdraw-saved-card ${effectiveSelectedCardId === card.id ? 'selected' : ''}`} key={card.id}>
                  <button type="button" className="withdraw-saved-card-select" role="radio" aria-checked={effectiveSelectedCardId === card.id} onClick={() => { setCardNumber(''); setShowCardNumber(true); setSelectedCardId(card.id); setFormError('') }}>
                    <span className="withdraw-card-brand-icon"><CreditCard size={20} /></span><span className="withdraw-saved-card-copy"><strong>{getPaymentCardBrandLabel(card.brand)} · {formatSavedCardNumber(card.last4)}</strong><small>{card.holderName}</small></span>{effectiveSelectedCardId === card.id && <Check className="withdraw-card-check" size={18} />}
                  </button>
                  <button type="button" className="withdraw-card-delete" aria-label={`Видалити картку ${card.brand} із номером ${card.last4}`} onClick={() => setConfirmDeleteCardId(card.id)}><Trash2 size={17} /></button>
                </div>)}
              </div>}
              <button type="button" className={`withdraw-new-card-choice ${effectiveSelectedCardId === 'new' ? 'selected' : ''}`} role="radio" aria-checked={effectiveSelectedCardId === 'new'} onClick={() => { setSelectedCardId('new'); setFormError('') }}><span className="withdraw-radio-dot" /> Нова картка</button>
              {!selectedCard && <div className="withdraw-new-card-fields">
                <div className="form-field">
                  <label htmlFor="withdraw-card-number">Номер картки <span className="required-mark">*</span></label>
                  <div className="withdraw-card-number-wrap">
                    <input id="withdraw-card-number" className="withdraw-card-number-input" type={showCardNumber ? 'text' : 'password'} inputMode="numeric" autoComplete="cc-number" maxLength={19} value={cardNumber} onChange={(event) => setCard(event.target.value)} placeholder="0000 0000 0000 0000" aria-invalid={cardNumberError || undefined} />
                    <button className="withdraw-card-number-toggle" type="button" aria-label={showCardNumber ? 'Приховати номер картки' : 'Показати номер картки'} aria-pressed={!showCardNumber} onClick={() => setShowCardNumber((visible) => !visible)}><span className="sr-only">{showCardNumber ? 'Приховати номер картки' : 'Показати номер картки'}</span>{showCardNumber ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
                  </div>
                  <span className={`field-error ${cardNumberError ? 'is-visible' : ''}`}>{cardNumberError ? formError : ''}</span>
                </div>
                <div className="form-field">
                  <label htmlFor="withdraw-cardholder">Ім’я власника картки <span className="required-mark">*</span></label>
                  <input id="withdraw-cardholder" type="text" autoComplete="cc-name" maxLength={60} value={cardholder} onChange={(event) => { setCardholder(event.target.value); setFormError('') }} placeholder="Ім’я власника картки" aria-invalid={cardholderError || undefined} />
                  <span className={`field-error ${cardholderError ? 'is-visible' : ''}`}>{cardholderError ? formError : ''}</span>
                </div>
                <label className="withdraw-save-card"><input type="checkbox" checked={saveCard} onChange={(event) => setSaveCard(event.target.checked)} /><span>Зберегти картку для наступних виплат</span></label>
                <p className="withdraw-card-storage-note">У браузері зберігаються лише бренд картки, ім’я власника та останні 4 цифри. Повний номер картки не зберігається.</p>
              </div>}
            </>}
          </fieldset>

          <div className="withdraw-total-card">
            <div><span>Сума виводу</span><strong>{formatMoney(amount)}</strong></div>
            <div><span>Комісія сервісу</span><strong>{formatMoney(0)}</strong></div>
            <div className="withdraw-total-final"><span>До зарахування {isIbanMethod ? 'на рахунок' : 'на картку'}</span><strong>{formatMoney(amount)}</strong></div>
            <div><span>Термін зарахування</span><strong>{isIbanMethod ? '1–3 банківські дні' : 'До 5 хвилин (24/7)'}</strong></div>
          </div>
          {formError && <p className="withdraw-form-error" role="alert">{formError}</p>}
          <button type="submit" className="primary-button withdraw-submit" disabled={!canSubmit}><Wallet size={18} /> {submitting ? 'Обробляємо виплату…' : 'Підтвердити виплату'}</button>
          {feedback && <p className="withdraw-feedback" role="status">{feedback}</p>}
        </form>
      </section>

      <aside className="withdraw-aside">
        <section className="panel withdraw-payment-preview">
          <div className="withdraw-section-heading"><span className="withdraw-section-icon">{isIbanMethod ? <Landmark size={22} /> : <CreditCard size={22} />}</span><div><h2>Рахунок одержувача</h2><p>Перевірте обраний спосіб зарахування.</p></div></div>
          <div className="withdraw-bank-card">
            <div className="withdraw-bank-card-top"><span className="withdraw-bank-chip">{isIbanMethod ? <Landmark size={22} /> : <CreditCard size={22} />}</span><strong className="withdraw-bank-brand">{isIbanMethod ? 'IBAN • СЕП НБУ' : getPaymentCardBrandLabel(chosenBrand)}</strong></div>
            <p className={`withdraw-bank-card-number tabular-nums font-mono tracking-wider whitespace-nowrap ${isIbanMethod ? 'withdraw-iban-preview-number' : 'text-sm sm:text-lg'}`}>{isIbanMethod ? (selectedIban ? formatSavedIban(selectedIban.last4) : formatIbanPreview(ibanDigits)) : selectedCard ? formatSavedCardNumber(selectedCard.last4) : formatBinLastFourPreview(cardDigits)}</p>
          <div className="withdraw-bank-card-bottom"><span>{isIbanMethod ? selectedIban?.holderName || ibanHolder || courierName : selectedCard?.holderName || (effectiveSelectedCardId === 'new' ? cardholder || courierName : 'Одержувач')}</span><span>{isIbanMethod ? '1–3 БАНКІВСЬКІ ДНІ' : 'ДО 5 ХВ · 24/7'}</span></div>
          </div>
        </section>
        <section className="panel withdraw-safety-card">
          <div className="withdraw-section-heading"><span className="withdraw-section-icon"><ShieldCheck size={22} /></span><div><h2>Умови та безпека виплат</h2><p>Коротко про зарахування коштів.</p></div></div>
          <ul>
            <li><Clock3 size={18} /><span>{isIbanMethod ? 'Стандартний переказ триває 1–3 банківські дні.' : 'Миттєвий переказ: до 5 хвилин, цілодобово.'}</span></li>
            <li><Building2 size={18} /><span>Мінімальна сума виплати — 50 грн.</span></li>
            <li><LockKeyhole size={18} /><span>Комісія сервісу — 0 грн.</span></li>
            <li><BadgeCheck size={18} /><span>Виплата доступна лише з балансу кур’єра.</span></li>
          </ul>
        </section>
      </aside>
    </div>

    <section className="panel withdraw-history-section">
      <div className="withdraw-history-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> ФІНАНСИ</span><h2>Історія виплат</h2><p>Переглядайте транзакції та відкривайте квитанції.</p></div><span className="withdraw-history-total"><Landmark size={19} /> Виплачено: <strong>{formatMoney(totalWithdrawn)}</strong></span></div>
      <div className="order-filter-tabs withdraw-history-tabs" role="tablist" aria-label="Фільтр історії виплат">
        {HISTORY_FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`order-filter-tab ${filter === item.id ? 'selected' : ''}`} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id]}</span></button>)}
      </div>
      {filteredPayouts.length ? historyContent : <EmptyState title={filter === 'processing' ? 'Немає виплат в обробці' : 'Історія виплат порожня'} message={filter === 'processing' ? 'Тут з’являться виплати, щойно вони будуть опрацьовуватися.' : 'Підтверджені виплати відображатимуться тут разом із квитанціями.'} />}
    </section>

    {receipt && typeof document !== 'undefined' && createPortal(<div className="withdraw-receipt-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null) }}>
      <section className="panel withdraw-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="withdraw-receipt-title">
        <button type="button" className="withdraw-receipt-close" aria-label="Закрити квитанцію" onClick={() => setReceipt(null)}><X size={19} /></button>
        <span className="withdraw-receipt-icon"><CheckCircle2 size={28} /></span><h2 id="withdraw-receipt-title">Виплату підтверджено</h2><p>Електронна квитанція</p>
        <div className="withdraw-receipt-details">
          <ReceiptRow label="ID операції"><div className="withdraw-receipt-reference-value"><strong className="tabular-nums">{payoutReference(receipt)}</strong><CopyButton text={payoutReference(receipt)} label="Копіювати ID" /></div></ReceiptRow>
          <ReceiptRow label="Дата й час"><strong>{payoutDate(receipt.createdAt)}</strong></ReceiptRow>
          <ReceiptRow label={receipt.type === 'iban' ? 'IBAN' : 'Картка'}><div className="withdraw-receipt-card"><span className="withdraw-network-badge">{receipt.type === 'iban' ? 'IBAN • СЕП НБУ' : getPaymentCardBrandLabel(receipt.cardBrand || 'Банківська картка')}</span><span className="withdraw-receipt-mask">{receipt.type === 'iban' ? formatSavedIban(receipt.last4 || receipt.cardLast4) : formatSavedCardNumber(receipt.last4 || receipt.cardLast4)}</span></div></ReceiptRow>
          <ReceiptRow label="Отримувач"><strong>{receipt.holderName || '—'}</strong></ReceiptRow>
          <ReceiptRow label="Спосіб"><strong>{receipt.method === 'standard' ? 'Стандартний переказ · 1–3 банківські дні' : 'Миттєвий переказ · до 5 хвилин (24/7)'}</strong></ReceiptRow>
          <ReceiptRow label="Сума до зарахування" className="withdraw-receipt-amount"><strong className="tabular-nums whitespace-nowrap">{formatMoney(receipt.amount)}</strong></ReceiptRow>
          <ReceiptRow label="Статус"><strong className="success-text">Виплачено</strong></ReceiptRow>
        </div>
        <button type="button" className="primary-button" onClick={() => setReceipt(null)}><ReceiptText size={18} /> Готово</button>
      </section>
    </div>, document.body)}
    <ConfirmModal
      open={Boolean(confirmDeleteCardId)}
      title="Видалити збережену картку?"
      message="Картку буде видалено зі списку для наступних виплат. Дані вже проведених виплат залишаться в історії."
      confirmLabel="Видалити картку"
      cancelLabel="Залишити картку"
      danger
      onClose={() => setConfirmDeleteCardId(null)}
      onConfirm={() => removeCard(confirmDeleteCardId)}
    />
    <ConfirmModal
      open={Boolean(confirmDeleteIbanId)}
      title="Видалити збережений IBAN?"
      message="Рахунок буде видалено зі списку для наступних виплат. Дані вже проведених виплат залишаться в історії."
      confirmLabel="Видалити рахунок"
      cancelLabel="Залишити рахунок"
      danger
      onClose={() => setConfirmDeleteIbanId(null)}
      onConfirm={() => removeIban(confirmDeleteIbanId)}
    />
  </div>
}
