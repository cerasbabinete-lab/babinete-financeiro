// ============================================================
// app/layout.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Global
// Função: Layout raiz do Next.js App Router
//         Importa Tabler Icons (webfont via CDN)
//         Define fonte Tahoma como padrão global
//         Envolve todas as páginas do sistema
// ============================================================

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gestão Financeira — Ceras Babinete',
  description: 'Sistema de gestão financeira Ceras Babinete',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Tabler Icons — webfont outline (5800+ ícones) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'Tahoma, Geneva, sans-serif',
          background: '#f0f4f7',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  )
}
