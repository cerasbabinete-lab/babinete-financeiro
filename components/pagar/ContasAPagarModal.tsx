// ============================================================
// components/pagar/ContasAPagarModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Modal de visualização/edição de um título, com seção de
//         baixa manual avulsa (Especificação §5, "Function: Baixa
//         Manual Avulsa" — só para títulos já lançados, nunca cria
//         Despesa nova) e timeline de eventos (auditoria). Sem modo
//         'novo' — este módulo nunca cria título do zero pela UI
//         (Especificação §7, Non-negotiable), diferente de
//         ContasReceberModal.tsx.
// Conecta com: app/pagar/page.tsx, types/contasAPagar.ts (ModoModalPagar)
// ============================================================

'use client'

import { useState, useEffect } from 'react'
import type { ContaAPagar, ModoModalPagar, FormaBaixaPagar } from '@/types/contasAPagar'
import { STATUS_LABELS_PAGAR } from '@/types/contasAPagar'
import { formatarCnpjCpf, formatarMoeda, formatarDataBR } from '@/lib/contasAPagarService'

interface ContasAPagarModalProps {
  titulo:        ContaAPagar | null
  modo:          ModoModalPagar
  abrirEmBaixa?: boolean // quando true, abre já com a seção de baixa manual expandida (vindo do botão "Baixar" da linha)
  onFechar:      () => void
  onSalvar:      (titulo: ContaAPagar) => Promise<void>
  onBaixar:      (id: string, formaBaixa: FormaBaixaPagar, valorBaixa: number) => Promise<void>
  onCancelar:    (id: string) => Promise<void>
  onReabrir:     (id: string) => Promise<void>
}

export default function ContasAPagarModal({ titulo, modo, abrirEmBaixa, onFechar, onSalvar, onBaixar, onCancelar, onReabrir }: ContasAPagarModalProps) {
  const [observacoes, setObservacoes] = useState('')
  const [mostrarBaixa, setMostrarBaixa] = useState(false)
  const [formaBaixa, setFormaBaixa] = useState<FormaBaixaPagar>('pix')
  const [valorBaixa, setValorBaixa] = useState<number>(0)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setObservacoes(titulo?.observacoes ?? '')
    setMostrarBaixa(!!abrirEmBaixa)
    setValorBaixa(titulo ? titulo.valor : 0)
    setErro(null)
  }, [titulo, abrirEmBaixa])

  if (!titulo || !modo) return null

  const somenteLeitura = modo === 'visualizar'
  const cancelado = titulo.deleted_at !== null && titulo.deleted_at !== undefined

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar({ ...titulo!, observacoes })
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function handleConfirmarBaixa() {
    if (valorBaixa <= 0) { setErro('Informe um valor de baixa maior que zero.'); return }
    setSalvando(true)
    setErro(null)
    try {
      await onBaixar(titulo!.id, formaBaixa, valorBaixa)
      onFechar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar baixa')
    } finally {
      setSalvando(false)
    }
  }

  const label: React.CSSProperties = { fontSize: '11px', color: '#5a6b7a', marginBottom: '3px', display: 'block' }
  const valor: React.CSSProperties = { fontSize: '13px', color: '#1a1a1a', marginBottom: '12px' }
  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dde8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, fontFamily: 'Tahoma, Geneva, sans-serif' }} onClick={onFechar}>
      <div style={{ background: '#ffffff', borderRadius: '10px', padding: '20px', width: '92%', maxWidth: '520px', maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>
            {somenteLeitura ? 'Visualizar Título' : 'Editar Título'}
          </div>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', color: '#7a8a99', fontSize: '18px', cursor: 'pointer' }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div><span style={label}>Favorecido</span><div style={valor}>{titulo.favorecido_nome}</div></div>
          <div><span style={label}>CNPJ / CPF</span><div style={valor}>{formatarCnpjCpf(titulo.favorecido_cnpj_cpf)}</div></div>
          <div><span style={label}>Nº Documento</span><div style={valor}>{titulo.numero_documento ?? '—'}</div></div>
          <div><span style={label}>Nosso Número</span><div style={{ ...valor, fontFamily: 'Courier New, monospace' }}>{titulo.nosso_numero ?? '—'}</div></div>
          <div><span style={label}>Vencimento</span><div style={valor}>{formatarDataBR(titulo.data_vencimento)}</div></div>
          <div><span style={label}>Valor</span><div style={{ ...valor, fontWeight: 700, color: '#1a6094' }}>{formatarMoeda(titulo.valor)}</div></div>
          <div><span style={label}>Status</span><div style={valor}>{STATUS_LABELS_PAGAR[titulo.status]}</div></div>
          <div><span style={label}>Data Baixa</span><div style={valor}>{titulo.data_baixa ? formatarDataBR(titulo.data_baixa) : '—'}</div></div>
        </div>

        <div>
          <span style={label}>Observações</span>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} disabled={somenteLeitura} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* ── Seção de baixa manual ── */}
        {!somenteLeitura && !cancelado && titulo.status !== 'pago' && (
          <div style={{ marginTop: '14px', border: '1px solid #dde8f0', borderRadius: '8px', padding: '12px' }}>
            <button onClick={() => setMostrarBaixa((v) => !v)} style={{ border: 'none', background: 'transparent', color: '#166534', fontWeight: 600, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti ti-cash" /> Registrar baixa manual {mostrarBaixa ? '▲' : '▼'}
            </button>
            {mostrarBaixa && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <span style={label}>Forma</span>
                  <select value={formaBaixa} onChange={(e) => setFormaBaixa(e.target.value as FormaBaixaPagar)} style={inputStyle}>
                    <option value="pix">PIX</option>
                    <option value="transferencia">Transferência</option>
                    <option value="boleto_manual">Boleto (manual)</option>
                    <option value="manual">Manual (rápida)</option>
                  </select>
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <span style={label}>Valor</span>
                  <input type="number" step="0.01" value={valorBaixa} onChange={(e) => setValorBaixa(parseFloat(e.target.value) || 0)} style={inputStyle} />
                </div>
                <button disabled={salvando} onClick={handleConfirmarBaixa} style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 14px', fontSize: '12px', cursor: 'pointer' }}>
                  Confirmar Baixa
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Timeline de eventos ── */}
        {titulo.eventos && titulo.eventos.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <span style={label}>Histórico</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
              {titulo.eventos.map((ev) => (
                <div key={ev.id} style={{ fontSize: '11px', color: '#5a6b7a', borderLeft: '2px solid #dde8f0', paddingLeft: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#1a6094' }}>{ev.tipo}</span> — {ev.descricao}
                </div>
              ))}
            </div>
          </div>
        )}

        {erro && <div style={{ marginTop: '10px', color: '#d32f2f', fontSize: '11px' }}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
          {cancelado && (
            <button onClick={() => onReabrir(titulo.id)} style={{ border: '1px solid #1a6094', background: 'transparent', color: '#1a6094', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer' }}>
              Reabrir
            </button>
          )}
          {!cancelado && !somenteLeitura && (
            <button onClick={() => onCancelar(titulo.id)} style={{ border: '1px solid #d32f2f', background: 'transparent', color: '#d32f2f', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer' }}>
              Cancelar Título
            </button>
          )}
          <button onClick={onFechar} style={{ border: '1px solid #dde8f0', background: 'transparent', color: '#5a6b7a', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer' }}>
            Fechar
          </button>
          {!somenteLeitura && (
            <button disabled={salvando} onClick={handleSalvar} style={{ background: '#1a6094', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
