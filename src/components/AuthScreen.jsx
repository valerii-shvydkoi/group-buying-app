import { useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Lock, Moon, ShieldCheck, ShoppingBag, Sun, Truck, Users } from 'lucide-react'
import BrandLogo from './BrandLogo.jsx'
import { isValidPersonName, sanitizePersonName } from '../utils/personName.js'
import { getRoleLabel } from '../utils/roles.js'
import { localizeAuthError } from '../utils/authErrors.js'
import { isValidEmail, isValidPassword } from '../utils/validation.js'

export default function AuthScreen({
  theme = 'light',
  recoveryMode = false,
  serverMessage = '',
  onToggleTheme = () => {},
  onLogin = async () => 'Не вдалося увійти.',
  onRegister = async () => 'Не вдалося зареєструватися.',
  onResetPassword = async () => 'Не вдалося оновити пароль.',
}) {
  const [mode, setMode] = useState('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('participant')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState({})
  const [busy, setBusy] = useState(false)

  const isRegistration = mode === 'register' && !recoveryMode
  const isReset = mode === 'reset' || recoveryMode
  const normalizedFirstName = firstName.trim()
  const normalizedLastName = lastName.trim()
  const firstNameProblem = !String(firstName).trim() ? 'Введіть ім’я' : !isValidPersonName(normalizedFirstName) ? 'Мінімум 2 символи' : ''
  const lastNameProblem = !String(lastName).trim() ? 'Введіть прізвище' : !isValidPersonName(normalizedLastName) ? 'Мінімум 2 символи' : ''
  const emailProblem = !String(email).trim() ? 'Введіть email' : !isValidEmail(email.trim()) ? 'Некоректний email' : ''
  const passwordRequired = true
  const passwordProblem = !String(password).trim()
    ? 'Введіть пароль'
    : (isRegistration || isReset) && !isValidPassword(password)
      ? 'Мінімум 8 символів'
      : ''
  const passwordValid = !passwordRequired || !passwordProblem
  const showErrors = submitted
  const firstNameError = (isRegistration || isReset) && (showErrors || touched.firstName) ? firstNameProblem : ''
  const lastNameError = (isRegistration || isReset) && (showErrors || touched.lastName) ? lastNameProblem : ''
  const emailError = (showErrors || touched.email) ? emailProblem : ''
  const passwordError = passwordRequired && (showErrors || touched.password) ? passwordProblem : ''

  function clearValidation() {
    setError('')
    setInfo('')
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    if (nextMode !== 'reset') {
      setFirstName('')
      setLastName('')
      setEmail('')
      setRole('participant')
    }
    setPassword('')
    setShowPassword(false)
    setError('')
    setInfo('')
    setSubmitted(false)
    setTouched({})
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setTouched({ firstName: true, lastName: true, email: true, password: passwordRequired })
    setError('')
    setInfo('')

    if (((isRegistration || isReset) && (firstNameProblem || lastNameProblem)) || emailProblem || !passwordValid) return

    const normalizedEmail = email.trim().toLowerCase()
    setBusy(true)
    try {
      let result
      if (isRegistration) {
        result = await onRegister({
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: normalizedEmail,
          role,
          password,
        })
      } else if (isReset) {
        result = await onResetPassword({ email: normalizedEmail, firstName: normalizedFirstName, lastName: normalizedLastName, newPassword: password })
      } else {
        result = await onLogin({ email: normalizedEmail, password })
      }

      if (typeof result === 'string' && result) {
        setError(localizeAuthError(result))
      } else if (isReset) {
        setMode('login')
        setEmail(normalizedEmail)
        setFirstName('')
        setLastName('')
        setPassword('')
        setShowPassword(false)
        setSubmitted(false)
        setTouched({})
        setInfo('Пароль успішно оновлено. Увійдіть із новим паролем.')
      }
    } catch (submitError) {
      setError(localizeAuthError(submitError))
    } finally {
      setBusy(false)
    }
  }

  const title = isRegistration ? 'Створити акаунт' : isReset ? 'Відновлення пароля' : 'Вхід до Group Buying'
  const description = isRegistration
    ? 'Зареєструйтеся, щоб долучатися до закупівель або створювати власні.'
    : isReset
      ? 'Підтвердьте профіль за email, ім’ям і прізвищем та задайте новий пароль.'
      : 'Увійдіть, щоб переглядати закупівлі та керувати своїми замовленнями.'
  const visibleServerError = serverMessage ? localizeAuthError(serverMessage) : ''

  return (
    <main className="auth-layout min-h-dvh w-full grid grid-cols-1 lg:grid-cols-[45%_55%]">
      <section className="auth-story" aria-label="Переваги Group Buying">
        <div className="auth-story-top"><BrandLogo onBrandBanner /><button className="theme-toggle auth-theme-toggle" onClick={onToggleTheme} aria-label="Змінити тему">{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button></div>
        <div className="story-copy">
          <span className="eyebrow light-eyebrow"><span className="eyebrow-dot" /> Спільнота мешканців</span>
          <h1>Купуємо разом&nbsp;—<br />платимо менше</h1>
          <p className="story-intro">Об’єднуйте замовлення, щоб отримати гуртову ціну та зручну доставку до дому.</p>
          <ul className="benefit-list">
            <li><span className="benefit-icon"><Check size={18} /></span>Гуртова ціна після досягнення порогу збору</li>
            <li><span className="benefit-icon"><Check size={18} /></span>Доставка розподіляється пропорційно замовленню</li>
            <li><span className="benefit-icon"><Check size={18} /></span>Відстеження статусу до отримання товару</li>
          </ul>
        </div>
        <div className="story-footnote"><ShieldCheck size={18} /> Оплата захищена до отримання товару</div>
      </section>
      <section className="auth-panel">
        <div className="mobile-brand auth-mobile-toolbar flex lg:hidden">
          <BrandLogo />
          <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему'} title={theme === 'light' ? 'Темна тема' : 'Світла тема'}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
        <form className={`auth-card auth-form ${isRegistration || isReset ? 'auth-card-registration' : ''}`} onSubmit={handleSubmit} noValidate>
          <span className="eyebrow"><span className="eyebrow-dot" /> {isReset ? 'Безпека акаунта' : 'Вітаємо у спільноті'}</span>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>

          {(isRegistration || isReset) && <>
            <div className="auth-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="auth-field">
                <label className="field-label" htmlFor="auth-first-name">Ім’я <i className="required-mark">*</i></label>
                <div className={`input-wrap ${firstNameError ? 'invalid' : ''}`}><input className="text-[13px] sm:text-sm" id="auth-first-name" autoComplete="given-name" type="text" required maxLength={25} aria-invalid={Boolean(firstNameError)} aria-describedby="first-name-message" value={firstName} onBlur={() => setTouched((current) => ({ ...current, firstName: true }))} onChange={(event) => { setFirstName(sanitizePersonName(event.target.value)); clearValidation() }} placeholder="Ваше ім’я" /></div>
                <div id="first-name-message" className="auth-message-slot min-h-[16px] text-sm" aria-live="polite">{firstNameError && <small className="field-error">{firstNameError}</small>}</div>
              </div>
              <div className="auth-field">
                <label className="field-label" htmlFor="auth-last-name">Прізвище <i className="required-mark">*</i></label>
                <div className={`input-wrap ${lastNameError ? 'invalid' : ''}`}><input className="text-[13px] sm:text-sm" id="auth-last-name" autoComplete="family-name" type="text" required maxLength={25} aria-invalid={Boolean(lastNameError)} aria-describedby="last-name-message" value={lastName} onBlur={() => setTouched((current) => ({ ...current, lastName: true }))} onChange={(event) => { setLastName(sanitizePersonName(event.target.value)); clearValidation() }} placeholder="Ваше прізвище" /></div>
                <div id="last-name-message" className="auth-message-slot min-h-[16px] text-sm" aria-live="polite">{lastNameError && <small className="field-error">{lastNameError}</small>}</div>
              </div>
            </div>
            {isRegistration && <>
              <p className="field-label role-picker-label">Роль <i className="required-mark">*</i></p>
              <div className="role-picker grid grid-cols-3 gap-2" role="group" aria-label="Оберіть роль">
                <button type="button" className={`role-option ${role === 'participant' ? 'selected' : ''}`} onClick={() => setRole('participant')}><Users size={18} /> {getRoleLabel('participant')}</button>
                <button type="button" className={`role-option ${role === 'organizer' ? 'selected' : ''}`} onClick={() => setRole('organizer')}><ShoppingBag size={18} /> {getRoleLabel('organizer')}</button>
                <button type="button" className={`role-option ${role === 'courier' ? 'selected' : ''}`} onClick={() => setRole('courier')}><Truck size={18} /> {getRoleLabel('courier')}</button>
              </div>
            </>}
          </>}

          <>
            <label className="field-label" htmlFor="email">Електронна пошта <i className="required-mark">*</i></label>
            <div className={`input-wrap ${emailError ? 'invalid' : ''}`}><span className="input-prefix" aria-hidden="true">@</span><input className="has-leading-icon text-[13px] sm:text-sm" id="email" autoComplete="email" type="email" required maxLength={60} aria-invalid={Boolean(emailError)} aria-describedby="email-message" value={email} onBlur={() => setTouched((current) => ({ ...current, email: true }))} onChange={(event) => { setEmail(event.target.value); clearValidation() }} placeholder="name@example.com" /></div>
            <div id="email-message" className="auth-message-slot min-h-[16px] text-sm" aria-live="polite">{emailError && <small className="field-error">{emailError}</small>}</div>
          </>

          {!isReset && mode === 'login'
            ? <div className="label-row"><label className="field-label" htmlFor="password">Пароль <i className="required-mark">*</i></label><button className="text-button auth-forgot-link" type="button" onClick={() => changeMode('reset')}>Забули пароль?</button></div>
            : <label className="field-label auth-password-label" htmlFor="password">{isReset ? 'Новий пароль' : 'Пароль'} <i className="required-mark">*</i></label>}
          <>
            <div className={`input-wrap ${passwordError ? 'invalid' : ''}`}><span className="input-prefix password-prefix text-slate-400" aria-hidden="true"><Lock size={18} /></span><input className="has-leading-icon has-trailing-action text-[13px] sm:text-sm" id="password" autoComplete={isRegistration || isReset ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} required maxLength={64} minLength={isRegistration || isReset ? 8 : undefined} aria-invalid={Boolean(passwordError)} aria-describedby="password-message" value={password} onBlur={() => setTouched((current) => ({ ...current, password: true }))} onChange={(event) => { setPassword(event.target.value); clearValidation() }} placeholder={isRegistration || isReset ? 'Мінімум 8 символів' : 'Ваш пароль'} /><button className="input-action" type="button" aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            <div id="password-message" className="auth-message-slot min-h-[16px] text-sm" aria-live="polite">
              {passwordError && <small className="field-error">{passwordError}</small>}
            </div>
          </>

          {(error || visibleServerError) && <div className="form-error auth-feedback mt-3 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm leading-snug" role="alert"><AlertCircle size={18} className="shrink-0" /><span>{error || visibleServerError}</span></div>}
          {info && <div className="form-success auth-feedback mt-3 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm leading-snug" role="status"><CheckCircle2 size={18} className="shrink-0" /><span>{info}</span></div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Зачекайте…' : isReset ? 'Оновити пароль' : isRegistration ? 'Зареєструватися' : 'Увійти'} {!isReset && <span aria-hidden="true">→</span>}</button>

          {isReset
            ? <p className="register-copy"><button type="button" onClick={() => changeMode('login')}>Повернутися до входу</button></p>
            : <p className="register-copy">{isRegistration ? 'Вже є акаунт?' : 'Ще немає акаунта?'} <button type="button" onClick={() => changeMode(isRegistration ? 'login' : 'register')}>{isRegistration ? 'Увійти' : 'Зареєструватися'}</button></p>}
        </form>
      </section>
    </main>
  )
}
