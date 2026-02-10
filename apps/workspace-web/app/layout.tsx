import React from 'react'
import './globals.css'
import 'prismjs/themes/prism.css'
import { Providers } from './providers'

export const metadata = { title: '新智流', description: 'Chat UI (Next.js)' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}