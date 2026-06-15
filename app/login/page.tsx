// ============================================================
// app/login/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Página de login com Supabase Auth
// Conecta com: lib/supabase.ts (signInWithPassword)
//              app/clientes/page.tsx (redireciona após login)
// ============================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {

  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setCarregando(false)
      return
    }

    router.push('/clientes')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0f4f7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Tahoma, Geneva, sans-serif',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #dde8f0',
          width: '100%',
          maxWidth: '360px',
          overflow: 'hidden',
        }}
      >
        {/* Header azul com logo */}
        <div
          style={{
            background: '#1a6094',
            padding: '24px 24px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Image
            src="/img/logo_branca.png"
            alt="Ceras Babinete"
            height={48}
            width={128}
            style={{ objectFit: 'contain' }}
            priority
          />
          <span
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
            }}
          >
            Gestão Financeira
          </span>
        </div>

        {/* Formulário */}
        <form
          onSubmit={handleLogin}
          style={{ padding: '24px' }}
        >
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '9px',
                fontWeight: 700,
                color: '#1a6094',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
              style={{
                width: '100%',
                height: '34px',
                padding: '0 10px',
                fontSize: '12px',
                fontFamily: 'Tahoma, Geneva, sans-serif',
                color: '#3a6080',
                background: '#ffffff',
                border: '1px solid #dde8f0',
                borderRadius: '4px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '9px',
                fontWeight: 700,
                color: '#1a6094',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                height: '34px',
                padding: '0 10px',
                fontSize: '12px',
                fontFamily: 'Tahoma, Geneva, sans-serif',
                color: '#3a6080',
                background: '#ffffff',
                border: '1px solid #dde8f0',
                borderRadius: '4px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Erro */}
          {erro && (
            <div
              style={{
                fontSize: '11px',
                color: '#dc2626',
                marginBottom: '12px',
                padding: '8px 10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '4px',
              }}
            >
              {erro}
            </div>
          )}

          {/* Botão entrar */}
          <button
            type="submit"
            disabled={carregando}
            style={{
              width: '100%',
              height: '36px',
              fontSize: '13px',
              fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#1a6094',
              color: '#ffffff',
              border: '1px solid #1a6094',
              borderRadius: '5px',
              cursor: carregando ? 'wait' : 'pointer',
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {/* Footer */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid #f0f4f7',
            textAlign: 'center',
            fontSize: '10px',
            color: '#5a84a6',
          }}
        >
          Ceras Babinete © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}
