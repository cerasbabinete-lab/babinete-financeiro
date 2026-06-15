// ============================================================
// next.config.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Configuração do Next.js
//         Permite imagens locais da pasta public/img
//         allowedDevOrigins: permite acesso de dispositivos na
//         rede local (celular, tablet) durante desenvolvimento
// ============================================================
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Permite carregar imagens locais da pasta public sem restrições
    unoptimized: true,
  },
  // Permite que dispositivos na rede local acessem o servidor de desenvolvimento
  // Necessário para testar no celular via IP (ex: http://192.168.0.5:3000)
  allowedDevOrigins: [
    'http://192.168.0.5:3000',
  ],
}

export default nextConfig
