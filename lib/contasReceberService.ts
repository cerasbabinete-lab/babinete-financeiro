// ============================================================
// lib/contasReceberService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Todas as operações de dados do módulo Contas a Receber
//         Camada de serviço entre UI e Supabase
// Conecta com: supabase.ts, types/contasReceber.ts,
//              ContasReceberTabela.tsx, ContasReceberModal.tsx,
//              ContasReceberMobileList.tsx, ContasReceberHeader.tsx,
//              ContasReceberModalAvisos.tsx, ImportarRetornoPreviewModal.tsx,
//              txtBbParser.ts, remParser.ts, retParser.ts, xlsParser.ts
// ============================================================

import { supabase } from '@/lib/supabase'
import type {
  ContaReceber,
  ContaReceberInsert,
  ContaReceberUpdate,
  ContaReceberEvento,
  RemessaImportada,
  FiltrosContasReceber,
  StatusTitulo,
  TipoEvento,
  TipoRemessa,
  TituloAvisoVencimento,
} from '@/types/contasReceber'
import { MAPEAMENTO_OCORRENCIAS_RET } from '@/types/contasReceber'
import type {
  RegistroTxtBb,
  RegistroRemSegmentoP,
  RegistroXls,
  ResultadoImportTxtBb,
  ResultadoImportRem,
  ResultadoImportRet,
  ResultadoImportXls,
  ResultadoLinhaImport,
} from '@/types/contasReceber'
import { MAPEAMENTO_SITUACAO_XLS } from '@/types/contasReceber'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA         = 'contas_receber'           // Tabela principal de títulos
const TABELA_EVENTOS = 'contas_receber_eventos'   // Log de auditoria por título
const TABELA_REMESSA = 'remessas_importadas'      // Registro de arquivos importados

// ============================================================
// ── SEÇÃO 1: LEITURA / LISTAGEM ──
// ============================================================

// ============================================================
// buscarTitulos()
// Retorna lista de títulos aplicando filtros ativos
// Inclui join com eventos para exibir histórico no modal
// Ordenado por data_vencimento ASC (vence mais cedo primeiro)
// Chamado por: app/receber/page.tsx no useEffect e filtros
// ============================================================
export async function buscarTitulos(filtros: FiltrosContasReceber): Promise<ContaReceber[]> {
  // Monta query base com join de eventos ordenados por created_at
  let query = supabase
    .from(TABELA)
    .select(`
      *,
      eventos:contas_receber_eventos(*)
    `)

  // Busca textual: nome, CNPJ/CPF (dígitos only), nº doc, nosso número
  if (filtros.busca && filtros.busca.trim() !== '') {
    const termo    = `%${filtros.busca.trim()}%`                         // Para campos texto
    const termoDig = `%${filtros.busca.trim().replace(/[^0-9]/g, '')}%` // Para CNPJ/CPF
    const partes: string[] = [
      `cliente_nome.ilike.${termo}`,         // Razão social do sacado
      `cliente_fantasia.ilike.${termo}`,     // Nome fantasia
      `numero_documento.ilike.${termo}`,     // Nº do documento (ex: 005414/1)
      `nosso_numero.ilike.${termo}`,         // Nosso Número BB
    ]
    // CNPJ/CPF: busca por dígitos puros para ignorar pontuação
    if (termoDig !== '%%') {
      partes.push(`cliente_cpf_cnpj.ilike.${termoDig}`)
    }
    query = query.or(partes.join(','))
  }

  // Filtro data vencimento início — inclui o dia
  if (filtros.vencimentoDe && filtros.vencimentoDe !== '') {
    query = query.gte('data_vencimento', filtros.vencimentoDe)
  }

  // Filtro data vencimento fim — inclui o dia
  if (filtros.vencimentoAte && filtros.vencimentoAte !== '') {
    query = query.lte('data_vencimento', filtros.vencimentoAte)
  }

  // Filtro por status — string exata do tipo StatusTitulo
  if (filtros.status && filtros.status !== '') {
    query = query.eq('status', filtros.status)
  }

  // Ordenação dupla: ativos (deleted_at IS NULL) primeiro, depois cancelados
  // M-3 FIX: deleted_at nulls-first coloca ativos antes dos cancelados
  // data_vencimento ordena dentro de cada grupo (mais cedo primeiro)
  query = query
    .order('deleted_at', { ascending: true, nullsFirst: true })
    .order('data_vencimento', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('[contasReceberService] buscarTitulos error:', error)
    throw new Error(error.message)
  }

  return (data as ContaReceber[]) ?? []
}

// ============================================================
// contarTitulos()
// Retorna o total de títulos ativos (deleted_at IS NULL)
// Exibido no header como "X títulos"
// Chamado por: app/receber/page.tsx após cada operação
// ============================================================
export async function contarTitulos(): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null) // Conta apenas títulos não cancelados

  if (error) {
    console.error('[contasReceberService] contarTitulos error:', error)
    return 0
  }

  return count ?? 0
}

// ============================================================
// ContadoresTitulos
// Estrutura com contagens por grupo de status para o painel
// ============================================================
export interface ContadoresTitulos {
  emAberto:    number  // status = 'em_aberto', não vencido
  atrasados:   number  // status = 'em_aberto', data_vencimento < hoje
  baixados:    number  // status = 'pago' ou 'recebido_pix_ted'
  emCartorio:  number  // status = 'enviado_cartorio'
  protestados: number  // status = 'protestado'
  cancelados:  number  // deleted_at IS NOT NULL (status = 'cancelado')
}

// ============================================================
// buscarContadoresTitulos()
// Retorna contagens agrupadas por status para o banner de resumo
// Chamado por: app/receber/page.tsx após cada operação
// ============================================================
export async function buscarContadoresTitulos(): Promise<ContadoresTitulos> {
  const hoje = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const { data, error } = await supabase
    .from(TABELA)
    .select('status, deleted_at, data_vencimento')

  if (error) {
    console.error('[contasReceberService] buscarContadoresTitulos error:', error)
    return { emAberto: 0, atrasados: 0, baixados: 0, emCartorio: 0, protestados: 0, cancelados: 0 }
  }

  const registros = (data ?? []) as {
    status:          string
    deleted_at:      string | null
    data_vencimento: string
  }[]

  let emAberto    = 0
  let atrasados   = 0
  let baixados    = 0
  let emCartorio  = 0
  let protestados = 0
  let cancelados  = 0

  for (const r of registros) {
    if (r.deleted_at !== null) {
      cancelados++
      continue
    }
    if (r.status === 'em_aberto') {
      if (r.data_vencimento < hoje) {
        atrasados++
      } else {
        emAberto++
      }
    } else if (r.status === 'pago' || r.status === 'recebido_pix_ted') {
      baixados++
    } else if (r.status === 'enviado_cartorio') {
      emCartorio++
    } else if (r.status === 'protestado') {
      protestados++
    }
  }

  return { emAberto, atrasados, baixados, emCartorio, protestados, cancelados }
}

// ============================================================
// ContadoresReceitasAberto
// Estrutura com NFs e duplicatas em aberto para banner Receitas
// ============================================================
export interface ContadoresReceitasAberto {
  nfsComAberto:       number  // NFs distintas com ao menos 1 título em_aberto
  duplicatasEmAberto: number  // Total de títulos em_aberto (inclui atrasados)
}

// ============================================================
// buscarContadoresReceitasAberto()
// Conta NFs distintas e duplicatas totais com status em_aberto
// Chamado por: app/receitas/page.tsx para exibir o banner de resumo
// ============================================================
export async function buscarContadoresReceitasAberto(): Promise<ContadoresReceitasAberto> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('receita_id')
    .eq('status', 'em_aberto')
    .is('deleted_at', null)
    .not('receita_id', 'is', null)

  if (error) {
    console.error('[contasReceberService] buscarContadoresReceitasAberto error:', error)
    return { nfsComAberto: 0, duplicatasEmAberto: 0 }
  }

  const registros = (data ?? []) as { receita_id: string }[]
  const nfsDistintas = new Set(registros.map(r => r.receita_id))

  return {
    nfsComAberto:       nfsDistintas.size,
    duplicatasEmAberto: registros.length,
  }
}

// ============================================================
// buscarTituloPorId()
// Retorna um título completo com eventos ordenados por data
// Usado para pré-preencher o modal de edição/visualização
// Chamado por: ContasReceberTabela.tsx ao abrir modal
// ============================================================
export async function buscarTituloPorId(id: string): Promise<ContaReceber | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(`
      *,
      eventos:contas_receber_eventos(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[contasReceberService] buscarTituloPorId error:', error)
    return null
  }

  // Ordena eventos por created_at ASC para exibir timeline cronológica
  const titulo = data as ContaReceber
  if (titulo.eventos) {
    titulo.eventos = titulo.eventos.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return titulo
}

// ============================================================
// buscarTitulosNearVencimento()
// Retorna títulos em_aberto com vencimento entre hoje e hoje+5
// Usados no banner de alerta e na modal ContasReceberModalAvisos
// Chamado por: app/receber/page.tsx no useEffect inicial
// ============================================================
export async function buscarTitulosNearVencimento(): Promise<TituloAvisoVencimento[]> {
  const hoje   = new Date()
  const limite = new Date()
  limite.setDate(hoje.getDate() + 5) // 5 dias à frente

  const dataHoje  = hoje.toISOString().slice(0, 10)   // YYYY-MM-DD
  const dataLimit = limite.toISOString().slice(0, 10) // YYYY-MM-DD

  const { data, error } = await supabase
    .from(TABELA)
    .select('id, numero_documento, cliente_nome, data_vencimento, valor, cliente_email')
    .eq('status', 'em_aberto')         // Apenas títulos em aberto
    .is('deleted_at', null)            // Exclui cancelados
    .gte('data_vencimento', dataHoje)  // Vence a partir de hoje
    .lte('data_vencimento', dataLimit) // Até 5 dias
    .order('data_vencimento', { ascending: true })

  if (error) {
    console.error('[contasReceberService] buscarTitulosNearVencimento error:', error)
    return []
  }

  // Converte para TituloAvisoVencimento com campos editáveis de UI
  return (data ?? []).map((t: { id: string; numero_documento: string; cliente_nome: string; data_vencimento: string; valor: number; cliente_email: string | null }) => ({
    id:               t.id,
    numero_documento: t.numero_documento,
    cliente_nome:     t.cliente_nome,
    data_vencimento:  t.data_vencimento,
    valor:            t.valor,
    emailEditavel:    t.cliente_email ?? '', // Pré-preenchido — editável na modal
    selecionado:      true,                  // Todos selecionados por padrão
  }))
}

// ============================================================
// buscarReceitas()
// Retorna lista simplificada de receitas para o seletor
// de NF-e no modal de Novo Lançamento manual
// Retorna: id, numero_nf, data_emissao, cliente_nome, valor_nf
// Chamado por: ContasReceberModal.tsx no modo 'novo'
// ============================================================
export async function buscarReceitasParaVinculo(): Promise<{
  id: string
  numero_nf: number
  data_emissao: string
  cliente_nome: string
  valor_nf: number
  duplicatas: { numero_duplicata: string; data_vencimento: string; valor: number }[]
}[]> {
  const { data, error } = await supabase
    .from('receitas')
    .select(`
      id,
      numero_nf,
      data_emissao,
      cliente_nome,
      valor_nf,
      duplicatas:receitas_duplicatas(numero_duplicata, data_vencimento, valor)
    `)
    .order('data_emissao', { ascending: false })
    .limit(200) // Limita para não sobrecarregar o select da UI

  if (error) {
    console.error('[contasReceberService] buscarReceitasParaVinculo error:', error)
    return []
  }

  return data ?? []
}

// ============================================================
// ── SEÇÃO 2: CRIAÇÃO / EDIÇÃO / CANCELAMENTO ──
// ============================================================

// ============================================================
// criarTitulosDeReceita()
// Cria automaticamente um título em contas_receber para cada
// duplicata de uma NF-e recém-importada em Receitas.
// Ponto de entrada: ImportarXmlButton.tsx após criarReceita().
//
// Fluxo:
//   1. Para cada duplicata: verificar deduplicação por duplicata_id
//   2. Se já existe (ou cancelado): pular — não recria
//   3. Se não existe: criar ContaReceber com status 'em_aberto'
//
// Erros são coletados e retornados — NÃO lança exceção global
// para não desfazer a Receita já gravada com sucesso.
//
// Chamado por: ImportarXmlButton.tsx após criarReceita()
// ============================================================
export async function criarTitulosDeReceita(params: {
  receita: {
    id:               string
    numero_nf:        number
    cliente_nome?:    string
    cliente_cpf_cnpj?: string
    cliente_fantasia?: string | null
    cliente_email?:    string | null
    cliente_fone?:     string | null
    cliente_municipio?: string | null
    cliente_uf?:       string | null
    cliente_id?:       number | null
  }
  duplicatas: {
    id:               string   // UUID gerado — retornado pelo .select() do insert
    numero_duplicata: string
    data_vencimento:  string
    valor:            number
  }[]
}): Promise<{ criados: number; erros: string[] }> {
  const { receita, duplicatas } = params
  let criados = 0
  const erros: string[] = []

  // Monta o número do documento no padrão MIGRATE
  // CRÍTICO: o MIGRATE omite a barra e o número da parcela quando a NF tem só 1 duplicata
  //   NF com 1 parcela:  TXT BB → "005413"    (sem barra)
  //   NF com 2+ parcelas: TXT BB → "005414/1", "005414/2" (com barra e número da parcela)
  // Se gerarmos "005413/1" para parcela única, a busca do import TXT BB não encontrará o título
  // e criará um avulso duplicado, deixando o nosso_numero em branco no título original.
  const numNfPad      = String(receita.numero_nf).padStart(6, '0')
  const temMultiplas  = duplicatas.length > 1  // true → usa barra; false → sem barra

  for (const dup of duplicatas) {
    try {
      // ── Deduplicação por duplicata_id ──────────────────────
      // Inclui registros cancelados — cancelado BLOQUEIA re-criação
      const jaExiste = await verificarDuplicataXml(dup.id)
      if (jaExiste) {
        // Título já existe (ou existiu e foi cancelado) — pular silenciosamente
        continue
      }

      // ── Monta o título ────────────────────────────────────
      // Remove zero-padding da parcela para bater com o formato MIGRATE do TXT BB
      // "001" → 1 → "1"; fallback: usa o valor original se não for numérico
      const parcelaNum    = parseInt(dup.numero_duplicata, 10)
      const parcelaSufixo = isNaN(parcelaNum) ? dup.numero_duplicata : String(parcelaNum)

      // numero_documento segue o padrão MIGRATE:
      //   parcela única  → "005413"   (sem barra — MIGRATE não adiciona /1)
      //   parcelas múlt. → "005414/1" (com barra e número sem zero-padding)
      const numeroDocumento = temMultiplas
        ? `${numNfPad}/${parcelaSufixo}`
        : numNfPad

      const titulo: ContaReceberInsert = {
        duplicata_id:       dup.id,
        receita_id:         receita.id,
        cliente_id:         receita.cliente_id ?? null,
        numero_documento:   numeroDocumento,  // Formato MIGRATE: "005413" ou "005414/1"
        numero_duplicata:   dup.numero_duplicata,               // Ex: "001", "002"
        data_vencimento:    dup.data_vencimento,                // ISO date da duplicata
        data_processamento: new Date().toISOString().slice(0, 10), // Hoje
        valor:              dup.valor,                          // Valor da parcela
        status:             'em_aberto',                        // Estado inicial
        // nosso_numero e linha_digitavel ficam null até import TXT BB / REM
        nosso_numero:       null,
        linha_digitavel:    null,
        // Dados históricos do sacado — imutáveis após criação
        cliente_nome:       receita.cliente_nome      ?? '',
        cliente_cpf_cnpj:   receita.cliente_cpf_cnpj ?? '',
        cliente_fantasia:   receita.cliente_fantasia  ?? null,
        cliente_email:      receita.cliente_email     ?? null,
        cliente_fone:       receita.cliente_fone      ?? null,
        cliente_municipio:  receita.cliente_municipio ?? null,
        cliente_uf:         receita.cliente_uf        ?? null,
        observacoes:        null,
        deleted_at:         null,
      }

      // ── Insere e registra evento de criação ──────────────
      await criarTitulo(
        titulo,
        `Título criado automaticamente via import XML — NF-e ${receita.numero_nf}, duplicata ${dup.numero_duplicata}.`,
      )

      criados++

    } catch (err: unknown) {
      // Erro na duplicata individual — coleta e continua para as demais
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[contasReceberService] criarTitulosDeReceita duplicata error:', msg)
      erros.push(`Duplicata ${dup.numero_duplicata}: ${msg}`)
    }
  }

  return { criados, erros }
}
// Usado tanto pelo import bancário quanto pelo lançamento manual
// Chamado por: ContasReceberModal.tsx (modo novo),
//              processarImportTxtBb(), processarImportRem()
// ============================================================
export async function criarTitulo(
  titulo: ContaReceberInsert,
  descricaoEvento: string,
): Promise<ContaReceber> {
  // 1. Insere o título na tabela principal
  const { data, error } = await supabase
    .from(TABELA)
    .insert(titulo)
    .select()
    .single()

  if (error) {
    console.error('[contasReceberService] criarTitulo error:', error)
    throw new Error(error.message)
  }

  const novoTitulo = data as ContaReceber

  // 2. Registra evento de criação no log de auditoria
  await registrarEvento(novoTitulo.id, 'criado', descricaoEvento)

  return novoTitulo
}

// ============================================================
// editarTitulo()
// Atualiza campos editáveis de um título (email, obs, status, etc.)
// H-5/C FIX: títulos com qualquer status — inclusive 'pago' — agora
// podem ser editados livremente. A trava anterior bloqueava edição
// de títulos pagos via RET; removida a pedido do usuário, já que o
// campo Status passou a ser editável manualmente no modal e a
// reversão de baixa depende de poder alterá-lo a qualquer momento.
// Chamado por: ContasReceberModal.tsx (modo editar)
// ============================================================
export async function editarTitulo(titulo: ContaReceberUpdate): Promise<ContaReceber> {
  const { id, ...campos } = titulo // Separa o id dos campos a atualizar

  // Executa o UPDATE com os campos permitidos — sem checagem prévia de status
  const { data, error } = await supabase
    .from(TABELA)
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[contasReceberService] editarTitulo error:', error)
    throw new Error(error.message)
  }

  return data as ContaReceber
}

// ============================================================
// registrarBaixaManual()
// Registra baixa por PIX ou Transferência no título
// Atualiza: status → recebido_pix_ted, data_baixa, forma_baixa
// Chamado por: ContasReceberModal.tsx ao confirmar "Baixar"
// ============================================================
export async function registrarBaixaManual(
  id: string,
  formaBaixa: 'pix' | 'transferencia',
): Promise<void> {
  const dataBaixa = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Atualiza o título com os dados da baixa manual
  const { error } = await supabase
    .from(TABELA)
    .update({
      status:      'recebido_pix_ted',  // Status específico para baixa manual
      data_baixa:  dataBaixa,           // Data de hoje
      forma_baixa: formaBaixa,          // 'pix' ou 'transferencia'
    })
    .eq('id', id)

  if (error) {
    console.error('[contasReceberService] registrarBaixaManual error:', error)
    throw new Error(error.message)
  }

  // Log de auditoria com detalhe da forma de baixa
  const formaLabel = formaBaixa === 'pix' ? 'PIX' : 'Transferência'
  await registrarEvento(
    id,
    'baixa_manual',
    `Baixa manual registrada em ${formatarDataBR(dataBaixa)} via ${formaLabel}.`,
  )
}

// ============================================================
// registrarBaixaInline()
// Baixa manual simplificada — usada pelo botão "Baixar" inline
// na coluna de ações da listagem (tabela e mobile), sem perguntar
// a forma de recebimento. Aplica data = hoje e valor = valor total
// do título automaticamente. forma_baixa = 'manual' diferencia esse
// fluxo de registrarBaixaManual() (PIX/Transferência, usado no modal)
// Chamado por: ContasReceberTabela.tsx e ContasReceberMobileList.tsx
// após confirmação inline "Deseja confirmar a baixa deste título?"
// ============================================================
export async function registrarBaixaInline(id: string): Promise<void> {
  const dataBaixa = new Date().toISOString().slice(0, 10) // YYYY-MM-DD de hoje

  // Atualiza o título — status 'pago' (mesmo status usado pela baixa via RET,
  // mantendo consistência com isTituloVencido/buscarContadoresTitulos, que
  // tratam baixa como concluída independente da forma)
  const { error } = await supabase
    .from(TABELA)
    .update({
      status:      'pago',     // Status final — título liquidado
      data_baixa:  dataBaixa,  // Data de hoje, conforme definido no brainstorm
      forma_baixa: 'manual',   // Baixa inline rápida — sem forma específica
    })
    .eq('id', id)

  if (error) {
    console.error('[contasReceberService] registrarBaixaInline error:', error)
    throw new Error(error.message)
  }

  // Log de auditoria — mesmo tipo de evento da baixa manual via modal
  await registrarEvento(
    id,
    'baixa_manual',
    `Baixa rápida registrada em ${formatarDataBR(dataBaixa)} (confirmação inline).`,
  )
}


// ============================================================
// reabrirTitulo()
// Reverte um título cancelado ou com baixa manual para em_aberto
// Limpa: deleted_at, data_baixa, forma_baixa
// Chamado por: ContasReceberModal.tsx no modo editar
// ============================================================
export async function reabrirTitulo(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABELA)
    .update({
      status:      'em_aberto', // Retorna ao estado inicial
      deleted_at:  null,        // Remove o soft-delete se estava cancelado
      data_baixa:  null,        // Limpa data de liquidação
      forma_baixa: null,        // Limpa forma de liquidação
    })
    .eq('id', id)

  if (error) {
    console.error('[contasReceberService] reabrirTitulo error:', error)
    throw new Error(error.message)
  }

  await registrarEvento(id, 'reaberto', 'Título reaberto manualmente pelo usuário.')
}

// ============================================================
// cancelarTitulo()
// Soft-delete: seta deleted_at e status = cancelado
// NUNCA faz DELETE físico — título fica visível como cancelado
// Cancelados BLOQUEIAM re-importação via TXT BB / REM / RET
// Chamado por: ContasReceberModal.tsx ao confirmar cancelamento
// ============================================================
export async function cancelarTitulo(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABELA)
    .update({
      status:     'cancelado',    // Badge cinza na listagem
      deleted_at: new Date().toISOString(), // Marca o momento do cancelamento
    })
    .eq('id', id)

  if (error) {
    console.error('[contasReceberService] cancelarTitulo error:', error)
    throw new Error(error.message)
  }

  await registrarEvento(id, 'cancelado', 'Título cancelado pelo usuário.')
}

// ============================================================
// atualizarEmailTitulo()
// Atualiza o e-mail do sacado em um título específico
// Chamado por: ContasReceberModalAvisos após edição do e-mail
// ============================================================
export async function atualizarEmailTitulo(id: string, email: string): Promise<void> {
  const { error } = await supabase
    .from(TABELA)
    .update({ cliente_email: email }) // Apenas o email é atualizado
    .eq('id', id)

  if (error) {
    console.error('[contasReceberService] atualizarEmailTitulo error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// ── SEÇÃO 3: DEDUPLICAÇÃO ──
// ============================================================

// ============================================================
// verificarDuplicataXml()
// Verifica se já existe título com mesma duplicata_id (import XML)
// Inclui registros cancelados — cancelado BLOQUEIA re-import
// Chamado por: processarImportTxtBb() e criarTitulo() no modo XML
// ============================================================
export async function verificarDuplicataXml(duplicataId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .eq('duplicata_id', duplicataId) // Match exato no FK da duplicata de origem

  if (error) return false
  return (count ?? 0) > 0
}

// ============================================================
// verificarDuplicataManual()
// Verifica duplicata de lançamento manual: receita_id + numero_duplicata
// Inclui cancelados — cancelado BLOQUEIA re-lançamento
// Chamado por: ContasReceberModal.tsx ao salvar novo lançamento manual
// ============================================================
export async function verificarDuplicataManual(
  receitaId: string,
  numeroDuplicata: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .eq('receita_id', receitaId)          // Mesma NF-e
    .eq('numero_duplicata', numeroDuplicata) // Mesma parcela

  if (error) return false
  return (count ?? 0) > 0
}

// ============================================================
// verificarDuplicataBancaria()
// Verifica duplicata de import bancário: nosso_numero + doc + vencimento
// Inclui cancelados — cancelado BLOQUEIA re-import
// Chamado por: processarImportTxtBb() e processarImportRem()
// ============================================================
export async function verificarDuplicataBancaria(
  nossoNumero: string,
  numeroDocumento: string,
  dataVencimento: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .eq('nosso_numero', nossoNumero)
    .eq('numero_documento', numeroDocumento)
    .eq('data_vencimento', dataVencimento)

  if (error) return false
  return (count ?? 0) > 0
}

// ============================================================
// ── SEÇÃO 4: IMPORT BANCÁRIO ──
// ============================================================

// ============================================================
// verificarHashRemessa()
// Verifica se o arquivo já foi importado pelo SHA-256 do conteúdo
// Retorna a data de import anterior ou null se não encontrado
// Chamado por: ContasReceberHeader.tsx antes de processar qualquer arquivo
// ============================================================
export async function verificarHashRemessa(hash: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABELA_REMESSA)
    .select('created_at')
    .eq('hash_arquivo', hash) // Busca pelo hash SHA-256
    .single()

  if (error || !data) return null // null = arquivo não importado antes

  return data.created_at // Retorna data do import anterior para exibir ao usuário
}

// ============================================================
// registrarRemessaImportada()
// Grava o registro do arquivo importado com contadores
// Chamado ao final de cada import (TXT BB, REM, RET)
// ============================================================
export async function registrarRemessaImportada(
  tipo: TipoRemessa,
  nomeArquivo: string,
  hashArquivo: string,
  totalRegistros: number,
  processados: number,
  naoEncontrados: number,
): Promise<void> {
  const { error } = await supabase
    .from(TABELA_REMESSA)
    .insert({
      tipo,
      nome_arquivo:     nomeArquivo,
      hash_arquivo:     hashArquivo,
      total_registros:  totalRegistros,
      processados,
      nao_encontrados:  naoEncontrados,
    })

  if (error) {
    // Não lança — falha no registro não deve abortar o import
    console.error('[contasReceberService] registrarRemessaImportada error:', error)
  }
}

// ============================================================
// processarRegistrosTxtBb()
// Processa array de registros parsed do TXT BB
// Para cada registro: deduplicação → vincula nosso_número a título
// existente ou cria registro avulso se nenhum título encontrado
// Chamado por: ContasReceberHeader.tsx após parse do arquivo
// ============================================================
export async function processarRegistrosTxtBb(
  registros: RegistroTxtBb[],
): Promise<ResultadoImportTxtBb> {
  const detalhes: ResultadoLinhaImport[] = []
  let vinculados     = 0
  let naoEncontrados = 0
  let jaExistentes   = 0
  let avulsosCriados = 0

  for (const reg of registros) {
    // reg.dataVencimento já vem em YYYY-MM-DD do txtBbParser (formatarDDMMYYYY já converteu)
    // NÃO aplicar parseDateDDMMYYYY novamente — causaria dupla conversão corrompendo a data
    const dvenc = reg.dataVencimento

    // 1. Deduplicação bancária: nosso_numero + doc + vencimento
    const jaCadastrado = await verificarDuplicataBancaria(
      reg.nossoNumero,
      reg.numeroDocumento,
      dvenc,
    )

    if (jaCadastrado) {
      // Já existe (ativo ou cancelado) — pula sem processar
      jaExistentes++
      detalhes.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento: reg.numeroDocumento,
        resultado:       'ja_existe',
        descricao:       `Nosso Número ${reg.nossoNumero} já cadastrado — ignorado.`,
      })
      continue
    }

    // 2. Tenta encontrar título existente por numero_documento + data_vencimento
    const { data: encontrado } = await supabase
      .from(TABELA)
      .select('id, nosso_numero')
      .eq('numero_documento', reg.numeroDocumento) // Busca pelo nº do documento
      .eq('data_vencimento', dvenc)                // E pela data de vencimento
      .is('deleted_at', null)                      // Exclui cancelados nesta busca
      .maybeSingle()

    if (encontrado) {
      // 3a. Título encontrado: vincula nosso_numero e linha_digitavel
      const { error: errUpd } = await supabase
        .from(TABELA)
        .update({
          nosso_numero:    reg.nossoNumero,      // Nosso Número do BB
          linha_digitavel: reg.linhaDigitavel ?? null, // Linha digitável para 2ª via
        })
        .eq('id', encontrado.id)

      if (errUpd) {
        detalhes.push({
          nossoNumero:     reg.nossoNumero,
          numeroDocumento: reg.numeroDocumento,
          resultado:       'erro',
          descricao:       `Erro ao vincular: ${errUpd.message}`,
        })
        continue
      }

      // Registra evento de vinculação no histórico do título
      await registrarEvento(
        encontrado.id,
        'nosso_numero_vinculado',
        `Nosso Número ${reg.nossoNumero} vinculado via import TXT BB.`,
      )

      vinculados++
      detalhes.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento: reg.numeroDocumento,
        resultado:       'vinculado',
        descricao:       `Nosso Número ${reg.nossoNumero} vinculado ao título ${reg.numeroDocumento}.`,
      })
    } else {
      // 3b. Nenhum título encontrado: cria registro avulso
      try {
        const novoTitulo: ContaReceberInsert = {
          numero_documento:   reg.numeroDocumento, // H-1 FIX: usar o nº do documento real, não o nosso_numero
          numero_duplicata:   '001',              // Padrão — único no avulso
          data_vencimento:    dvenc,
          data_processamento: new Date().toISOString().slice(0, 10),
          valor:              reg.valor,
          nosso_numero:       reg.nossoNumero,
          linha_digitavel:    reg.linhaDigitavel ?? null,
          status:             'em_aberto',
          cliente_nome:       reg.nomeSacado,
          cliente_cpf_cnpj:   reg.cnpjCpf.replace(/[^0-9]/g, ''), // Dígitos puros
          cliente_municipio:  reg.municipio || null,
          cliente_uf:         reg.uf || null,
        }

        await criarTitulo(
          novoTitulo,
          `Título avulso criado via import TXT BB — sem NF-e correspondente. Nosso Número: ${reg.nossoNumero}.`,
        )

        // H-2 FIX: avulso criado com sucesso → apenas avulsosCriados++
        // naoEncontrados++ fica reservado para o catch (falha real na criação)
        avulsosCriados++
        detalhes.push({
          nossoNumero:     reg.nossoNumero,
          numeroDocumento: reg.numeroDocumento,
          resultado:       'avulso_criado',
          descricao:       `Nenhum título encontrado para ${reg.numeroDocumento}/${dvenc} — título avulso criado.`,
        })
      } catch (err: unknown) {
        // Falha real na criação do avulso — conta como não encontrado
        naoEncontrados++
        detalhes.push({
          nossoNumero:     reg.nossoNumero,
          numeroDocumento: reg.numeroDocumento,
          resultado:       'nao_encontrado',
          descricao:       `Nenhum título encontrado — erro ao criar avulso: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  return { vinculados, naoEncontrados, jaExistentes, avulsosCriados, detalhes }
}

// ============================================================
// processarRegistrosRem()
// Processa array de segmentos P parsed do arquivo REM CNAB 240
// Prioridade: se título já tem nosso_numero, pula (não sobrescreve)
// Chamado por: ContasReceberHeader.tsx após parse do arquivo REM
// ============================================================
export async function processarRegistrosRem(
  segmentos: RegistroRemSegmentoP[],
): Promise<ResultadoImportRem> {
  const detalhes: ResultadoLinhaImport[] = []
  let vinculados     = 0
  let naoEncontrados = 0
  let jaExistentes   = 0

  for (const seg of segmentos) {
    // seg.dataVencimento já vem em YYYY-MM-DD do remParser (formatarDDMMYYYY já converteu)
    // NÃO aplicar parseDateDDMMYYYY novamente — causaria dupla conversão corrompendo a data
    const dvenc = seg.dataVencimento

    // 1. Deduplicação bancária — inclui cancelados
    const jaCadastrado = await verificarDuplicataBancaria(
      seg.nossoNumero,
      seg.numeroDocumento,
      dvenc,
    )

    if (jaCadastrado) {
      jaExistentes++
      detalhes.push({
        nossoNumero:     seg.nossoNumero,
        numeroDocumento: seg.numeroDocumento,
        resultado:       'ja_existe',
        descricao:       `Nosso Número ${seg.nossoNumero} já cadastrado — ignorado.`,
      })
      continue
    }

    // 2. Busca título existente por doc + vencimento
    const { data: encontrado } = await supabase
      .from(TABELA)
      .select('id, nosso_numero')
      .eq('numero_documento', seg.numeroDocumento)
      .eq('data_vencimento', dvenc)
      .is('deleted_at', null)
      .maybeSingle()

    if (!encontrado) {
      naoEncontrados++
      detalhes.push({
        nossoNumero:     seg.nossoNumero,
        numeroDocumento: seg.numeroDocumento,
        resultado:       'nao_encontrado',
        descricao:       `Nenhum título encontrado para ${seg.numeroDocumento}/${dvenc}.`,
      })
      continue
    }

    // 3. Se já tem nosso_numero preenchido (ex: do TXT BB), pula — prioridade TXT BB
    if (encontrado.nosso_numero) {
      jaExistentes++
      detalhes.push({
        nossoNumero:     seg.nossoNumero,
        numeroDocumento: seg.numeroDocumento,
        resultado:       'ja_existe',
        descricao:       `Título ${seg.numeroDocumento} já tem Nosso Número vinculado — REM ignorado.`,
      })
      continue
    }

    // 4. Vincula o nosso_numero via REM (sem linha_digitavel — não disponível no REM)
    const { error: errUpd } = await supabase
      .from(TABELA)
      .update({ nosso_numero: seg.nossoNumero })
      .eq('id', encontrado.id)

    if (errUpd) {
      detalhes.push({
        nossoNumero:     seg.nossoNumero,
        numeroDocumento: seg.numeroDocumento,
        resultado:       'erro',
        descricao:       `Erro ao vincular REM: ${errUpd.message}`,
      })
      continue
    }

    await registrarEvento(
      encontrado.id,
      'nosso_numero_vinculado',
      `Nosso Número ${seg.nossoNumero} vinculado via import REM CNAB 240.`,
    )

    vinculados++
    detalhes.push({
      nossoNumero:     seg.nossoNumero,
      numeroDocumento: seg.numeroDocumento,
      resultado:       'vinculado',
      descricao:       `Nosso Número ${seg.nossoNumero} vinculado ao título ${seg.numeroDocumento} via REM.`,
    })
  }

  return { vinculados, naoEncontrados, jaExistentes, detalhes }
}

// ============================================================
// processarRegistrosRet()
// Processa ocorrências do arquivo RET CNAB 240
// Para cada ocorrência: busca por nosso_numero → atualiza status
// Mapeamento de códigos: ver MAPEAMENTO_OCORRENCIAS_RET em types/contasReceber.ts
// Chamado por: ContasReceberHeader.tsx após parse do arquivo RET
// ============================================================
export async function processarRegistrosRet(
  ocorrencias: { nossoNumero: string; codigoOcorrencia: string; dataOcorrencia: string; valorPago: number }[],
): Promise<ResultadoImportRet> {
  const detalhes: ResultadoLinhaImport[]  = []
  let baixados              = 0
  let atualizados           = 0
  let naoEncontrados        = 0
  let ocorrenciasInformativas = 0

  for (const oc of ocorrencias) {
    // 1. Busca título pelo nosso_numero — campo único do BB
    const { data: titulo } = await supabase
      .from(TABELA)
      .select('id, status')
      .eq('nosso_numero', oc.nossoNumero) // Lookup por Nosso Número
      .is('deleted_at', null)             // Cancelados não recebem baixa automática
      .maybeSingle()

    if (!titulo) {
      naoEncontrados++
      detalhes.push({
        nossoNumero: oc.nossoNumero,
        resultado:   'nao_encontrado',
        descricao:   `Nosso Número ${oc.nossoNumero} não encontrado (ocorrência ${oc.codigoOcorrencia}).`,
      })
      continue
    }

    // 2. Mapeia o código de ocorrência para StatusTitulo
    const novoStatus = MAPEAMENTO_OCORRENCIAS_RET[oc.codigoOcorrencia] as StatusTitulo | undefined

    if (!novoStatus) {
      // Código desconhecido — registra evento informativo sem mudar status
      ocorrenciasInformativas++
      await registrarEvento(
        titulo.id,
        'ocorrencia_informativa',
        `Ocorrência RET código ${oc.codigoOcorrencia} em ${formatarDataBR(parseDateDDMMYYYY(oc.dataOcorrencia))} — sem mudança de status.`,
      )
      detalhes.push({
        nossoNumero: oc.nossoNumero,
        resultado:   'informativo',
        descricao:   `Ocorrência ${oc.codigoOcorrencia} registrada como informativa.`,
      })
      continue
    }

    // AUDITORIA FIX (item 4): mesma lógica aplicada em processarRegistrosXls —
    // se o status mapeado já é o status atual do título, não há mudança real
    // a aplicar. Evita que o RET sobrescreva data_baixa/forma_baixa em títulos
    // que a prévia (gerarPreviewImportacao) não listou como alterados.
    if (novoStatus === titulo.status) {
      detalhes.push({
        nossoNumero: oc.nossoNumero,
        resultado:   'informativo',
        descricao:   `Ocorrência ${oc.codigoOcorrencia} já corresponde ao status atual — nenhuma alteração aplicada.`,
      })
      continue
    }

    // 3. Atualiza status + data_baixa para ocorrências que liquidam o título
    const dataOcorrBR = parseDateDDMMYYYY(oc.dataOcorrencia) // YYYY-MM-DD

    const updateData: Partial<ContaReceber> = {
      status: novoStatus, // Status mapeado do código BB
    }

    // Preenche data_baixa e forma_baixa apenas para liquidações
    if (novoStatus === 'pago') {
      updateData.data_baixa  = dataOcorrBR
      updateData.forma_baixa = 'ret' // Baixa automática por retorno bancário
    }

    const { error: errUpd } = await supabase
      .from(TABELA)
      .update(updateData)
      .eq('id', titulo.id)

    if (errUpd) {
      detalhes.push({
        nossoNumero: oc.nossoNumero,
        resultado:   'erro',
        descricao:   `Erro ao atualizar status: ${errUpd.message}`,
      })
      continue
    }

    // 4. Registra evento com detalhes da ocorrência
    const tipoEvento: TipoEvento = novoStatus === 'pago'
      ? 'baixa_ret'
      : novoStatus === 'protestado'
      ? 'protestado'
      : 'enviado_cartorio'

    const descOcorrencia = descricaoOcorrenciaRet(oc.codigoOcorrencia, novoStatus)
    await registrarEvento(
      titulo.id,
      tipoEvento,
      `${descOcorrencia} em ${formatarDataBR(dataOcorrBR)}. Valor pago: ${formatarMoeda(oc.valorPago)}.`,
    )

    // Conta como baixado (pago) ou atualizado (protestado, cartório)
    if (novoStatus === 'pago') {
      baixados++
    } else {
      atualizados++
    }

    detalhes.push({
      nossoNumero: oc.nossoNumero,
      resultado:   novoStatus === 'pago' ? 'baixado' : 'atualizado',
      descricao:   `${descOcorrencia} — status atualizado para "${novoStatus}".`,
    })
  }

  return { baixados, atualizados, naoEncontrados, ocorrenciasInformativas, detalhes }
}

// ============================================================
// processarRegistrosXls()
// Processa array de registros parsed do relatório XLS de consulta
// (autoatendimento.bb.com.br). Mesma lógica de matching por
// nosso_numero usada em processarRegistrosRet() — reaproveitada
// para não criar conflito nem resultado vazio entre os dois imports.
// Mapeamento de Situação: ver MAPEAMENTO_SITUACAO_XLS em types/contasReceber.ts
// Regra de conflito (combinada com o usuário): quando RET e XLS
// trazem status diferentes para o mesmo título, prevalece sempre a
// importação mais recente — aqui não há lógica especial de prioridade,
// o último import processado simplesmente sobrescreve o status,
// igual já acontece com qualquer UPDATE sequencial no banco.
// Chamado por: ContasReceberHeader.tsx após parse do arquivo XLS
// ============================================================
export async function processarRegistrosXls(
  registros: RegistroXls[],
): Promise<ResultadoImportXls> {
  const detalhes: ResultadoLinhaImport[] = []
  let baixados       = 0
  let atualizados    = 0
  let naoEncontrados  = 0

  for (const reg of registros) {
    // 1. Busca título pelo nosso_numero — mesmo campo único do BB
    //    usado pelo RET, garantindo a mesma lógica de matching
    const { data: titulo } = await supabase
      .from(TABELA)
      .select('id, status')
      .eq('nosso_numero', reg.nossoNumero)
      .is('deleted_at', null) // Cancelados não recebem atualização automática
      .maybeSingle()

    if (!titulo) {
      naoEncontrados++
      detalhes.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento: reg.numeroDocumento,
        resultado:       'nao_encontrado',
        descricao:       `Nosso Número ${reg.nossoNumero} não encontrado (Situação: "${reg.situacao}").`,
      })
      continue
    }

    // 2. Mapeia o texto da Situação para StatusTitulo — match exato
    //    case-insensitive primeiro; se não encontrar, tenta match
    //    parcial (ex: variações de "Protestado" não previstas
    //    literalmente na tabela), evitando ficar restrito a um
    //    texto fixo enviado pelo BB
    const novoStatus = mapearSituacaoXls(reg.situacao)

    if (!novoStatus) {
      // Situação desconhecida — não altera o status, mas registra
      // o evento para rastreabilidade, igual ocorrência informativa do RET
      await registrarEvento(
        titulo.id,
        'ocorrencia_informativa',
        `Situação "${reg.situacao}" (XLS) não reconhecida — sem mudança de status.`,
      )
      detalhes.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento: reg.numeroDocumento,
        resultado:       'informativo',
        descricao:       `Situação "${reg.situacao}" não mapeada — nenhuma alteração aplicada.`,
      })
      continue
    }

    // AUDITORIA FIX (item 4): espelha exatamente o que gerarPreviewImportacao()
    // mostrou ao usuário — se o status calculado já é o status atual do
    // título, não há mudança real a aplicar. Sem essa checagem, o UPDATE
    // sempre rodava e podia tocar data_baixa/forma_baixa silenciosamente
    // em títulos que a prévia nunca listou como alterados.
    if (novoStatus === titulo.status) {
      detalhes.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento: reg.numeroDocumento,
        resultado:       'informativo',
        descricao:       `Situação "${reg.situacao}" já corresponde ao status atual — nenhuma alteração aplicada.`,
      })
      continue
    }

    // 3. Monta o UPDATE — Pergunta 21a: preenche automaticamente
    //    data_baixa quando o status final é 'pago', usando Data Situação
    //    do arquivo; se a planilha não trouxer essa coluna (formato
    //    simples), usa a data de hoje como fallback.
    //    AUDITORIA FIX (item 3): NÃO sobrescreve mais o campo `valor`
    //    (valor de face do título) — processarRegistrosRet() já existente
    //    também nunca toca em `valor` ao liquidar, só em data_baixa/forma_baixa;
    //    sobrescrever o valor original corromperia a conciliação com a NF-e
    const updateData: Partial<ContaReceber> = { status: novoStatus }

    if (novoStatus === 'pago') {
      updateData.data_baixa  = reg.dataSituacao ?? new Date().toISOString().slice(0, 10)
      updateData.forma_baixa = 'xls' // Baixa automática via importação XLS
    }

    const { error: errUpd } = await supabase
      .from(TABELA)
      .update(updateData)
      .eq('id', titulo.id)

    if (errUpd) {
      detalhes.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento: reg.numeroDocumento,
        resultado:       'erro',
        descricao:       `Erro ao atualizar status: ${errUpd.message}`,
      })
      continue
    }

    // 4. Registra evento de auditoria com a Situação original do BB
    const tipoEvento: TipoEvento = novoStatus === 'pago'
      ? 'baixa_ret' // Reaproveita o mesmo tipo de evento de liquidação automática
      : novoStatus === 'protestado'
      ? 'protestado'
      : novoStatus === 'enviado_cartorio'
      ? 'enviado_cartorio'
      : 'ocorrencia_informativa'

    await registrarEvento(
      titulo.id,
      tipoEvento,
      `Situação "${reg.situacao}" (relatório XLS BB)${reg.dataSituacao ? ` em ${formatarDataBR(reg.dataSituacao)}` : ''} — status atualizado para "${novoStatus}".`,
    )

    if (novoStatus === 'pago') {
      baixados++
    } else {
      atualizados++
    }

    detalhes.push({
      nossoNumero:     reg.nossoNumero,
      numeroDocumento: reg.numeroDocumento,
      resultado:       novoStatus === 'pago' ? 'baixado' : 'atualizado',
      descricao:       `"${reg.situacao}" — status atualizado para "${novoStatus}".`,
    })
  }

  return { baixados, atualizados, naoEncontrados, detalhes }
}

// ============================================================
// mapearSituacaoXls()
// Traduz o texto da coluna "Situação" do XLS para StatusTitulo
// usando MAPEAMENTO_SITUACAO_XLS — primeiro tenta match exato
// (case-insensitive), depois match parcial por palavra-chave para
// cobrir variações de texto que o BB pode emitir (ex: "Protestado
// em cartório" não é uma chave literal do mapa, mas contém "protest")
// Retorna null se não reconhecer a situação — não altera o título
// ============================================================
function mapearSituacaoXls(situacao: string): StatusTitulo | null {
  const normalizado = situacao.trim().toLowerCase()

  // 1. Match exato contra as chaves do mapeamento
  if (normalizado in MAPEAMENTO_SITUACAO_XLS) {
    return MAPEAMENTO_SITUACAO_XLS[normalizado]
  }

  // 2. Match parcial por palavra-chave — ordem importa: verifica
  //    protesto antes de cartório, pois um título "protestado em
  //    cartório" deve virar 'protestado' (estado mais grave), não
  //    'enviado_cartorio'
  if (normalizado.includes('protest'))           return 'protestado'
  if (normalizado.includes('liquid') || normalizado.includes('baixa')) return 'pago'
  if (normalizado.includes('cart'))               return 'enviado_cartorio'
  if (normalizado.includes('normal'))             return 'em_aberto'

  return null // Situação não reconhecida
}

// ============================================================
// gerarPreviewImportacao()
// Roda o matching de um lote de ocorrências RET ou registros XLS
// SEM gravar nada no banco — usado para montar a tela de prévia
// (ImportarRetornoPreviewModal.tsx) antes do usuário confirmar a
// importação. Reaproveita a mesma lógica de busca por nosso_numero
// e mapeamento de status das funções de processamento reais, para
// a prévia nunca divergir do que será efetivamente aplicado.
// Chamado por: ContasReceberHeader.tsx antes de abrir o modal de prévia
// ============================================================
export interface ItemPreviewImportacao {
  nossoNumero:      string         // Nosso Número do título
  numeroDocumento:  string         // Nº documento — para exibição
  statusAtual:      StatusTitulo   // Status atual do título no banco
  statusNovo:        StatusTitulo  // Status que será aplicado
  encontrado:        boolean       // false = não encontrado, fica em lista separada
}

export async function gerarPreviewImportacao(
  origem: 'ret' | 'xls',
  // União dos dois formatos de entrada — RET traz codigoOcorrencia, XLS traz situacao
  registros: ({ nossoNumero: string; codigoOcorrencia: string } | RegistroXls)[],
): Promise<{ mudancas: ItemPreviewImportacao[]; naoEncontrados: ItemPreviewImportacao[] }> {
  const mudancas:       ItemPreviewImportacao[] = []
  const naoEncontrados: ItemPreviewImportacao[] = []

  for (const reg of registros) {
    // 1. Busca o título atual pelo nosso_numero — mesma lógica de
    //    processarRegistrosRet()/processarRegistrosXls(), só sem UPDATE
    const { data: titulo } = await supabase
      .from(TABELA)
      .select('status, numero_documento')
      .eq('nosso_numero', reg.nossoNumero)
      .is('deleted_at', null)
      .maybeSingle()

    // 2. Determina o status que SERIA aplicado, conforme a origem
    const statusNovo = origem === 'ret'
      ? (MAPEAMENTO_OCORRENCIAS_RET[(reg as { codigoOcorrencia: string }).codigoOcorrencia] as StatusTitulo | undefined) ?? null
      : mapearSituacaoXls((reg as RegistroXls).situacao)

    const numeroDocumento = !titulo
      ? ('numeroDocumento' in reg ? reg.numeroDocumento : '—')
      : titulo.numero_documento

    if (!titulo) {
      naoEncontrados.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento,
        statusAtual:     'em_aberto', // Irrelevante — título não existe no sistema
        statusNovo:      statusNovo ?? 'em_aberto',
        encontrado:      false,
      })
      continue
    }

    // 3. Só entra na lista de mudanças se houver de fato uma alteração
    //    de status a aplicar (situação reconhecida e diferente da atual)
    if (statusNovo && statusNovo !== titulo.status) {
      mudancas.push({
        nossoNumero:     reg.nossoNumero,
        numeroDocumento,
        statusAtual:     titulo.status as StatusTitulo,
        statusNovo,
        encontrado:      true,
      })
    }
  }

  return { mudancas, naoEncontrados }
}

// ============================================================
// ── SEÇÃO 5: EVENTOS (LOG DE AUDITORIA) ──
// ============================================================

// ============================================================
// registrarEvento()
// Insere uma linha imutável no log de auditoria do título
// Chamado internamente por todas as funções que mudam o estado
// ============================================================
export async function registrarEvento(
  tituloId: string,
  tipo: TipoEvento,
  descricao: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABELA_EVENTOS)
    .insert({ titulo_id: tituloId, tipo, descricao })

  if (error) {
    // Não lança — falha no log não deve abortar a operação principal
    console.error('[contasReceberService] registrarEvento error:', error)
  }
}

// ============================================================
// registrarEmailEnviado()
// Registra evento de e-mail de aviso de vencimento enviado
// Chamado por: ContasReceberModalAvisos após envio confirmado
// ============================================================
export async function registrarEmailEnviado(tituloId: string, email: string): Promise<void> {
  await registrarEvento(
    tituloId,
    'email_enviado',
    `E-mail de aviso de vencimento enviado para ${email}.`,
  )
}

// ============================================================
// ── SEÇÃO 6: EXPORTAÇÃO ──
// ============================================================

// ============================================================
// exportarCSV()
// Exporta a lista atual de títulos (filtrada) como CSV
// Chamado por: ExportDropdownContasReceber.tsx ao selecionar CSV
// ============================================================
export function exportarCSV(titulos: ContaReceber[], usuario: string): void {
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'

  // Mapeia campos para colunas legíveis no CSV
  const dados = titulos.map(t => ({
    'Vencimento':        t.data_vencimento,
    'Nº Documento':      t.numero_documento,
    'Nº Duplicata':      t.numero_duplicata,
    'Nome Fantasia':     t.cliente_fantasia ?? '',
    'Razão Social':      t.cliente_nome,
    'CNPJ/CPF':          formatarCnpjCpf(t.cliente_cpf_cnpj),
    'Cidade':            t.cliente_municipio ?? '',
    'UF':                t.cliente_uf ?? '',
    'Dt. Processamento': t.data_processamento,
    'Nosso Número':      t.nosso_numero ?? '',
    'Valor':             t.valor,
    'Status':            t.status,
    'Dt. Baixa':         t.data_baixa ?? '',
    'Forma Baixa':       t.forma_baixa ?? '',
    'Observações':       t.observacoes ?? '',
  }))

  const csv  = Papa.unparse(dados, { delimiter: ';' })
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = `contas_receber_${dataHoje()}_${nomeSeguro}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// exportarExcel()
// Exporta a lista atual de títulos (filtrada) como .xlsx
// Chamado por: ExportDropdownContasReceber.tsx ao selecionar Excel
// ============================================================
export function exportarExcel(titulos: ContaReceber[], usuario: string): void {
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'

  const dados = titulos.map(t => ({
    'Vencimento':        t.data_vencimento,
    'Nº Documento':      t.numero_documento,
    'Nº Duplicata':      t.numero_duplicata,
    'Nome Fantasia':     t.cliente_fantasia ?? '',
    'Razão Social':      t.cliente_nome,
    'CNPJ/CPF':          formatarCnpjCpf(t.cliente_cpf_cnpj),
    'Cidade':            t.cliente_municipio ?? '',
    'UF':                t.cliente_uf ?? '',
    'Dt. Processamento': t.data_processamento,
    'Nosso Número':      t.nosso_numero ?? '',
    'Valor':             t.valor,
    'Status':            t.status,
    'Dt. Baixa':         t.data_baixa ?? '',
    'Forma Baixa':       t.forma_baixa ?? '',
    'Observações':       t.observacoes ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contas a Receber')
  XLSX.writeFile(wb, `contas_receber_${dataHoje()}_${nomeSeguro}.xlsx`)
}

// ============================================================
// ── SEÇÃO 7: BACKUP / RESTAURAÇÃO ──
// ============================================================

// ============================================================
// fazerBackup()
// Exporta a tabela contas_receber COMPLETA como JSON
// Inclui eventos de cada título para auditoria completa
// Chamado por: ContasReceberHeader.tsx ao clicar em Backup
// ============================================================
export async function fazerBackup(usuario?: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(`
      *,
      eventos:contas_receber_eventos(*)
    `)
    .order('data_vencimento', { ascending: true })

  if (error) {
    console.error('[contasReceberService] fazerBackup error:', error)
    throw new Error(error.message)
  }

  const json     = JSON.stringify(data, null, 2)
  const blob     = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url      = URL.createObjectURL(blob)
  const link     = document.createElement('a')
  link.href      = url
  const sufixo   = usuario ? `_${usuario}` : ''
  link.download  = `backup_contas_receber_${dataHoje()}${sufixo}.json`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// lerArquivoBackup()
// Lê o arquivo JSON selecionado e retorna o array de títulos
// Chamado por: ContasReceberHeader.tsx após seleção do arquivo
// ============================================================
export function lerArquivoBackup(file: File): Promise<ContaReceber[]> {
  return new Promise((resolve, reject) => {
    const reader   = new FileReader()
    reader.onload  = (e) => {
      try {
        const conteudo = e.target?.result as string
        const dados    = JSON.parse(conteudo) as ContaReceber[]
        resolve(dados)
      } catch {
        reject(new Error('Arquivo de backup inválido ou corrompido.'))
      }
    }
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
    reader.readAsText(file, 'utf-8')
  })
}

// ============================================================
// restaurarBackup()
// Recebe array de títulos e faz upsert por id
// Estratégia simples: upsert pelo PK (id) — não cria duplicatas
// Chamado por: ContasReceberHeader.tsx após leitura do arquivo
// ============================================================
export async function restaurarBackup(titulos: ContaReceber[]): Promise<void> {
  // L-3 FIX: coleta todos os erros em vez de abortar no primeiro
  // Sem transação real no Supabase client-side, abortar no meio deixa
  // o banco em estado parcial sem visibilidade. Coletar todos os erros
  // permite ao usuário saber exatamente quais títulos falharam e retentar.
  const erros: string[] = []

  for (const titulo of titulos) {
    // Remove o campo virtual de join — não existe na tabela
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { eventos: _ev, ...dadosTitulo } = titulo

    // Upsert pelo id — preserva histórico de datas (created_at, updated_at)
    const { error } = await supabase
      .from(TABELA)
      .upsert(dadosTitulo, { onConflict: 'id' })

    if (error) {
      // Registra o erro mas continua processando os demais títulos
      console.error('[contasReceberService] restaurarBackup titulo error:', error)
      erros.push(`${titulo.numero_documento}: ${error.message}`)
    }
  }

  // Ao final, lança um único erro consolidado se houver falhas
  if (erros.length > 0) {
    throw new Error(
      `${erros.length} título(s) com erro ao restaurar:\n${erros.join('\n')}`
    )
  }
}

// ============================================================
// ── SEÇÃO 8: FUNÇÕES UTILITÁRIAS EXPORTADAS ──
// ============================================================

// ============================================================
// formatarCnpjCpf()
// Formata CPF/CNPJ sem pontuação para exibição
// Ex: "18350838000170" → "18.350.838/0001-70"
//     "12345678901"    → "123.456.789-01"
// ============================================================
export function formatarCnpjCpf(valor: string): string {
  const digits = valor.replace(/[^0-9]/g, '')
  if (digits.length === 14) {
    // Formata como CNPJ: XX.XXX.XXX/XXXX-XX
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digits.length === 11) {
    // Formata como CPF: XXX.XXX.XXX-XX
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return valor // Retorna sem formatação se não reconhecer o comprimento
}

// ============================================================
// formatarMoeda()
// Formata número para moeda brasileira
// Ex: 1585.15 → "R$ 1.585,15"
// ============================================================
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ============================================================
// formatarDataBR()
// Formata ISO date string YYYY-MM-DD para dd/mm/yyyy
// Ex: "2026-07-16" → "16/07/2026"
// ============================================================
export function formatarDataBR(iso: string): string {
  if (!iso) return ''
  // Para datas no formato YYYY-MM-DD, parseia sem depender de timezone
  const partes = iso.slice(0, 10).split('-')
  if (partes.length !== 3) return iso
  return `${partes[2]}/${partes[1]}/${partes[0]}` // DD/MM/YYYY
}

// ============================================================
// formatarNossoNumero()
// Formata o Nosso Número BB com espaço após os 7 primeiros dígitos
// Ex: "21602610000007694" → "2160261 0000007694"
// Conforme padrão visual do módulo (Courier New, bold, #1a5276)
// ============================================================
export function formatarNossoNumero(nossoNumero: string): string {
  if (!nossoNumero || nossoNumero.length < 8) return nossoNumero
  // Divide nos 7 primeiros dígitos + restante
  return `${nossoNumero.slice(0, 7)} ${nossoNumero.slice(7)}`
}

// ============================================================
// isTituloVencido()
// Retorna true se o título está vencido E em_aberto
// Usado para aplicar row styles vermelhos na tabela
// ============================================================
export function isTituloVencido(titulo: ContaReceber): boolean {
  if (titulo.status !== 'em_aberto') return false        // Só verifica em_aberto
  const hoje  = new Date().toISOString().slice(0, 10)   // YYYY-MM-DD de hoje
  return titulo.data_vencimento < hoje                   // Vencido se antes de hoje
}

// ============================================================
// isTituloNearVencimento()
// Retorna true se o título vence entre hoje e hoje+5 dias E está em_aberto
// Usado para row styles âmbar na tabela e para o banner de alerta
// ============================================================
export function isTituloNearVencimento(titulo: ContaReceber): boolean {
  if (titulo.status !== 'em_aberto') return false
  const hoje   = new Date()
  const limite = new Date()
  limite.setDate(hoje.getDate() + 5)
  const dataHoje  = hoje.toISOString().slice(0, 10)
  const dataLim   = limite.toISOString().slice(0, 10)
  const venc      = titulo.data_vencimento
  // Entre hoje e hoje+5 (inclusive em ambos os lados)
  return venc >= dataHoje && venc <= dataLim
}

// ============================================================
// ── SEÇÃO 9: FUNÇÕES INTERNAS (não exportadas) ──
// ============================================================

// ============================================================
// parseDateDDMMYYYY()
// Converte string no formato DDMMYYYY para YYYY-MM-DD
// Usado ao converter datas dos arquivos TXT BB e CNAB 240
// ============================================================
function parseDateDDMMYYYY(s: string): string {
  if (!s || s.length < 8) return ''
  const dd   = s.slice(0, 2)  // Dia
  const mm   = s.slice(2, 4)  // Mês
  const yyyy = s.slice(4, 8)  // Ano
  return `${yyyy}-${mm}-${dd}` // Retorna no formato ISO YYYY-MM-DD
}

// ============================================================
// dataHoje()
// Retorna a data atual no formato YYYY-MM-DD para nomes de arquivo
// ============================================================
function dataHoje(): string {
  return new Date().toISOString().slice(0, 10)
}

// ============================================================
// descricaoOcorrenciaRet()
// Gera descrição legível para cada código de ocorrência BB RET
// Usado na geração de eventos no processarRegistrosRet()
// ============================================================
function descricaoOcorrenciaRet(codigo: string, status: StatusTitulo): string {
  const mapa: Record<string, string> = {
    '06': 'Liquidação normal (código 06)',
    '09': 'Liquidação parcial (código 09)',
    '17': 'Liquidação após baixa (código 17)',
    '23': 'Título enviado a cartório (código 23)',
    '25': 'Título protestado (código 25)',
  }
  return mapa[codigo] ?? `Ocorrência ${codigo} → status "${status}"`
}

// ============================================================
// Re-exporta tipos de eventos para uso nos componentes
// que precisam descrever o tipo ao chamar registrarEvento()
// ============================================================
export type { ContaReceberEvento, RemessaImportada }
