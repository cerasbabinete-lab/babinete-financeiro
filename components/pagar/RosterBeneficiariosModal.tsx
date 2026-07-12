// ============================================================
// components/pagar/RosterBeneficiariosModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Tela de manutenção do roster de beneficiários
//         (beneficiarios_pessoais) — lista todos os registros,
//         permite editar qualquer campo (incluindo os 4 novos deste
//         módulo), efeito imediato nas próximas conciliações, sem
//         deploy. Não é opcional (Especificação §5/§7).
// Conecta com: app/pagar/page.tsx, pages/api/pagar/roster.ts
// ============================================================

'use client'

import { useState } from 'react'
import type { BeneficiarioPessoalRosterPagar, RegraConciliacaoPagar } from '@/types/contasAPagar'

interface RosterBeneficiariosModalProps {
  roster:    BeneficiarioPessoalRosterPagar[]
  onFechar:  () => void
  onSalvar:  (id: string, campos: Partial<Omit<BeneficiarioPessoalRosterPagar, 'id'>>) => Promise<void>
}

const OPCOES_REGRA: { value: RegraConciliacaoPagar | ''; label: string }[] = [
  { value: '', label: '— sem regra especial —' },
  { value: 'holerite_com_abatimento', label: 'Holerite com abatimento' },
  { value: 'despesa_automatica_baixada', label: 'Despesa automática baixada' },
  { value: 'acumulo_ate_valor_integral', label: 'Acúmulo até valor integral' },
]

export default function RosterBeneficiariosModal({ roster, onFechar, onSalvar }: RosterBeneficiariosModalProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Partial<BeneficiarioPessoalRosterPagar>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function iniciarEdicao(b: BeneficiarioPessoalRosterPagar) {
    setEditandoId(b.id)
    setRascunho({ ...b })
    setErro(null)
  }

  async function handleSalvar() {
    if (!editandoId) return
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(editandoId, rascunho)
      setEditandoId(null)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar beneficiário')
    } finally {
      setSalvando(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dde8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontFamily: 'Tahoma, Geneva, sans-serif', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <div style={{ background: '#ffffff', borderRadius: '10px', padding: '20px', width: '94%', maxWidth: '760px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>Roster de Beneficiários</div>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', color: '#7a8a99', fontSize: '18px', cursor: 'pointer' }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {roster.map((b) => {
            const emEdicao = editandoId === b.id
            return (
              <div key={b.id} style={{ border: '1px solid #dde8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{b.nome} <span style={{ fontWeight: 400, color: '#7a8a99' }}>({b.vinculo})</span></div>
                  {!emEdicao && (
                    <button onClick={() => iniciarEdicao(b)} style={{ border: 'none', background: 'transparent', color: '#1a6094', cursor: 'pointer', fontSize: '13px' }}>
                      <i className="ti ti-writing" />
                    </button>
                  )}
                </div>

                {!emEdicao ? (
                  <div style={{ fontSize: '10px', color: '#7a8a99', marginTop: '4px' }}>
                    CPF: {b.cpf ?? '—'} · CNPJ: {b.cnpj ?? '—'} · Regra: {b.regra_conciliacao_pagar ?? '—'} · Categoria: {b.despesa_gerada_categoria ?? '—'} · Subtipo: {b.despesa_gerada_subtipo ?? '—'}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <div><span style={{ fontSize: '10px', color: '#5a6b7a' }}>CPF</span><input style={inputStyle} value={rascunho.cpf ?? ''} onChange={(e) => setRascunho({ ...rascunho, cpf: e.target.value || null })} /></div>
                    <div><span style={{ fontSize: '10px', color: '#5a6b7a' }}>CNPJ</span><input style={inputStyle} value={rascunho.cnpj ?? ''} onChange={(e) => setRascunho({ ...rascunho, cnpj: e.target.value || null })} /></div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '10px', color: '#5a6b7a' }}>Regra de conciliação (Contas a Pagar)</span>
                      <select style={inputStyle} value={rascunho.regra_conciliacao_pagar ?? ''} onChange={(e) => setRascunho({ ...rascunho, regra_conciliacao_pagar: (e.target.value || null) as RegraConciliacaoPagar | null })}>
                        {OPCOES_REGRA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div><span style={{ fontSize: '10px', color: '#5a6b7a' }}>Categoria da despesa gerada</span><input style={inputStyle} value={rascunho.despesa_gerada_categoria ?? ''} onChange={(e) => setRascunho({ ...rascunho, despesa_gerada_categoria: e.target.value || null })} /></div>
                    <div><span style={{ fontSize: '10px', color: '#5a6b7a' }}>Subtipo da despesa gerada</span><input style={inputStyle} value={rascunho.despesa_gerada_subtipo ?? ''} onChange={(e) => setRascunho({ ...rascunho, despesa_gerada_subtipo: e.target.value || null })} /></div>

                    {erro && <div style={{ gridColumn: '1 / -1', color: '#d32f2f', fontSize: '10px' }}>{erro}</div>}

                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                      <button onClick={() => setEditandoId(null)} style={{ border: '1px solid #dde8f0', background: 'transparent', color: '#5a6b7a', borderRadius: '6px', padding: '5px 10px', fontSize: '10px', cursor: 'pointer' }}>Cancelar</button>
                      <button disabled={salvando} onClick={handleSalvar} style={{ background: '#1a6094', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '10px', cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
