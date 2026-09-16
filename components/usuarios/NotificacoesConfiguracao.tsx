// ============================================================
// components/usuarios/NotificacoesConfiguracao.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários (aba Notificações)
// Função: Tela para o Admin adicionar/remover os e-mails que
//         recebem o aviso diário de despesas (Edge Function
//         aviso-diario-despesas), sem precisar mexer em código
//         nem no Supabase. Lê e grava via
//         pages/api/notificacoes/configuracao.ts.
// Conecta com: pages/api/notificacoes/configuracao.ts,
//              app/usuarios/page.tsx
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

async function obterToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function NotificacoesConfiguracao() {
  const [emails, setEmails] = useState<string[]>([])
  const [novoEmail, setNovoEmail] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const token = await obterToken()
        const resp = await fetch('/api/notificacoes/configuracao', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const dados = await resp.json()
        if (!resp.ok) throw new Error(dados.erro || 'Falha ao carregar')
        setEmails(dados.destinatariosAvisoDiarioDespesas)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao carregar configuração')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  function adicionarEmail() {
    const valor = novoEmail.trim()
    if (!valor) return
    if (emails.includes(valor)) {
      setErro('Esse e-mail já está na lista.')
      return
    }
    setEmails([...emails, valor])
    setNovoEmail('')
    setErro(null)
    setSucesso(false)
  }

  function removerEmail(email: string) {
    setEmails(emails.filter(e => e !== email))
    setSucesso(false)
  }

  async function salvar() {
    if (emails.length === 0) {
      setErro('É preciso manter ao menos um e-mail na lista.')
      return
    }
    setSalvando(true)
    setErro(null)
    setSucesso(false)
    try {
      const token = await obterToken()
      const resp = await fetch('/api/notificacoes/configuracao', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destinatariosAvisoDiarioDespesas: emails }),
      })
      const dados = await resp.json()
      if (!resp.ok) throw new Error(dados.erro || 'Falha ao salvar')
      setSucesso(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar configuração')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <div style={{ padding: '20px', fontSize: '12px', color: '#5a84a6' }}>Carregando...</div>
  }

  return (
    <div style={{ maxWidth: '520px', background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '8px', padding: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a6094', marginBottom: '4px' }}>
        Aviso diário de despesas
      </div>
      <p style={{ fontSize: '11px', color: '#5a84a6', marginBottom: '16px' }}>
        E-mails que recebem, todo dia útil às 8h, a lista de despesas vencendo hoje e vencidas em aberto.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        {emails.map(email => (
          <div
            key={email}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', background: '#f0f4f7', borderRadius: '5px',
              fontSize: '12px', color: '#2b2b2b',
            }}
          >
            <span>{email}</span>
            <button
              onClick={() => removerEmail(email)}
              aria-label={`Remover ${email}`}
              style={{ background: 'none', border: 'none', color: '#a13b3b', cursor: 'pointer', fontSize: '13px', padding: '2px 4px' }}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        ))}
        {emails.length === 0 && (
          <div style={{ fontSize: '11px', color: '#a13b3b' }}>Nenhum e-mail cadastrado ainda.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="email"
          value={novoEmail}
          onChange={e => setNovoEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarEmail() } }}
          placeholder="novo-email@exemplo.com"
          style={{
            flex: 1, padding: '7px 10px', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif',
            border: '1px solid #dde8f0', borderRadius: '5px',
          }}
        />
        <button
          onClick={adicionarEmail}
          style={{
            padding: '7px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#ffffff', color: '#1a6094', border: '1px solid #1a6094', borderRadius: '5px', cursor: 'pointer',
          }}
        >
          Adicionar
        </button>
      </div>

      {erro && <p style={{ fontSize: '11px', color: '#a13b3b', marginBottom: '10px' }}>{erro}</p>}
      {sucesso && <p style={{ fontSize: '11px', color: '#1a6094', marginBottom: '10px' }}>Salvo com sucesso.</p>}

      <button
        onClick={salvar}
        disabled={salvando}
        style={{
          padding: '8px 16px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
          background: '#1a6094', color: '#ffffff', border: '1px solid #1a6094', borderRadius: '5px',
          cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.6 : 1,
        }}
      >
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  )
}
