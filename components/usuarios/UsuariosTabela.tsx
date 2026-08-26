// ============================================================
// components/usuarios/UsuariosTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Tabela ÚNICA para desktop E mobile — desvio proposital
//         do padrão usual do projeto (que separa TabelaDesktop +
//         MobileList, ex: FornecedoresTabela.tsx +
//         FornecedoresMobileList.tsx). Decisão explícita da
//         Especificação §4 (Screen: Lista de Usuários): "Do NOT
//         build a separate mobile card list component for this
//         screen". NÃO "corrigir" isso para o padrão de cards em
//         revisões futuras — é intencional.
//         Exatamente 4 colunas (Especificação §4, Non-negotiable
//         §7 item 12): Nome, Username, Status, Ações. Nenhuma
//         coluna de CPF/CNPJ ou e-mail aqui, mesmo que esses dados
//         existam na tabela usuarios.
// Conecta com: app/usuarios/page.tsx (usuarios, onEditar,
//              onResetarSenha, onExcluir), types/usuarios.ts (Usuario)
// ============================================================

'use client'

import { useState } from 'react'
import type { Usuario } from '@/types/usuarios'

// ============================================================
// Props
// ============================================================
interface UsuariosTabelaProps {
  usuarios: Usuario[]
  carregando: boolean
  erro: string | null
  onEditar: (usuario: Usuario) => void
  onResetarSenha: (usuario: Usuario, novaSenha: string) => void
  onExcluir: (usuario: Usuario) => void
}

// ============================================================
// UsuariosTabela
// ============================================================
export default function UsuariosTabela({
  usuarios,
  carregando,
  erro,
  onEditar,
  onResetarSenha,
  onExcluir,
}: UsuariosTabelaProps) {

  const [hoverId, setHoverId] = useState<string | null>(null)
  // id do usuário aguardando confirmação — reaproveita o mesmo
  // estado para exclusão E reset de senha, um de cada vez, porque
  // as duas ações não fazem sentido simultaneamente na mesma linha
  const [confirmando, setConfirmando] = useState<{ id: string; acao: 'excluir' | 'resetar' } | null>(null)
  // Senha nova digitada inline durante o reset (Admin digita, sistema
  // não sorteia mais — decisão de 26/08/2026)
  const [novaSenhaDigitada, setNovaSenhaDigitada] = useState('')

  // ============================================================
  // Estado: erro (mesmo visual do FaixaErro de Relatórios, recriado
  // aqui localmente — RelatorioUiComum.tsx não é um componente
  // compartilhado entre módulos, é local ao módulo Relatórios)
  // ============================================================
  if (erro) {
    return (
      <div
        style={{
          padding: '10px 12px',
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          color: '#dc2626',
          fontSize: '11px',
          marginBottom: '16px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        {erro}
      </div>
    )
  }

  // ============================================================
  // Estado: carregando (mesmo padrão textual simples usado em
  // outras telas do projeto enquanto os dados chegam)
  // ============================================================
  if (carregando) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        Carregando usuários...
      </div>
    )
  }

  // ============================================================
  // Render — tabela única, sem breakpoint de mobile
  // ============================================================
  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        border: '1px solid #dde8f0',
        borderRadius: '8px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '11px',
          minWidth: '480px',   // Menor que os 850px de Fornecedores — só 4 colunas
        }}
      >
        <thead>
          <tr
            style={{
              background: '#1a6094',
              color: '#ffffff',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            <th style={thStyle()}>Nome</th>
            <th style={thStyle()}>Username</th>
            <th style={thStyle('100px', true)}>Status</th>
            <th style={thStyle('130px', true)}>Ações</th>
          </tr>
        </thead>

        <tbody>
          {usuarios.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#5a84a6', fontSize: '12px' }}>
                Nenhum usuário cadastrado.
              </td>
            </tr>
          ) : (
            usuarios.map((usuario, index) => {
              const isHover = hoverId === usuario.id
              const isAlternado = index % 2 !== 0
              const estaConfirmando = confirmando?.id === usuario.id

              return (
                <tr
                  key={usuario.id}
                  onMouseEnter={() => setHoverId(usuario.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: isHover ? '#edf4fb' : isAlternado ? '#f7fafc' : '#ffffff',
                    borderBottom: '1px solid #e8f0f7',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ ...tdStyle(), fontWeight: 700, color: '#1a6094' }}>
                    {usuario.nome_completo}
                  </td>

                  <td style={tdStyle()}>{usuario.username}</td>

                  <td style={{ ...tdStyle('100px'), textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: usuario.status === 'ativo' ? '#e6f4ea' : '#f0f4f7',
                        color: usuario.status === 'ativo' ? '#1e7a3d' : '#7a8a99',
                      }}
                    >
                      {usuario.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdStyle(estaConfirmando && confirmando?.acao === 'resetar' ? undefined : '130px'), textAlign: 'center' }}>
                    {estaConfirmando && confirmando.acao === 'resetar' ? (
                      // Reset de senha — Admin digita a senha nova aqui,
                      // inline (sistema não sorteia mais, decisão de 26/08/2026)
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                        <input
                          type="text"
                          autoFocus
                          value={novaSenhaDigitada}
                          onChange={e => setNovaSenhaDigitada(e.target.value)}
                          placeholder="Nova senha (mín. 6)"
                          style={{
                            width: '110px', height: '22px', fontSize: '10px', padding: '0 6px',
                            border: '1px solid #c4d8eb', borderRadius: '3px', fontFamily: 'Tahoma, Geneva, sans-serif',
                          }}
                        />
                        <button
                          onClick={() => {
                            if (novaSenhaDigitada.trim().length < 6) return
                            onResetarSenha(usuario, novaSenhaDigitada.trim())
                            setConfirmando(null)
                            setNovaSenhaDigitada('')
                          }}
                          disabled={novaSenhaDigitada.trim().length < 6}
                          title="Confirmar nova senha"
                          style={{ ...btnAcaoStyle, color: '#1a6094', fontSize: '10px', width: 'auto', padding: '2px 5px', opacity: novaSenhaDigitada.trim().length < 6 ? 0.4 : 1 }}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => { setConfirmando(null); setNovaSenhaDigitada('') }}
                          title="Cancelar"
                          style={{ ...btnAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : estaConfirmando ? (
                      // Confirmação inline (exclusão) — sem alert/confirm, mesmo padrão de FornecedoresTabela
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => {
                            onExcluir(usuario)
                            setConfirmando(null)
                          }}
                          title="Confirmar"
                          style={{ ...btnAcaoStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmando(null)}
                          title="Cancelar"
                          style={{ ...btnAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          onClick={() => onEditar(usuario)}
                          title="Editar usuário"
                          aria-label={`Editar ${usuario.nome_completo}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-writing" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => setConfirmando({ id: usuario.id, acao: 'resetar' })}
                          title="Resetar senha"
                          aria-label={`Resetar senha de ${usuario.nome_completo}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-key" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => setConfirmando({ id: usuario.id, acao: 'excluir' })}
                          title="Excluir usuário"
                          aria-label={`Excluir ${usuario.nome_completo}`}
                          style={{ ...btnAcaoStyle, color: '#dc2626' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Estilos auxiliares — mesmos valores de FornecedoresTabela.tsx
// ============================================================
function thStyle(width?: string, centered?: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    fontWeight: 700,
    textAlign: centered ? 'center' : 'left',
    whiteSpace: 'nowrap',
    ...(width ? { width } : {}),
  }
}

function tdStyle(width?: string): React.CSSProperties {
  return {
    padding: '6px 8px',
    color: '#2c4a60',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    ...(width ? { width } : {}),
  }
}

const btnAcaoStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '3px',
  fontSize: '13px',
  color: '#1a6094',
}
