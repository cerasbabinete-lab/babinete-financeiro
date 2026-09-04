// ============================================================
// components/usuarios/VisitanteFormModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários — Usuário Visitante
// Função: Modal DEDICADO de criação de usuário Visitante — acesso
//         demo temporário, somente leitura em todo o sistema (ver
//         proxy.ts), múltiplos simultâneos, sem CPF/data de
//         nascimento/celular/e-mail pessoal (não é uma pessoa
//         cadastrável). Deliberadamente SEPARADO de
//         UsuarioFormModal.tsx (não reaproveita o mesmo componente)
//         — os campos e a validação são fundamentalmente diferentes,
//         e misturar os dois modos deixaria UsuarioFormModal mais
//         complexo sem necessidade real.
//         Username é gerado automaticamente pelo servidor
//         (lib/usuariosService.ts, gerarUsernameVisitante) — não
//         pedido aqui. Sem aba Permissões — não se aplica, o
//         Visitante é bloqueado globalmente pelo proxy.ts.
// Conecta com: app/usuarios/page.tsx, lib/supabase.ts (token Bearer),
//              lib/validacoesUsuarios.ts (gerarSenhaAleatoria),
//              types/usuarios.ts (UsuarioInsert), pages/api/usuarios/criar.ts
// ============================================================

'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { senhaValida, gerarSenhaAleatoria } from '@/lib/validacoesUsuarios'
import type { UsuarioInsert } from '@/types/usuarios'

interface VisitanteFormModalProps {
  onFechar: () => void
  onSalvo: () => void
}

// Opções de duração — Especificação desta sessão (27/08/2026):
// 30min / 2h / 4h / 6h / 12h / 24h, escolhido no momento da criação
const OPCOES_DURACAO: { label: string; minutos: number }[] = [
  { label: '30 minutos', minutos: 30 },
  { label: '2 horas', minutos: 120 },
  { label: '4 horas', minutos: 240 },
  { label: '6 horas', minutos: 360 },
  { label: '12 horas', minutos: 720 },
  { label: '24 horas', minutos: 1440 },
]

export default function VisitanteFormModal({ onFechar, onSalvo }: VisitanteFormModalProps) {
  const [nome, setNome] = useState('Visitante')
  const [senha, setSenha] = useState('')
  const [minutos, setMinutos] = useState(240) // default 4h, o prazo original pedido
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar() {
    setErroGeral(null)

    if (!nome.trim()) {
      setErroGeral('Nome é obrigatório.')
      return
    }
    if (!senhaValida(senha)) {
      setErroSenha('Mínimo de 6 caracteres')
      return
    }
    setErroSenha(null)

    setSalvando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const payload: UsuarioInsert = {
        nome_completo: nome.trim(),
        username: '', // gerado no servidor — campo exigido pelo tipo, mas ignorado quando tipo_usuario='visitante'
        senha,
        status: 'ativo',
        tipo_usuario: 'visitante',
        expiraEmMinutos: minutos,
      }

      const res = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Falha ao criar visitante.')

      onSalvo()
      onFechar()
    } catch (err: unknown) {
      setErroGeral(err instanceof Error ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
            Novo Visitante
          </span>
          <button onClick={onFechar} aria-label="Fechar modal" style={botaoFecharStyle}>✕</button>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto' }}>
          <p style={{ fontSize: '11px', color: '#5a84a6', fontFamily: 'Tahoma, Geneva, sans-serif', marginTop: 0, marginBottom: '14px' }}>
            Acesso demo temporário — visualização em todo o sistema, sem nenhuma ação de criar/editar/excluir. Sem acesso ao módulo Usuários.
          </p>

          {erroGeral && (
            <div style={{ padding: '8px 10px', marginBottom: '10px', background: '#fef2f2', color: '#dc2626', fontSize: '11px', borderRadius: '5px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
              {erroGeral}
            </div>
          )}

          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>Nome *</label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>Senha *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setErroSenha(null) }}
                  placeholder="Mínimo 6 caracteres"
                  style={{ ...inputStyle, borderColor: erroSenha ? '#dc2626' : '#dde8f0' }}
                />
                <button
                  type="button"
                  onClick={() => { setSenha(gerarSenhaAleatoria()); setErroSenha(null) }}
                  title="Gerar senha aleatória"
                  style={{ ...inputStyle, width: 'auto', whiteSpace: 'nowrap', cursor: 'pointer', background: '#f0f4f7', color: '#1a6094', fontWeight: 600 }}
                >
                  Gerar senha
                </button>
              </div>
              {erroSenha && <span style={erroCampoStyle}>{erroSenha}</span>}
              <span style={{ fontSize: '9px', color: '#5a84a6' }}>
                Guarde esta senha em local seguro — o sistema não permite consultá-la depois.
              </span>
            </div>
          </div>

          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>Duração do acesso *</label>
              <select value={minutos} onChange={e => setMinutos(Number(e.target.value))} style={selectStyle}>
                {OPCOES_DURACAO.map(op => (
                  <option key={op.minutos} value={op.minutos}>{op.label}</option>
                ))}
              </select>
              <span style={{ fontSize: '9px', color: '#5a84a6' }}>
                Prazo conta a partir do primeiro login do visitante, não da criação.
              </span>
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button onClick={onFechar} style={botaoSecundarioStyle}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} style={{ ...botaoPrimarioStyle, opacity: salvando ? 0.7 : 1, cursor: salvando ? 'wait' : 'pointer' }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Estilos — espelham exatamente UsuarioFormModal.tsx, pra manter
// consistência visual entre os dois modais do módulo
// ============================================================
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
}

const boxStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: '8px', width: '100%', maxWidth: '480px',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  background: '#1a6094', padding: '10px 16px', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
}

const botaoFecharStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px',
  cursor: 'pointer', lineHeight: 1, padding: '0 4px',
}

const footerStyle: React.CSSProperties = {
  background: '#f7fafc', borderTop: '1px solid #dde8f0', padding: '10px 16px',
  display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0,
}

const botaoSecundarioStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
  background: '#ffffff', color: '#3a6080', border: '1px solid #c4d8eb', borderRadius: '5px', cursor: 'pointer',
}

const botaoPrimarioStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 16px', fontSize: '12px', fontWeight: 700,
  fontFamily: 'Tahoma, Geneva, sans-serif', background: '#1a6094', color: '#ffffff', border: '1px solid #1a6094', borderRadius: '5px',
}

const rowStyle: React.CSSProperties = { display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }

function colStyle(width?: string): React.CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: '3px', flex: width ? `0 0 ${width}` : 1, minWidth: width ?? '80px' }
}

const labelStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 700, color: '#1a6094', textTransform: 'uppercase',
  letterSpacing: '0.04em', fontFamily: 'Tahoma, Geneva, sans-serif',
}

const inputStyle: React.CSSProperties = {
  height: '28px', padding: '0 8px', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#3a6080', background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '4px',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

const erroCampoStyle: React.CSSProperties = { fontSize: '10px', color: '#dc2626', fontFamily: 'Tahoma, Geneva, sans-serif' }
