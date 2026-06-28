// ============================================================
// components/receitas/ReceitasModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Modal de criação, edição e visualização de receita
//         5 seções: Destinatário | Fatura | Duplicatas |
//                   Transportador | Observações
//         Sem alert() / confirm() — erros inline
// Conecta com: app/receitas/page.tsx
//              receitasService.ts (criarReceita, editarReceita,
//                buscarClientePorCpfCnpj, calcularPrazos,
//                calcularFormaPagamento, formatarCnpjCpf,
//                formatarMoeda, formatarDataBR)
//              transportadorasService.ts (buscarTransportadoras)
//              types/receitas.ts
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import type { Receita, Duplicata, Transportadora, ModoModal } from '@/types/receitas'
import {
  criarReceita,
  editarReceita,
  buscarClientePorCpfCnpj,
  calcularPrazos,
  calcularFormaPagamento,
  formatarCnpjCpf,
  formatarMoeda,
  formatarDataBR,
  buscarTransportadoras,
} from '@/lib/receitasService'
import { OPCOES_MODALIDADE_FRETE } from '@/types/receitas'

interface ReceitasModalProps {
  modo: ModoModal
  receita: Receita | null
  onFechar: () => void
  onSalvo: () => void
}

// Estado vazio para nova receita
const DUPLICATA_VAZIA = (): Omit<Duplicata, 'id' | 'receita_id' | 'created_at'> => ({
  numero_duplicata: '001',
  data_vencimento: '',
  valor: 0,
})

export default function ReceitasModal({ modo, receita, onFechar, onSalvo }: ReceitasModalProps) {

  const isVisualizar = modo === 'visualizar'
  const isNovo = modo === 'novo'

  // ── Campos do cabeçalho ──
  const [cpfCnpj,          setCpfCnpj]          = useState('')
  const [clienteNome,      setClienteNome]       = useState('')
  const [clienteEnd,       setClienteEnd]        = useState('')
  const [clienteMun,       setClienteMun]        = useState('')
  const [clienteUf,        setClienteUf]         = useState('')
  const [clienteIe,        setClienteIe]         = useState('')
  const [clienteFone,      setClienteFone]       = useState('')
  const [clienteEmail,     setClienteEmail]      = useState('')
  const [clienteId,        setClienteId]         = useState<number | null>(null)
  const [dataEmissao,      setDataEmissao]        = useState('')
  const [numeroNf,         setNumeroNf]           = useState('')
  const [fatValorOrig,     setFatValorOrig]       = useState('')
  const [fatValorDesc,     setFatValorDesc]       = useState('0')
  const [observacoes,      setObservacoes]        = useState('')
  const [modalidadeFrete,  setModalidadeFrete]    = useState<number>(1)
  const [transportadoraId, setTransportadoraId]   = useState<string>('')
  const [transportadoras,  setTransportadoras]    = useState<Transportadora[]>([])
  const [duplicatas,       setDuplicatas]         = useState<Omit<Duplicata, 'id' | 'receita_id' | 'created_at'>[]>([])

  const [salvando,  setSalvando]  = useState(false)
  const [erro,      setErro]      = useState<string | null>(null)
  const [buscandoCpfCnpj, setBuscandoCpfCnpj] = useState(false)

  // Carrega transportadoras e preenche campos se editar/visualizar
  useEffect(() => {
    buscarTransportadoras().then(setTransportadoras)
  }, [])

  useEffect(() => {
    if (!receita || isNovo) return
    setCpfCnpj(receita.cliente_cpf_cnpj ? formatarCnpjCpf(receita.cliente_cpf_cnpj) : '')
    setClienteNome(receita.cliente_nome ?? '')
    setClienteEnd([receita.cliente_logradouro, receita.cliente_numero, receita.cliente_bairro].filter(Boolean).join(', '))
    setClienteMun(receita.cliente_municipio ?? '')
    setClienteUf(receita.cliente_uf ?? '')
    setClienteIe(receita.cliente_ie ?? '')
    setClienteFone(receita.cliente_fone ?? '')
    setClienteEmail(receita.cliente_email ?? '')
    setClienteId(receita.cliente_id ?? null)
    setDataEmissao(receita.data_emissao ? receita.data_emissao.slice(0, 10) : '')
    setNumeroNf(String(receita.numero_nf))
    setFatValorOrig(String(receita.fatura_valor_original ?? receita.valor_nf))
    setFatValorDesc(String(receita.fatura_valor_desconto ?? 0))
    setObservacoes(receita.observacoes ?? '')
    setModalidadeFrete(receita.modalidade_frete ?? 1)
    setTransportadoraId(receita.transportadora_id ?? '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDuplicatas((receita.duplicatas ?? []).map((d: any) => ({
      numero_duplicata: d.numero_duplicata,
      data_vencimento: d.data_vencimento,
      valor: d.valor,
    })))
  }, [receita, isNovo])

  // Autocomplete CNPJ/CPF
  async function handleCpfCnpjBlur() {
    const digits = cpfCnpj.replace(/[^0-9]/g, '')
    if (digits.length !== 11 && digits.length !== 14) return
    if (!isNovo) return
    setBuscandoCpfCnpj(true)
    try {
      const cliente = await buscarClientePorCpfCnpj(digits)
      if (cliente) {
        setClienteId(cliente.id)
        setClienteNome(cliente.razao ?? '')
        setClienteEnd([cliente.end, cliente.num, cliente.bairro].filter(Boolean).join(', '))
        setClienteMun(cliente.cidade ?? '')
        setClienteUf(cliente.uf ?? '')
        setClienteIe(cliente.ie ?? '')
        setClienteFone(cliente.fone1 ?? '')
        setClienteEmail(cliente.email ?? '')
      }
    } finally {
      setBuscandoCpfCnpj(false)
    }
  }

  // Valor líquido calculado
  const valorLiquido = (parseFloat(fatValorOrig || '0') - parseFloat(fatValorDesc || '0')).toFixed(2)

  // Prazos e forma de pagamento calculados
  const prazos    = duplicatas.length > 0 ? calcularPrazos(dataEmissao, duplicatas.map((d: typeof duplicatas[number]) => ({ ...d, id: '', receita_id: '', created_at: '' }))) : '0'
  const formaPgto = calcularFormaPagamento(duplicatas.map((d: typeof duplicatas[number]) => ({ ...d, id: '', receita_id: '', created_at: '' })))

  function adicionarDuplicata() {
    const num = String(duplicatas.length + 1).padStart(3, '0')
    setDuplicatas((prev: typeof duplicatas) => [...prev, { ...DUPLICATA_VAZIA(), numero_duplicata: num }])
  }

  function removerDuplicata(i: number) {
    setDuplicatas((prev: typeof duplicatas) => prev.filter((_: typeof duplicatas[0], idx: number) => idx !== i))
  }

  function atualizarDuplicata(i: number, campo: string, valor: string) {
    setDuplicatas((prev: typeof duplicatas) => prev.map((d: typeof duplicatas[0], idx: number) => idx === i ? { ...d, [campo]: campo === 'valor' ? parseFloat(valor) || 0 : valor } : d))
  }

  async function handleSalvar() {
    setErro(null)
    const digits = cpfCnpj.replace(/[^0-9]/g, '')

    if (!clienteNome) { setErro('Nome / Razão Social é obrigatório.'); return }
    if (!dataEmissao) { setErro('Data de Emissão é obrigatória.'); return }
    if (!numeroNf)    { setErro('Número da NF é obrigatório.'); return }

    setSalvando(true)
    try {
      const dadosReceita = {
        numero_nf:             parseInt(numeroNf, 10),
        serie:                 receita?.serie ?? 1,
        // Para receitas manuais (modo novo), gera chave temporária única
        // Formato: 'MANUAL-' + timestamp + random para evitar conflito de UNIQUE constraint
        chave_acesso:          receita?.chave_acesso ?? `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        protocolo:             receita?.protocolo,
        data_emissao:          dataEmissao,
        data_autorizacao:      receita?.data_autorizacao,
        natureza_operacao:     receita?.natureza_operacao ?? 'VENDA',
        status_nf:             receita?.status_nf ?? 100,
        cliente_id:            clienteId,
        cliente_cpf_cnpj:      digits || undefined,
        cliente_nome:          clienteNome,
        cliente_ie:            clienteIe || undefined,
        cliente_fone:          clienteFone || undefined,
        cliente_email:         clienteEmail || undefined,
        cliente_municipio:     clienteMun || undefined,
        cliente_uf:            clienteUf || undefined,
        valor_produtos:        receita?.valor_produtos ?? parseFloat(fatValorOrig || '0'),
        valor_frete:           receita?.valor_frete ?? 0,
        valor_seguro:          receita?.valor_seguro ?? 0,
        valor_desconto:        receita?.valor_desconto ?? 0,
        valor_outras:          receita?.valor_outras ?? 0,
        valor_ipi:             receita?.valor_ipi ?? 0,
        valor_nf:              parseFloat(valorLiquido),
        transportadora_id:     transportadoraId || null,
        modalidade_frete:      modalidadeFrete,
        fatura_numero:         numeroNf,
        fatura_valor_original: parseFloat(fatValorOrig || '0'),
        fatura_valor_desconto: parseFloat(fatValorDesc || '0'),
        xml_storage_path:      receita?.xml_storage_path,
        observacoes:           observacoes || undefined,
      }

      const itens = receita?.itens?.map(item => ({
        codigo_produto: item.codigo_produto,
        descricao:      item.descricao,
        unidade:        item.unidade,
        quantidade:     item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total:    item.valor_total,
        valor_desconto: item.valor_desconto,
        valor_frete:    item.valor_frete,
        cfop:           item.cfop,
      })) ?? []

      if (modo === 'novo') {
        await criarReceita(dadosReceita, itens, duplicatas)
      } else if (modo === 'editar' && receita) {
        await editarReceita({ ...dadosReceita, id: receita.id }, itens, duplicatas)
      }
      onSalvo()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  // ── DANFE ──
  async function handleDanfe() {
    if (!receita?.chave_acesso) return
    try {
      const res = await fetch('/api/danfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave_acesso: receita.chave_acesso }),
      })
      if (!res.ok) { const j = await res.json(); setErro(j.erro ?? 'Erro ao gerar DANFE'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar DANFE')
    }
  }

  // ── Estilos ──
  const secaoStyle: React.CSSProperties = {
    marginBottom: '16px', border: '1px solid #dde8f0', borderRadius: '6px', overflow: 'hidden',
  }
  const secaoTituloStyle: React.CSSProperties = {
    padding: '6px 12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.05em', color: '#1a6094', background: '#e8f0f7', borderBottom: '1px solid #dde8f0',
  }
  const secaoCorpoStyle: React.CSSProperties = { padding: '12px' }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#888', marginBottom: '3px', display: 'block',
  }
  const inputStyle = (disabled?: boolean): React.CSSProperties => ({
    width: '100%', height: '28px', padding: '0 8px', fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif', color: '#333',
    background: disabled ? '#f7fafc' : '#fff',
    border: '1px solid #dde8f0', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' as const,
  })
  const rowStyle: React.CSSProperties = { display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' as const }
  const colStyle = (flex?: number): React.CSSProperties => ({ flex: flex ?? 1, minWidth: '120px' })

  if (!modo) return null

  return (
    <>
      {/* Overlay */}
      <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(760px, 95vw)', maxHeight: '90vh', overflowY: 'auto',
        background: '#ffffff', borderRadius: '8px', zIndex: 401,
        fontFamily: 'Tahoma, Geneva, sans-serif',
        border: '1px solid #c4d8eb',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #dde8f0' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a6094' }}>
            {modo === 'novo' ? 'Nova Receita' : modo === 'editar' ? 'Editar Receita' : 'Visualizar Receita'}
          </span>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a84a6', fontSize: '18px' }}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: '16px' }}>

          {/* SEÇÃO 1 — DESTINATÁRIO */}
          <div style={secaoStyle}>
            <div style={secaoTituloStyle}>1. Destinatário</div>
            <div style={secaoCorpoStyle}>
              <div style={rowStyle}>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>CNPJ / CPF</label>
                  <input
                    value={cpfCnpj}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCpfCnpj(e.target.value)}
                    onBlur={handleCpfCnpjBlur}
                    disabled={isVisualizar || buscandoCpfCnpj}
                    placeholder="Digite o CNPJ ou CPF..."
                    style={{ ...inputStyle(isVisualizar), borderColor: '#1a6094' }}
                  />
                  {buscandoCpfCnpj && <span style={{ fontSize: '10px', color: '#5a84a6' }}>Buscando...</span>}
                </div>
                <div style={colStyle(2)}>
                  <label style={labelStyle}>Nome / Razão Social</label>
                  <input value={clienteNome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteNome(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
              </div>
              <div style={rowStyle}>
                <div style={colStyle(3)}>
                  <label style={labelStyle}>Endereço</label>
                  <input value={clienteEnd} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteEnd(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(2)}>
                  <label style={labelStyle}>Município</label>
                  <input value={clienteMun} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteMun(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(0.5)}>
                  <label style={labelStyle}>UF</label>
                  <input value={clienteUf} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteUf(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} maxLength={2} />
                </div>
              </div>
              <div style={rowStyle}>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Insc. Estadual</label>
                  <input value={clienteIe} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteIe(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Telefone</label>
                  <input value={clienteFone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteFone(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(2)}>
                  <label style={labelStyle}>E-mail</label>
                  <input value={clienteEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClienteEmail(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Data Emissão</label>
                  <input type="date" value={dataEmissao} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDataEmissao(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2 — FATURA */}
          <div style={secaoStyle}>
            <div style={secaoTituloStyle}>2. Fatura</div>
            <div style={secaoCorpoStyle}>
              <div style={rowStyle}>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Nº NF-e</label>
                  <input value={numeroNf} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumeroNf(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Valor Original</label>
                  <input type="number" value={fatValorOrig} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFatValorOrig(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Desconto</label>
                  <input type="number" value={fatValorDesc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFatValorDesc(e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                </div>
                <div style={colStyle(1)}>
                  <label style={labelStyle}>Valor Líquido</label>
                  <input value={formatarMoeda(parseFloat(valorLiquido))} disabled style={{ ...inputStyle(true), background: '#eaf3de', fontWeight: 700, color: '#3b6d11' }} />
                </div>
              </div>
              {/* Info derivada */}
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#5a84a6' }}>
                <span>Prazos: <strong>{prazos}</strong></span>
                <span>Forma Pgto: <strong>{formaPgto}</strong></span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3 — DUPLICATAS */}
          <div style={secaoStyle}>
            <div style={secaoTituloStyle}>3. Duplicatas</div>
            <div style={secaoCorpoStyle}>
              {duplicatas.length === 0 && (
                <div style={{ fontSize: '11px', color: '#5a84a6', marginBottom: '8px' }}>
                  Sem duplicatas — pagamento à vista.
                </div>
              )}
              {duplicatas.map((d: { numero_duplicata: string; data_vencimento: string; valor: number }, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ width: '24px', height: '24px', background: '#1a6094', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Vencimento</label>
                    <input type="date" value={d.data_vencimento} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarDuplicata(i, 'data_vencimento', e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Valor</label>
                    <input type="number" value={d.valor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => atualizarDuplicata(i, 'valor', e.target.value)} disabled={isVisualizar} style={inputStyle(isVisualizar)} />
                  </div>
                  {!isVisualizar && (
                    <button onClick={() => removerDuplicata(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px', marginTop: '14px' }}>
                      <i className="ti ti-minus" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {!isVisualizar && (
                <button
                  onClick={adicionarDuplicata}
                  style={{ width: '100%', padding: '7px', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif', fontWeight: 600, color: '#1a6094', background: 'transparent', border: '1px dashed #1a6094', borderRadius: '5px', cursor: 'pointer', marginTop: '4px' }}
                >
                  <i className="ti ti-plus" style={{ marginRight: '5px' }} />
                  Adicionar duplicata
                </button>
              )}
            </div>
          </div>

          {/* SEÇÃO 4 — TRANSPORTADOR */}
          <div style={secaoStyle}>
            <div style={secaoTituloStyle}>4. Transportador / Volumes</div>
            <div style={secaoCorpoStyle}>
              <div style={rowStyle}>
                <div style={colStyle(2)}>
                  <label style={labelStyle}>Transportadora</label>
                  <select
                    value={transportadoraId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTransportadoraId(e.target.value)}
                    disabled={isVisualizar || modalidadeFrete === 9}
                    style={{ ...inputStyle(isVisualizar || modalidadeFrete === 9), cursor: 'pointer' }}
                  >
                    <option value="">— Selecione —</option>
                    {transportadoras.map((t: Transportadora) => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </div>
                <div style={colStyle(2)}>
                  <label style={labelStyle}>Frete por Conta</label>
                  <select
                    value={modalidadeFrete}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { const v = parseInt(e.target.value, 10); setModalidadeFrete(v); if (v === 9) setTransportadoraId('') }}
                    disabled={isVisualizar}
                    style={{ ...inputStyle(isVisualizar), cursor: 'pointer' }}
                  >
                    {OPCOES_MODALIDADE_FRETE.map((o: { value: number; label: string }) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Volumes — readonly, vindos do XML */}
              {receita && (receita.volume_qtd || receita.peso_liquido) && (
                <div style={rowStyle}>
                  <div style={colStyle(1)}>
                    <label style={labelStyle}>Volume(s)</label>
                    <input value={receita.volume_qtd ?? ''} disabled style={inputStyle(true)} />
                  </div>
                  <div style={colStyle(1)}>
                    <label style={labelStyle}>Marca</label>
                    <input value={receita.volume_marca ?? ''} disabled style={inputStyle(true)} />
                  </div>
                  <div style={colStyle(1)}>
                    <label style={labelStyle}>Peso Líq. (kg)</label>
                    <input value={receita.peso_liquido ?? ''} disabled style={inputStyle(true)} />
                  </div>
                  <div style={colStyle(1)}>
                    <label style={labelStyle}>Peso Bruto (kg)</label>
                    <input value={receita.peso_bruto ?? ''} disabled style={inputStyle(true)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SEÇÃO 5 — OBSERVAÇÕES */}
          <div style={secaoStyle}>
            <div style={secaoTituloStyle}>5. Observações</div>
            <div style={secaoCorpoStyle}>
              <textarea
                value={observacoes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(e.target.value)}
                disabled={isVisualizar}
                rows={3}
                style={{
                  width: '100%', padding: '8px', fontSize: '12px',
                  fontFamily: 'Tahoma, Geneva, sans-serif', color: '#333',
                  background: isVisualizar ? '#f7fafc' : '#fff',
                  border: '1px solid #dde8f0', borderRadius: '4px',
                  outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Itens (visualizar apenas) */}
          {isVisualizar && receita?.itens && receita.itens.length > 0 && (
            <div style={secaoStyle}>
              <div style={secaoTituloStyle}>Itens da NF-e</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f0f4f7' }}>
                      {['Código', 'Descrição', 'UN', 'Qtd', 'V. Unit.', 'V. Total', 'CFOP'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#5a84a6', textTransform: 'uppercase' as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(receita.itens ?? []).map((item, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f4f7' }}>
                        <td style={{ padding: '5px 8px', color: '#5a84a6' }}>{item.codigo_produto ?? '—'}</td>
                        <td style={{ padding: '5px 8px', color: '#2c4a60' }}>{item.descricao}</td>
                        <td style={{ padding: '5px 8px', color: '#5a84a6' }}>{item.unidade ?? '—'}</td>
                        <td style={{ padding: '5px 8px', color: '#2c4a60' }}>{item.quantidade}</td>
                        <td style={{ padding: '5px 8px', color: '#2c4a60' }}>{formatarMoeda(item.valor_unitario)}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 700, color: '#1a6094' }}>{formatarMoeda(item.valor_total)}</td>
                        <td style={{ padding: '5px 8px', color: '#5a84a6' }}>{item.cfop ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Erro inline */}
          {erro && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '5px', color: '#a32d2d', fontSize: '12px', marginBottom: '12px' }}>
              {erro}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #dde8f0', background: '#f7fafc' }}>

          {/* DANFE (visualizar com chave_acesso) */}
          {isVisualizar && receita?.chave_acesso && (
            <button
              onClick={handleDanfe}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif', background: '#ffffff', color: '#1a6094', border: '1px solid #1a6094', borderRadius: '5px', cursor: 'pointer' }}
            >
              <i className="ti ti-printer" style={{ fontSize: '14px' }} aria-hidden="true" />
              Imprimir 2ª via DANFE
            </button>
          )}

          {!isVisualizar && <div />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onFechar}
              style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 600, fontFamily: 'Tahoma, Geneva, sans-serif', background: '#f0f4f7', color: '#555', border: '1px solid #c4d8eb', borderRadius: '5px', cursor: 'pointer' }}
            >
              {isVisualizar ? 'Fechar' : 'Cancelar'}
            </button>
            {!isVisualizar && (
              <button
                onClick={handleSalvar}
                disabled={salvando}
                style={{ padding: '6px 20px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif', background: salvando ? '#9bb8cc' : '#1a6094', color: '#ffffff', border: 'none', borderRadius: '5px', cursor: salvando ? 'wait' : 'pointer' }}
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
