'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Locale, LOCALES } from './translations'

interface LocaleCtx { locale: Locale; setLocale: (l: Locale) => void }
const Ctx = createContext<LocaleCtx>({ locale: 'en', setLocale: () => {} })

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')
  useEffect(() => {
    const saved = localStorage.getItem('finsyt-locale') as Locale | null
    if (saved && LOCALES.find(l => l.code === saved)) setLocaleState(saved)
    else {
      // Auto-detect from browser
      const browser = navigator.language.slice(0, 2) as Locale
      if (LOCALES.find(l => l.code === browser)) setLocaleState(browser)
    }
  }, [])
  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('finsyt-locale', l)
  }
  return <Ctx.Provider value={{ locale, setLocale }}>{children}</Ctx.Provider>
}

export function useLocale() { return useContext(Ctx) }
