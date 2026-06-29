// ============================================================
// components/contas-receber/ContasReceberModalAvisos.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Modal de avisos de vencimento (títulos que vencem em ≤5 dias)
//         Permite selecionar títulos e confirmar/editar e-mails
//         antes de enviar os alertas (provider TBD — deferred)
// Conecta com: app/contas-receber/page.tsx
//              contasReceberService.ts (atualizarEmailTitulo, registrarEmailEnviado)
//              types/contasReceber.ts (TituloAvisoVencimento)
// Sem alert() ou confirm() — tudo inline
// ============================================================

'use client'

import { useState } from 'react'
import type { TituloAvisoVencimento } from '@/types/contasReceber'
import {
  atualizarEmailTitulo,
  registrarEmailEnviado,
  formatarDataBR,
  formatarMoeda,
} from '@/lib/contasReceberService'

interface ContasReceberModalAvisosProps {
  titulos:   TituloAvisoVencimento[]  // Títulos near-due pré-carregados
  onFechar:  () => void               // Fecha a modal sem enviar
  onEnviado: (n: number) => void      // Callback após envio com count de e-mails enviados
}

export default function ContasReceberModalAvisos({
  titulos: titulosIniciais,
  onFechar,
  onEnviado,
}: ContasReceberModalAvisosProps) {

  // Estado local com seleção e e-mails editáveis por título
  const [titulos, setTitulos] = useState<TituloAvisoVencimento[]>(titulosIniciais)

  // Estado de loading durante o envio
  const [enviando, setEnviando] = useState(false)

  // Mensagem de erro inline
  const [erro, setErro] = useState<string | null>(null)

  // Quantos títulos estão selecionados
  const totalSelecionados = titulos.filter((t: TituloAvisoVencimento) => t.selecionado).length

  // ── Selecionar / desselecionar todos ──────────────────────
  function handleSelecionarTodos(checked: boolean) {
    setTitulos((prev: TituloAvisoVencimento[]) => prev.map((t: TituloAvisoVencimento) => ({ ...t, selecionado: checked })))
  }

  // ── Toggle individual ─────────────────────────────────────
  function handleToggle(id: string, checked: boolean) {
    setTitulos((prev: TituloAvisoVencimento[]) => prev.map((t: TituloAvisoVencimento) => t.id === id ? { ...t, selecionado: checked } : t))
  }

  // ── Editar e-mail de um título ────────────────────────────
  function handleEmailChange(id: string, email: string) {
    setTitulos((prev: TituloAvisoVencimento[]) => prev.map((t: TituloAvisoVencimento) => t.id === id ? { ...t, emailEditavel: email } : t))
  }

  // ── Confirmar envio ───────────────────────────────────────
  async function handleEnviar() {
    const selecionados = titulos.filter((t: TituloAvisoVencimento) => t.selecionado && t.emailEditavel.trim() !== '')
    if (selecionados.length === 0) {
      setErro('Selecione pelo menos um título com e-mail válido.')
      return
    }
    setErro(null)
    setEnviando(true)

    try {
      let enviados = 0
      for (const t of selecionados) {
        const email = t.emailEditavel.trim()

        // Atualiza o e-mail no banco se foi editado na modal
        await atualizarEmailTitulo(t.id, email)

        // Registra o evento de e-mail enviado no histórico do título
        // Provider de e-mail TBD — por ora apenas registra o evento
        await registrarEmailEnviado(t.id, email)

        // TODO: Integrar provider de e-mail (SendGrid, Resend, etc.)
        // quando provider for definido
        enviados++
      }
      onEnviado(enviados)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar avisos')
    } finally {
      setEnviando(false)
    }
  }

  // ── Verificação de seleção geral ──────────────────────────
  const todosSelecionados = titulos.length > 0 && titulos.every((t: TituloAvisoVencimento) => t.selecionado)
  const algunsSelecionados = titulos.some((t: TituloAvisoVencimento) => t.selecionado)

  return (
    // Overlay
    <div style={{
      position:   'fixed',
      inset:      0,
      background: 'rgba(0,0,0,0.45)',
      zIndex:     500,
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Tahoma, Geneva, sans-serif',
    }}>
      {/* Painel */}
      <div style={{
        background:   '#ffffff',
        borderRadius: '8px',
        width:        '680px',
        maxWidth:     '95vw',
        maxHeight:    '85vh',
        display:      'flex',
        flexDirection: 'column',
        overflow:     'hidden',
      }}>

        {/* ── Header âmbar ── */}
        <div style={{
          background:  '#b07d00',
          padding:     '12px 16px',
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="ti ti-bell-ringing" style={{ fontSize: '18px', color: '#fff' }} aria-hidden="true" />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
              Avisos de Vencimento
            </span>
            {/* Badge contador */}
            <span style={{
              background:   '#fff',
              color:        '#b07d00',
              fontSize:     '11px',
              fontWeight:   700,
              padding:      '1px 8px',
              borderRadius: '10px',
            }}>
              {titulos.length} título{titulos.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Fechar */}
          <button
            onClick={onFechar}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* ── Corpo scrollável ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

          {/* Intro */}
          <p style={{ fontSize: '12px', color: '#5a84a6', margin: '0 0 12px' }}>
            Os títulos abaixo vencem nos próximos 5 dias. Selecione aqueles para os quais deseja enviar um aviso por e-mail e confirme ou edite os endereços.
          </p>

          {/* Selecionar todos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <input
              type="checkbox"
              id="select-all"
              checked={todosSelecionados}
              ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = !todosSelecionados && algunsSelecionados }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSelecionarTodos(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="select-all" style={{ fontSize: '12px', fontWeight: 600, color: '#3a6080', cursor: 'pointer' }}>
              Selecionar todos
            </label>
          </div>

          {/* ── Tabela de títulos ── */}
          {titulos.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Nenhum título vencendo nos próximos 5 dias.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {titulos.map((t: TituloAvisoVencimento) => {
                const semEmail = !t.emailEditavel.trim()
                return (
                  <div
                    key={t.id}
                    style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          '10px',
                      padding:      '8px 10px',
                      background:   t.selecionado ? '#fffde7' : '#fafafa',
                      border:       `1px solid ${t.selecionado ? '#ffe082' : '#e8f0f7'}`,
                      borderRadius: '5px',
                      opacity:      t.selecionado ? 1 : 0.6,
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={t.selecionado}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToggle(t.id, e.target.checked)}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />

                    {/* Nº Documento */}
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094', minWidth: '80px', flexShrink: 0 }}>
                      {t.numero_documento}
                    </span>

                    {/* Nome sacado */}
                    <span style={{
                      fontSize:     '11px',
                      color:        '#2c4a60',
                      flex:         1,
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:   'nowrap',
                    }}>
                      {t.cliente_nome}
                    </span>

                    {/* Vencimento */}
                    <span style={{ fontSize: '10px', color: '#b07d00', fontWeight: 600, flexShrink: 0 }}>
                      {formatarDataBR(t.data_vencimento)}
                    </span>

                    {/* Valor */}
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>
                      {formatarMoeda(t.valor)}
                    </span>

                    {/* Input de e-mail */}
                    <input
                      type="email"
                      value={t.emailEditavel}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEmailChange(t.id, e.target.value)}
                      disabled={!t.selecionado}
                      placeholder="Sem e-mail — informe manualmente"
                      style={{
                        height:       '26px',
                        padding:      '0 8px',
                        fontSize:     '11px',
                        fontFamily:   'Tahoma, Geneva, sans-serif',
                        width:        '200px',
                        flexShrink:   0,
                        border:       semEmail && t.selecionado ? '1px solid #ffe082' : '1px solid #dde8f0',
                        borderRadius: '4px',
                        background:   !t.selecionado ? '#f5f5f5' : '#fff',
                        outline:      'none',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* Erro inline */}
          {erro && (
            <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '5px', color: '#a32d2d', fontSize: '12px' }}>
              {erro}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding:         '12px 16px',
          borderTop:       '1px solid #eef3f7',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
        }}>
          {/* Contador de selecionados */}
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
            {totalSelecionados} de {titulos.length} título{titulos.length !== 1 ? 's' : ''} selecionado{totalSelecionados !== 1 ? 's' : ''}
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Cancelar */}
            <button
              onClick={onFechar}
              style={{
                padding:      '6px 16px',
                fontSize:     '12px',
                fontWeight:   600,
                fontFamily:   'Tahoma, Geneva, sans-serif',
                background:   '#f0f4f7',
                color:        '#3a6080',
                border:       '1px solid #c4d8eb',
                borderRadius: '5px',
                cursor:       'pointer',
              }}
            >
              Cancelar
            </button>

            {/* Enviar avisos */}
            <button
              onClick={handleEnviar}
              disabled={enviando || totalSelecionados === 0}
              style={{
                padding:      '6px 16px',
                fontSize:     '12px',
                fontWeight:   700,
                fontFamily:   'Tahoma, Geneva, sans-serif',
                background:   totalSelecionados > 0 ? '#1a6094' : '#c4d8eb',
                color:        '#ffffff',
                border:       'none',
                borderRadius: '5px',
                cursor:       totalSelecionados > 0 && !enviando ? 'pointer' : 'not-allowed',
                opacity:      enviando ? 0.7 : 1,
              }}
            >
              {enviando ? 'Enviando...' : `Enviar avisos (${totalSelecionados})`}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
