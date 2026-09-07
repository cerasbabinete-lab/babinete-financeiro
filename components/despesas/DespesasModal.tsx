// ============================================================
// components/despesas/DespesasModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Modal unificado para os 3 fluxos de lançamento/edição:
//   1. 'revisar' — após import XML ou IA, exibe o resultado do
//      pipeline (fornecedor, classificação, duplicidade) para revisão
//      antes de "Confirmar e Gravar" (POST /api/despesas/confirmar)
//   2. 'novo' — lançamento manual, sem documento de origem
//      (POST /api/despesas/confirmar, fornecedor buscado por CNPJ/CPF,
//      nunca criado automaticamente neste fluxo)
//   3. 'editar' — edição de despesa existente, com sync obrigatório
//      de parcelas na mesma operação (PUT /api/despesas/atualizar)
// Conecta com: app/despesas/page.tsx, lib/despesasService.ts,
//              lib/supabase.ts, types/despesas.ts
// Sem alert() / confirm() — erros e confirmações via UI inline
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Despesa,
  DespesaInsert,
  DespesaParcelaInsert,
  ModoModalDespesa,
  ResultadoProcessamentoDespesa,
  CategoriaFinanceira,
  OrigemDespesaTipo,
} from '@/types/despesas'
import { CATEGORIA_FINANCEIRA_LABELS, ORIGEM_TIPO_LABELS, STATUS_PAGAMENTO_LABELS } from '@/types/despesas'
import { buscarFornecedorPorDocumento, buscarFornecedoresPorNome, formatarCnpjCpf, formatarMoeda } from '@/lib/despesasService'
import type { FornecedorSugestao } from '@/lib/despesasService'

// ------------------------------------------------------------
// TIPO: linha de parcela editável no formulário — pode ter id
// (parcela já existente, em modo 'editar') ou não (nova/manual)
// ------------------------------------------------------------
type ParcelaForm = Omit<DespesaParcelaInsert, 'despesa_id'> & { id?: string }

function parcelaVazia(numero: number): ParcelaForm {
  return {
    numero_parcela: numero,
    total_parcelas: numero,
    valor: 0,
    data_vencimento: '',
    linha_digitavel: null,
    codigo_barras: null,
    nosso_numero: null,
    pode_gerar_segunda_via: false,
    status: 'em_aberto',
    deleted_at: null,
  }
}

interface DespesasModalProps {
  modo: ModoModalDespesa
  despesa: Despesa | null                              // usado em modo 'editar'
  resultadoImportacao: ResultadoProcessamentoDespesa | null // usado em modo 'revisar'
  onFechar: () => void
  onSalvo: () => void
  // FEATURE: botão "Visualizar" inline (pedido do usuário após a entrega
  // de QA) — reaproveita o modo 'editar' (já carrega a despesa + parcelas
  // existentes com todos os campos), mas com somenteLeitura=true: os
  // campos ficam desabilitados via <fieldset disabled> (desabilita todos
  // os inputs/selects/botões descendentes de uma vez, sem precisar tocar
  // em cada input individualmente) e o botão "Salvar" não aparece.
  somenteLeitura?: boolean
}

export default function DespesasModal({ modo, despesa, resultadoImportacao, onFechar, onSalvo, somenteLeitura = false }: DespesasModalProps) {

  const isRevisar = modo === 'revisar'
  const isEditar = modo === 'editar'
  const isNovo = modo === 'novo'

  // ── Campos do cabeçalho ──
  const [categoriaFinanceira, setCategoriaFinanceira] = useState<CategoriaFinanceira>('compra_mercadoria_insumo')
  const [favorecidoNome, setFavorecidoNome] = useState('')
  const [favorecidoCnpjCpf, setFavorecidoCnpjCpf] = useState('')
  const [favorecidoEndereco, setFavorecidoEndereco] = useState('')
  const [fornecedorId, setFornecedorId] = useState<number | null>(null)
  const [fornecedorAutoCriado, setFornecedorAutoCriado] = useState(false)
  const [documentoNumero, setDocumentoNumero] = useState('')
  const [documentoDataEmissao, setDocumentoDataEmissao] = useState('')
  const [valorTotal, setValorTotal] = useState('0')
  const [origemTipo, setOrigemTipo] = useState<OrigemDespesaTipo>('empresarial')
  const [origemBeneficiarioNome, setOrigemBeneficiarioNome] = useState<string | null>(null)
  // QA fix (achado Crítico #11 — Relatorio_Auditoria_Modulo_Despesas.md):
  // CPF e vínculo do beneficiário pessoal precisam de estado local próprio.
  // Antes, esses dois campos não tinham setState e handleSalvar gravava
  // null incondicionalmente — apagando o dado calculado pelo classificador
  // em toda gravação (novo lançamento) e corrompendo o dado já correto
  // em toda edição futura de uma despesa já lançada.
  const [origemBeneficiarioCpf, setOrigemBeneficiarioCpf] = useState<string | null>(null)
  const [origemBeneficiarioVinculo, setOrigemBeneficiarioVinculo] = useState<string | null>(null)
  const [origemClassificacaoStatus, setOrigemClassificacaoStatus] = useState<'auto_classificado' | 'revisao_manual'>('auto_classificado')
  const [origemCriteriosBatidos, setOrigemCriteriosBatidos] = useState<string[]>([])
  // FEATURE (a pedido do usuário — 2ª via de DANFE): populados apenas
  // quando a despesa veio de importação XML (nfe_compra ou nfse) — ficam
  // null em lançamento manual ou via IA (PDF/foto). Usados para exibir a
  // chave de acesso (somente leitura) e habilitar o botão "Gerar 2ª via
  // de DANFE" no modal.
  const [chaveAcessoNfe, setChaveAcessoNfe] = useState<string | null>(null)
  const [xmlConteudo, setXmlConteudo] = useState<string | null>(null)
  // QA fix (achados Médio #12/#13 — Relatorio_Auditoria_Modulo_Despesas.md):
  // sinaliza quando o usuário edita manualmente favorecido/CNPJ/categoria
  // (achado #12) ou o dropdown de origem (achado #13) DEPOIS que a
  // classificação automática já rodou — nestes casos, os critérios
  // batidos exibidos/gravados não refletem mais os dados reais, e a
  // trilha de auditoria ficaria silenciosamente inconsistente. Em vez de
  // recalcular a classificação no client (exigiria acesso ao roster e ao
  // client admin, disponíveis só na API route), marcamos explicitamente
  // que houve sobrescrita manual — status vira 'revisao_manual' e um
  // critério informativo é anotado, nunca ficando com um "auto_classificado"
  // que na verdade reflete dado já corrigido pelo usuário.
  const [classificacaoDesatualizadaPorEdicao, setClassificacaoDesatualizadaPorEdicao] = useState(false)

  const [parcelas, setParcelas] = useState<ParcelaForm[]>([parcelaVazia(1)])
  const [extensaoCategoria, setExtensaoCategoria] = useState<Despesa['extensao_categoria']>({})
  const [origemEntrada, setOrigemEntrada] = useState<Despesa['origem_entrada']>('manual')
  // QA fix (14/08/2026, a pedido do Maycon): status editável manualmente
  // no modal, em modo 'editar' — mesmo padrão de ContasReceberModal.tsx.
  // Antes o handleSalvar gravava 'em_aberto' fixo mesmo em edição,
  // resetando o status de qualquer despesa já paga/parcial toda vez que
  // o usuário editasse qualquer outro campo e salvasse — bug real,
  // corrigido junto. 'cancelado' fica de fora do dropdown: não existe
  // fluxo de soft-delete dedicado neste modal (diferente de Contas a
  // Pagar/Receber), então setar 'cancelado' aqui deixaria deleted_at
  // dessincronizado — fora do escopo deste pedido.
  const [statusPagamento, setStatusPagamento] = useState<Despesa['status_pagamento']>('em_aberto')

  // ── Indicadores exclusivos do modo 'revisar' ──
  const [duplicadoBloqueado, setDuplicadoBloqueado] = useState(false)
  const [criterioDuplicidade, setCriterioDuplicidade] = useState<string | null>(null)

  // ── Estado de busca de fornecedor no lançamento manual ──
  const [buscandoFornecedor, setBuscandoFornecedor] = useState(false)
  const [fornecedorNaoEncontrado, setFornecedorNaoEncontrado] = useState(false)
  // FEATURE (a pedido do usuário — seletor de fornecedor): campo de busca
  // por nome/CNPJ, com lista de sugestões dos fornecedores já cadastrados
  // — existe em Nova E Editar Despesa (diferente da busca automática por
  // CNPJ no blur, que antes só existia em Nova Despesa)
  const [termoBuscaFornecedor, setTermoBuscaFornecedor] = useState('')
  const [sugestoesFornecedor, setSugestoesFornecedor] = useState<FornecedorSugestao[]>([])
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // ── Preenche o formulário conforme o modo ──
  // Sincroniza o estado local do formulário com os dados externos (props)
  // quando o modal abre — mesmo padrão já usado (sem correção) em
  // ReceitasModal.tsx:85. Um refactor para "ajustar durante o render"
  // aqui exigiria reescrever ~15 setters condicionais de forma segura;
  // dado que este é um padrão aceito no restante do projeto, mantemos o
  // effect com supressão explícita em vez de arriscar um refactor maior.
  useEffect(() => {
    if (isRevisar && resultadoImportacao) {
      const { despesa: d, parcelas: p, fornecedorMatch, origemDespesaClassificacao, duplicateCheck } = resultadoImportacao
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategoriaFinanceira(d.categoria_financeira)
      setFavorecidoNome(d.favorecido_nome)
      setFavorecidoCnpjCpf(d.favorecido_cnpj_cpf ?? '')
      setFavorecidoEndereco(d.favorecido_endereco ?? '')
      setFornecedorId(fornecedorMatch.fornecedorId)
      setFornecedorAutoCriado(fornecedorMatch.autoCriado)
      setDocumentoNumero(d.documento_numero ?? '')
      setDocumentoDataEmissao(d.documento_data_emissao ?? '')
      setValorTotal(String(d.valor_total))
      setOrigemTipo(d.origem_tipo)
      setOrigemBeneficiarioNome(d.origem_beneficiario_nome ?? null)
      // QA fix (achado Crítico #11): lê CPF/vínculo já calculados pelo
      // classificador determinístico e devolvidos pela rota de importação
      // (importar-xml.ts / importar-documento.ts) dentro de `d` — antes
      // esses dois campos eram ignorados aqui e perdidos no handleSalvar.
      setOrigemBeneficiarioCpf(d.origem_beneficiario_cpf ?? null)
      setOrigemBeneficiarioVinculo(d.origem_beneficiario_vinculo ?? null)
      setOrigemClassificacaoStatus(origemDespesaClassificacao.status)
      setOrigemCriteriosBatidos(origemDespesaClassificacao.criteriosBatidos)
      // FEATURE (a pedido do usuário — 2ª via de DANFE): lê a chave/XML já
      // extraídos pelo parser e devolvidos pela rota de importação dentro
      // de `d` — populado só quando a importação foi por XML (ver
      // importar-xml.ts); fica null no caminho de IA (importar-documento.ts)
      setChaveAcessoNfe(d.chave_acesso_nfe ?? null)
      setXmlConteudo(d.xml_conteudo ?? null)
      setParcelas(p.map((parcela) => ({ ...parcela })))
      setExtensaoCategoria(d.extensao_categoria)
      setOrigemEntrada(d.origem_entrada)
      setDuplicadoBloqueado(duplicateCheck.duplicado)
      setCriterioDuplicidade(duplicateCheck.criterioDuplicidade)
      // QA fix (achados #12/#13): dados recém-chegados do backend — a
      // classificação está em dia, nenhuma edição manual ainda ocorreu
      setClassificacaoDesatualizadaPorEdicao(false)
    } else if (isEditar && despesa) {
      setCategoriaFinanceira(despesa.categoria_financeira)
      setFavorecidoNome(despesa.favorecido_nome)
      setFavorecidoCnpjCpf(despesa.favorecido_cnpj_cpf ?? '')
      setFavorecidoEndereco(despesa.favorecido_endereco ?? '')
      setFornecedorId(despesa.fornecedor_id)
      setFornecedorAutoCriado(despesa.fornecedor_auto_criado)
      setDocumentoNumero(despesa.documento_numero ?? '')
      setDocumentoDataEmissao(despesa.documento_data_emissao ?? '')
      setValorTotal(String(despesa.valor_total))
      setOrigemTipo(despesa.origem_tipo)
      setOrigemBeneficiarioNome(despesa.origem_beneficiario_nome ?? null)
      // QA fix (achado Crítico #11): lê o CPF/vínculo já persistidos na
      // despesa existente — antes esses dois campos eram descartados ao
      // abrir o modal de edição e regravados como null ao salvar,
      // corrompendo retroativamente a trilha de auditoria fiscal/societária.
      setOrigemBeneficiarioCpf(despesa.origem_beneficiario_cpf ?? null)
      setOrigemBeneficiarioVinculo(despesa.origem_beneficiario_vinculo ?? null)
      setOrigemClassificacaoStatus(despesa.origem_classificacao_status)
      setOrigemCriteriosBatidos(despesa.origem_criterios_batidos)
      // FEATURE (a pedido do usuário — 2ª via de DANFE): lê o que já está
      // persistido na despesa — nunca editável pelo usuário, só exibido
      // (somente leitura) e usado para habilitar o botão de 2ª via
      setChaveAcessoNfe(despesa.chave_acesso_nfe ?? null)
      setXmlConteudo(despesa.xml_conteudo ?? null)
      setParcelas((despesa.parcelas ?? []).filter((p) => !p.deleted_at).map((p) => ({ ...p })))
      setExtensaoCategoria(despesa.extensao_categoria)
      setOrigemEntrada(despesa.origem_entrada)
      setStatusPagamento(despesa.status_pagamento)
      // QA fix (achados #12/#13): despesa recém-carregada — classificação
      // já gravada está em dia, nenhuma edição manual ainda ocorreu nesta sessão
      setClassificacaoDesatualizadaPorEdicao(false)
    } else if (isNovo) {
      // Formulário em branco — valores padrão já definidos no useState
      setParcelas([parcelaVazia(1)])
    }
  }, [modo, despesa, resultadoImportacao]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Busca fornecedor por CNPJ/CPF no lançamento manual ──
  async function handleBuscarFornecedorManual() {
    if (!favorecidoCnpjCpf.trim()) return
    setBuscandoFornecedor(true)
    setFornecedorNaoEncontrado(false)
    try {
      const encontrado = await buscarFornecedorPorDocumento(favorecidoCnpjCpf)
      if (encontrado) {
        setFornecedorId(encontrado.id)
        if (!favorecidoNome.trim()) setFavorecidoNome(encontrado.razao)
        setFornecedorNaoEncontrado(false)
      } else {
        setFornecedorId(null)
        setFornecedorNaoEncontrado(true)
      }
    } finally {
      setBuscandoFornecedor(false)
    }
  }

  // FEATURE (a pedido do usuário — seletor de fornecedor): busca com
  // debounce de 350ms conforme o usuário digita no campo "Buscar
  // fornecedor existente" — disponível em Nova E Editar Despesa
  useEffect(() => {
    const termo = termoBuscaFornecedor.trim()
    // QA fix (mesma categoria já corrigida antes neste módulo —
    // set-state-in-effect): nenhum setState roda de forma síncrona no
    // corpo do efeito — tudo acontece dentro do callback do timer,
    // mesmo a decisão de limpar a lista quando o termo é curto demais
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

  // FEATURE (a pedido do usuário — seletor de fornecedor): ao escolher um
  // fornecedor da lista de sugestões, vincula ele à despesa — substitui
  // favorecido_nome/cnpj_cpf pelos dados oficiais já cadastrados, marca
  // fornecedor_auto_criado como false (é um vínculo explícito do
  // usuário, não uma criação automática) e fecha a lista de sugestões
  function handleSelecionarFornecedor(f: FornecedorSugestao) {
    setFornecedorId(f.id)
    setFornecedorAutoCriado(false)
    setFavorecidoNome(f.razao)
    setFavorecidoCnpjCpf(f.cnpj ?? f.cpf ?? '')
    setFornecedorNaoEncontrado(false)
    setTermoBuscaFornecedor('')
    setSugestoesFornecedor([])
    setMostrarSugestoes(false)
    // Vincular manualmente um fornecedor existente também conta como
    // edição pós-classificação — mesmo motivo dos campos Favorecido/CNPJ
    // (achado #12): o vínculo pode mudar a origem (empresarial x pessoal)
    if (!isNovo) setClassificacaoDesatualizadaPorEdicao(true)
  }

  // ── Manipulação das parcelas ──
  function atualizarParcela(index: number, campo: keyof ParcelaForm, valor: string | number | boolean | null) {
    setParcelas((atual) => atual.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)))
  }

  function adicionarParcela() {
    setParcelas((atual) => [...atual, parcelaVazia(atual.length + 1)])
  }

  function removerParcela(index: number) {
    setParcelas((atual) => atual.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero_parcela: i + 1 })))
  }

  // ── Obtém o Bearer token da sessão atual (mesmo padrão de ContasReceberModal.tsx) ──
  async function obterToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // FEATURE (a pedido do usuário — 2ª via de DANFE): mesmo mecanismo já
  // usado em ContasAPagarModal.tsx::handleGerarBoletoAvulso — fetch com
  // Bearer token, recebe o PDF como blob, abre em nova aba via
  // URL.createObjectURL. Só chamada quando o botão está habilitado
  // (chaveAcessoNfe && xmlConteudo presentes), mas a rota também valida
  // isso de novo no servidor, por segurança.
  const [gerandoDanfe, setGerandoDanfe] = useState(false)
  async function handleGerarDanfe() {
    if (!despesa) return
    setGerandoDanfe(true)
    setErro(null)
    try {
      const token = await obterToken()
      const resp = await fetch(`/api/despesas/gerar-danfe?id=${despesa.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => ({}))
        throw new Error(corpo.erro ?? 'Erro ao gerar DANFE')
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar 2ª via de DANFE')
    } finally {
      setGerandoDanfe(false)
    }
  }

  // ── Salvar ──
  async function handleSalvar() {
    setErro(null)

    // Validações mínimas antes de qualquer chamada de rede
    if (!favorecidoNome.trim()) return setErro('Informe o nome do favorecido.')
    if (!fornecedorId) return setErro('Fornecedor não vinculado — busque pelo CNPJ/CPF ou cadastre em Fornecedores primeiro.')
    if (parcelas.length === 0) return setErro('É necessário ao menos 1 parcela.')
    if (parcelas.some((p) => !p.data_vencimento || p.valor <= 0)) return setErro('Todas as parcelas precisam de valor e vencimento válidos.')
    if (isRevisar && duplicadoBloqueado) return setErro('Não é possível gravar: título duplicado detectado.')

    setSalvando(true)
    try {
      const token = await obterToken()

      // QA fix (achado Baixo #14 — Relatorio_Auditoria_Modulo_Despesas.md):
      // "|| fallback" tratava 0 (valor digitado legitimamente como zero,
      // ex: despesa com desconto integral) como se fosse ausência/valor
      // inválido, caindo no fallback indevidamente. Number.isNaN() checa
      // apenas se o parse falhou de fato.
      const valorTotalParseado = parseFloat(valorTotal)
      const valorTotalNum = Number.isNaN(valorTotalParseado) ? parcelas.reduce((soma, p) => soma + p.valor, 0) : valorTotalParseado

      // QA fix (achados Médio #12/#13): se o usuário editou manualmente
      // favorecido/CNPJ/categoria/origem depois que a classificação
      // automática já havia rodado, nunca grava "auto_classificado" com
      // critérios que não refletem mais o dado real — força
      // 'revisao_manual' e anota o motivo, preservando a trilha de auditoria
      const statusClassificacaoFinal = classificacaoDesatualizadaPorEdicao
        ? 'revisao_manual'
        : origemClassificacaoStatus
      const criteriosBatidosFinal = classificacaoDesatualizadaPorEdicao
        ? [...origemCriteriosBatidos, 'sobrescrito_manualmente_apos_classificacao']
        : origemCriteriosBatidos

      const despesaPayload: DespesaInsert = {
        tipo_documento: isNovo ? 'recibo' : (isEditar ? despesa!.tipo_documento : resultadoImportacao!.despesa.tipo_documento),
        categoria_financeira: categoriaFinanceira,
        favorecido_nome: favorecidoNome,
        favorecido_cnpj_cpf: favorecidoCnpjCpf || null,
        favorecido_endereco: favorecidoEndereco || null,
        fornecedor_id: fornecedorId,
        fornecedor_auto_criado: fornecedorAutoCriado,
        origem_tipo: origemTipo,
        origem_beneficiario_nome: origemBeneficiarioNome,
        // QA fix (achado Crítico #11): usa os estados populados a partir do
        // classificador/despesa existente, em vez de null fixo — preserva o
        // CPF/vínculo do beneficiário pessoal em toda gravação e edição.
        origem_beneficiario_cpf: origemBeneficiarioCpf,
        origem_beneficiario_vinculo: origemBeneficiarioVinculo,
        origem_classificacao_status: statusClassificacaoFinal,
        origem_criterios_batidos: criteriosBatidosFinal,
        origem_ia_sugestao: null,
        documento_numero: documentoNumero || null,
        documento_data_emissao: documentoDataEmissao || null,
        documento_competencia: null,
        valor_original: valorTotalNum,
        valor_desconto: 0,
        valor_juros_multa: 0,
        valor_total: valorTotalNum,
        status_pagamento: statusPagamento,
        extensao_categoria: extensaoCategoria,
        origem_entrada: origemEntrada,
        // FEATURE (a pedido do usuário — 2ª via de DANFE): passthrough dos
        // estados populados acima — nunca editáveis pelo usuário no
        // formulário, só preservados (modo editar) ou herdados da
        // importação (modo revisar/novo, onde ficam null se não vieram de XML)
        chave_acesso_nfe: chaveAcessoNfe,
        xml_conteudo: xmlConteudo,
        deleted_at: null,
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parcelasPayload = parcelas.map(({ id: _id, ...resto }) => resto)

      if (isEditar && despesa) {
        // ── Edição — PUT /api/despesas/atualizar, com sync de parcelas ──
        const res = await fetch('/api/despesas/atualizar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            despesaId: despesa.id,
            camposDespesa: despesaPayload,
            parcelas: parcelas.map(({ id, ...resto }) => (id ? { id, ...resto } : { ...resto })),
          }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({ erro: 'Erro desconhecido' }))
          throw new Error(json.erro ?? 'Erro ao atualizar despesa')
        }
      } else {
        // ── Novo lançamento (revisão de import OU manual) — POST /api/despesas/confirmar ──
        const res = await fetch('/api/despesas/confirmar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ despesa: despesaPayload, parcelas: parcelasPayload }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({ erro: 'Erro desconhecido' }))
          throw new Error(json.erro ?? 'Erro ao gravar despesa')
        }
      }

      onSalvo()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    } finally {
      setSalvando(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: '32px', padding: '0 8px', fontSize: '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif', color: '#2c4a60',
    background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '4px', outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#5a84a6', marginBottom: '3px', display: 'block',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{
        background: '#ffffff', borderRadius: '10px', width: '100%', maxWidth: '760px',
        maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Tahoma, Geneva, sans-serif',
      }}>
        {/* Cabeçalho */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8f0f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a6094' }}>
            {somenteLeitura ? 'Visualizar Despesa' : isRevisar ? 'Revisar Documento Importado' : isEditar ? 'Editar Despesa' : 'Nova Despesa'}
          </span>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#5a84a6' }}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* FEATURE: fieldset disabled desabilita TODOS os inputs/selects/
              botões descendentes de uma vez quando somenteLeitura=true —
              evita ter que adicionar disabled={somenteLeitura} em cada um
              dos ~15 campos do formulário individualmente */}
          <fieldset disabled={somenteLeitura} style={{ border: 'none', padding: 0, margin: 0 }}>

          {somenteLeitura && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f0f4f7', border: '1px solid #d8e3ec', borderRadius: '6px', fontSize: '12px', color: '#3a6080' }}>
              <i className="ti ti-eye" aria-hidden="true" style={{ marginRight: '6px' }} />
              Modo somente leitura. Para editar, feche esta janela e use o botão de edição.
            </div>
          )}

          {/* Aviso de duplicidade (bloqueia gravação) */}
          {isRevisar && duplicadoBloqueado && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', color: '#a32d2d' }}>
              <strong>Documento já lançado anteriormente.</strong> Critério: {criterioDuplicidade}. Não é possível gravar — se acredita ser um falso positivo, corrija a origem e tente novamente.
            </div>
          )}

          {/* Aviso de fornecedor auto-criado */}
          {fornecedorAutoCriado && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
              <strong>Novo fornecedor criado automaticamente.</strong> Os dados podem estar incompletos — revise o cadastro em Fornecedores após salvar.
            </div>
          )}

          {/* Indicador de classificação pendente de revisão */}
          {origemClassificacaoStatus === 'revisao_manual' && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
              <strong>Classificação de origem pendente de revisão.</strong> Sinais insuficientes para decidir automaticamente entre empresarial e pessoal — confirme manualmente abaixo.
            </div>
          )}

          {/* QA fix (achados Médio #12/#13): aviso quando favorecido/CNPJ/
              categoria/origem foram editados manualmente após a classificação
              automática já ter rodado — grava como revisão manual, nunca
              como "auto_classificado" desatualizado */}
          {classificacaoDesatualizadaPorEdicao && origemClassificacaoStatus !== 'revisao_manual' && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', color: '#1e4e7a' }}>
              <strong>Classificação recalculada como revisão manual.</strong> Campos que afetam a origem (favorecido, CNPJ/CPF, categoria ou origem) foram editados após a classificação automática — ao salvar, o registro será marcado como revisado manualmente.
            </div>
          )}

          {/* FEATURE (a pedido do usuário — seletor de fornecedor):
              busca por nome/CNPJ entre os fornecedores já cadastrados,
              disponível em Nova E Editar Despesa — resolve tanto a
              origem do problema (usuário escolhe, IA não precisa acertar
              sozinha) quanto a correção posterior (reabre uma despesa já
              lançada com fornecedor errado, busca o certo, vincula) */}
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

          {/* Favorecido */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={labelStyle}>Favorecido</label>
              <input
                style={inputStyle}
                value={favorecidoNome}
                onChange={(e) => {
                  setFavorecidoNome(e.target.value)
                  // QA fix (achado #12): edição manual pós-classificação — os
                  // critérios batidos exibidos deixam de refletir o dado atual
                  if (!isNovo) setClassificacaoDesatualizadaPorEdicao(true)
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>CNPJ / CPF</label>
              <input
                style={inputStyle}
                value={favorecidoCnpjCpf}
                onChange={(e) => {
                  setFavorecidoCnpjCpf(e.target.value)
                  // QA fix (achado #12): mesmo motivo do campo Favorecido acima
                  if (!isNovo) setClassificacaoDesatualizadaPorEdicao(true)
                }}
                onBlur={(isNovo || isEditar) ? handleBuscarFornecedorManual : undefined}
                placeholder={isNovo ? 'Buscar fornecedor ao sair do campo' : ''}
              />
              {(isNovo || isEditar) && buscandoFornecedor && <span style={{ fontSize: '10px', color: '#5a84a6' }}>Buscando...</span>}
              {(isNovo || isEditar) && fornecedorNaoEncontrado && (
                <span style={{ fontSize: '10px', color: '#a32d2d' }}>Fornecedor não encontrado — busque acima ou cadastre em Fornecedores primeiro.</span>
              )}
              {!(isNovo || isEditar) && favorecidoCnpjCpf && (
                <span style={{ fontSize: '10px', color: '#5a84a6' }}>{formatarCnpjCpf(favorecidoCnpjCpf)}</span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>Endereço</label>
            <input style={inputStyle} value={favorecidoEndereco} onChange={(e) => setFavorecidoEndereco(e.target.value)} />
          </div>

          {/* Categoria / Documento / Valor */}
          <div style={{ display: 'grid', gridTemplateColumns: isEditar ? '1.3fr 1fr 1fr 1fr 1fr' : '1.5fr 1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={labelStyle}>Categoria Financeira</label>
              <select
                style={inputStyle}
                value={categoriaFinanceira}
                onChange={(e) => {
                  setCategoriaFinanceira(e.target.value as CategoriaFinanceira)
                  // QA fix (achado #12): categoria afeta diretamente a exceção
                  // MEI/servicos_profissionais e os sinais de fallback — mudar
                  // manualmente também desatualiza a classificação exibida
                  if (!isNovo) setClassificacaoDesatualizadaPorEdicao(true)
                }}
              >
                {Object.entries(CATEGORIA_FINANCEIRA_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>
            {isEditar && (
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  style={{ ...inputStyle, fontWeight: 700, color: '#1a6094', cursor: 'pointer' }}
                  value={statusPagamento}
                  onChange={(e) => setStatusPagamento(e.target.value as Despesa['status_pagamento'])}
                >
                  {/* 'cancelado' fica de fora — sem fluxo de soft-delete dedicado
                      neste modal, setar aqui deixaria deleted_at dessincronizado */}
                  {(Object.keys(STATUS_PAGAMENTO_LABELS) as Despesa['status_pagamento'][])
                    .filter((s) => s !== 'cancelado')
                    .map((s) => (
                      <option key={s} value={s}>{STATUS_PAGAMENTO_LABELS[s]}</option>
                    ))}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Nº Documento</label>
              <input style={inputStyle} value={documentoNumero} onChange={(e) => setDocumentoNumero(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Data Emissão</label>
              <input type="date" style={inputStyle} value={documentoDataEmissao} onChange={(e) => setDocumentoDataEmissao(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Valor Total</label>
              <input type="number" step="0.01" style={inputStyle} value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} />
            </div>
          </div>

          {/* FEATURE (a pedido do usuário — 2ª via de DANFE): chave de
              acesso, somente leitura — só aparece quando a despesa foi
              importada por XML (nfe_compra ou nfse) e o parser conseguiu
              extrair a chave. Nunca editável pelo usuário. */}
          {chaveAcessoNfe && (
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Chave de Acesso (NFe/NFSe)</label>
              <div style={{
                ...inputStyle, background: '#f7fafc', color: '#3a6080',
                fontFamily: 'monospace', letterSpacing: '0.03em', fontSize: '12px',
                display: 'flex', alignItems: 'center',
              }}>
                {/* Agrupa de 4 em 4 dígitos, mesmo formato visual padrão de chave de acesso de NF-e */}
                {chaveAcessoNfe.replace(/(\d{4})(?=\d)/g, '$1 ')}
              </div>
            </div>
          )}

          {/* Origem (empresarial x pessoal) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Origem da Despesa</label>
              <select
                style={inputStyle}
                value={origemTipo}
                onChange={(e) => {
                  setOrigemTipo(e.target.value as OrigemDespesaTipo)
                  // QA fix (achado #13): troca manual do tipo de origem
                  // sobrescreve o que a classificação automática decidiu —
                  // marca para não gravar um status "auto_classificado"
                  // contraditório com uma escolha manual do usuário
                  setClassificacaoDesatualizadaPorEdicao(true)
                }}
              >
                {Object.entries(ORIGEM_TIPO_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>
            {origemTipo === 'pessoal_socio' && (
              <div>
                <label style={labelStyle}>Beneficiário</label>
                <input style={inputStyle} value={origemBeneficiarioNome ?? ''} onChange={(e) => setOrigemBeneficiarioNome(e.target.value)} />
              </div>
            )}
          </div>

          {/* Parcelas */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094' }}>Parcelas</span>
              <button onClick={adicionarParcela} style={{ fontSize: '11px', color: '#1a6094', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                + Adicionar parcela
              </button>
            </div>
            {parcelas.map((p, i) => (
              <div key={p.id ?? `nova-${i}`} style={{ display: 'grid', gridTemplateColumns: '0.6fr 1fr 1fr 1.5fr 0.4fr', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#5a84a6' }}>{p.numero_parcela}/{parcelas.length}</span>
                <input type="number" step="0.01" style={inputStyle} value={p.valor} onChange={(e) => atualizarParcela(i, 'valor', parseFloat(e.target.value) || 0)} placeholder="Valor" />
                <input type="date" style={inputStyle} value={p.data_vencimento} onChange={(e) => atualizarParcela(i, 'data_vencimento', e.target.value)} />
                <input style={inputStyle} value={p.linha_digitavel ?? ''} onChange={(e) => atualizarParcela(i, 'linha_digitavel', e.target.value || null)} placeholder="Linha digitável (opcional)" />
                <button onClick={() => removerParcela(i)} disabled={parcelas.length === 1} style={{ background: 'none', border: 'none', cursor: parcelas.length === 1 ? 'not-allowed' : 'pointer', color: '#dc2626', opacity: parcelas.length === 1 ? 0.3 : 1 }}>
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: '#5a84a6', marginTop: '4px' }}>
              Soma das parcelas: {formatarMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
            </div>
          </div>

          {/* Erro inline */}
          {erro && (
            <div style={{ marginBottom: '12px', padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', color: '#a32d2d' }}>
              {erro}
            </div>
          )}
          </fieldset>
        </div>

        {/* Rodapé */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e8f0f7', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {/* FEATURE (a pedido do usuário — 2ª via de DANFE): só aparece
              quando a despesa já foi salva (tem id) E tem chave/XML
              arquivados — nunca em Nova Despesa/Revisar (ainda não
              persistida), nunca para despesas sem origem XML.
              marginRight: 'auto' empurra pro canto esquerdo do rodapé,
              longe de Cancelar/Salvar. */}
          {despesa && chaveAcessoNfe && xmlConteudo && (
            <button
              onClick={handleGerarDanfe}
              disabled={gerandoDanfe}
              title="Gerar 2ª via de DANFE"
              style={{
                marginRight: 'auto',
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '7px 14px', fontSize: '12px', fontWeight: 700,
                fontFamily: 'Tahoma, Geneva, sans-serif',
                background: '#ffffff', color: '#1a6094',
                border: '1px solid #c4d8eb', borderRadius: '5px',
                cursor: gerandoDanfe ? 'wait' : 'pointer',
                opacity: gerandoDanfe ? 0.7 : 1,
              }}
            >
              <i className="ti ti-file-invoice" aria-hidden="true" />
              {gerandoDanfe ? 'Gerando...' : '2ª via de DANFE'}
            </button>
          )}
          <button onClick={onFechar} style={{ padding: '7px 16px', fontSize: '12px', fontWeight: 600, background: '#f0f4f7', color: '#3a6080', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {/* FEATURE: em modo somente leitura não faz sentido "Salvar" —
              o botão simplesmente não é renderizado */}
          {!somenteLeitura && (
          <button
            onClick={handleSalvar}
            disabled={salvando || (isRevisar && duplicadoBloqueado)}
            style={{
              padding: '7px 18px', fontSize: '12px', fontWeight: 700,
              background: (isRevisar && duplicadoBloqueado) ? '#c4d8eb' : '#1a6094',
              color: '#ffffff', border: 'none', borderRadius: '5px',
              cursor: (salvando || (isRevisar && duplicadoBloqueado)) ? 'not-allowed' : 'pointer',
              opacity: salvando ? 0.7 : 1,
            }}
          >
            {salvando ? 'Salvando...' : isEditar ? 'Salvar Alterações' : 'Confirmar e Gravar'}
          </button>
          )}
        </div>
      </div>
    </div>
  )
}
