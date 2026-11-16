export default function BrandLogo({ onBrandBanner = false, className = '' }) {
  const bannerRing = onBrandBanner ? 'ring-1 ring-white/30 shadow-sm' : ''

  return (
    <div className={`brand-lockup ${className}`.trim()} aria-label="Group Buying">
      <span className={`brand-mark brand-logo-mark rounded-xl text-white font-extrabold tracking-tight ${bannerRing}`.trim()} aria-hidden="true">GB</span>
      <span className="brand-name">Group Buying</span>
    </div>
  )
}
