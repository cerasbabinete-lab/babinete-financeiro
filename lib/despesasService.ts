// ============================================================
// lib/despesasService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Todas as operações de dados do módulo despesas
//         Camada de serviço entre UI e Supabase
// Conecta com: supabase.ts, types/despesas.ts,
//              DespesasTabela.tsx, DespesasModal.tsx,
//              DespesasMobileList.tsx, DespesasHeader.tsx,
//              DespesasFiltros.tsx
// Referência: Especificacao_Modulo_Despesas.md §5
// ============================================================

import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Despesa,
  DespesaInsert,
  DespesaParcela,
  DespesaParcelaInsert,
  FiltrosDespesas,
} from '@/types/despesas'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA           = 'despesas'
const TABELA_PARCELAS  = 'despesas_parcelas'

// ============================================================
// buscarDespesas()
// Retorna lista de despesas aplicando filtros, com parcelas
// carregadas via join. Ordenado por data de emissão DESC.
// Filtros de vencimento/status são aplicados client-side sobre as
// parcelas já carregadas (mesmo padrão de prazo/formaPagamento em
// receitasService.ts) — uma Despesa aparece se PELO MENOS UMA de
// suas parcelas ativas atender ao filtro.
// Chamado por: app/despesas/page.tsx no useEffect e nos filtros
// ============================================================
export async function buscarDespesas(filtros: FiltrosDespesas): Promise<Despesa[]> {
  let query = supabase
    .from(TABELA)
    .select(`
      *,
      parcelas:despesas_parcelas(*),
      fornecedor:fornecedores(razao, fantasia)
    `)
    .is('deleted_at', null) // nunca lista despesas canceladas (soft-deleted)

  // Busca textual: favorecido, número do documento, CNPJ/CPF (sem pontuação)
  if (filtros.busca && filtros.busca.trim() !== '') {
    const termo = `%${filtros.busca.trim()}%`
    const termoDig = `%${filtros.busca.trim().replace(/[^0-9]/g, '')}%`
    query = query.or(
      `favorecido_nome.ilike.${termo},documento_numero.ilike.${termo},favorecido_cnpj_cpf.ilike.${termoDig}`,
    )
  }

  // Filtro por categoria financeira (uma das 8 fixas)
  if (filtros.categoriaFinanceira && filtros.categoriaFinanceira !== '') {
    query = query.eq('categoria_financeira', filtros.categoriaFinanceira)
  }

  // Filtro por origem (empresarial x pessoal_socio)
  if (filtros.origemTipo && filtros.origemTipo !== '') {
    query = query.eq('origem_tipo', filtros.origemTipo)
  }

  query = query.order('documento_data_emissao', { ascending: false, nullsFirst: false })

  const { data, error } = await query

  if (error) {
    console.error('[despesasService] buscarDespesas error:', error)
    throw new Error(error.message)
  }

  let despesas = (data as Despesa[]) ?? []

  // Filtros de vencimento e status dependem das PARCELAS (não da despesa
  // em si), aplicados client-side sobre os dados já carregados via join —
  // uma despesa "sobrevive" ao filtro se qualquer parcela ativa bater
  if (filtros.vencimentoDe && filtros.vencimentoDe !== '') {
    despesas = despesas.filter((d) =>
      (d.parcelas ?? []).some((p) => !p.deleted_at && p.data_vencimento >= filtros.vencimentoDe),
    )
  }
  if (filtros.vencimentoAte && filtros.vencimentoAte !== '') {
    despesas = despesas.filter((d) =>
      (d.parcelas ?? []).some((p) => !p.deleted_at && p.data_vencimento <= filtros.vencimentoAte),
    )
  }
  if (filtros.status && filtros.status !== '') {
    despesas = despesas.filter((d) =>
      (d.parcelas ?? []).some((p) => !p.deleted_at && p.status === filtros.status),
    )
  }

  return despesas
}

// ============================================================
// contarDespesas()
// Retorna o total de despesas ativas (não canceladas)
// Exibido no header como "X despesas"
// Chamado por: app/despesas/page.tsx após cada operação
// ============================================================
export async function contarDespesas(): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (error) {
    console.error('[despesasService] contarDespesas error:', error)
    return 0
  }

  return count ?? 0
}

// ============================================================
// buscarDespesaPorId()
// Retorna uma despesa completa com parcelas e dados básicos do
// fornecedor vinculado — usado para pré-preencher o modal de edição
// Chamado por: DespesasTabela.tsx ao clicar em editar/visualizar,
//              e internamente por atualizarDespesaComSync()
// ============================================================
export async function buscarDespesaPorId(id: string, client: SupabaseClient = supabase): Promise<Despesa | null> {
  const { data, error } = await client
    .from(TABELA)
    .select(`
      *,
      parcelas:despesas_parcelas(*),
      fornecedor:fornecedores(razao, fantasia)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[despesasService] buscarDespesaPorId error:', error)
    return null
  }

  return data as Despesa
}

// ============================================================
// criarDespesaComParcelas()
// Insere a despesa e, em seguida, uma linha em despesas_parcelas para
// cada parcela — espelha criarReceita()/criarTitulosDeReceita() de
// Receitas/Contas a Receber. Chamado depois que o pipeline de
// pages/api/despesas/importar-xml.ts ou importar-documento.ts já
// resolveu fornecedor/classificação/duplicidade (nada disso é refeito
// aqui — esta função só persiste o que já foi processado e revisado).
// Chamado por: pages/api/despesas/confirmar.ts
// ============================================================
export async function criarDespesaComParcelas(
  despesa: DespesaInsert,
  parcelas: Omit<DespesaParcelaInsert, 'despesa_id'>[],
  client: SupabaseClient = supabase, // permite uso a partir de API routes com client admin — padrão é o client do browser
): Promise<{ despesa: Despesa; parcelas: DespesaParcela[] }> {
  // 1. Insere a despesa principal
  const { data: despesaCriada, error: erroDespesa } = await client
    .from(TABELA)
    .insert(despesa)
    .select()
    .single()

  if (erroDespesa) {
    console.error('[despesasService] criarDespesaComParcelas (despesa) error:', erroDespesa)
    throw new Error(erroDespesa.message)
  }

  const despesaId = (despesaCriada as Despesa).id

  // 2. Insere as parcelas, agora com o despesa_id gerado pelo passo 1
  const parcelasComFk = parcelas.map((p) => ({ ...p, despesa_id: despesaId }))

  const { data: parcelasCriadas, error: erroParcelas } = await client
    .from(TABELA_PARCELAS)
    .insert(parcelasComFk)
    .select()

  if (erroParcelas) {
    // Erro nas parcelas não desfaz a despesa já gravada (mesma filosofia
    // de criarTitulosDeReceita — erros são reportados, não revertidos
    // via transação distribuída, que o Supabase client não suporta aqui)
    console.error('[despesasService] criarDespesaComParcelas (parcelas) error:', erroParcelas)
    throw new Error(`Despesa criada, mas falha ao gravar parcelas: ${erroParcelas.message}`)
  }

  return {
    despesa: despesaCriada as Despesa,
    parcelas: (parcelasCriadas as DespesaParcela[]) ?? [],
  }
}

// ============================================================
// atualizarDespesaComSync()
// Atualiza os campos da Despesa E sincroniza despesas_parcelas na MESMA
// operação — requisito não-negociável da spec (§5, "Function: Edit
// Despesa"): zero divergência entre a Despesa e suas parcelas.
//
// Como o projeto usa soft-delete (nunca DELETE físico), a sincronização
// funciona por comparação de conjuntos:
//   - Parcelas enviadas COM id existente → UPDATE na linha correspondente
//   - Parcelas enviadas SEM id → INSERT como nova parcela
//   - Parcelas que existiam mas não vieram na lista nova → soft-delete
//     (deleted_at preenchido), nunca removidas fisicamente
// Chamado por: pages/api/despesas/atualizar.ts
// ============================================================
export async function atualizarDespesaComSync(
  despesaId: string,
  camposDespesa: Partial<DespesaInsert>,
  parcelasAtualizadas: (Omit<DespesaParcelaInsert, 'despesa_id'> & { id?: string })[],
  client: SupabaseClient = supabase, // permite uso a partir de API routes com client admin
): Promise<{ despesa: Despesa; parcelas: DespesaParcela[] }> {
  // ── Passo 1: atualiza os campos da despesa ──
  const { error: erroUpdateDespesa } = await client
    .from(TABELA)
    .update({ ...camposDespesa, updated_at: new Date().toISOString() })
    .eq('id', despesaId)

  if (erroUpdateDespesa) {
    console.error('[despesasService] atualizarDespesaComSync (despesa) error:', erroUpdateDespesa)
    throw new Error(erroUpdateDespesa.message)
  }

  // ── Passo 2: busca as parcelas ativas atuais, para saber quais somem ──
  const { data: parcelasAtuais, error: erroBuscaAtuais } = await client
    .from(TABELA_PARCELAS)
    .select('id')
    .eq('despesa_id', despesaId)
    .is('deleted_at', null)

  if (erroBuscaAtuais) {
    console.error('[despesasService] atualizarDespesaComSync (busca parcelas atuais) error:', erroBuscaAtuais)
    throw new Error(erroBuscaAtuais.message)
  }

  const idsAtuais = new Set((parcelasAtuais ?? []).map((p) => p.id as string))
  const idsMantidos = new Set(
    parcelasAtualizadas.filter((p) => p.id).map((p) => p.id as string),
  )

  // ── Passo 3: soft-delete das parcelas que não vieram na lista nova ──
  const idsParaRemover = [...idsAtuais].filter((id) => !idsMantidos.has(id))
  if (idsParaRemover.length > 0) {
    const { error: erroSoftDelete } = await client
      .from(TABELA_PARCELAS)
      .update({ deleted_at: new Date().toISOString() })
      .in('id', idsParaRemover)

    if (erroSoftDelete) {
      console.error('[despesasService] atualizarDespesaComSync (soft-delete parcelas) error:', erroSoftDelete)
      throw new Error(erroSoftDelete.message)
    }
  }

  // ── Passo 4: para cada parcela enviada, UPDATE (se já existe) ou
  // INSERT (se é nova) — executado sequencialmente para manter o
  // tratamento de erro simples e específico por parcela
  for (const parcela of parcelasAtualizadas) {
    const { id: parcelaId, ...dadosParcela } = parcela

    if (parcelaId) {
      // Parcela já existente — UPDATE
      const { error: erroUpdateParcela } = await client
        .from(TABELA_PARCELAS)
        .update({ ...dadosParcela, updated_at: new Date().toISOString() })
        .eq('id', parcelaId)

      if (erroUpdateParcela) {
        console.error('[despesasService] atualizarDespesaComSync (update parcela) error:', erroUpdateParcela)
        throw new Error(`Falha ao atualizar parcela ${parcela.numero_parcela}: ${erroUpdateParcela.message}`)
      }
    } else {
      // Parcela nova (adicionada durante a edição) — INSERT
      const { error: erroInsertParcela } = await client
        .from(TABELA_PARCELAS)
        .insert({ ...dadosParcela, despesa_id: despesaId })

      if (erroInsertParcela) {
        console.error('[despesasService] atualizarDespesaComSync (insert parcela) error:', erroInsertParcela)
        throw new Error(`Falha ao criar nova parcela ${parcela.numero_parcela}: ${erroInsertParcela.message}`)
      }
    }
  }

  // ── Passo 5: re-busca o estado final (despesa + parcelas atualizadas) ──
  const despesaFinal = await buscarDespesaPorId(despesaId, client)
  if (!despesaFinal) {
    throw new Error('Despesa atualizada, mas não foi possível recarregar o estado final.')
  }

  return {
    despesa: despesaFinal,
    parcelas: despesaFinal.parcelas ?? [],
  }
}

// ============================================================
// cancelarDespesa()
// Soft-delete da despesa E de todas as suas parcelas ativas, na mesma
// operação — nunca DELETE físico, conforme convenção do projeto
// Chamado por: DespesasTabela.tsx (ação de cancelar/excluir)
// ============================================================
export async function cancelarDespesa(despesaId: string): Promise<void> {
  const agora = new Date().toISOString()

  // Soft-delete da despesa principal
  const { error: erroDespesa } = await supabase
    .from(TABELA)
    .update({ deleted_at: agora, status_pagamento: 'cancelado', updated_at: agora })
    .eq('id', despesaId)

  if (erroDespesa) {
    console.error('[despesasService] cancelarDespesa (despesa) error:', erroDespesa)
    throw new Error(erroDespesa.message)
  }

  // Soft-delete em cascata de todas as parcelas ainda ativas
  const { error: erroParcelas } = await supabase
    .from(TABELA_PARCELAS)
    .update({ deleted_at: agora, status: 'cancelado', updated_at: agora })
    .eq('despesa_id', despesaId)
    .is('deleted_at', null)

  if (erroParcelas) {
    console.error('[despesasService] cancelarDespesa (parcelas) error:', erroParcelas)
    throw new Error(`Despesa cancelada, mas falha ao cancelar parcelas: ${erroParcelas.message}`)
  }
}

// ============================================================
// buscarFornecedorPorDocumento()
// Busca um fornecedor existente pelo CNPJ/CPF (client-side, anon key) —
// usado apenas no lançamento MANUAL de Despesa (sem documento de origem),
// onde não existe pipeline de extração/auto-criação automática. Se não
// encontrar, a UI deve orientar o usuário a cadastrar em Fornecedores
// primeiro — este helper NUNCA cria um fornecedor novo.
// Chamado por: DespesasModal.tsx (modo 'novo', lançamento manual)
// ============================================================
export async function buscarFornecedorPorDocumento(cpfCnpj: string): Promise<{ id: number; razao: string } | null> {
  const digitos = cpfCnpj.replace(/[^0-9]/g, '')
  if (!digitos) return null

  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, razao, cnpj, cpf')
    .or(`cnpj.ilike.%${digitos}%,cpf.ilike.%${digitos}%`)
    .limit(5)

  if (error || !data || data.length === 0) return null

  // Confirma o match exato pelos dígitos, evitando falso positivo de ILIKE
  const match = data.find((f: { cnpj?: string; cpf?: string }) => {
    const cnpjDig = (f.cnpj ?? '').replace(/[^0-9]/g, '')
    const cpfDig = (f.cpf ?? '').replace(/[^0-9]/g, '')
    return cnpjDig === digitos || cpfDig === digitos
  })

  return match ? { id: match.id, razao: match.razao } : null
}

// ============================================================
// formatarMoeda()
// Formata número para moeda brasileira — helper próprio do módulo,
// duplicado propositalmente em vez de importado de receitasService.ts,
// para manter Despesas 100% independente de Receitas
// ============================================================
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ============================================================
// formatarDataBR()
// Formata data ISO (YYYY-MM-DD) para dd/mm/yyyy
// ============================================================
export function formatarDataBR(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// ============================================================
// formatarCnpjCpf()
// Formata CPF/CNPJ (sem pontuação) para exibição
// ============================================================
export function formatarCnpjCpf(valor: string | null | undefined): string {
  if (!valor) return ''
  const digitos = valor.replace(/[^0-9]/g, '')
  if (digitos.length === 14) {
    return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digitos.length === 11) {
    return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return valor
}
