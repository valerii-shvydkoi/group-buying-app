import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Clock3, Package, Users } from 'lucide-react'
import { CATEGORIES } from '../data/initialData.js'
import { formatMoney } from '../lib/money.js'
import { categoryVisual, PRODUCT_ICONS } from '../utils/productVisuals.js'
import { PURCHASE_TIMER_OPTIONS } from '../utils/purchaseTimer.js'
import { validateOrganizerForm } from '../utils/validation.js'
import { PageIntro } from './Shared.jsx'
import CustomSelect from './CustomSelect.jsx'

const NUMERIC_PURCHASE_FIELDS = new Set(['retail', 'wholesale', 'target', 'delivery'])
const MEASURE_PURCHASE_FIELDS = new Set(['totalWeightKg', 'totalVolumeL'])

export default function CreatePurchaseView({ organizer = '', onCreate = () => {} }) {
  const [values, setValues] = useState({ name: '', category: '', supplier: '', retail: '', wholesale: '', target: '', timer: '', delivery: '', description: '', pickupAddress: '', pickupHours: '', totalWeightKg: '', totalVolumeL: '' })
  const [touched, setTouched] = useState({})
  const [inputErrors, setInputErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const descriptionRef = useRef(null)
  const errors = validateOrganizerForm(values)
  const hasErrors = Object.values(errors).some(Boolean) || Object.values(inputErrors).some(Boolean)
  const visual = categoryVisual(values.category)
  const CoverIcon = PRODUCT_ICONS[visual.icon] || Package
  const retailPreview = Number(values.retail) || 0
  const wholesalePreview = Number(values.wholesale) || 0
  const previewDiscount = retailPreview > 0 ? Math.max(0, Math.round((retailPreview - wholesalePreview) / retailPreview * 100)) : 0
  const selectedTimerLabel = PURCHASE_TIMER_OPTIONS.find((option) => option.seconds === Number(values.timer))?.label || ''
  const targetAmount = Number(values.target)
  const hasValidTarget = Boolean(String(values.target).trim()) && Number.isFinite(targetAmount) && targetAmount > 0 && !inputErrors.target
  const warningText = selectedTimerLabel && hasValidTarget
    ? `Якщо за ${selectedTimerLabel} не збереться ${formatMoney(targetAmount)}, закупівлю буде скасовано.`
    : selectedTimerLabel
      ? `Якщо за ${selectedTimerLabel} не збереться мінімальна сума, закупівлю буде скасовано.`
      : hasValidTarget
        ? `Якщо протягом обраного часу не збереться ${formatMoney(targetAmount)}, закупівлю буде скасовано.`
        : 'Якщо протягом обраного часу не збереться мінімальна сума, закупівлю буде скасовано.'

  useEffect(() => {
    const textarea = descriptionRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [values.description])

  function change(name, value) {
    let normalizedValue = value
    let inputError = ''
    if (NUMERIC_PURCHASE_FIELDS.has(name)) {
      const compactValue = String(value).trim().replace(/\s/g, '')
      if (compactValue && !/^\d+$/.test(compactValue)) {
        normalizedValue = ''
        inputError = compactValue.startsWith('-')
          ? name === 'delivery' ? 'Вартість не може бути від’ємною' : 'Використовуйте лише ціле невід’ємне число'
          : 'Використовуйте лише ціле невід’ємне число'
      } else if (compactValue && !Number.isSafeInteger(Number(compactValue))) {
        normalizedValue = ''
        inputError = 'Значення завелике.'
      } else {
        normalizedValue = compactValue ? String(Number(compactValue)) : ''
      }
      setInputErrors((current) => ({ ...current, [name]: inputError }))
    } else if (MEASURE_PURCHASE_FIELDS.has(name)) {
      const compactValue = String(value).trim().replace(/,/g, '.')
      if (compactValue && !/^\d*(?:\.\d{0,2})?$/.test(compactValue)) {
        normalizedValue = ''
        inputError = 'Введіть невід’ємне число'
      } else if (compactValue && !Number.isFinite(Number(compactValue))) {
        normalizedValue = ''
        inputError = 'Значення завелике'
      } else {
        normalizedValue = compactValue
      }
      setInputErrors((current) => ({ ...current, [name]: inputError }))
    }
    setValues((current) => ({ ...current, [name]: normalizedValue }))
    setTouched((current) => ({ ...current, [name]: true }))
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (hasErrors || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onCreate(values)
    } finally {
      setIsSubmitting(false)
    }
  }

  function fieldError(name) {
    return submitted || touched[name] ? inputErrors[name] || errors[name] : ''
  }

  function fieldMessage(name) {
    return <small className="form-message-slot" aria-live="polite">{fieldError(name)}</small>
  }

  function inputField(name, label, options = {}) {
    const invalid = Boolean(fieldError(name))
    const required = options.required !== false
    return <label className="form-field" key={name}><span>{label} {required ? <i className="required-mark">*</i> : <small>(необов’язково)</small>}</span><input className={`text-[13px] sm:text-sm ${invalid ? 'invalid' : ''}`} type="text" inputMode={MEASURE_PURCHASE_FIELDS.has(name) ? 'decimal' : 'numeric'} pattern={MEASURE_PURCHASE_FIELDS.has(name) ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'} maxLength={options.maxLength || 9} required={required} aria-invalid={invalid} value={values[name]} onChange={(event) => change(name, event.target.value)} onBlur={() => setTouched((current) => ({ ...current, [name]: true }))} placeholder={options.placeholder || label.toLowerCase()} />{fieldMessage(name)}</label>
  }

  return (
    <div className="page-content create-content"><PageIntro label="Нова закупівля" description="Об’єднайте замовлення та запропонуйте сусідам гуртову ціну." /><div className="create-layout">
      <form className="panel create-form" onSubmit={submit} noValidate><h3 className="create-section-title">Товар</h3>
        <label className="form-field"><span>Назва товару <i className="required-mark">*</i></span><input className={`text-[13px] sm:text-sm ${fieldError('name') ? 'invalid' : ''}`} type="text" required aria-invalid={Boolean(fieldError('name'))} value={values.name} onChange={(event) => change('name', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, name: true }))} placeholder="Назва товару" maxLength={80} />{fieldMessage('name')}</label>
        <label className="form-field"><span>Категорія <i className="required-mark">*</i></span><CustomSelect className="form-custom-select" invalid={Boolean(fieldError('category'))} required value={values.category} placeholder="Оберіть категорію" onBlur={() => setTouched((current) => ({ ...current, category: true }))} onChange={(value) => change('category', value)} options={CATEGORIES.filter((category) => category !== 'Усі').map((category) => ({ value: category, label: category }))} aria-label="Оберіть категорію" />{fieldMessage('category')}</label>
        <label className="form-field"><span>Магазин / постачальник <i className="required-mark">*</i></span><input className={`text-[13px] sm:text-sm ${fieldError('supplier') ? 'invalid' : ''}`} type="text" required maxLength={80} aria-invalid={Boolean(fieldError('supplier'))} value={values.supplier} onChange={(event) => change('supplier', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, supplier: true }))} placeholder="Назва магазину / постачальника" />{fieldMessage('supplier')}</label>
        <div className="form-two-col">{inputField('retail', 'Роздрібна ціна, грн', { placeholder: 'Роздрібна ціна' })}{inputField('wholesale', 'Гуртова ціна, грн', { placeholder: 'Гуртова ціна' })}</div>
        <h3 className="create-section-title conditions-title">Умови збору</h3>
        <div className="form-two-col">{inputField('target', 'Мінімальний поріг, грн', { placeholder: 'Мінімальна сума' })}<label className="form-field"><span>Таймер збору <i className="required-mark">*</i></span><CustomSelect className="form-custom-select" invalid={Boolean(fieldError('timer'))} required value={values.timer} placeholder="Оберіть тривалість" onBlur={() => setTouched((current) => ({ ...current, timer: true }))} onChange={(value) => change('timer', value)} options={PURCHASE_TIMER_OPTIONS.map((option) => ({ value: String(option.seconds), label: option.label }))} aria-label="Оберіть тривалість збору" />{fieldMessage('timer')}</label></div>
        <div className="create-delivery-field-group">{inputField('delivery', 'Вартість доставки, грн', { placeholder: 'Вартість доставки' })}<p className="field-help create-delivery-help">Вартість доставки розподілиться між учасниками пропорційно замовленню.</p></div>
        <div className="form-two-col logistics-measures">{inputField('totalWeightKg', 'Загальна вага, кг', { required: false, placeholder: 'Вага, кг' })}{inputField('totalVolumeL', 'Загальний обсяг, л', { required: false, placeholder: 'Обсяг, л' })}</div>
        <label className="form-field"><span>Точка видачі <i className="required-mark">*</i></span><input className={`text-[13px] sm:text-sm ${fieldError('pickupAddress') ? 'invalid' : ''}`} type="text" required maxLength={90} aria-invalid={Boolean(fieldError('pickupAddress'))} value={values.pickupAddress} onChange={(event) => change('pickupAddress', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, pickupAddress: true }))} placeholder="Адреса точки видачі" />{fieldMessage('pickupAddress')}</label>
        <label className="form-field"><span>Графік роботи точки видачі <small>(необов’язково)</small></span><input className={`text-[13px] sm:text-sm ${fieldError('pickupHours') ? 'invalid' : ''}`} type="text" maxLength={40} aria-invalid={Boolean(fieldError('pickupHours'))} value={values.pickupHours} onChange={(event) => change('pickupHours', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, pickupHours: true }))} placeholder="09:00 – 21:00" />{fieldMessage('pickupHours')}</label>
        <label className="form-field"><span>Короткий опис <small>(необов’язково)</small></span><textarea ref={descriptionRef} className={`description-textarea resize-none overflow-hidden text-[13px] sm:text-sm ${fieldError('description') ? 'invalid' : ''}`} rows={2} aria-invalid={Boolean(fieldError('description'))} value={values.description} onChange={(event) => { const textarea = event.currentTarget; textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; change('description', event.target.value) }} onBlur={() => setTouched((current) => ({ ...current, description: true }))} placeholder="Опис товару (необов’язково)" maxLength={300} /><small className="description-counter">{values.description.length} / 300</small>{fieldMessage('description')}</label>
        <div className="create-form-footer"><button className="primary-button" type="submit" disabled={hasErrors || isSubmitting}>{isSubmitting ? 'Створюємо закупівлю…' : <>Створити закупівлю <ArrowRight size={18} /></>}</button></div>
      </form>

      <aside className="create-preview-column lg:sticky lg:top-20"><div className="preview-heading"><h3>Так закупівлю побачать учасники</h3></div><div className="purchase-card preview-purchase-card"><div className={`product-art preview-product-art h-28 art-${visual.art}`}><span className="art-glow" />{values.category && <span className="art-category">{values.category}</span>}<div className="product-art-placeholder"><div className="product-art-icon"><CoverIcon size={36} /></div><span className="art-pack-label preview-art-pack-label break-words [overflow-wrap:anywhere]">{values.name.trim() || 'Ваш товар'}</span></div></div><div className="purchase-card-body p-3.5 space-y-2"><div className="purchase-title-row"><h3 className="break-words [overflow-wrap:anywhere] whitespace-pre-line leading-relaxed text-left">{values.name.trim() || 'Назва товару'}</h3><span className="participants-count"><Users size={18} /> 0</span></div><p className="organizer-name text-left break-words [overflow-wrap:anywhere]">Організатор: <strong className="break-words [overflow-wrap:anywhere]">{organizer}</strong></p><p className="organizer-name text-left break-words [overflow-wrap:anywhere]">Магазин: <strong className="break-words [overflow-wrap:anywhere]">{values.supplier || 'Назва магазину або постачальника'}</strong></p><div className="progress-meta"><span>{formatMoney(0)} <span className="muted">/ {formatMoney(Number(values.target))}</span></span><strong>0%</strong></div><div className="progress-track"><span style={{ width: '0%' }} /></div><div className="price-row text-left"><span className="text-left">Ціна: роздрібна <i>→</i> гуртова</span><strong>{formatMoney(Number(values.retail))} <i>→</i> <b>{formatMoney(Number(values.wholesale))}</b>{previewDiscount > 0 && <span className="discount-badge">−{previewDiscount}%</span>}</strong></div><div className="timer-row"><Clock3 size={18} /><span>{selectedTimerLabel ? `Збір триватиме ${selectedTimerLabel}` : 'Оберіть тривалість збору'}</span></div><p className="product-description preview-product-description whitespace-pre-line break-words [overflow-wrap:anywhere] leading-relaxed text-left">{values.description || 'Тут з’явиться короткий опис товару.'}</p></div></div><div className="preview-rule-card mt-3 p-2.5 text-xs leading-relaxed"><span><Clock3 size={18} /></span><div><strong>Поріг не досягнуто вчасно?</strong><p>{warningText}</p></div></div></aside>
    </div></div>
  )
}
