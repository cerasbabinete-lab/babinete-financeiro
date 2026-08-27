// ============================================================
// app/login/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Página de login com Supabase Auth
// Conecta com: lib/supabase.ts (signInWithPassword)
//              app/page.tsx (redireciona para / após login bem-sucedido)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
// Roteamento client-side — removido: redirect pós-login usa window.location.href
// import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {

  // router removido — redirect pós-login usa window.location.href (ver linha 38)
  const [username, setUsername] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  // Evita reexecutar o auto-login se o efeito rodar mais de uma vez
  // (StrictMode do React em desenvolvimento monta os efeitos 2x) —
  // useRef, não useState, porque não precisa disparar re-render
  const autoLoginTentadoRef = useRef(false)

  // ============================================================
  // resolverEmailLogin()
  // Traduz o username digitado no e-mail real usado pelo Supabase
  // Auth. Caso especial do Admin (temporário — ver comentário em
  // lib/usuariosService.ts, ehAdmin()): se o username digitado for
  // o ADMIN_USERNAME fixo, usa o e-mail real da conta reaproveitada
  // como Admin, em vez da fórmula padrão. Para todos os outros
  // usuários, aplica a fórmula {username}@login.cerasbabinete.com.br
  // (Especificação §2.1/§2.3 — mesma fórmula usada em
  // derivarEmailTecnico() no service).
  // ============================================================
  function resolverEmailLogin(usernameDigitado: string): string {
    // Normaliza para minúsculas — usernames são sempre gravados em
    // minúsculas (DECISION-02, Handoff_Modulo_Usuarios_Audit_para_QA.md),
    // então o login precisa comparar da mesma forma
    const usernameNormalizado = usernameDigitado.trim().toLowerCase()
    if (usernameNormalizado === process.env.NEXT_PUBLIC_ADMIN_USERNAME) {
      return process.env.NEXT_PUBLIC_ADMIN_LOGIN_EMAIL ?? ''
    }
    return `${usernameNormalizado}@login.cerasbabinete.com.br`
  }

  async function realizarLogin(usernameLogin: string, senhaLogin: string) {
    setErro('')
    setCarregando(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolverEmailLogin(usernameLogin.trim()),
      password: senhaLogin,
    })

    if (error) {
      // Log de auditoria (login_falha) — fire-and-forget, nunca
      // bloqueia nem atrasa o feedback de erro pro usuário
      fetch('/api/logs/registrar-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameLogin.trim(), sucesso: false }),
        keepalive: true,
      }).catch(() => {})

      setErro('Usuário ou senha inválidos.')
      setCarregando(false)
      return
    }

    // Log de auditoria (login_sucesso) — keepalive garante que a
    // requisição sobrevive ao hard navigation logo abaixo
    fetch('/api/logs/registrar-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameLogin.trim(), sucesso: true, token: data.session?.access_token }),
      keepalive: true,
    }).catch(() => {})

    // Redireciona para a Home após login bem-sucedido
    // window.location.href (hard navigation) evita race condition entre escrita do cookie
    // e interceptação do middleware — padrão aprovado no projeto para pós-auth
    window.location.href = '/'
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    await realizarLogin(username, senha)
  }

  // ============================================================
  // Auto-login em desenvolvimento (decisão desta sessão)
  // Só ativa quando `npm run dev` (NODE_ENV==='development') E a
  // variável NEXT_PUBLIC_DEV_AUTO_LOGIN_SENHA estiver definida no
  // .env.local. A checagem de NODE_ENV é eliminada pelo Next.js no
  // build de produção (dead-code elimination em comparação literal
  // com process.env.NODE_ENV) — este bloco inteiro, e a senha que
  // ele referencia, simplesmente não existem no bundle publicado.
  // Objetivo: evitar ter que digitar login toda hora durante a
  // construção/testes do sistema, SEM desligar a autenticação real
  // (as rotas de API continuam exigindo o Bearer token normalmente
  // — aqui só preenchemos e enviamos o formulário sozinhos).
  // Remover este bloco quando o sistema for publicado/testado por
  // completo (ver "On the horizon" — publicação em Vercel).
  // ============================================================
  useEffect(() => {
    if (autoLoginTentadoRef.current) return
    if (process.env.NODE_ENV !== 'development') return
    const senhaAutoLogin = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_SENHA
    if (!senhaAutoLogin) return

    autoLoginTentadoRef.current = true
    const usernameAutoLogin = process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? ''
    setUsername(usernameAutoLogin) // eslint-disable-line react-hooks/set-state-in-effect
    realizarLogin(usernameAutoLogin, senhaAutoLogin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            src="/img/logo_branca.svg"
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
          {process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_SENHA && (
            <div
              style={{
                fontSize: '10px',
                color: '#7a5c1e',
                background: '#fdf6e8',
                border: '1px solid #e8d5a3',
                borderRadius: '4px',
                padding: '6px 8px',
                marginBottom: '12px',
                fontStyle: 'italic',
              }}
            >
              Modo desenvolvimento: auto-login ativo (ver .env.local)
            </div>
          )}

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
              Usuário
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="seu usuário"
              required
              autoFocus
              autoCapitalize="none"
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
