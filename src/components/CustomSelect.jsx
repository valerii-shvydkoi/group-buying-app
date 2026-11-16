import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

const OPEN_SELECT_EVENT = 'gb:custom-select-open'

/** Accessible, theme-aware replacement for the browser's native select. */
export default function CustomSelect({
  value = '',
  options = [],
  onChange = () => {},
  placeholder = 'Оберіть варіант',
  className = '',
  triggerClassName = '',
  menuClassName = '',
  align = 'stretch',
  disabled = false,
  required = false,
  invalid = false,
  onBlur = () => {},
  name,
  id,
  'aria-label': ariaLabel,
}) {
  const generatedId = useId()
  const triggerId = id || `custom-select-${generatedId}`
  const listId = `${triggerId}-listbox`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [opensUp, setOpensUp] = useState(false)
  const [listMaxHeight, setListMaxHeight] = useState(240)
  const [activeIndex, setActiveIndex] = useState(-1)
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value))
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null
  const enabledIndexes = options.reduce((indexes, option, index) => {
    if (!option.disabled) indexes.push(index)
    return indexes
  }, [])

  function updateDirection() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8)
    const spaceAbove = Math.max(0, rect.top - 8)
    const shouldOpenUp = spaceBelow < 240
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow
    setOpensUp(shouldOpenUp)
    setListMaxHeight(Math.max(0, Math.min(240, availableSpace - 14)))
  }

  function openMenu(preferredIndex = selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] ?? -1) {
    if (disabled) return
    updateDirection()
    const safeIndex = enabledIndexes.includes(preferredIndex) ? preferredIndex : enabledIndexes[0] ?? -1
    setActiveIndex(safeIndex)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_SELECT_EVENT, { detail: triggerId }))
    setOpen(true)
  }

  function chooseOption(index) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(String(option.value))
    setOpen(false)
    setActiveIndex(index)
    onBlur()
    triggerRef.current?.focus()
  }

  function moveActive(direction) {
    if (!enabledIndexes.length) return
    const currentPosition = enabledIndexes.indexOf(activeIndex)
    const nextPosition = currentPosition < 0
      ? (direction > 0 ? 0 : enabledIndexes.length - 1)
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[nextPosition])
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openMenu(event.key === 'ArrowDown' ? selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] : selectedIndex >= 0 ? selectedIndex : enabledIndexes.at(-1))
      else moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) chooseOption(activeIndex)
      else openMenu()
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(enabledIndexes[0] ?? -1)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(enabledIndexes.at(-1) ?? -1)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  useEffect(() => {
    function closeOtherSelect(event) {
      if (event.detail !== triggerId) setOpen(false)
    }
    window.addEventListener(OPEN_SELECT_EVENT, closeOtherSelect)
    return () => window.removeEventListener(OPEN_SELECT_EVENT, closeOtherSelect)
  }, [triggerId])

  useEffect(() => {
    if (!open) return undefined
    function closeOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        onBlur()
      }
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function reposition() { updateDirection() }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, onBlur])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, listId])

  return (
    <div ref={rootRef} className={`custom-select ${align === 'stretch' ? 'custom-select-stretch' : 'custom-select-compact'} ${className}`.trim()}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`custom-select-trigger ${open ? 'is-open' : ''} ${invalid ? 'is-invalid' : ''} ${triggerClassName}`.trim()}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false)
            onBlur()
          } else openMenu()
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={`custom-select-value ${selectedOption ? '' : 'is-placeholder'}`}>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown className={`custom-select-chevron ${open ? 'is-open' : ''}`} size={16} aria-hidden="true" />
      </button>
      {open && <div className={`custom-select-menu ${opensUp ? 'opens-up' : ''} ${menuClassName}`.trim()}>
        <div id={listId} role="listbox" aria-labelledby={triggerId} className="custom-select-options" style={{ maxHeight: `${listMaxHeight}px` }}>
          {options.map((option, index) => {
            const selected = index === selectedIndex
            const active = index === activeIndex
            return <button
              id={`${listId}-option-${index}`}
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              className={`custom-select-option ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseOption(index)}
            >
              <span>{option.label}</span>
              {selected && <Check size={16} aria-hidden="true" />}
            </button>
          })}
          {!options.length && <p className="custom-select-empty">Немає доступних варіантів</p>}
        </div>
      </div>}
    </div>
  )
}
