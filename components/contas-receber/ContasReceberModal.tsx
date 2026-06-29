// ============================================================
// components/contas-receber/ContasReceberModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Modal principal — visualizar / editar / novo título
//         Seções: Identificação | Sacado | Dados BB | Histórico
//         Baixa manual e cancelamento via UI inline (sem alert/confirm)
//         2ª via de boleto via API route /api/boleto
// Conecta com: app/receber/page.tsx
//              contasReceberService.ts (CRUD + baixa + cancelar + reabrir)
//              types/contasReceber.ts (ContaReceber, ModoModal)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import type { ContaReceber, ModoModal } from '@/types/contasReceber'
import { STATUS_LABELS, STATUS_CORES } from '@/types/contasReceber'
import {
  criarTitulo,
  editarTitulo,
  cancelarTitulo,
  reabrirTitulo,
  registrarBaixaManual,
  verificarDuplicataManual,
  buscarReceitasParaVinculo,
  formatarCnpjCpf,
  formatarMoeda,
  formatarDataBR,
  formatarNossoNumero,
} from '@/lib/contasReceberService'
import { supabase } from '@/lib/supabase'  // Para obter o access_token do boleto
import type { ContaReceberInsert } from '@/types/contasReceber'

interface ContasReceberModalProps {
  modo:    ModoModal
  titulo:  ContaReceber | null
  onFechar:  () => void
  onSalvo:   () => void
  onEditar?: (t: ContaReceber) => void  // Callback para trocar para modo editar (opcional)
}

export default function ContasReceberModal({
  modo,
  titulo,
  onFechar,
  onSalvo,
  onEditar,
}: ContasReceberModalProps) {

  // Não renderiza se não há modo ativo
  if (!modo) return null

  const isVisualizar = modo === 'visualizar'
  const isEditar     = modo === 'editar'
  const isNovo       = modo === 'novo'

  return (
    <ModalContent
      modo={modo}
      titulo={titulo}
      isVisualizar={isVisualizar}
      isEditar={isEditar}
      isNovo={isNovo}
      onFechar={onFechar}
      onSalvo={onSalvo}
      onEditar={onEditar}
    />
  )
}

// ============================================================
// ModalContent — componente interno separado para limpar estado
// ao abrir/fechar (key prop na page garante reset)
// ============================================================
function ModalContent({
  modo,
  titulo,
  isVisualizar,
  isEditar,
  isNovo,
  onFechar,
  onSalvo,
  onEditar,
}: {
  modo:         ModoModal
  titulo:       ContaReceber | null
  isVisualizar: boolean
  isEditar:     boolean
  isNovo:       boolean
  onFechar:     () => void
  onSalvo:      () => void
  onEditar?:    (t: ContaReceber) => void
}) {

  // ── Campos editáveis ──────────────────────────────────────
  const [clienteEmail,   setClienteEmail]   = useState(titulo?.cliente_email   ?? '')
  const [observacoes,    setObservacoes]    = useState(titulo?.observacoes      ?? '')
  const [dataVencimento, setDataVencimento] = useState(titulo?.data_vencimento  ?? '')
  const [valor,          setValor]          = useState(titulo?.valor?.toString() ?? '')
  const [numDoc,         setNumDoc]         = useState(titulo?.numero_documento  ?? '')
  const [numDuplic,      setNumDuplic]      = useState(titulo?.numero_duplicata  ?? '001')
  // H-4: campo CPF/CNPJ editável no modo novo — não retornado por buscarReceitasParaVinculo
  const [cpfCnpjNovo,   setCpfCnpjNovo]   = useState('')

  // ── Seleção de NF-e (modo novo) ───────────────────────────
  const [receitas,        setReceitas]        = useState<Awaited<ReturnType<typeof buscarReceitasParaVinculo>>>([])
  const [receitaId,       setReceitaId]       = useState<string>('')
  const [duplicataSelecionada, setDuplicataSelecionada] = useState<string>('')

  // ── Estados de UI ─────────────────────────────────────────
  const [salvando,          setSalvando]          = useState(false)
  const [erro,              setErro]              = useState<string | null>(null)
  const [showBaixaForm,     setShowBaixaForm]     = useState(false)
  const [formaBaixa,        setFormaBaixa]        = useState<'pix' | 'transferencia'>('pix')
  const [baixando,          setBaixando]          = useState(false)
  const [showCancelForm,    setShowCancelForm]    = useState(false)
  const [cancelando,        setCancelando]        = useState(false)
  const [gerandoBoleto,     setGerandoBoleto]     = useState(false)

  // ── Carrega receitas para seleção no modo novo ─────────────
  useEffect(() => {
    if (isNovo) {
      buscarReceitasParaVinculo().then(setReceitas)
    }
  }, [isNovo])

  // ── Preenche duplicata ao selecionar receita ───────────────
  const receitaSelecionada = receitas.find((r: { id: string; numero_nf: number; cliente_nome: string; valor_nf: number; duplicatas: { numero_duplicata: string; data_vencimento: string; valor: number }[] }) => r.id === receitaId)

  // ── Salvar título ─────────────────────────────────────────
  async function handleSalvar() {
    setErro(null)
    setSalvando(true)
    try {
      if (isNovo) {
        // Validações do modo novo
        if (!receitaId) { setErro('Selecione uma NF-e de origem.'); return }
        if (!dataVencimento) { setErro('Data de vencimento obrigatória.'); return }
        if (!valor || parseFloat(valor) <= 0) { setErro('Valor inválido.'); return }
        if (!numDoc.trim()) { setErro('Número do documento obrigatório.'); return }

        // Deduplicação: receita_id + numero_duplicata
        const duplicado = await verificarDuplicataManual(receitaId, numDuplic)
        if (duplicado) {
          setErro(`Já existe um título para esta NF-e com duplicata ${numDuplic}.`)
          return
        }

        const rec = receitaSelecionada
        const novoTitulo: ContaReceberInsert = {
          receita_id:        receitaId,
          numero_documento:  numDoc.trim(),
          numero_duplicata:  numDuplic.trim(),
          data_vencimento:   dataVencimento,
          data_processamento: new Date().toISOString().slice(0, 10),
          valor:             parseFloat(valor),
          status:            'em_aberto',
          cliente_nome:      rec?.cliente_nome ?? '',
          // H-4 FIX: usa o CNPJ/CPF digitado pelo usuário no modo novo
          // strip de pontuação — banco armazena só dígitos
          cliente_cpf_cnpj:  cpfCnpjNovo.replace(/[^0-9]/g, ''),
          cliente_email:     clienteEmail.trim() || null,
          observacoes:       observacoes.trim() || null,
        }
        await criarTitulo(novoTitulo, `Lançamento manual criado pelo usuário para NF-e ${rec?.numero_nf ?? numDoc}.`)

      } else if (isEditar && titulo) {
        // Modo editar — apenas campos editáveis
        await editarTitulo({
          id:            titulo.id,
          cliente_email: clienteEmail.trim() || null,
          observacoes:   observacoes.trim() || null,
          data_vencimento: dataVencimento || titulo.data_vencimento,
        })
      }
      onSalvo()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  // ── Baixa manual ──────────────────────────────────────────
  async function handleConfirmarBaixa() {
    if (!titulo) return
    setBaixando(true)
    try {
      await registrarBaixaManual(titulo.id, formaBaixa)
      onSalvo()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar baixa')
      setBaixando(false)
    }
  }

  // ── Cancelamento ──────────────────────────────────────────
  async function handleConfirmarCancelamento() {
    if (!titulo) return
    setCancelando(true)
    try {
      await cancelarTitulo(titulo.id)
      onSalvo()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao cancelar título')
      setCancelando(false)
    }
  }

  // ── Reabrir título ────────────────────────────────────────
  async function handleReabrir() {
    if (!titulo) return
    try {
      await reabrirTitulo(titulo.id)
      onSalvo()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao reabrir título')
    }
  }

  // ── 2ª Via de Boleto ──────────────────────────────────────
  async function handleGerarBoleto() {
    if (!titulo?.nosso_numero) return
    setGerandoBoleto(true)
    try {
      // Obtém o token de acesso da sessão atual para autenticar na API
      // getSession() é aceitável aqui pois é client-side — apenas para obter o token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const res = await fetch('/api/boleto', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`, // H-3: token para validação server-side
        },
        body:    JSON.stringify({
          nossoNumero:      titulo.nosso_numero,
          valor:            titulo.valor,
          dataVencimento:   titulo.data_vencimento,
          clienteNome:      titulo.cliente_nome,
          clienteCpfCnpj:   titulo.cliente_cpf_cnpj,
          clienteMunicipio: titulo.cliente_municipio,
          clienteUf:        titulo.cliente_uf,
          numeroDocumento:  titulo.numero_documento,
          // M-5: endereço e CEP do sacado — schema não possui campos separados;
          // enviados como strings vazias para que a API não processe undefined
          clienteEndereco:  '',
          clienteCep:       '',
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({ erro: 'Erro desconhecido' }))
        throw new Error(json.erro ?? 'Erro ao gerar boleto')
      }
      // Abre o PDF em nova aba
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      window.open(url, '_blank')
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar boleto')
    } finally {
      setGerandoBoleto(false)
    }
  }

  // ── WhatsApp link ─────────────────────────────────────────
  function handleWhatsApp() {
    if (!titulo?.cliente_fone) return
    const fone = titulo.cliente_fone.replace(/\D/g, '')
    window.open(`https://wa.me/55${fone}`, '_blank')
  }

  // ── Status do título atual ────────────────────────────────
  const statusAtual  = titulo?.status ?? 'em_aberto'
  const cores        = STATUS_CORES[statusAtual as keyof typeof STATUS_CORES]
  const labelStatus  = STATUS_LABELS[statusAtual as keyof typeof STATUS_LABELS] ?? statusAtual
  const isCancelado  = statusAtual === 'cancelado'
  const isPago       = statusAtual === 'pago'
  const isEmAberto   = statusAtual === 'em_aberto'
  const temNossoNum  = !!titulo?.nosso_numero

  // ── Estilos compartilhados ────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', height: '28px', padding: '0 8px',
    fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif',
    border: '1px solid #dde8f0', borderRadius: '4px',
    background: '#fff', outline: 'none', color: '#2c4a60',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', color: '#5a84a6', fontWeight: 600,
    fontFamily: 'Tahoma, Geneva, sans-serif', marginBottom: '3px', display: 'block',
  }
  const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
  const sectionStyle: React.CSSProperties = {
    borderBottom: '1px solid #eef3f7', paddingBottom: '12px', marginBottom: '12px',
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#1a6094',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: '10px', fontFamily: 'Tahoma, Geneva, sans-serif',
  }
  const btnPrimary: React.CSSProperties = {
    padding: '6px 14px', fontSize: '12px', fontWeight: 700,
    fontFamily: 'Tahoma, Geneva, sans-serif',
    background: '#1a6094', color: '#fff', border: 'none',
    borderRadius: '5px', cursor: 'pointer',
  }
  const btnOutline: React.CSSProperties = {
    ...btnPrimary, background: '#fff', color: '#3a6080', border: '1px solid #c4d8eb',
  }
  const btnDanger: React.CSSProperties = {
    ...btnPrimary, background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
  }

  // ── Título da modal ───────────────────────────────────────
  const tituloModal = isNovo       ? 'Novo Lançamento'
                    : isEditar     ? 'Editar Título'
                    : 'Visualizar Título'

  return (
    // Overlay
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Tahoma, Geneva, sans-serif',
    }}>
      {/* Painel */}
      <div style={{
        background: '#ffffff', borderRadius: '8px',
        width: '680px', maxWidth: '96vw', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header azul ── */}
        <div style={{
          background: '#1a6094', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
            {tituloModal}
          </span>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* ── Corpo scrollável ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

          {/* Erro inline */}
          {erro && (
            <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '5px', color: '#a32d2d', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{erro}</span>
              <button onClick={() => setErro(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d' }}>✕</button>
            </div>
          )}

          {/* ── SEÇÃO 1: Modo Novo — seleção de NF-e ── */}
          {isNovo && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>NF-e de Origem</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>NF-e *</label>
                  <select
                    value={receitaId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setReceitaId(e.target.value); setNumDoc(''); setDataVencimento(''); setValor('') }}
                    style={{ ...inputStyle, height: '28px', cursor: 'pointer' }}
                  >
                    <option value="">Selecione a NF-e...</option>
                    {receitas.map((r: Awaited<ReturnType<typeof buscarReceitasParaVinculo>>[number]) => (
                      <option key={r.id} value={r.id}>
                        {r.numero_nf} — {r.cliente_nome.slice(0, 30)} — {formatarMoeda(r.valor_nf)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Duplicata</label>
                  <select
                    value={duplicataSelecionada}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const d = receitaSelecionada?.duplicatas.find((d: { numero_duplicata: string; data_vencimento: string; valor: number }) => d.numero_duplicata === e.target.value)
                      setDuplicataSelecionada(e.target.value)
                      if (d) {
                        setNumDuplic(d.numero_duplicata)
                        setDataVencimento(d.data_vencimento)
                        setValor(String(d.valor))
                        setNumDoc(receitaSelecionada ? `${String(receitaSelecionada.numero_nf).padStart(6, '0')}/${d.numero_duplicata}` : '')
                      }
                    }}
                    disabled={!receitaId}
                    style={{ ...inputStyle, height: '28px', cursor: receitaId ? 'pointer' : 'not-allowed', opacity: receitaId ? 1 : 0.5 }}
                  >
                    <option value="">Selecione a parcela...</option>
                    {receitaSelecionada?.duplicatas.map((d: { numero_duplicata: string; data_vencimento: string; valor: number }) => (
                      <option key={d.numero_duplicata} value={d.numero_duplicata}>
                        {d.numero_duplicata} — {formatarDataBR(d.data_vencimento)} — {formatarMoeda(d.valor)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── SEÇÃO 2: Identificação ── */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Identificação</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Nº Documento</label>
                {isNovo ? (
                  <input type="text" value={numDoc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumDoc(e.target.value)} style={inputStyle} placeholder="005414/1" />
                ) : (
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center', fontWeight: 700, color: '#1a6094' }}>
                    {titulo?.numero_documento ?? '—'}
                  </div>
                )}
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Duplicata</label>
                {isNovo ? (
                  <input type="text" value={numDuplic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumDuplic(e.target.value)} style={inputStyle} placeholder="001" />
                ) : (
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>
                    {titulo?.numero_duplicata ?? '—'}
                  </div>
                )}
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Status</label>
                <div style={{ display: 'flex', alignItems: 'center', height: '28px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
                    fontSize: '11px', fontWeight: 700,
                    background: cores?.bg ?? '#f0f4f7',
                    color: cores?.text ?? '#5a84a6',
                  }}>
                    {labelStatus}
                  </span>
                </div>
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Dt. Processamento</label>
                <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center', fontSize: '11px' }}>
                  {titulo ? formatarDataBR(titulo.data_processamento) : new Date().toLocaleDateString('pt-BR')}
                </div>
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Vencimento {isNovo || isEditar ? '*' : ''}</label>
                {(isNovo || isEditar) ? (
                  <input type="date" value={dataVencimento} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDataVencimento(e.target.value)} style={inputStyle} />
                ) : (
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>
                    {titulo ? formatarDataBR(titulo.data_vencimento) : '—'}
                  </div>
                )}
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Valor {isNovo ? '*' : ''}</label>
                {isNovo ? (
                  <input type="number" step="0.01" min="0" value={valor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValor(e.target.value)} style={inputStyle} placeholder="0,00" />
                ) : (
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center', fontWeight: 700, color: '#1a6094' }}>
                    {titulo ? formatarMoeda(titulo.valor) : '—'}
                  </div>
                )}
              </div>

              {/* H-4: Campo CNPJ/CPF editável apenas no modo novo */}
              {/* No modo visualizar/editar, o campo vem do banco e é exibido na seção Sacado */}
              {isNovo && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>CNPJ / CPF do Sacado</label>
                  <input
                    type="text"
                    value={cpfCnpjNovo}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCpfCnpjNovo(e.target.value)}
                    style={inputStyle}
                    placeholder="00.000.000/0001-00 ou 000.000.000-00"
                    maxLength={18} // Comprimento máximo de CNPJ formatado
                  />
                </div>
              )}

              {titulo?.data_baixa && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Dt. Baixa</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>
                    {formatarDataBR(titulo.data_baixa)}
                  </div>
                </div>
              )}

              {titulo?.forma_baixa && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Forma Baixa</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>
                    {titulo.forma_baixa === 'ret' ? 'Retorno bancário' : titulo.forma_baixa === 'pix' ? 'PIX' : 'Transferência'}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── SEÇÃO 3: Sacado ── */}
          {titulo && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>Sacado</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Razão Social</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>{titulo.cliente_nome}</div>
                </div>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>CNPJ / CPF</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center', fontFamily: '\'Courier New\', monospace', fontSize: '11px' }}>
                    {formatarCnpjCpf(titulo.cliente_cpf_cnpj)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Cidade / UF</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>
                    {titulo.cliente_municipio ?? '—'}{titulo.cliente_uf ? ` / ${titulo.cliente_uf}` : ''}
                  </div>
                </div>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Telefone</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>
                    {titulo.cliente_fone ?? '—'}
                  </div>
                </div>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>E-mail</label>
                  {isEditar ? (
                    <input type="email" value={clienteEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteEmail(e.target.value)} style={inputStyle} placeholder="email@exemplo.com" />
                  ) : (
                    <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>{titulo.cliente_email ?? '—'}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── SEÇÃO 4: Dados BB (Nosso Número) ── */}
          {titulo?.nosso_numero && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>Dados do Boleto (BB)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Nosso Número</label>
                  <div style={{ ...inputStyle, background: '#f0f6ff', display: 'flex', alignItems: 'center', fontFamily: '\'Courier New\', monospace', fontWeight: 700, color: '#1a5276', letterSpacing: '0.04em' }}>
                    {formatarNossoNumero(titulo.nosso_numero)}
                  </div>
                </div>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Carteira</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center' }}>17</div>
                </div>
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Agência / Conta</label>
                  <div style={{ ...inputStyle, background: '#f7fafc', display: 'flex', alignItems: 'center', fontFamily: '\'Courier New\', monospace' }}>
                    3512-2 / 0000025605-6
                  </div>
                </div>
              </div>
              {titulo.linha_digitavel && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Linha Digitável</label>
                  <div style={{ padding: '6px 10px', background: '#f7fafc', border: '1px solid #dde8f0', borderRadius: '4px', fontFamily: '\'Courier New\', monospace', fontSize: '11px', color: '#2c4a60', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
                    {titulo.linha_digitavel}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SEÇÃO 5: Observações ── */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Observações</div>
            {isVisualizar ? (
              <div style={{ fontSize: '12px', color: titulo?.observacoes ? '#2c4a60' : '#c5d8e8', fontStyle: titulo?.observacoes ? 'normal' : 'italic', minHeight: '36px' }}>
                {titulo?.observacoes || 'Sem observações.'}
              </div>
            ) : (
              <textarea
                value={observacoes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, height: 'auto', padding: '6px 8px', resize: 'vertical', width: '100%' }}
                placeholder="Observações internas sobre este título..."
              />
            )}
          </div>

          {/* ── SEÇÃO 6: Histórico de eventos ── */}
          {titulo?.eventos && titulo.eventos.length > 0 && (
            <div>
              <div style={sectionTitle}>Histórico</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {titulo.eventos.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {/* Dot */}
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '4px',
                      background: ev.tipo === 'criado'               ? '#1a6094'
                                : ev.tipo === 'nosso_numero_vinculado' ? '#28a745'
                                : ev.tipo.startsWith('baixa')        ? '#28a745'
                                : ev.tipo === 'cancelado'             ? '#dc2626'
                                : ev.tipo === 'reaberto'              ? '#6c757d'
                                : '#5a84a6',
                    }} />
                    <div>
                      <div style={{ fontSize: '11px', color: '#2c4a60' }}>{ev.descricao}</div>
                      <div style={{ fontSize: '10px', color: '#7a9db8', marginTop: '2px' }}>
                        {formatarDataBR(ev.created_at.slice(0, 10))}
                        {ev.created_at.length > 10 && ` ${ev.created_at.slice(11, 16)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Baixa Manual (inline) ── */}
          {isVisualizar && isEmAberto && showBaixaForm && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#f0fff4', border: '1px solid #b7d98f', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b6d11', marginBottom: '10px' }}>
                Confirmar baixa
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '12px', color: '#3a6080', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input type="radio" name="formaBaixa" value="pix" checked={formaBaixa === 'pix'} onChange={(_e: React.ChangeEvent<HTMLInputElement>) => setFormaBaixa('pix')} />
                  PIX
                </label>
                <label style={{ fontSize: '12px', color: '#3a6080', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input type="radio" name="formaBaixa" value="transferencia" checked={formaBaixa === 'transferencia'} onChange={(_e: React.ChangeEvent<HTMLInputElement>) => setFormaBaixa('transferencia')} />
                  Transferência
                </label>
                <span style={{ fontSize: '11px', color: '#5a84a6' }}>
                  em {new Date().toLocaleDateString('pt-BR')}
                </span>
                <button
                  onClick={handleConfirmarBaixa}
                  disabled={baixando}
                  style={{ ...btnPrimary, background: '#28a745', opacity: baixando ? 0.7 : 1 }}
                >
                  {baixando ? 'Registrando...' : 'Confirmar Baixa'}
                </button>
                <button onClick={() => setShowBaixaForm(false)} style={btnOutline}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Cancelamento inline ── */}
          {showCancelForm && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#a32d2d', marginBottom: '10px' }}>
                Confirmar cancelamento deste título?
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleConfirmarCancelamento}
                  disabled={cancelando}
                  style={{ ...btnPrimary, background: '#dc2626', opacity: cancelando ? 0.7 : 1 }}
                >
                  {cancelando ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
                <button onClick={() => setShowCancelForm(false)} style={btnOutline}>
                  Voltar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* ── Footer com ações ── */}
        <div style={{
          padding:         '10px 16px',
          borderTop:       '1px solid #eef3f7',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          gap:             '8px',
        }}>
          {/* Esquerda: ações destrutivas */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Cancelar título — disponível exceto para já cancelados */}
            {titulo && !isCancelado && !showCancelForm && (
              <button onClick={() => setShowCancelForm(true)} style={btnDanger}>
                <i className="ti ti-ban" style={{ fontSize: '13px', marginRight: '4px' }} aria-hidden="true" />
                Cancelar Título
              </button>
            )}
            {/* Reabrir — apenas cancelados */}
            {titulo && isCancelado && (
              <button onClick={handleReabrir} style={btnOutline}>
                <i className="ti ti-refresh" style={{ fontSize: '13px', marginRight: '4px' }} aria-hidden="true" />
                Reabrir
              </button>
            )}
          </div>

          {/* Direita: ações principais */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* WhatsApp — apenas se tem telefone */}
            {isVisualizar && titulo?.cliente_fone && (
              <button onClick={handleWhatsApp} style={{ ...btnPrimary, background: '#25D366' }}>
                <i className="ti ti-brand-whatsapp" style={{ fontSize: '13px', marginRight: '4px' }} aria-hidden="true" />
                WhatsApp
              </button>
            )}

            {/* 2ª Via Boleto — desabilitado sem nosso_numero */}
            {isVisualizar && (
              <button
                onClick={handleGerarBoleto}
                disabled={!temNossoNum || gerandoBoleto}
                title={!temNossoNum ? 'Nosso Número não vinculado' : '2ª Via do Boleto'}
                style={{
                  ...btnOutline,
                  opacity:  !temNossoNum ? 0.45 : gerandoBoleto ? 0.7 : 1,
                  cursor:   !temNossoNum ? 'not-allowed' : 'pointer',
                }}
              >
                <i className="ti ti-file-invoice" style={{ fontSize: '13px', marginRight: '4px' }} aria-hidden="true" />
                {gerandoBoleto ? 'Gerando...' : '2ª Via Boleto'}
              </button>
            )}

            {/* Baixar — só em_aberto no modo visualizar */}
            {isVisualizar && isEmAberto && !showBaixaForm && !showCancelForm && (
              <button onClick={() => setShowBaixaForm(true)} style={{ ...btnPrimary, background: '#28a745' }}>
                <i className="ti ti-check" style={{ fontSize: '13px', marginRight: '4px' }} aria-hidden="true" />
                Baixar
              </button>
            )}

            {/* Editar — apenas no visualizar, não para pago */}
            {isVisualizar && !isPago && !isCancelado && (
              <button
                onClick={() => {
                  if (titulo && onEditar) onEditar(titulo)
                  else onFechar()
                }}
                style={btnOutline}
              >
                <i className="ti ti-pencil" style={{ fontSize: '13px', marginRight: '4px' }} aria-hidden="true" />
                Editar
              </button>
            )}

            {/* Salvar — editar e novo */}
            {(isEditar || isNovo) && (
              <button onClick={handleSalvar} disabled={salvando} style={{ ...btnPrimary, opacity: salvando ? 0.7 : 1 }}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            )}

            {/* Fechar */}
            <button onClick={onFechar} style={btnOutline}>
              Fechar
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
