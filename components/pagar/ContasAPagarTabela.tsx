// ============================================================
// components/pagar/ContasAPagarTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Tabela desktop de títulos a pagar. Réplica visual do
//         padrão de ContasReceberTabela.tsx (Tahoma, header #1a6094,
//         table-layout fixed, confirmação inline trocando botões por
//         Sim/Não) — colunas adaptadas ao sentido inverso: Favorecido
//         no lugar de Cliente, sem Nome Fantasia/Cidade (não fazem
//         parte do modelo de dados de contas_a_pagar).
// Conecta com: app/pagar/page.tsx, lib/contasAPagarService.ts,
//              types/contasAPagar.ts (STATUS_LABELS_PAGAR, STATUS_CORES_PAGAR)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import type { ContaAPagar } from '@/types/contasAPagar'
import { STATUS_LABELS_PAGAR, STATUS_CORES_PAGAR } from '@/types/contasAPagar'
import { formatarCnpjCpf, formatarMoeda, formatarDataBR, isTituloVencido, isTituloNearVencimento } from '@/lib/contasAPagarService'

interface ContasAPagarTabelaProps {
  titulos:      ContaAPagar[]
  onVisualizar: (t: ContaAPagar) => void
  onEditar:     (t: ContaAPagar) => void
  onCancelar:   (t: ContaAPagar) => void
  onBaixar:     (t: ContaAPagar) => void  // abre o modal já no modo de baixa manual
}

export default function ContasAPagarTabela({ titulos, onVisualizar, onEditar, onCancelar, onBaixar }: ContasAPagarTabelaProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [acaoConfirmando, setAcaoConfirmando] = useState<{ id: string; tipo: 'cancelar' } | null>(null)

  useEffect(() => { setAcaoConfirmando(null) }, [titulos])

  return (
    <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #dde8f0', borderRadius: '8px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed', minWidth: '820px' }}>
        <thead>
          <tr style={{ background: '#1a6094', color: '#ffffff', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            <th style={thStyle('8%')}>Vencimento</th>
            <th style={thStyle('9%')}>Nº Doc.</th>
            <th style={thStyle('11%')}>CNPJ / CPF</th>
            <th style={thStyle('26%')}>Favorecido</th>
            <th style={thStyle('9%')}>Dt. Process.</th>
            <th style={thStyle('16%')}>Nosso Número</th>
            <th style={thStyle('9%', true)}>Valor</th>
            <th style={thStyle('7%')}>Status</th>
            <th style={thStyle('13%')}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {titulos.length === 0 && (
            <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#7a8a99', fontSize: '12px' }}>Nenhum título encontrado.</td></tr>
          )}
          {titulos.map((t) => {
            const vencido = isTituloVencido(t)
            const nearVenc = isTituloNearVencimento(t)
            const cancelado = t.deleted_at !== null && t.deleted_at !== undefined
            const cores = STATUS_CORES_PAGAR[t.status]

            let bg = hoverId === t.id ? '#f0f4f7' : '#ffffff'
            if (cancelado) bg = hoverId === t.id ? '#f5f5f5' : '#fafafa'
            else if (vencido) bg = hoverId === t.id ? '#fde8e8' : '#fef2f2'
            else if (nearVenc) bg = hoverId === t.id ? '#fef3c7' : '#fffbeb'

            const confirmandoCancelar = acaoConfirmando?.id === t.id && acaoConfirmando.tipo === 'cancelar'

            return (
              <tr
                key={t.id}
                onMouseEnter={() => setHoverId(t.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ background: bg, borderBottom: '1px solid #eef2f5', color: cancelado ? '#9ca3af' : '#1a1a1a', textDecoration: cancelado ? 'line-through' : 'none' }}
              >
                <td style={tdStyle()}>{formatarDataBR(t.data_vencimento)}</td>
                <td style={tdStyle()}>{t.numero_documento ?? '—'}</td>
                <td style={tdStyle()}>{formatarCnpjCpf(t.favorecido_cnpj_cpf)}</td>
                <td style={tdStyle()} title={t.favorecido_nome}>{t.favorecido_nome}</td>
                <td style={tdStyle()}>{formatarDataBR(t.data_processamento)}</td>
                <td style={{ ...tdStyle(), fontFamily: 'Courier New, monospace', fontWeight: 600, color: '#1a5276' }}>{t.nosso_numero ?? '—'}</td>
                <td style={{ ...tdStyle(true), fontWeight: 600 }}>{formatarMoeda(t.valor)}</td>
                <td style={tdStyle()}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: cores.bg, color: cores.text }}>
                    {STATUS_LABELS_PAGAR[t.status]}
                  </span>
                </td>
                <td style={tdStyle()}>
                  {confirmandoCancelar ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => { onCancelar(t); setAcaoConfirmando(null) }} style={btnAcao('#d32f2f')}>Sim</button>
                      <button onClick={() => setAcaoConfirmando(null)} style={btnAcao('#7a8a99')}>Não</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => onVisualizar(t)} title="Visualizar" style={btnIcone()}><i className="ti ti-eye" /></button>
                      {!cancelado && (
                        <>
                          <button onClick={() => onEditar(t)} title="Editar" style={btnIcone()}><i className="ti ti-writing" /></button>
                          {t.status !== 'pago' && (
                            <button onClick={() => onBaixar(t)} title="Baixar" style={btnIcone('#166534')}><i className="ti ti-cash" /></button>
                          )}
                          <button onClick={() => setAcaoConfirmando({ id: t.id, tipo: 'cancelar' })} title="Cancelar" style={btnIcone('#d32f2f')}><i className="ti ti-x" /></button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function thStyle(width: string, alignRight = false): React.CSSProperties {
  return { width, padding: '8px 6px', textAlign: alignRight ? 'right' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
}
function tdStyle(alignRight = false): React.CSSProperties {
  return { padding: '7px 6px', textAlign: alignRight ? 'right' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
}
function btnIcone(cor = '#1a6094'): React.CSSProperties {
  return { border: 'none', background: 'transparent', color: cor, cursor: 'pointer', fontSize: '15px', padding: '2px 4px' }
}
function btnAcao(cor: string): React.CSSProperties {
  return { border: `1px solid ${cor}`, background: 'transparent', color: cor, cursor: 'pointer', fontSize: '10px', padding: '3px 8px', borderRadius: '4px' }
}
