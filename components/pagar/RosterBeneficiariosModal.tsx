// ============================================================
// components/pagar/RosterBeneficiariosModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Tela de manutenção do roster de beneficiários
//         (beneficiarios_pessoais) — lista todos os registros ativos,
//         permite editar qualquer campo (incluindo os 4 novos deste
//         módulo), efeito imediato nas próximas conciliações, sem
//         deploy. Não é opcional (Especificação §5/§7).
// FEATURE NOVA (08/09/2026, a pedido do Maycon): adicionar novos
// beneficiários, excluir (soft-delete) beneficiários novos e antigos,
// e reativar um beneficiário excluído — ver nota completa sobre a
// decisão de soft-delete em lib/contasAPagarService.ts::criarBeneficiarioRoster.
// Fluxo de exclusão passa por uma confirmação inline (sem window.confirm,
// proibido no projeto) antes de chamar onExcluir.
// Conecta com: app/pagar/page.tsx, pages/api/pagar/roster.ts
// ============================================================

'use client'

import { useState } from 'react'
import type { BeneficiarioPessoalRosterPagar, RegraConciliacaoPagar } from '@/types/contasAPagar'
import { formatarDataBR } from '@/lib/contasAPagarService'

interface RosterBeneficiariosModalProps {
  roster:      BeneficiarioPessoalRosterPagar[]
  onFechar:    () => void
  onSalvar:    (id: string, campos: Partial<Omit<BeneficiarioPessoalRosterPagar, 'id'>>) => Promise<void>
  // FEATURE NOVA: cria uma linha nova a partir do formulário "+ Novo Beneficiário"
  onCriar:     (dados: Omit<BeneficiarioPessoalRosterPagar, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  // FEATURE NOVA: soft-delete de uma linha existente (ativa ou recém-criada)
  onExcluir:   (id: string) => Promise<void>
  // FEATURE NOVA: reverte o soft-delete de uma linha
  onReativar:  (id: string) => Promise<void>
  // FEATURE NOVA: dispara novo GET no pai com ?incluirExcluidos=1 (ou sem, pra voltar a só ativos) —
  // a lista de "roster" recebida por prop já vem filtrada/completa conforme esse estado no pai
  onRecarregar: (incluirExcluidos: boolean) => Promise<void>
}

// QA fix (07/09/2026, a pedido do Maycon): holerite_com_abatimento
// (Sheli) e acumulo_ate_valor_integral (Maycon-CNPJ) eliminadas —
// geravam pago_parcial automático e Despesas sintéticas com valores
// irreais em anomalias. sempre_manual substitui as duas: motor de
// conciliação nunca decide baixa sozinho, sempre cai em
// pendente_confirmacao (fila de confirmação manual já existente).
const OPCOES_REGRA: { value: RegraConciliacaoPagar | ''; label: string }[] = [
  { value: '', label: '— sem regra especial —' },
  { value: 'sempre_manual', label: 'Sempre manual (nunca decide sozinho)' },
  { value: 'despesa_automatica_baixada', label: 'Despesa automática baixada' },
]

// FEATURE NOVA: valores de vinculo restritos a select (em vez de texto
// livre) especificamente no formulário de CRIAÇÃO — classificadorOrigemDespesa.ts
// compara vinculo === 'prestador_mei' em 3 pontos diferentes; um typo
// aqui quebraria classificação automática de Despesas silenciosamente.
// Edição de vinculo em linha já existente continua fora de escopo desta
// tela (nunca existiu, decisão anterior mantida).
const OPCOES_VINCULO: { value: string; label: string }[] = [
  { value: 'socio', label: 'Sócio' },
  { value: 'prestador_mei', label: 'Prestador MEI' },
]

const RASCUNHO_NOVO_VAZIO: Partial<BeneficiarioPessoalRosterPagar> = {
  nome: '', cpf: null, cnpj: null, vinculo: 'socio',
  regra_conciliacao_pagar: null, despesa_gerada_categoria: null, despesa_gerada_subtipo: null,
}

export default function RosterBeneficiariosModal({ roster, onFechar, onSalvar, onCriar, onExcluir, onReativar, onRecarregar }: RosterBeneficiariosModalProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Partial<BeneficiarioPessoalRosterPagar>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // ── FEATURE NOVA: criação de novo beneficiário ──
  const [criandoNovo, setCriandoNovo] = useState(false)
  const [rascunhoNovo, setRascunhoNovo] = useState<Partial<BeneficiarioPessoalRosterPagar>>(RASCUNHO_NOVO_VAZIO)
  const [criando, setCriando] = useState(false)
  const [erroNovo, setErroNovo] = useState<string | null>(null)

  // ── FEATURE NOVA: exclusão (com confirmação inline) e reativação ──
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [erroLinhaId, setErroLinhaId] = useState<string | null>(null)
  const [erroLinhaMsg, setErroLinhaMsg] = useState<string | null>(null)

  // ── FEATURE NOVA: toggle "Mostrar excluídos" ──
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false)
  const [recarregando, setRecarregando] = useState(false)

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

  // FEATURE NOVA: submete o formulário de novo beneficiário
  async function handleCriar() {
    if (!rascunhoNovo.nome?.trim()) { setErroNovo('Informe o nome.'); return }
    if (!rascunhoNovo.vinculo) { setErroNovo('Selecione o vínculo.'); return }
    setCriando(true)
    setErroNovo(null)
    try {
      await onCriar({
        nome: rascunhoNovo.nome.trim(),
        cpf: rascunhoNovo.cpf?.trim() || null,
        cnpj: rascunhoNovo.cnpj?.trim() || null,
        vinculo: rascunhoNovo.vinculo,
        aliases: [],
        endereco: null,
        deleted_at: null,
        regra_conciliacao_pagar: (rascunhoNovo.regra_conciliacao_pagar || null) as RegraConciliacaoPagar | null,
        despesa_gerada_categoria: rascunhoNovo.despesa_gerada_categoria?.trim() || null,
        despesa_gerada_subtipo: rascunhoNovo.despesa_gerada_subtipo?.trim() || null,
      })
      setRascunhoNovo(RASCUNHO_NOVO_VAZIO)
      setCriandoNovo(false)
    } catch (err: unknown) {
      setErroNovo(err instanceof Error ? err.message : 'Erro ao criar beneficiário')
    } finally {
      setCriando(false)
    }
  }

  // FEATURE NOVA: confirma e executa a exclusão (soft-delete)
  async function handleConfirmarExclusao(id: string) {
    setProcessandoId(id)
    setErroLinhaId(null)
    try {
      await onExcluir(id)
      setConfirmandoExclusaoId(null)
    } catch (err: unknown) {
      setErroLinhaId(id)
      setErroLinhaMsg(err instanceof Error ? err.message : 'Erro ao excluir beneficiário')
    } finally {
      setProcessandoId(null)
    }
  }

  // FEATURE NOVA: reativa um beneficiário soft-deletado
  async function handleReativar(id: string) {
    setProcessandoId(id)
    setErroLinhaId(null)
    try {
      await onReativar(id)
    } catch (err: unknown) {
      setErroLinhaId(id)
      setErroLinhaMsg(err instanceof Error ? err.message : 'Erro ao reativar beneficiário')
    } finally {
      setProcessandoId(null)
    }
  }

  // FEATURE NOVA: toggle "Mostrar excluídos" — recarrega a lista no pai
  async function handleToggleMostrarExcluidos() {
    const novoValor = !mostrarExcluidos
    setRecarregando(true)
    try {
      await onRecarregar(novoValor)
      setMostrarExcluidos(novoValor)
    } catch {
      // erro de carregamento já é tratado no pai (msgErro global da tela) — nada a fazer aqui
    } finally {
      setRecarregando(false)
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

        {/* FEATURE NOVA: barra de ações — Novo Beneficiário + Mostrar excluídos */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <button
            onClick={() => { setCriandoNovo((v) => !v); setErroNovo(null) }}
            style={{ background: '#1a6094', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <i className="ti ti-plus" aria-hidden="true" /> Novo Beneficiário
          </button>
          <label style={{ fontSize: '11px', color: '#5a6b7a', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', opacity: recarregando ? 0.6 : 1 }}>
            <input type="checkbox" checked={mostrarExcluidos} disabled={recarregando} onChange={handleToggleMostrarExcluidos} />
            Mostrar excluídos
          </label>
        </div>

        {/* FEATURE NOVA: formulário de criação — mesmo padrão visual do card de edição existente */}
        {criandoNovo && (
          <div style={{ border: '1px solid #c4d8eb', background: '#f7fbff', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094', marginBottom: '8px' }}>Novo beneficiário</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '10px', color: '#5a6b7a' }}>Nome *</span>
                <input style={inputStyle} value={rascunhoNovo.nome ?? ''} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, nome: e.target.value })} />
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#5a6b7a' }}>CPF</span>
                <input style={inputStyle} value={rascunhoNovo.cpf ?? ''} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, cpf: e.target.value || null })} />
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#5a6b7a' }}>CNPJ</span>
                <input style={inputStyle} value={rascunhoNovo.cnpj ?? ''} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, cnpj: e.target.value || null })} />
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#5a6b7a' }}>Vínculo *</span>
                <select style={inputStyle} value={rascunhoNovo.vinculo ?? 'socio'} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, vinculo: e.target.value })}>
                  {OPCOES_VINCULO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#5a6b7a' }}>Regra de conciliação (Contas a Pagar)</span>
                <select style={inputStyle} value={rascunhoNovo.regra_conciliacao_pagar ?? ''} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, regra_conciliacao_pagar: (e.target.value || null) as RegraConciliacaoPagar | null })}>
                  {OPCOES_REGRA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div><span style={{ fontSize: '10px', color: '#5a6b7a' }}>Categoria da despesa gerada</span><input style={inputStyle} value={rascunhoNovo.despesa_gerada_categoria ?? ''} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, despesa_gerada_categoria: e.target.value || null })} /></div>
              <div><span style={{ fontSize: '10px', color: '#5a6b7a' }}>Subtipo da despesa gerada</span><input style={inputStyle} value={rascunhoNovo.despesa_gerada_subtipo ?? ''} onChange={(e) => setRascunhoNovo({ ...rascunhoNovo, despesa_gerada_subtipo: e.target.value || null })} /></div>

              {erroNovo && <div style={{ gridColumn: '1 / -1', color: '#d32f2f', fontSize: '10px' }}>{erroNovo}</div>}

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                <button onClick={() => { setCriandoNovo(false); setRascunhoNovo(RASCUNHO_NOVO_VAZIO); setErroNovo(null) }} style={{ border: '1px solid #dde8f0', background: 'transparent', color: '#5a6b7a', borderRadius: '6px', padding: '5px 10px', fontSize: '10px', cursor: 'pointer' }}>Cancelar</button>
                <button disabled={criando} onClick={handleCriar} style={{ background: '#1a6094', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '10px', cursor: criando ? 'not-allowed' : 'pointer', opacity: criando ? 0.7 : 1 }}>{criando ? 'Criando...' : 'Criar'}</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {roster.map((b) => {
            const emEdicao = editandoId === b.id
            const excluido = b.deleted_at !== null && b.deleted_at !== undefined
            const emProcessamento = processandoId === b.id
            return (
              <div key={b.id} style={{ border: '1px solid #dde8f0', borderRadius: '8px', padding: '10px', background: excluido ? '#f7f7f7' : '#fff', opacity: excluido ? 0.75 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>
                    {b.nome} <span style={{ fontWeight: 400, color: '#7a8a99' }}>({b.vinculo})</span>
                    {excluido && <span style={{ marginLeft: '8px', fontSize: '9px', fontWeight: 700, color: '#a32d2d', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '1px 6px' }}>EXCLUÍDO {b.deleted_at ? `em ${formatarDataBR(b.deleted_at)}` : ''}</span>}
                  </div>

                  {/* FEATURE NOVA: ações condicionais conforme o estado da linha */}
                  {!emEdicao && !excluido && confirmandoExclusaoId !== b.id && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => iniciarEdicao(b)} title="Editar" style={{ border: 'none', background: 'transparent', color: '#1a6094', cursor: 'pointer', fontSize: '13px' }}>
                        <i className="ti ti-writing" />
                      </button>
                      <button onClick={() => setConfirmandoExclusaoId(b.id)} title="Excluir" style={{ border: 'none', background: 'transparent', color: '#d32f2f', cursor: 'pointer', fontSize: '13px' }}>
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  )}
                  {excluido && (
                    <button disabled={emProcessamento} onClick={() => handleReativar(b.id)} style={{ border: '1px solid #c4d8eb', background: '#fff', color: '#1a6094', borderRadius: '6px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, cursor: emProcessamento ? 'not-allowed' : 'pointer' }}>
                      {emProcessamento ? 'Reativando...' : 'Reativar'}
                    </button>
                  )}
                </div>

                {/* FEATURE NOVA: confirmação inline de exclusão (sem window.confirm) */}
                {confirmandoExclusaoId === b.id && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '7px 10px' }}>
                    <span style={{ fontSize: '10px', color: '#92400e' }}>Excluir {b.nome}? Não afeta despesas já lançadas — só deixa de valer para classificações e conciliações novas. Pode ser revertido em &quot;Mostrar excluídos&quot;.</span>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '10px' }}>
                      <button onClick={() => setConfirmandoExclusaoId(null)} style={{ border: '1px solid #dde8f0', background: '#fff', color: '#5a6b7a', borderRadius: '5px', padding: '4px 9px', fontSize: '10px', cursor: 'pointer' }}>Não</button>
                      <button disabled={emProcessamento} onClick={() => handleConfirmarExclusao(b.id)} style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '5px', padding: '4px 9px', fontSize: '10px', fontWeight: 700, cursor: emProcessamento ? 'not-allowed' : 'pointer' }}>{emProcessamento ? 'Excluindo...' : 'Sim, excluir'}</button>
                    </div>
                  </div>
                )}

                {erroLinhaId === b.id && <div style={{ marginTop: '6px', color: '#d32f2f', fontSize: '10px' }}>{erroLinhaMsg}</div>}

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
