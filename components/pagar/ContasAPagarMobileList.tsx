// ============================================================
// components/pagar/ContasAPagarMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Lista de cards para mobile — equivalente de
//         ContasReceberMobileList.tsx, adaptada ao sentido inverso
// Conecta com: app/pagar/page.tsx
// ============================================================

'use client'

import { useState } from 'react'
import type { ContaAPagar } from '@/types/contasAPagar'
import { STATUS_LABELS_PAGAR, STATUS_CORES_PAGAR } from '@/types/contasAPagar'
import { formatarCnpjCpf, formatarMoeda, formatarDataBR, isTituloVencido, isTituloNearVencimento } from '@/lib/contasAPagarService'

interface ContasAPagarMobileListProps {
  titulos:      ContaAPagar[]
  onVisualizar: (t: ContaAPagar) => void
  onEditar:     (t: ContaAPagar) => void
  onCancelar:   (t: ContaAPagar) => void
  onBaixar:     (t: ContaAPagar) => void
}

export default function ContasAPagarMobileList({ titulos, onVisualizar, onEditar, onCancelar, onBaixar }: ContasAPagarMobileListProps) {
  const [confirmandoCancelarId, setConfirmandoCancelarId] = useState<string | null>(null)

  if (titulos.length === 0) {
    return <div style={{ padding: '32px 16px', textAlign: 'center', color: '#7a8a99', fontSize: '13px', fontFamily: 'Tahoma' }}>Nenhum título encontrado.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      {titulos.map((t) => {
        const vencido = isTituloVencido(t)
        const nearVenc = isTituloNearVencimento(t)
        const cancelado = t.deleted_at !== null && t.deleted_at !== undefined
        const cores = STATUS_CORES_PAGAR[t.status]

        let borderCor = '#dde8f0'
        if (cancelado) borderCor = '#e0e0e0'
        else if (vencido) borderCor = '#f5c2c2'
        else if (nearVenc) borderCor = '#fde68a'

        return (
          <div key={t.id} style={{ border: `1px solid ${borderCor}`, borderRadius: '8px', padding: '12px', background: cancelado ? '#fafafa' : '#ffffff', opacity: cancelado ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', flex: 1, textDecoration: cancelado ? 'line-through' : 'none' }}>
                {t.favorecido_nome}
              </div>
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: cores.bg, color: cores.text, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                {STATUS_LABELS_PAGAR[t.status]}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#5a6b7a', marginBottom: '2px' }}>{formatarCnpjCpf(t.favorecido_cnpj_cpf)} · Doc. {t.numero_documento ?? '—'}</div>
            <div style={{ fontSize: '11px', color: '#5a6b7a', marginBottom: '8px' }}>Vencimento: {formatarDataBR(t.data_vencimento)}</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094', marginBottom: '10px' }}>{formatarMoeda(t.valor)}</div>

            {confirmandoCancelarId === t.id ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '12px', flex: 1 }}>Cancelar este título?</span>
                <button onClick={() => { onCancelar(t); setConfirmandoCancelarId(null) }} style={btnMobile('#d32f2f')}>Sim</button>
                <button onClick={() => setConfirmandoCancelarId(null)} style={btnMobile('#7a8a99')}>Não</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => onVisualizar(t)} style={btnMobile('#1a6094')}><i className="ti ti-eye" /> Ver</button>
                {!cancelado && (
                  <>
                    <button onClick={() => onEditar(t)} style={btnMobile('#1a6094')}><i className="ti ti-writing" /> Editar</button>
                    {t.status !== 'pago' && (
                      <button onClick={() => onBaixar(t)} style={btnMobile('#166534')}><i className="ti ti-cash" /> Baixar</button>
                    )}
                    <button onClick={() => setConfirmandoCancelarId(t.id)} style={btnMobile('#d32f2f')}><i className="ti ti-x" /></button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function btnMobile(cor: string): React.CSSProperties {
  return { flex: 1, border: `1px solid ${cor}`, background: 'transparent', color: cor, cursor: 'pointer', fontSize: '11px', padding: '7px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }
}
