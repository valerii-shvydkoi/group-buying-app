import { useMemo, useState } from 'react'
import { ArrowRight, Check, Clock3, EyeOff, Package, Search, Users, X } from 'lucide-react'
import { CATEGORIES } from '../data/initialData.js'
import { formatMoney } from '../lib/money.js'
import { getPurchasePricing, percentOf, safeNumber } from '../utils/calculations.js'
import { formatCountdown, purchaseRemainingSeconds } from '../utils/purchaseTimer.js'
import { PRODUCT_ICONS } from '../utils/productVisuals.js'
import { EmptyState, Notice, PageIntro } from './Shared.jsx'
import CustomSelect from './CustomSelect.jsx'

const SORT_OPTIONS = [
  { value: 'default', label: 'За замовчуванням' },
  { value: 'goal', label: 'Близько до 100 % збору' },
  { value: 'discount', label: 'Найбільша знижка (%)' },
  { value: 'price', label: 'Найменша ціна' },
  { value: 'ending', label: 'Скоро завершуються' },
]

function isReached(purchase) {
  return getPurchasePricing(purchase).reached
}

function isTargetReached(purchase) {
  return getPurchasePricing(purchase).targetReached
}

function isClosed(purchase, now) {
  return ['Завершено', 'Скасовано'].includes(purchase.status)
    || isReached(purchase)
    || (!isReached(purchase) && purchaseRemainingSeconds(purchase, now) <= 0)
}

function discountPercent(purchase) {
  const retail = safeNumber(purchase.retail)
  return retail > 0 ? Math.max(0, Math.round((retail - safeNumber(purchase.wholesale)) / retail * 100)) : 0
}

export default function CatalogView({ purchases = [], now, userRole = 'participant', userId = '', notice = '', onDismissNotice = () => {}, onOpenPurchase = () => {}, onCreatePurchase = () => {} }) {
  const [category, setCategory] = useState('Усі')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('default')
  const [hideClosed, setHideClosed] = useState(true)
  const matchingPurchases = useMemo(() => purchases.filter((purchase) => {
    const matchesCategory = category === 'Усі' || purchase.category === category
    const searchable = `${purchase.name || ''} ${purchase.category || ''} ${purchase.organizerName || purchase.organizer || ''} ${purchase.supplier || ''} ${purchase.description || ''} ${purchase.detail || ''}`.toLocaleLowerCase('uk-UA')
    return matchesCategory && searchable.includes(query.toLocaleLowerCase('uk-UA').trim())
  }), [purchases, category, query])
  const openCollections = matchingPurchases.filter((purchase) => !isClosed(purchase, now)).length
  const fundedCollections = matchingPurchases.filter((purchase) => isTargetReached(purchase)).length
  const visiblePurchases = useMemo(() => {
    const source = hideClosed ? matchingPurchases.filter((purchase) => !isClosed(purchase, now)) : [...matchingPurchases]
    if (sortBy === 'goal') source.sort((a, b) => percentOf(b.collected, b.target) - percentOf(a.collected, a.target))
    if (sortBy === 'discount') source.sort((a, b) => discountPercent(b) - discountPercent(a))
    if (sortBy === 'price') source.sort((a, b) => (isReached(a) ? safeNumber(a.wholesale) : safeNumber(a.retail)) - (isReached(b) ? safeNumber(b.wholesale) : safeNumber(b.retail)))
    if (sortBy === 'ending') source.sort((a, b) => purchaseRemainingSeconds(a, now) - purchaseRemainingSeconds(b, now))
    return source
  }, [matchingPurchases, hideClosed, sortBy, now])
  const purchaseCountLabel = formatPurchaseCount(visiblePurchases.length)

  function resetFilters() {
    setCategory('Усі')
    setQuery('')
    setSortBy('default')
    setHideClosed(false)
  }

  return (
    <div className="page-content catalog-content">
      {notice && <Notice message={notice} onClose={onDismissNotice} />}
      <PageIntro label="Каталог закупівель" description="Знаходьте спільні замовлення та долучайтеся до гуртових цін." />
      <section className="catalog-tools" aria-label="Фільтри каталогу">
        <div className="category-list" role="group" aria-label="Категорії закупівель">{CATEGORIES.map((item) => <button key={item} className={`filter-chip ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className={`search-box${query ? ' has-query' : ''}`}><Search size={18} aria-hidden="true" /><input type="text" className="text-[13px] sm:text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук товару або магазину" aria-label="Пошук за товаром, магазином чи описом" />{query && <button className="search-clear" type="button" aria-label="Очистити пошук" onClick={() => setQuery('')}><X size={18} /></button>}</div>
      </section>
      <section className="catalog-view-controls" aria-label="Сортування та показ закупівель">
        <label className="catalog-sort-control">Сортування
          <CustomSelect value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} aria-label="Сортувати закупівлі" align="compact" />
        </label>
        <button className={`catalog-closed-toggle ${hideClosed ? 'selected' : ''}`} type="button" aria-pressed={hideClosed} onClick={() => setHideClosed((hidden) => !hidden)}><EyeOff size={17} /><span>{hideClosed ? 'Показати завершені / скасовані' : 'Приховати завершені / скасовані'}</span></button>
      </section>
      <div className="catalog-results-row"><span>{visiblePurchases.length} {purchaseCountLabel}</span><span>{openCollections} відкритих зборів · {fundedCollections} зібрано на 100 %</span></div>
      {visiblePurchases.length ? <section className="purchase-grid" aria-label="Закупівлі">{visiblePurchases.map((purchase) => <PurchaseCard key={purchase.id} purchase={purchase} now={now} userRole={userRole} isOwnPurchase={userRole === 'organizer' && purchase.organizerId === userId} onClick={() => onOpenPurchase(purchase.id)} />)}</section> : purchases.length === 0 ? <EmptyState title="Активних закупівель поки немає" message="Коли організатори створять закупівлі, вони з’являться у цьому каталозі." onReset={userRole === 'organizer' ? onCreatePurchase : null} resetLabel="Створити першу закупівлю" /> : <EmptyState title={hideClosed && matchingPurchases.length ? 'Усі знайдені закупівлі завершені' : 'За вашим запитом закупівель не знайдено'} message="Змініть пошук і фільтри або покажіть завершені закупівлі." onReset={resetFilters} resetLabel="Скинути пошук і фільтри" />}
    </div>
  )
}

function formatPurchaseCount(count) {
  const lastTwo = count % 100
  const lastDigit = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return 'закупівель'
  if (lastDigit === 1) return 'закупівля'
  if (lastDigit >= 2 && lastDigit <= 4) return 'закупівлі'
  return 'закупівель'
}

function PurchaseCard({ purchase, now, userRole = 'participant', isOwnPurchase = false, onClick = () => {} }) {
  const Icon = PRODUCT_ICONS[purchase.icon] || Package
  const percentage = percentOf(purchase.collected, purchase.target)
  const reached = isReached(purchase)
  const targetReached = isTargetReached(purchase)
  const participantCount = getPurchasePricing(purchase).participantCount
  const discount = discountPercent(purchase)
  const secondsLeft = purchaseRemainingSeconds(purchase, now)
  const cancelled = purchase.status === 'Скасовано' || (!reached && secondsLeft === 0)
  const urgent = !reached && !cancelled && secondsLeft < 60 * 60
  return (
    <button type="button" className="purchase-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" onClick={onClick} aria-label={`Відкрити закупівлю ${purchase.name}`}>
      <div className={`product-art art-${purchase.art || 'coffee'}`}><span className="art-glow" /><span className="art-category">{purchase.category}</span><div className="product-art-placeholder"><div className="product-art-icon"><Icon size={36} strokeWidth={1.45} /></div><span className="art-pack-label">{purchase.name.split(',')[1]?.trim() || 'Набір'}</span></div></div>
      <div className="purchase-card-body"><div className="purchase-title-row"><h3 className="break-words whitespace-pre-line leading-relaxed text-left" title={purchase.name}>{purchase.name}</h3>{reached && <span className="threshold-badge">Поріг досягнуто</span>}{targetReached && !reached && <span className="threshold-badge">Потрібен ще 1 учасник</span>}<span className="participants-count" title="Учасники закупівлі"><Users size={18} /> {participantCount}</span></div><p className="organizer-name text-left">Організатор: <strong className="break-words leading-snug" title={purchase.organizerName || purchase.organizer}>{purchase.organizerName || purchase.organizer}</strong></p>{purchase.supplier && <p className="organizer-name text-left">Магазин: <strong className="break-words leading-snug" title={purchase.supplier}>{purchase.supplier}</strong></p>}<div className="progress-meta"><span>{formatMoney(purchase.collected)} <span className="muted">/ {formatMoney(purchase.target)}</span></span><strong>{percentage}%</strong></div><div className={`progress-track ${reached ? 'reached' : ''}`} role="progressbar" aria-label={`Збір для закупівлі ${purchase.name}`} aria-valuenow={percentage} aria-valuemin="0" aria-valuemax="100"><span className="transition-all duration-500 ease-out" style={{ width: `${percentage}%` }} /></div><div className="price-row text-left"><span className="text-left">Ціна: роздрібна <i>→</i> гуртова</span><strong>{formatMoney(purchase.retail)} <i>→</i> <b>{formatMoney(purchase.wholesale)}</b>{discount > 0 && <span className="discount-badge">−{discount}%</span>}</strong></div><div className={`timer-row ${urgent ? 'urgent critical' : ''} ${reached ? 'reached' : ''} ${cancelled ? 'cancelled' : ''}`}><Clock3 size={18} /><span>{cancelled ? 'Збір скасовано · час вичерпано' : reached ? 'Гуртова ціна активована' : targetReached ? 'Потрібен ще 1 учасник для гуртової ціни' : `Залишилось ${formatCountdown(secondsLeft)}${urgent ? ' · менше години' : ''}`}</span>{reached && <Check className="discount-confirm-icon" size={18} />}</div><p className="product-description line-clamp-2 break-words text-left">{purchase.detail || purchase.description}</p></div>
      <div className="card-action"><span>{isOwnPurchase ? 'Перейти до керування' : userRole === 'organizer' ? 'Перегляд закупівлі' : 'Деталі закупівлі'}</span><ArrowRight size={18} /></div>
    </button>
  )
}
