function SkeletonBlock({ className = '' }) {
  return <span className={`skeleton-block ${className}`} aria-hidden="true" />
}

export function CatalogSkeleton() {
  return <div className="loading-skeleton-screen page-content" aria-busy="true" aria-label="Завантаження каталогу">
    <div className="skeleton-toolbar"><SkeletonBlock className="skeleton-chip" /><SkeletonBlock className="skeleton-chip" /><SkeletonBlock className="skeleton-search" /></div>
    <div className="skeleton-results"><SkeletonBlock className="skeleton-line short" /><SkeletonBlock className="skeleton-line medium" /></div>
    <div className="skeleton-catalog-grid">{Array.from({ length: 6 }, (_, index) => <article className="skeleton-purchase-card" key={index}>
      <SkeletonBlock className="skeleton-art" /><div className="skeleton-card-body"><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-line medium" /><SkeletonBlock className="skeleton-line short" /><SkeletonBlock className="skeleton-progress" /><SkeletonBlock className="skeleton-line medium" /></div>
    </article>)}</div>
  </div>
}

export function OrdersSkeleton() {
  return <div className="loading-skeleton-screen page-content" aria-busy="true" aria-label="Завантаження замовлень">
    <div className="skeleton-two-column"><section className="skeleton-panel"><SkeletonBlock className="skeleton-line medium" /><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-tracker" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line medium" /></section><aside className="skeleton-panel"><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line medium" /></aside></div>
  </div>
}

export function LogisticsSkeleton() {
  return <div className="loading-skeleton-screen page-content" aria-busy="true" aria-label="Завантаження доставок">
    <div className="skeleton-kpi-grid">{Array.from({ length: 3 }, (_, index) => <div className="skeleton-panel" key={index}><SkeletonBlock className="skeleton-line medium" /><SkeletonBlock className="skeleton-line title" /></div>)}</div>
    <div className="skeleton-logistics-grid">{Array.from({ length: 3 }, (_, index) => <article className="skeleton-panel" key={index}><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line medium" /></article>)}</div>
  </div>
}

export function WithdrawSkeleton() {
  return <div className="loading-skeleton-screen page-content" aria-busy="true" aria-label="Завантаження виплат">
    <div className="skeleton-kpi-grid">{Array.from({ length: 3 }, (_, index) => <div className="skeleton-panel" key={index}><SkeletonBlock className="skeleton-line medium" /><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-line short" /></div>)}</div>
    <div className="skeleton-two-column"><section className="skeleton-panel"><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line long" /><SkeletonBlock className="skeleton-line medium" /><SkeletonBlock className="skeleton-line long" /></section><aside className="skeleton-panel"><SkeletonBlock className="skeleton-line title" /><SkeletonBlock className="skeleton-art" /><SkeletonBlock className="skeleton-line long" /></aside></div>
  </div>
}

export function SkeletonForPage({ page = 'catalog' }) {
  if (page === 'orders' || page === 'checkout') return <OrdersSkeleton />
  if (page === 'logistics') return <LogisticsSkeleton />
  if (page === 'withdraw') return <WithdrawSkeleton />
  return <CatalogSkeleton />
}
