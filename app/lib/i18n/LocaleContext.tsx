'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type LocaleContextType = {
  locale: string
  setLocale: (l: string) => void
}

const LocaleContext = createContext<LocaleContextType>({ locale: 'en', setLocale: () => {} })

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState('en')
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
