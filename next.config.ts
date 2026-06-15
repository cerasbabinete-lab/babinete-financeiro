// ============================================================
// next.config.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Configuração do Next.js
//         Permite imagens locais da pasta public/img
//         e desabilita avisos de imagens sem domínio externo
// ============================================================

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Permite carregar imagens locais da pasta public sem restrições
    unoptimized: true,
  },
}

export default nextConfig
