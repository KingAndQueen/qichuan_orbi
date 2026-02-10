// app/providers.tsx
"use client"

import React from 'react'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider 
      attribute="data-theme" 
      storageKey="of:theme"
      defaultTheme="light"
    >
      {children}
    </ThemeProvider>
  )
}
