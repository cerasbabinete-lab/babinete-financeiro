// ============================================================
// lib/contasAPagarService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Todas as operações de dados do módulo Contas a Pagar —
//         camada de serviço entre UI e Supabase. Espelha
//         lib/contasReceberService.ts na estrutura geral, mas segue
//         o padrão de client injetável de lib/despesasService.ts
//         (client: SupabaseClient = supabase) para as operações de
//         escrita, porque a Especificação (§7, Non-negotiables)
//         exige que TODA escrita passe por rota pages/api/pagar/*.ts
//         com Bearer+getUser() — nunca direto do browser com a anon
//         key, mesma correção do achado #8 do audit de Despesas.
//         Na prática: os componentes de UI chamam as funções de
//         LEITURA diretamente (buscarTitulos, buscarTituloPorId,
//         etc. — RLS não configurado neste módulo, gap conhecido,
//         mesmo padrão de todo o resto do sistema), mas para
//         ESCRITA sempre chamam fetch() para a rota de API
//         correspondente, que por sua vez chama estas mesmas funções
//         de serviço passando o client ADMIN.
// Conecta com: supabase.ts, types/contasAPagar.ts,
//              ContasAPagarTabela.tsx, ContasAPagarModal.tsx,
//              ContasAPagarMobileList.tsx, ContasAPagarHeader.tsx,
//              RosterBeneficiariosModal.tsx, pages/api/pagar/*.ts
// Referência: Especificacao_Modulo_Contas_a_Pagar.md
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ContaAPagar,
  ContaAPagarInsert,
  ContaAPagarUpdate,
  ContaAPagarEvento,
  FiltrosContasAPagar,
  StatusTituloPagar,
  FormaBaixaPagar,
  TipoEventoPagar,
  BeneficiarioPessoalRosterPagar,
} from '@/types/contasAPagar'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA          = 'contas_a_pagar'          // Tabela principal de títulos
const TABELA_EVENTOS  = 'contas_a_pagar_eventos'  // Log de auditoria por título
const TABELA_ROSTER    = 'beneficiarios_pessoais'  // Roster de sócios/prestador MEI (compartilhado com Despesas)

// ============================================================
// ── SEÇÃO 1: LEITURA / LISTAGEM ──
// ============================================================

// ============================================================
// buscarTitulos()
// Retorna lista de títulos aplicando filtros ativos, com join de
// eventos. Ordenado por deleted_at (ativos primeiro) e
// data_vencimento ASC — mesmo padrão de contasReceberService.ts
// Chamado por: app/pagar/page.tsx no useEffect e nos filtros
// ============================================================
export async function buscarTitulos(filtros: FiltrosContasAPagar): Promise<ContaAPagar[]> {
  let query = supabase
    .from(TABELA)
    .select(`
      *,
      eventos:contas_a_pagar_eventos(*)
    `)

  // Busca textual: favorecido, CNPJ/CPF (dígitos puros), nº doc, nosso número
  if (filtros.busca && filtros.busca.trim() !== '') {
    const termo    = `%${filtros.busca.trim()}%`
    const termoDig = `%${filtros.busca.trim().replace(/[^0-9]/g, '')}%`
    const partes: string[] = [
      `favorecido_nome.ilike.${termo}`,
      `numero_documento.ilike.${termo}`,
      `nosso_numero.ilike.${termo}`,
    ]
    if (termoDig !== '%%') {
      partes.push(`favorecido_cnpj_cpf.ilike.${termoDig}`)
    }
    query = query.or(partes.join(','))
  }

  if (filtros.vencimentoDe && filtros.vencimentoDe !== '') {
    query = query.gte('data_vencimento', filtros.vencimentoDe)
  }

  if (filtros.vencimentoAte && filtros.vencimentoAte !== '') {
    query = query.lte('data_vencimento', filtros.vencimentoAte)
  }

  if (filtros.status && filtros.status !== '') {
    query = query.eq('status', filtros.status)
  }

  // Ativos (deleted_at IS NULL) primeiro, depois cancelados; dentro de
  // cada grupo, vence mais cedo primeiro — mesmo padrão de Receber
  query = query
    .order('deleted_at', { ascending: true, nullsFirst: true })
    .order('data_vencimento', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('[contasAPagarService] buscarTitulos error:', error)
    throw new Error(error.message)
  }

  return (data as ContaAPagar[]) ?? []
}

// ============================================================
// contarTitulos()
// Total de títulos ativos (deleted_at IS NULL) — exibido no header
// ============================================================
export async function contarTitulos(): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (error) {
    console.error('[contasAPagarService] contarTitulos error:', error)
    return 0
  }

  return count ?? 0
}

// ============================================================
// ContadoresTitulosPagar
// Contagens por grupo de status para o painel de resumo — enum de
// Contas a Pagar tem só 4 status (vs. 6 de Receber), sem
// protesto/cartório (não se aplica ao sentido "a pagar")
// ============================================================
export interface ContadoresTitulosPagar {
  emAberto:     number  // status = 'em_aberto', não vencido
  atrasados:    number  // status = 'em_aberto', data_vencimento < hoje
  pagoParcial:  number  // status = 'pago_parcial'
  pagos:        number  // status = 'pago'
  cancelados:   number  // deleted_at IS NOT NULL
}

// ============================================================
// buscarContadoresTitulos()
// Contagens agrupadas por status para o banner de resumo
// ============================================================
export async function buscarContadoresTitulos(): Promise<ContadoresTitulosPagar> {
  const hoje = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from(TABELA)
    .select('status, deleted_at, data_vencimento')

  if (error) {
    console.error('[contasAPagarService] buscarContadoresTitulos error:', error)
    return { emAberto: 0, atrasados: 0, pagoParcial: 0, pagos: 0, cancelados: 0 }
  }

  const registros = (data ?? []) as { status: string; deleted_at: string | null; data_vencimento: string }[]

  let emAberto = 0, atrasados = 0, pagoParcial = 0, pagos = 0, cancelados = 0

  for (const r of registros) {
    if (r.deleted_at !== null) {
      cancelados++
      continue
    }
    if (r.status === 'em_aberto') {
      if (r.data_vencimento < hoje) atrasados++
      else emAberto++
    } else if (r.status === 'pago_parcial') {
      pagoParcial++
    } else if (r.status === 'pago') {
      pagos++
    }
  }

  return { emAberto, atrasados, pagoParcial, pagos, cancelados }
}

// ============================================================
// buscarTituloPorId()
// Título completo com eventos ordenados cronologicamente — usado
// para pré-preencher o modal de edição/visualização
// ============================================================
export async function buscarTituloPorId(id: string): Promise<ContaAPagar | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(`
      *,
      eventos:contas_a_pagar_eventos(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[contasAPagarService] buscarTituloPorId error:', error)
    return null
  }

  const titulo = data as ContaAPagar
  if (titulo.eventos) {
    titulo.eventos = titulo.eventos.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
  }

  return titulo
}

// ============================================================
// somarValorPagoEventos()
// Soma o valor_pago de todos os eventos de um título — única fonte
// de verdade de "quanto já foi pago" (Especificação §2.1: NÃO existe
// campo valor_pago_acumulado na tabela). Usado pela UI para mostrar
// o progresso de títulos pago_parcial.
// ============================================================
export async function somarValorPagoEventos(tituloId: string): Promise<number> {
  const { data, error } = await supabase
    .from(TABELA_EVENTOS)
    .select('valor_pago')
    .eq('titulo_id', tituloId)
    .not('valor_pago', 'is', null)

  if (error) {
    console.error('[contasAPagarService] somarValorPagoEventos error:', error)
    return 0
  }

  return (data ?? []).reduce((soma, e) => soma + (e.valor_pago ?? 0), 0)
}

// ============================================================
// ── SEÇÃO 2: ESCRITA (sempre via client admin, a partir de rotas de API) ──
// ============================================================

// ============================================================
// registrarEvento()
// Insere uma linha imutável no log de auditoria do título — tabela
// apenas-INSERT, nunca UPDATE/DELETE
// ============================================================
export async function registrarEvento(
  tituloId: string,
  tipo: TipoEventoPagar,
  descricao: string,
  valorPago: number | null = null,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from(TABELA_EVENTOS)
    .insert({ titulo_id: tituloId, tipo, descricao, valor_pago: valorPago })

  if (error) {
    // Não lança — falha no log não deve abortar a operação principal
    // (mesma filosofia de contasReceberService.registrarEvento)
    console.error('[contasAPagarService] registrarEvento error:', error)
  }
}

// ============================================================
// criarTitulosDePagar()
// Cria automaticamente um título em contas_a_pagar para cada
// despesas_parcela de uma Despesa recém-criada — espelha
// criarTitulosDeReceita() de lib/contasReceberService.ts
// (Especificação Módulo Contas a Pagar §1: "este módulo consome
// diretamente a saída do módulo Despesas [despesas_parcelas], da
// mesma forma que Contas a Receber consome receitas_duplicatas/
// receitas via criarTitulosDeReceita").
//
// QA fix (achado em uso real, sessão de fechamento do módulo): esta
// peça nunca foi construída durante o build original — o único
// código que inseria em contas_a_pagar era o Motor de Conciliação
// (lib/pagar/motorConciliacao.ts), e só para os títulos sintéticos
// do roster (sócios/Maycon-CNPJ). Toda Despesa comum lançada nunca
// gerava título nenhum, então nunca aparecia em Contas a Pagar —
// o Motor de Conciliação concilia pagamentos contra títulos que
// precisam existir primeiro, e essa ponte não existia.
//
// Regra de cardinalidade (Especificação §2.1, "Regra crítica",
// confirmada explicitamente com o usuário — não alterar): uma
// despesas_parcela gera EXATAMENTE um contas_a_pagar, nunca mais de
// um. Dedupe por despesa_parcela_id — inclui títulos cancelados no
// filtro de já-existe (cancelado bloqueia recriação, mesmo princípio
// de verificarDuplicataXml em Contas a Receber). A constraint UNIQUE
// parcial de contas_a_pagar (M5, sql/05_migration_contas_a_pagar_
// idempotente.sql) é o backstop no banco — esta checagem aqui evita
// o round-trip de erro antes de chegar lá.
//
// Erros são coletados e retornados — NÃO lança exceção global para
// não desfazer a Despesa já gravada com sucesso (mesma filosofia de
// criarTitulosDeReceita).
//
// Chamado por: pages/api/despesas/confirmar.ts, logo após
// criarDespesaComParcelas()
// ============================================================
export async function criarTitulosDePagar(params: {
  despesa: {
    id:                      string
    documento_numero?:       string | null
    documento_data_emissao?: string | null
    favorecido_nome:         string
    favorecido_cnpj_cpf?:    string | null
    favorecido_endereco?:    string | null
    fornecedor_id:           number
  }
  parcelas: {
    id:               string
    valor:            number
    data_vencimento:  string
    nosso_numero?:    string | null
    linha_digitavel?: string | null
  }[]
  client?: SupabaseClient // permite uso a partir de API routes com client admin — padrão é o client do browser
}): Promise<{ criados: number; erros: string[] }> {
  const { despesa, parcelas, client = supabase } = params
  let criados = 0
  const erros: string[] = []

  for (const parcela of parcelas) {
    try {
      // ── Dedupe por despesa_parcela_id ──────────────────────
      const { data: existente, error: erroChecagem } = await client
        .from(TABELA)
        .select('id')
        .eq('despesa_parcela_id', parcela.id)
        .maybeSingle()

      if (erroChecagem) {
        erros.push(`Parcela ${parcela.id}: falha ao checar duplicidade — ${erroChecagem.message}`)
        continue
      }
      if (existente) {
        // Título já existe para esta parcela — pula silenciosamente
        continue
      }

      // data_processamento: usa a data de emissão do documento de
      // origem quando disponível (mesmo princípio de
      // criarTitulosDeReceita, que usa receita.data_emissao);
      // fallback para a data de vencimento da própria parcela quando
      // a Despesa não tem data de emissão de documento (ex: lançamento manual)
      const dataProcessamento = (despesa.documento_data_emissao ?? parcela.data_vencimento).slice(0, 10)

      const titulo: ContaAPagarInsert = {
        despesa_parcela_id:  parcela.id,
        despesa_id:          despesa.id,
        fornecedor_id:       despesa.fornecedor_id,
        numero_documento:    despesa.documento_numero ?? null,
        data_vencimento:     parcela.data_vencimento,
        data_processamento:  dataProcessamento,
        valor:               parcela.valor,
        // Herdados da parcela — mesmo princípio de criarTitulosDeReceita
        // (nosso_numero/linha_digitavel podem já vir preenchidos de
        // boletos emitidos, ou ficam null até confirmação via Relatório BB)
        nosso_numero:        parcela.nosso_numero ?? null,
        linha_digitavel:     parcela.linha_digitavel ?? null,
        status:              'em_aberto',
        data_baixa:          null,
        forma_baixa:         null,
        // Dados do favorecido/credor — imutáveis após criação, mesmo
        // princípio de cliente_nome em Contas a Receber
        favorecido_nome:        despesa.favorecido_nome,
        favorecido_cnpj_cpf:    despesa.favorecido_cnpj_cpf ?? null,
        favorecido_endereco:    despesa.favorecido_endereco ?? null,
        observacoes:         null,
        deleted_at:          null,
      }

      const { data: tituloInserido, error: erroInsert } = await client
        .from(TABELA)
        .insert(titulo)
        .select('id')
        .single()

      if (erroInsert || !tituloInserido) {
        erros.push(`Parcela ${parcela.id}: falha ao criar título — ${erroInsert?.message ?? 'sem retorno do insert'}`)
        continue
      }

      await registrarEvento(
        tituloInserido.id,
        'criado',
        `Título criado automaticamente a partir da Despesa (parcela ${parcela.id}).`,
        null,
        client,
      )

      criados++

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[contasAPagarService] criarTitulosDePagar parcela error:', msg)
      erros.push(`Parcela ${parcela.id}: ${msg}`)
    }
  }

  return { criados, erros }
}

// ============================================================
// registrarBaixaManual()
// Baixa manual avulsa — SÓ para títulos já lançados via Despesas
// (Especificação §7, Non-negotiable: "nunca cria Despesa nova a
// partir desta tela"). Suporta acúmulo parcial: soma o valorBaixa
// aos eventos já existentes, decide entre pago_parcial e pago —
// MESMA lógica de acúmulo do motor de conciliação, mas SEM a etapa
// de excedente/despesa complementar (restrição explícita da spec:
// baixa manual nunca cria Despesa nova, então um excedente aqui
// simplesmente não é criado como título novo — fica só registrado
// no evento de baixa; UI deve orientar o usuário a não sobrepagar).
// Chamado por: pages/api/pagar/baixar-manual.ts
// ============================================================
export async function registrarBaixaManual(
  id: string,
  formaBaixa: FormaBaixaPagar,
  valorBaixa: number,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { data: tituloAtual, error: erroBusca } = await client
    .from(TABELA)
    .select('valor')
    .eq('id', id)
    .single()

  if (erroBusca || !tituloAtual) {
    throw new Error(`Falha ao buscar título para baixa manual: ${erroBusca?.message ?? 'título não encontrado'}`)
  }

  const somaAnterior = await somarValorPagoEventosComClient(id, client)
  const novaSoma = somaAnterior + valorBaixa
  const dataBaixa = new Date().toISOString().slice(0, 10)

  const novoStatus: StatusTituloPagar = novaSoma < tituloAtual.valor - 0.01 ? 'pago_parcial' : 'pago'

  const camposUpdate: Record<string, unknown> = { status: novoStatus }
  if (novoStatus === 'pago') {
    camposUpdate.data_baixa = dataBaixa
    camposUpdate.forma_baixa = formaBaixa
  }

  const { error: erroUpdate } = await client.from(TABELA).update(camposUpdate).eq('id', id)

  if (erroUpdate) {
    console.error('[contasAPagarService] registrarBaixaManual error:', erroUpdate)
    throw new Error(erroUpdate.message)
  }

  const tipoEvento: TipoEventoPagar = novoStatus === 'pago' ? 'baixa_total' : 'baixa_parcial'
  await registrarEvento(
    id,
    tipoEvento,
    `Baixa manual de ${formatarMoeda(valorBaixa)} registrada em ${formatarDataBR(dataBaixa)}.`,
    valorBaixa,
    client,
  )
}

// QA fix: exportada (antes era interna) para reaproveitar em
// pages/api/pagar/confirmar-conciliacao.ts, que precisa do mesmo
// cálculo de acúmulo (soma dos eventos de baixa) que registrarBaixaManual
// já usa — mesmo princípio de não duplicar a lógica de "quanto já foi
// pago" em dois lugares diferentes
export async function somarValorPagoEventosComClient(tituloId: string, client: SupabaseClient): Promise<number> {
  const { data, error } = await client
    .from(TABELA_EVENTOS)
    .select('valor_pago')
    .eq('titulo_id', tituloId)
    .not('valor_pago', 'is', null)

  if (error) {
    throw new Error(`Falha ao somar eventos de baixa: ${error.message}`)
  }

  return (data ?? []).reduce((soma, e) => soma + (e.valor_pago ?? 0), 0)
}

// ============================================================
// atualizarTitulo()
// Atualiza campos editáveis de um título (observações, status manual,
// etc.) — mesmo padrão livre de contasReceberService.editarTitulo
// (sem trava de status, já que o campo Status é editável no modal)
// Chamado por: pages/api/pagar/atualizar.ts
// ============================================================
export async function atualizarTitulo(
  titulo: ContaAPagarUpdate,
  client: SupabaseClient = supabase,
): Promise<ContaAPagar> {
  const { id, ...campos } = titulo

  const { data, error } = await client
    .from(TABELA)
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[contasAPagarService] atualizarTitulo error:', error)
    throw new Error(error.message)
  }

  return data as ContaAPagar
}

// ============================================================
// cancelarTitulo()
// Soft-delete: status='cancelado' + deleted_at preenchido — nunca
// DELETE físico
// Chamado por: pages/api/pagar/cancelar.ts
// ============================================================
export async function cancelarTitulo(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client
    .from(TABELA)
    .update({ status: 'cancelado', deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[contasAPagarService] cancelarTitulo error:', error)
    throw new Error(error.message)
  }

  await registrarEvento(id, 'cancelado', 'Título cancelado pelo usuário.', null, client)
}

// ============================================================
// reabrirTitulo()
// Reverte cancelamento ou baixa — status volta para em_aberto
// Chamado por: pages/api/pagar/reabrir.ts
// ============================================================
export async function reabrirTitulo(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client
    .from(TABELA)
    .update({ status: 'em_aberto', deleted_at: null, data_baixa: null, forma_baixa: null })
    .eq('id', id)

  if (error) {
    console.error('[contasAPagarService] reabrirTitulo error:', error)
    throw new Error(error.message)
  }

  await registrarEvento(id, 'reaberto', 'Título reaberto manualmente pelo usuário.', null, client)
}

// ============================================================
// ── SEÇÃO 3: ROSTER DE BENEFICIÁRIOS (RosterBeneficiariosModal) ──
// ============================================================

// ============================================================
// buscarRosterCompleto()
// Lista todos os registros de beneficiarios_pessoais — tela de
// manutenção mostra TODOS, não só os que já têm regra preenchida
// (usuário pode configurar uma regra nova numa linha que ainda não tem)
// Chamado por: RosterBeneficiariosModal.tsx
// ============================================================
export async function buscarRosterCompleto(client: SupabaseClient = supabase): Promise<BeneficiarioPessoalRosterPagar[]> {
  const { data, error } = await client
    .from(TABELA_ROSTER)
    .select('*')
    .order('nome', { ascending: true })

  if (error) {
    console.error('[contasAPagarService] buscarRosterCompleto error:', error)
    throw new Error(error.message)
  }

  return (data as BeneficiarioPessoalRosterPagar[]) ?? []
}

// ============================================================
// atualizarBeneficiarioRoster()
// Edita qualquer campo de uma linha existente do roster — efeito
// imediato nas próximas conciliações, sem necessidade de deploy
// (Especificação §5, Function: Manutenção do Roster)
// Chamado por: pages/api/pagar/roster.ts
// ============================================================
export async function atualizarBeneficiarioRoster(
  id: string,
  campos: Partial<Omit<BeneficiarioPessoalRosterPagar, 'id'>>,
  client: SupabaseClient = supabase,
): Promise<BeneficiarioPessoalRosterPagar> {
  const { data, error } = await client
    .from(TABELA_ROSTER)
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[contasAPagarService] atualizarBeneficiarioRoster error:', error)
    throw new Error(error.message)
  }

  return data as BeneficiarioPessoalRosterPagar
}

// ============================================================
// criarBeneficiarioRoster()
// Cria uma nova linha no roster — caso futuro sócio/prestador precise
// ser adicionado sem passar por SQL direto. NÃO existe função de
// exclusão nesta primeira versão: o roster é compartilhado com a
// classificação de origem do módulo Despesas (já em produção), e
// remover uma linha poderia quebrar a atribuição de despesas
// passadas — decisão de cautela, não pedida explicitamente na
// Especificação, sinalizar se precisar de exclusão no futuro.
// Chamado por: pages/api/pagar/roster.ts
// ============================================================
export async function criarBeneficiarioRoster(
  dados: Omit<BeneficiarioPessoalRosterPagar, 'id' | 'created_at' | 'updated_at'>,
  client: SupabaseClient = supabase,
): Promise<BeneficiarioPessoalRosterPagar> {
  const { data, error } = await client
    .from(TABELA_ROSTER)
    .insert(dados)
    .select()
    .single()

  if (error) {
    console.error('[contasAPagarService] criarBeneficiarioRoster error:', error)
    throw new Error(error.message)
  }

  return data as BeneficiarioPessoalRosterPagar
}

// ============================================================
// ── SEÇÃO 4: FUNÇÕES UTILITÁRIAS EXPORTADAS ──
// Duplicadas deliberadamente de contasReceberService.ts/despesasService.ts
// — mesmo padrão de isolamento entre módulos já usado no projeto
// ============================================================

export function formatarCnpjCpf(valor: string | null | undefined): string {
  if (!valor) return ''
  const digits = valor.replace(/[^0-9]/g, '')
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return valor
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarDataBR(iso: string): string {
  if (!iso) return ''
  const partes = iso.slice(0, 10).split('-')
  if (partes.length !== 3) return iso
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

// ============================================================
// isTituloVencido()
// true se o título está vencido E em_aberto — usado para row styles
// vermelhos na tabela
// ============================================================
export function isTituloVencido(titulo: ContaAPagar): boolean {
  if (titulo.status !== 'em_aberto') return false
  const hoje = new Date().toISOString().slice(0, 10)
  return titulo.data_vencimento < hoje
}

// ============================================================
// isTituloNearVencimento()
// true se vence entre hoje e hoje+5 dias E está em_aberto — row
// styles âmbar, mesmo padrão de Contas a Receber
// ============================================================
export function isTituloNearVencimento(titulo: ContaAPagar): boolean {
  if (titulo.status !== 'em_aberto') return false
  const hoje = new Date()
  const limite = new Date()
  limite.setDate(hoje.getDate() + 5)
  const dataHoje = hoje.toISOString().slice(0, 10)
  const dataLim = limite.toISOString().slice(0, 10)
  return titulo.data_vencimento >= dataHoje && titulo.data_vencimento <= dataLim
}

// ============================================================
// Re-exporta tipo de evento para uso nos componentes
// ============================================================
export type { ContaAPagarEvento }
