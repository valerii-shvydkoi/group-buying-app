import { LogOut, Package, ShoppingBag, ShieldCheck, Sparkles, Truck, Users, Wallet, X } from 'lucide-react'
import BrandLogo from './BrandLogo.jsx'
import { getAvatarStyle, initials } from '../utils/identity.js'
import { getRoleLabel } from '../utils/roles.js'
import { getCourierFinanceSummary } from '../services/dataService.js'

function formatCompactBalance(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))
  if (amount >= 100_000) return `${Math.round(amount / 1_000).toLocaleString('uk-UA')} тис. ₴`
  return `${amount.toLocaleString('uk-UA')} ₴`
}

export default function Sidebar({ user = {}, courierBalance = 0, purchases = [], wallet, userRole = 'participant', theme = 'light', activePage = 'catalog', onNavigate = () => {}, onSignOut = () => {}, isOpen = false, onClose = () => {} }) {
  const isOrganizer = userRole === 'organizer'
  const isCourier = userRole === 'courier'
  const availableCourierBalance = isCourier
    ? getCourierFinanceSummary(purchases, user, wallet?.payouts).availableBalance
    : courierBalance

  return <>
    {isOpen && <button className="mobile-sidebar-backdrop" type="button" aria-label="Закрити меню" onClick={onClose} />}
    <aside id="workspace-sidebar" className={`sidebar z-40 lg:z-20 lg:w-64 overflow-x-hidden ${isOpen ? 'mobile-open' : ''}`} aria-label="Навігація робочого простору" aria-modal={isOpen ? 'true' : undefined}>
      <div className="sidebar-brand"><BrandLogo /><button className="sidebar-close-button" type="button" onClick={onClose} aria-label="Закрити меню"><X size={18} /></button></div>
      <div className="sidebar-user">
        <div className="sidebar-user-top">
          <span className="sidebar-user-avatar" style={getAvatarStyle(user.name, theme)}>{initials(user.firstName || user.name, user.lastName || '')}</span>
          <div className="sidebar-user-info">
            <div className="sidebar-user-heading"><strong title={user.name}>{user.name}</strong><small className="sidebar-user-role">{getRoleLabel(userRole)}</small></div>
          </div>
        </div>
        <span className="sidebar-user-email text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-all" title={user.email}>{user.email}</span>
        <button className="sidebar-user-signout" type="button" onClick={() => { onClose(); onSignOut() }}><LogOut size={18} /> Вийти</button>
      </div>
      <nav className="side-nav overflow-x-hidden" aria-label="Основна навігація">
        {isOrganizer ? (
          <div className="nav-group organizer-nav">
            <p className="nav-caption">ОРГАНІЗАТОР</p>
            <NavItem icon={Users} label="Мої закупівлі" active={activePage === 'manage'} onClick={() => { onNavigate('manage'); onClose() }} />
            <NavItem icon={Sparkles} label="Нова закупівля" active={activePage === 'create'} onClick={() => { onNavigate('create'); onClose() }} />
            <NavItem icon={Package} label="Каталог закупівель" active={activePage === 'catalog' || activePage === 'purchase'} onClick={() => { onNavigate('catalog'); onClose() }} />
          </div>
        ) : isCourier ? (
          <div className="nav-group courier-nav">
            <p className="nav-caption">{getRoleLabel('courier').toLocaleUpperCase('uk-UA')}</p>
            <NavItem icon={Truck} label="Доставки" active={activePage === 'logistics'} onClick={() => { onNavigate('logistics'); onClose() }} />
            <NavItem icon={Wallet} label="Вивести кошти" badge={formatCompactBalance(availableCourierBalance)} active={activePage === 'withdraw'} onClick={() => { onNavigate('withdraw'); onClose() }} />
          </div>
        ) : (
          <div className="nav-group">
            <p className="nav-caption">УЧАСНИК</p>
            <NavItem icon={Package} label="Каталог закупівель" active={activePage === 'catalog' || activePage === 'purchase'} onClick={() => { onNavigate('catalog'); onClose() }} />
            <NavItem icon={ShoppingBag} label="Мої замовлення" active={activePage === 'orders' || activePage === 'checkout'} onClick={() => { onNavigate('orders'); onClose() }} />
          </div>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="secure-note"><div className="secure-note-icon"><ShieldCheck size={18} /></div><div><strong>Оплата захищена</strong><p>Кошти утримуються до отримання товару на точці видачі</p></div></div>
      </div>
    </aside>
  </>
}

function NavItem({ icon: Icon, label, badge = '', active = false, onClick = () => {} }) {
  return <button className={`nav-item w-full max-w-full min-w-0 overflow-hidden flex items-center justify-start gap-2.5 px-3 py-2.5 text-left ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
    <span className="nav-icon shrink-0"><Icon className="w-4 h-4" size={16} strokeWidth={1.8} /></span>
    <span className="nav-item-label min-w-0 flex-1 break-words whitespace-normal text-[13.5px] font-medium leading-snug" title={label}>{label}</span>
    {badge !== '' && <span className="nav-balance-badge ml-auto shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums" title={`Доступно до виплати: ${badge}`}>{badge}</span>}
  </button>
}
