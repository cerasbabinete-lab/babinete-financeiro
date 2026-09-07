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
//
// QA fix (07/09/2026, a pedido do Maycon): padronização visual 1:1 com
// DespesasModal.tsx — header/body/footer separados por borda, título do
// header em #1a6094 (era #1a1a1a), largura do modal 760px (era 520px),
// z-index 400 (era 50, agora consistente com o resto do sistema),
// inputStyle/labelStyle idênticos ao Despesas, banners de aviso no
// mesmo padrão de cor.
//
// FEATURE NOVA (mesma sessão): campo "Buscar fornecedor existente" +
// Favorecido/CNPJ passam a ser editáveis, vinculando fornecedor_id —
// resolve na tela correções que antes exigiam SQL manual (ex: título
// vinculado ao fornecedor errado por nome digitado errado no favorecido,
// caso real corrigido nesta mesma sessão via Supabase SQL Editor).
//
// PRESERVADO SEM NENHUMA ALTERAÇÃO DE LÓGICA (só reestilizado):
// baixa manual (handleConfirmarBaixa/onBaixar), geração de 2ª via de
// boleto (handleGerarBoletoAvulso), cancelamento/reabertura
// (onCancelar/onReabrir) e timeline de eventos.
//
// Conecta com: app/pagar/page.tsx, types/contasAPagar.ts (ModoModalPagar),
//              lib/contasAPagarService.ts (formatarCnpjCpf/Moeda/DataBR),
//              lib/despesasService.ts (busca de fornecedor — reaproveitada
//              porque é lógica genérica sobre a tabela `fornecedores`, já
//              testada em produção no módulo Despesas; reuso de função,
//              não duplicação de módulo/tabela — sinalizar se preferir
//              mover essa lógica para um lib compartilhado).
//
// ATENÇÃO — DEPENDÊNCIAS A CONFIRMAR ANTES DESTA FEATURE FUNCIONAR DE
// PONTA A PONTA (não verificadas nesta entrega, arquivos não fornecidos):
//   1. pages/api/pagar/atualizar.ts precisa aceitar e gravar os campos
//      favorecido_nome, favorecido_cnpj_cpf e fornecedor_id no payload
//      de edição — se a rota fizer UPDATE com lista fixa de colunas sem
//      esses 3 campos, o Salvar não vai persistir a correção.
//   2. types/contasAPagar.ts — ContaAPagar precisa expor fornecedor_id
//      (existe na tabela via SQL, mas não confirmado no type aqui).
// ============================================================

'use client'

import { useState, useEffect } from 'react'
import type { ContaAPagar, ModoModalPagar, FormaBaixaPagar } from '@/types/contasAPagar'
import { STATUS_LABELS_PAGAR } from '@/types/contasAPagar'
import { formatarCnpjCpf, formatarMoeda, formatarDataBR } from '@/lib/contasAPagarService'
// Reuso deliberado: busca de fornecedor por nome/CNPJ é lógica genérica
// sobre a tabela `fornecedores`, já auditada e em produção no módulo
// Despesas — evita reimplementar (e potencialmente errar nomes de
// coluna) uma segunda vez aqui.
import { buscarFornecedorPorDocumento, buscarFornecedoresPorNome } from '@/lib/despesasService'
import type { FornecedorSugestao } from '@/lib/despesasService'
// Client Supabase do browser — mesmo import usado em app/pagar/page.tsx
import { supabase } from '@/lib/supabase'

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
  // ── Campos já existentes — estado e comportamento preservados ──
  const [observacoes, setObservacoes] = useState('')
  // Nosso Número e Linha Digitável editáveis — complementa o fluxo de
  // "Importar Boleto" (que preenche automaticamente, mas o usuário
  // também precisa poder corrigir/preencher manualmente)
  const [nossoNumero, setNossoNumero] = useState('')
  const [linhaDigitavel, setLinhaDigitavel] = useState('')
  // Status editável manualmente no modal. 'cancelado' fica de fora do
  // dropdown de propósito: selecioná-lo aqui setaria status='cancelado'
  // sem o soft-delete (deleted_at), quebrando contadores/listagem —
  // cancelamento continua exclusivo do botão dedicado "Cancelar Título"
  const [statusEdit, setStatusEdit] = useState<ContaAPagar['status']>('em_aberto')
  // Valor editável manualmente — caso real confirmado: título criado
  // automaticamente a partir de uma Despesa pode nascer com valor errado
  const [valorEdit, setValorEdit] = useState<number>(0)
  const [mostrarBaixa, setMostrarBaixa] = useState(false)
  const [formaBaixa, setFormaBaixa] = useState<FormaBaixaPagar>('pix')
  const [valorBaixa, setValorBaixa] = useState<number>(0)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [gerandoBoleto, setGerandoBoleto] = useState(false)

  // ── FEATURE NOVA: Favorecido/CNPJ editáveis + vínculo a fornecedor
  // cadastrado — antes eram campos só de exibição (texto fixo) ──
  const [favorecidoNome, setFavorecidoNome] = useState('')
  const [favorecidoCnpjCpf, setFavorecidoCnpjCpf] = useState('')
  const [fornecedorId, setFornecedorId] = useState<number | null>(null)
  const [buscandoFornecedor, setBuscandoFornecedor] = useState(false)
  const [fornecedorNaoEncontrado, setFornecedorNaoEncontrado] = useState(false)
  const [termoBuscaFornecedor, setTermoBuscaFornecedor] = useState('')
  const [sugestoesFornecedor, setSugestoesFornecedor] = useState<FornecedorSugestao[]>([])
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  // Sincroniza todo o estado local do formulário sempre que o modal
  // abre com um título diferente (ou fecha/abre de novo)
  useEffect(() => {
    setObservacoes(titulo?.observacoes ?? '')
    setNossoNumero(titulo?.nosso_numero ?? '')
    setLinhaDigitavel(titulo?.linha_digitavel ?? '')
    setStatusEdit(titulo?.status ?? 'em_aberto')
    setValorEdit(titulo?.valor ?? 0)
    setMostrarBaixa(!!abrirEmBaixa)
    setValorBaixa(titulo ? titulo.valor : 0)
    // FEATURE NOVA: sincroniza favorecido/fornecedor junto com o resto
    setFavorecidoNome(titulo?.favorecido_nome ?? '')
    setFavorecidoCnpjCpf(titulo?.favorecido_cnpj_cpf ?? '')
    setFornecedorId(titulo?.fornecedor_id ?? null)
    setFornecedorNaoEncontrado(false)
    setTermoBuscaFornecedor('')
    setSugestoesFornecedor([])
    setErro(null)
  }, [titulo, abrirEmBaixa])

  // FEATURE NOVA: busca com debounce de 350ms conforme o usuário digita
  // no campo "Buscar fornecedor existente" — mesmo padrão de
  // DespesasModal.tsx, reaproveitando buscarFornecedoresPorNome (nenhum
  // setState roda de forma síncrona no corpo do efeito, só dentro do
  // callback do timer)
  useEffect(() => {
    const termo = termoBuscaFornecedor.trim()
    const timer = setTimeout(async () => {
      if (termo.length < 2) {
        setSugestoesFornecedor([])
        return
      }
      setBuscandoSugestoes(true)
      const resultado = await buscarFornecedoresPorNome(termoBuscaFornecedor)
      setSugestoesFornecedor(resultado)
      setBuscandoSugestoes(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [termoBuscaFornecedor])

  if (!titulo || !modo) return null

  const somenteLeitura = modo === 'visualizar'
  const cancelado = titulo.deleted_at !== null && titulo.deleted_at !== undefined

  // FEATURE NOVA: busca automática do fornecedor ao sair do campo
  // CNPJ/CPF (mesmo mecanismo de DespesasModal.tsx) — permite corrigir
  // o vínculo só digitando o CNPJ certo e saindo do campo, sem precisar
  // abrir a lista de sugestões. Não sobrescreve favorecidoNome de
  // propósito: o usuário pode estar só corrigindo o CNPJ mantendo um
  // nome que já digitou/corrigiu à parte.
  async function handleBuscarFornecedorPorCnpj() {
    if (!favorecidoCnpjCpf.trim()) return
    setBuscandoFornecedor(true)
    setFornecedorNaoEncontrado(false)
    try {
      const encontrado = await buscarFornecedorPorDocumento(favorecidoCnpjCpf)
      if (encontrado) {
        setFornecedorId(encontrado.id)
        setFornecedorNaoEncontrado(false)
      } else {
        setFornecedorId(null)
        setFornecedorNaoEncontrado(true)
      }
    } finally {
      setBuscandoFornecedor(false)
    }
  }

  // FEATURE NOVA: seleção de fornecedor pela lista de sugestões —
  // substitui favorecido_nome/cnpj_cpf pelos dados oficiais do cadastro
  // e vincula fornecedor_id (equivalente ao handleSelecionarFornecedor
  // de DespesasModal.tsx)
  function handleSelecionarFornecedor(f: FornecedorSugestao) {
    setFornecedorId(f.id)
    setFavorecidoNome(f.razao)
    setFavorecidoCnpjCpf(f.cnpj ?? f.cpf ?? '')
    setFornecedorNaoEncontrado(false)
    setTermoBuscaFornecedor('')
    setSugestoesFornecedor([])
    setMostrarSugestoes(false)
  }

  async function handleSalvar() {
    if (!favorecidoNome.trim()) { setErro('Informe o nome do favorecido.'); return }
    if (valorEdit <= 0) { setErro('Informe um valor maior que zero.'); return }
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar({
        ...titulo!,
        observacoes,
        nosso_numero: nossoNumero.trim() || null,
        linha_digitavel: linhaDigitavel.trim() || null,
        status: statusEdit,
        valor: valorEdit,
        // FEATURE NOVA: favorecido/CNPJ/fornecedor agora fazem parte do
        // payload salvo — ver aviso de dependência no cabeçalho do arquivo
        favorecido_nome: favorecidoNome.trim(),
        favorecido_cnpj_cpf: favorecidoCnpjCpf.trim() || null,
        fornecedor_id: fornecedorId,
      })
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

  async function handleGerarBoletoAvulso() {
    if (!titulo) return
    setGerandoBoleto(true)
    setErro(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada — faça login novamente.')

      const resp = await fetch(`/api/pagar/gerar-boleto-avulso?id=${titulo.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!resp.ok) {
        const corpo = await resp.json().catch(() => ({}))
        throw new Error(corpo.erro ?? 'Erro ao gerar boleto')
      }

      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar 2ª via')
    } finally {
      setGerandoBoleto(false)
    }
  }

  // ── Estilos — padronizados 1:1 com DespesasModal.tsx ──
  const inputStyle: React.CSSProperties = {
    width: '100%', height: '32px', padding: '0 8px', fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif', color: '#2c4a60',
    background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '4px', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#5a84a6', marginBottom: '3px', display: 'block',
  }
  // Estilo de exibição somente-leitura — usado nos campos sempre fixos
  // (Nº Documento, Vencimento, Data Baixa) e nos campos editáveis
  // quando modo === 'visualizar'
  const displayStyle: React.CSSProperties = { fontSize: '13px', color: '#1a1a1a', marginTop: '6px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onFechar}>
      <div
        style={{ background: '#ffffff', borderRadius: '10px', width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Tahoma, Geneva, sans-serif' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho — padrão DespesasModal.tsx */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8f0f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a6094' }}>
            {somenteLeitura ? 'Visualizar Título' : 'Editar Título'}
          </span>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#5a84a6' }}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: '20px' }}>

          {somenteLeitura && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f0f4f7', border: '1px solid #d8e3ec', borderRadius: '6px', fontSize: '12px', color: '#3a6080' }}>
              <i className="ti ti-eye" aria-hidden="true" style={{ marginRight: '6px' }} />
              Modo somente leitura. Para editar, feche esta janela e use o botão de edição.
            </div>
          )}

          {/* FEATURE NOVA: aviso de título sem fornecedor vinculado —
              mesmo padrão visual do aviso de "fornecedor auto-criado"
              do Despesas */}
          {!fornecedorId && favorecidoNome && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
              <strong>Título sem fornecedor vinculado.</strong> Busque abaixo pelo nome ou CNPJ/CPF para vincular a um cadastro existente.
            </div>
          )}

          {/* FEATURE NOVA: busca de fornecedor — só faz sentido em modo edição */}
          {!somenteLeitura && (
            <div style={{ marginBottom: '10px', position: 'relative' }}>
              <label style={labelStyle}>Buscar fornecedor existente</label>
              <input
                style={inputStyle}
                value={termoBuscaFornecedor}
                onChange={(e) => { setTermoBuscaFornecedor(e.target.value); setMostrarSugestoes(true) }}
                onFocus={() => setMostrarSugestoes(true)}
                onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)} // atraso para o onClick da sugestão registrar antes de fechar
                placeholder="Digite o nome ou CNPJ/CPF para buscar..."
              />
              {buscandoSugestoes && <span style={{ fontSize: '10px', color: '#5a84a6' }}>Buscando...</span>}
              {mostrarSugestoes && sugestoesFornecedor.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '6px',
                  marginTop: '2px', maxHeight: '180px', overflowY: 'auto',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                }}>
                  {sugestoesFornecedor.map((f) => (
                    <div
                      key={f.id}
                      onMouseDown={() => handleSelecionarFornecedor(f)} // onMouseDown dispara antes do onBlur do input
                      style={{ padding: '7px 10px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #f0f4f7' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f7ff' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontWeight: 700, color: '#1a6094' }}>{f.fantasia || f.razao}</div>
                      <div style={{ color: '#5a84a6' }}>{f.razao} — {formatarCnpjCpf(f.cnpj ?? f.cpf ?? '')}</div>
                    </div>
                  ))}
                </div>
              )}
              {mostrarSugestoes && !buscandoSugestoes && termoBuscaFornecedor.trim().length >= 2 && sugestoesFornecedor.length === 0 && (
                <span style={{ fontSize: '10px', color: '#5a84a6' }}>Nenhum fornecedor encontrado.</span>
              )}
            </div>
          )}

          {/* Favorecido / CNPJ — FEATURE NOVA: agora editáveis (antes
              eram texto fixo, sem forma de corrigir sem SQL manual) */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={labelStyle}>Favorecido</label>
              {somenteLeitura ? (
                <div style={displayStyle}>{titulo.favorecido_nome}</div>
              ) : (
                <input style={inputStyle} value={favorecidoNome} onChange={(e) => setFavorecidoNome(e.target.value)} />
              )}
            </div>
            <div>
              <label style={labelStyle}>CNPJ / CPF</label>
              {somenteLeitura ? (
                <div style={displayStyle}>{formatarCnpjCpf(titulo.favorecido_cnpj_cpf)}</div>
              ) : (
                <>
                  <input
                    style={inputStyle}
                    value={favorecidoCnpjCpf}
                    onChange={(e) => setFavorecidoCnpjCpf(e.target.value)}
                    onBlur={handleBuscarFornecedorPorCnpj}
                  />
                  {buscandoFornecedor && <span style={{ fontSize: '10px', color: '#5a84a6' }}>Buscando...</span>}
                  {fornecedorNaoEncontrado && <span style={{ fontSize: '10px', color: '#a32d2d' }}>Fornecedor não encontrado — busque acima ou cadastre em Fornecedores.</span>}
                </>
              )}
            </div>
          </div>

          {/* Nº Documento / Vencimento / Nosso Número / Linha Digitável —
              lógica inalterada, só reestilizados no padrão Despesas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={labelStyle}>Nº Documento</label>
              <div style={displayStyle}>{titulo.numero_documento ?? '—'}</div>
            </div>
            <div>
              <label style={labelStyle}>Vencimento</label>
              <div style={displayStyle}>{formatarDataBR(titulo.data_vencimento)}</div>
            </div>
            <div>
              <label style={labelStyle}>Nosso Número</label>
              {somenteLeitura ? (
                <div style={{ ...displayStyle, fontFamily: 'Courier New, monospace' }}>{titulo.nosso_numero ?? '—'}</div>
              ) : (
                <input
                  value={nossoNumero}
                  onChange={(e) => setNossoNumero(e.target.value)}
                  placeholder="—"
                  style={{ ...inputStyle, fontFamily: 'Courier New, monospace' }}
                />
              )}
            </div>
            <div>
              <label style={labelStyle}>Linha Digitável</label>
              {somenteLeitura ? (
                <div style={{ ...displayStyle, fontFamily: 'Courier New, monospace' }}>{titulo.linha_digitavel ?? '—'}</div>
              ) : (
                <input
                  value={linhaDigitavel}
                  onChange={(e) => setLinhaDigitavel(e.target.value)}
                  placeholder="—"
                  style={{ ...inputStyle, fontFamily: 'Courier New, monospace' }}
                />
              )}
            </div>
          </div>

          {/* Valor / Status / Data Baixa — lógica inalterada, só
              reestilizados no padrão Despesas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Valor</label>
              {somenteLeitura ? (
                <div style={{ ...displayStyle, fontWeight: 700, color: '#1a6094' }}>{formatarMoeda(titulo.valor)}</div>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorEdit}
                  onChange={(e) => setValorEdit(parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, fontWeight: 700, color: '#1a6094' }}
                />
              )}
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              {somenteLeitura ? (
                <div style={displayStyle}>{STATUS_LABELS_PAGAR[titulo.status]}</div>
              ) : (
                <select
                  value={statusEdit}
                  onChange={(e) => setStatusEdit(e.target.value as ContaAPagar['status'])}
                  style={{ ...inputStyle, fontWeight: 700, color: '#1a6094', cursor: 'pointer' }}
                >
                  {(Object.keys(STATUS_LABELS_PAGAR) as ContaAPagar['status'][])
                    .filter((s) => s !== 'cancelado')
                    .map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS_PAGAR[s]}</option>
                    ))}
                </select>
              )}
            </div>
            <div>
              <label style={labelStyle}>Data Baixa</label>
              <div style={displayStyle}>{titulo.data_baixa ? formatarDataBR(titulo.data_baixa) : '—'}</div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} disabled={somenteLeitura} rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px', resize: 'vertical' }} />
          </div>

          {/* ── Seção de baixa manual — PRESERVADA: handler
              (handleConfirmarBaixa/onBaixar) e condição de exibição
              intactos, só reestilizada no padrão Despesas ── */}
          {!somenteLeitura && !cancelado && titulo.status !== 'pago' && (
            <div style={{ marginBottom: '14px', border: '1px solid #dde8f0', borderRadius: '8px', padding: '12px' }}>
              <button onClick={() => setMostrarBaixa((v) => !v)} style={{ border: 'none', background: 'transparent', color: '#166534', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ti ti-cash" aria-hidden="true" /> Registrar baixa manual {mostrarBaixa ? '▲' : '▼'}
              </button>
              {mostrarBaixa && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 140px' }}>
                    <label style={labelStyle}>Forma</label>
                    <select value={formaBaixa} onChange={(e) => setFormaBaixa(e.target.value as FormaBaixaPagar)} style={inputStyle}>
                      <option value="pix">PIX</option>
                      <option value="transferencia">Transferência</option>
                      <option value="boleto_manual">Boleto (manual)</option>
                      <option value="manual">Manual (rápida)</option>
                    </select>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label style={labelStyle}>Valor</label>
                    <input type="number" step="0.01" value={valorBaixa} onChange={(e) => setValorBaixa(parseFloat(e.target.value) || 0)} style={inputStyle} />
                  </div>
                  <button disabled={salvando} onClick={handleConfirmarBaixa} style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: '5px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
                    Confirmar Baixa
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Timeline de eventos — PRESERVADA sem alteração de dado
              exibido, só reestilizada ── */}
          {titulo.eventos && titulo.eventos.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>Histórico</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {titulo.eventos.map((ev) => (
                  <div key={ev.id} style={{ fontSize: '11px', color: '#5a6b7a', borderLeft: '2px solid #dde8f0', paddingLeft: '8px' }}>
                    <span style={{ fontWeight: 700, color: '#1a6094' }}>{ev.tipo}</span> — {ev.descricao}
                  </div>
                ))}
              </div>
            </div>
          )}

          {erro && (
            <div style={{ marginBottom: '4px', padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', color: '#a32d2d' }}>
              {erro}
            </div>
          )}
        </div>

        {/* Rodapé — padrão DespesasModal.tsx */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e8f0f7', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {/* Botão "Gerar 2ª Via" — PRESERVADO: handler
              (handleGerarBoletoAvulso) e condição de habilitação
              (precisa de linha_digitavel + nosso_numero) intactos, só
              migrado pro padrão visual do botão "2ª via de DANFE" do
              Despesas (marginRight: auto empurra pro canto esquerdo) */}
          <button
            onClick={handleGerarBoletoAvulso}
            disabled={gerandoBoleto || !titulo.linha_digitavel || !titulo.nosso_numero}
            title={!titulo.linha_digitavel || !titulo.nosso_numero ? 'Título sem Linha Digitável e/ou Nosso Número cadastrados' : 'Gerar 2ª via do boleto'}
            style={{
              marginRight: 'auto',
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '7px 14px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#ffffff',
              color: (!titulo.linha_digitavel || !titulo.nosso_numero) ? '#a9b7c2' : '#1a6094',
              border: `1px solid ${(!titulo.linha_digitavel || !titulo.nosso_numero) ? '#dde8f0' : '#c4d8eb'}`,
              borderRadius: '5px',
              cursor: (gerandoBoleto || !titulo.linha_digitavel || !titulo.nosso_numero) ? 'not-allowed' : 'pointer',
              opacity: gerandoBoleto ? 0.7 : 1,
            }}
          >
            <i className="ti ti-barcode" aria-hidden="true" />
            {gerandoBoleto ? 'Gerando...' : 'Gerar 2ª Via'}
          </button>

          {/* Reabrir/Cancelar Título — PRESERVADOS: handlers
              (onReabrir/onCancelar) e condições intactos, só
              reestilizados */}
          {cancelado && (
            <button onClick={() => onReabrir(titulo.id)} style={{ padding: '7px 16px', fontSize: '12px', fontWeight: 600, background: '#ffffff', color: '#1a6094', border: '1px solid #c4d8eb', borderRadius: '5px', cursor: 'pointer' }}>
              Reabrir
            </button>
          )}
          {!cancelado && !somenteLeitura && (
            <button onClick={() => onCancelar(titulo.id)} style={{ padding: '7px 16px', fontSize: '12px', fontWeight: 600, background: '#ffffff', color: '#d32f2f', border: '1px solid #f3c9c9', borderRadius: '5px', cursor: 'pointer' }}>
              Cancelar Título
            </button>
          )}
          <button onClick={onFechar} style={{ padding: '7px 16px', fontSize: '12px', fontWeight: 600, background: '#f0f4f7', color: '#3a6080', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button
              disabled={salvando}
              onClick={handleSalvar}
              style={{
                padding: '7px 18px', fontSize: '12px', fontWeight: 700,
                background: '#1a6094', color: '#ffffff', border: 'none', borderRadius: '5px',
                cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
