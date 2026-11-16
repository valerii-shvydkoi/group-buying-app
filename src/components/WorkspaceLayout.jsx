import { useEffect, useState } from 'react'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import BrandLogo from './BrandLogo.jsx'
import Sidebar from './Sidebar.jsx'
import { getAvatarStyle, initials } from '../utils/identity.js'
import { getRoleLabel } from '../utils/roles.js'

export default function WorkspaceLayout({ user = { name: '', role: 'participant' }, courierBalance = 0, purchases = [], wallet, theme = 'light', activePage = 'catalog', pageTitle = '', onNavigate = () => {}, onToggleTheme = () => {}, onSignOut = () => {}, children = null }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const userInitials = initials(user.firstName || user.name, user.lastName || '')
  const avatarStyle = getAvatarStyle(user.name, theme)

  function navigate(page) {
    setMenuOpen(false)
    onNavigate(page)
  }

  useEffect(() => {
    if (!menuOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const desktopBreakpoint = window.matchMedia('(min-width: 1024px)')
    function closeOnDesktop(event) {
      if (event.matches) setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    desktopBreakpoint.addEventListener('change', closeOnDesktop)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      desktopBreakpoint.removeEventListener('change', closeOnDesktop)
      document.body.style.overflow = previousOverflow
    }
  }, [menuOpen])

  return (
    <div className="workspace">
      <Sidebar user={user} courierBalance={courierBalance} purchases={purchases} wallet={wallet} userRole={user.role} theme={theme} activePage={activePage} onNavigate={navigate} onSignOut={onSignOut} isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="main-area min-w-0 lg:ml-64">
        <header className="topbar">
          <div className="topbar-title-wrap">
            <button className="mobile-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Відкрити меню" aria-expanded={menuOpen} aria-controls="workspace-sidebar"><Menu size={20} /></button>
            <BrandLogo className="topbar-brand-logo" />
            <h1 className="page-title text-base sm:text-xl font-bold leading-snug break-words" title={pageTitle}>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <button className="theme-toggle header-theme-toggle" type="button" onClick={onToggleTheme} aria-label={theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему'} title={theme === 'light' ? 'Темна тема' : 'Світла тема'}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
            <div className="user-summary"><strong title={user.name}>{user.name}</strong><span>{getRoleLabel(user.role)}</span></div>
            <span className="avatar profile-avatar" style={avatarStyle} role="img" aria-label={`${user.name}, ${getRoleLabel(user.role)}`} title={user.name}>{userInitials}</span>
            <button className="icon-button topbar-signout" onClick={onSignOut} title="Вийти" aria-label="Вийти"><LogOut size={18} /></button>
          </div>
        </header>
        <div className="workspace-content-shell">{children}</div>
      </main>
    </div>
  )
}
