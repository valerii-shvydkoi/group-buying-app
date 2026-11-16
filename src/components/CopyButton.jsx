import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export default function CopyButton({ text = '', label = 'Копіювати' }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  async function copyText() {
    const value = String(text ?? '')
    if (!value.trim()) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const temporary = document.createElement('textarea')
        temporary.value = value
        temporary.setAttribute('readonly', '')
        temporary.style.position = 'fixed'
        temporary.style.opacity = '0'
        document.body.append(temporary)
        temporary.select()
        const success = document.execCommand('copy')
        temporary.remove()
        if (!success) return
      }

      setCopied(true)
      window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return <button
    type="button"
    className={`copy-button inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium leading-none shrink-0 whitespace-nowrap bg-white text-slate-700 border border-slate-200 hover:border-[#007A53]/40 hover:bg-[#007A53]/5 hover:text-[#007A53] dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-400 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007A53]/25 ${copied ? 'copied border-[#007A53] bg-[#007A53]/10 text-[#007A53] dark:bg-emerald-500/15 dark:text-emerald-400' : ''}`}
    onClick={copyText}
    aria-label={copied ? 'Скопійовано' : label}
    title={copied ? 'Скопійовано' : label}
  >
    {copied
      ? <Check className="w-3.5 h-3.5 text-[#007A53] dark:text-emerald-400 shrink-0" aria-hidden="true" />
      : <Copy className="w-3.5 h-3.5 text-[#007A53] dark:text-emerald-400 shrink-0" aria-hidden="true" />}
    <span aria-live="polite">{copied ? 'Скопійовано' : label}</span>
  </button>
}
