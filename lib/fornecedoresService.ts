// ============================================================
// lib/fornecedoresService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Todas as operações de dados do módulo fornecedores
//         Clone funcional de clientesService.ts — sem lógica de
//         Lista/Status, com export incluindo website
// Conecta com: supabase.ts (cliente), types/fornecedores.ts (tipos)
//              FornecedoresTabela.tsx, FornecedoresModal.tsx,
//              ExportDropdown.tsx, FornecedoresHeader.tsx
// ============================================================

import { supabase } from '@/lib/supabase'
import type {
  Fornecedor,
  FornecedorInsert,
  FornecedorUpdate,
  FiltrosFornecedores,
  ChavePix,
  TipoChavePix,
  FornecedorCategoria,
  ContatoWhatsApp,
} from '@/types/fornecedores'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA = 'fornecedores'
const TABELA_CHAVES_PIX = 'fornecedor_chaves_pix'  // Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md, Seção 1
const TABELA_CATEGORIAS = 'fornecedor_categorias'  // Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md, Seção 4

// ============================================================
// buscarFornecedores()
// Retorna lista de fornecedores aplicando busca textual
// Sem filtros de lista/status — não existem neste módulo
// Ordenado por id crescente (mesmo padrão de Clientes)
// Chamado por: app/fornecedores/page.tsx
// ============================================================
export async function buscarFornecedores(filtros: FiltrosFornecedores): Promise<Fornecedor[]> {
  let query = supabase.from(TABELA).select('*').is('deleted_at', null) // soft-delete — nunca lista os excluídos

  if (filtros.busca && filtros.busca.trim() !== '') {
    const termo = `%${filtros.busca.trim()}%`
    query = query.or(
      `fantasia.ilike.${termo},razao.ilike.${termo},cnpj.ilike.${termo},cpf.ilike.${termo},cidade.ilike.${termo}`
    )
  }

  query = query.order('id', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('[fornecedoresService] buscarFornecedores error:', error)
    throw new Error(error.message)
  }

  return (data as Fornecedor[]) ?? []
}

// ============================================================
// contarFornecedores()
// Retorna o total de fornecedores cadastrados
// Sem qualificador "ativos" — não existe esse conceito aqui
// Chamado por: app/fornecedores/page.tsx após cada save
// ============================================================
export async function contarFornecedores(): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null) // soft-delete — não conta os excluídos

  if (error) {
    console.error('[fornecedoresService] contarFornecedores error:', error)
    return 0
  }

  return count ?? 0
}

// ============================================================
// buscarFornecedorPorId()
// Retorna um fornecedor pelo id — pré-preenche modal editar/visualizar
// Chamado por: FornecedoresTabela.tsx ao clicar em ✏️ ou 👁
// ============================================================
export async function buscarFornecedorPorId(id: number): Promise<Fornecedor | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null) // soft-delete — não retorna um excluído
    .single()

  if (error) {
    console.error('[fornecedoresService] buscarFornecedorPorId error:', error)
    return null
  }

  return data as Fornecedor
}

// ============================================================
// verificarDuplicidadeFornecedor()
// Verifica se já existe um fornecedor com o mesmo CNPJ ou CPF
// Retorna o fornecedor existente ou null se não houver duplicidade
// Chamado por: FornecedoresModal.tsx antes de criar ou editar
// Parâmetro excludeId: ID do registro atual (para ignorar em edições)
// ============================================================
export async function verificarDuplicidadeFornecedor(
  cnpj: string,
  cpf: string,
  excludeId?: number
): Promise<Fornecedor | null> {
  // Strip para dígitos — base de comparação final no JS
  const cnpjLimpo = cnpj.replace(/[^0-9]/g, '')
  const cpfLimpo  = cpf.replace(/[^0-9]/g, '')

  if (!cnpjLimpo && !cpfLimpo) return null

  // Formata para o padrão armazenado no banco
  // CRÍTICO: ilike com dígitos brutos (ex: "11506178000125") NÃO bate com
  // o valor formatado no banco ("11.506.178/0001-25") porque os dígitos
  // não são contíguos — a busca precisa usar o formato com pontuação
  const cnpjFmt = cnpjLimpo.length === 14
    ? cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : cnpjLimpo
  const cpfFmt = cpfLimpo.length === 11
    ? cpfLimpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    : cpfLimpo

  let query = supabase.from(TABELA).select('id, razao, cnpj, cpf')

  // OR duplo por campo: busca pelo valor formatado E pelo valor sem formatação
  // Cobre registros antigos que possam estar armazenados sem pontuação
  const filtros: string[] = []
  if (cnpjLimpo) {
    filtros.push(`cnpj.ilike.%${cnpjFmt}%`)    // formatado  ex: 11.506.178/0001-25
    filtros.push(`cnpj.ilike.%${cnpjLimpo}%`)  // sem format ex: 11506178000125
  }
  if (cpfLimpo) {
    filtros.push(`cpf.ilike.%${cpfFmt}%`)      // formatado  ex: 218.962.308-14
    filtros.push(`cpf.ilike.%${cpfLimpo}%`)    // sem format ex: 21896230814
  }
  query = query.or(filtros.join(','))

  // limit generoso para cobrir possíveis falsos positivos do ilike
  const { data, error } = await query.limit(10)

  if (error) {
    console.error('[fornecedoresService] verificarDuplicidadeFornecedor error:', error)
    return null
  }

  if (!data || data.length === 0) return null

  // Segunda etapa: comparação exata por dígitos — elimina falsos positivos do ilike
  const duplicados = data.filter(f => {
    if (excludeId !== undefined && f.id === excludeId) return false
    const fCnpj = (f.cnpj ?? '').replace(/[^0-9]/g, '')
    const fCpf  = (f.cpf  ?? '').replace(/[^0-9]/g, '')
    return (cnpjLimpo && fCnpj === cnpjLimpo) || (cpfLimpo && fCpf === cpfLimpo)
  })

  return duplicados.length > 0 ? duplicados[0] : null
}

// ============================================================
// normalizarDocumentos()
// Converte string vazia ('') para null nos campos cpf e cnpj antes de
// gravar no banco. Necessário porque a coluna cpf tem UNIQUE constraint
// (fornecedores_cpf_key): o Postgres permite múltiplos NULL (tratados
// como distintos entre si), mas bloqueia múltiplos '' (string vazia é
// um valor igual a outro) — sem essa normalização, o segundo fornecedor
// salvo com CPF em branco colide com o primeiro e o INSERT/UPDATE falha
// com "duplicate key value violates unique constraint fornecedores_cpf_key".
// Mesma normalização aplicada a cnpj por simetria/precaução, já que a
// coluna segue o mesmo padrão (fornecedores_cnpj_key).
// Genérico em T para servir tanto FornecedorInsert quanto os campos de
// FornecedorUpdate (após desestruturar o id) sem duplicar a função.
// Chamado por: criarFornecedor(), editarFornecedor()
// ============================================================
function normalizarDocumentos<T extends { cpf?: string | null; cnpj?: string | null }>(
  campos: T
): T {
  return {
    ...campos, // preserva todos os demais campos do objeto sem alteração
    // string vazia vira null — valores já null ou preenchidos passam intactos
    cpf: campos.cpf === '' ? null : campos.cpf,
    cnpj: campos.cnpj === '' ? null : campos.cnpj,
  }
}

// ============================================================
// criarFornecedor()
// Insere um novo fornecedor e retorna o registro criado
// Chamado por: FornecedoresModal.tsx ao clicar em 💾 Gravar (modo novo)
// ============================================================
export async function criarFornecedor(fornecedor: FornecedorInsert): Promise<Fornecedor> {
  const { data, error } = await supabase
    .from(TABELA)
    .insert(normalizarDocumentos(fornecedor)) // cpf/cnpj vazios ('') viram null antes de gravar
    .select()
    .single()

  if (error) {
    console.error('[fornecedoresService] criarFornecedor error:', error)
    throw new Error(error.message)
  }

  return data as Fornecedor
}

// ============================================================
// editarFornecedor()
// Atualiza um fornecedor existente pelo id
// updated_at atualizado automaticamente pelo trigger Supabase
// Chamado por: FornecedoresModal.tsx ao clicar em 💾 Gravar (modo editar)
// ============================================================
export async function editarFornecedor(fornecedor: FornecedorUpdate): Promise<Fornecedor> {
  const { id, ...campos } = fornecedor

  const { data, error } = await supabase
    .from(TABELA)
    .update(normalizarDocumentos(campos)) // cpf/cnpj vazios ('') viram null antes de gravar
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[fornecedoresService] editarFornecedor error:', error)
    throw new Error(error.message)
  }

  return data as Fornecedor
}

// ============================================================
// atualizarTipoFornecedor()
// Atualiza SOMENTE o campo tipo_fornecedor_id de um fornecedor — usado
// pela classificação rápida inline na tabela/lista (FornecedoresTabela.tsx,
// FornecedoresMobileList.tsx), suporte à classificação em massa dos 19
// fornecedores existentes pedida pela Especificacao_Modulo_Relatorios.md,
// Seção 3. Não passa por editarFornecedor() de propósito: evita reenviar
// o registro inteiro só para trocar um campo, e mantém a intenção da
// chamada explícita no nome da função.
// MIGRADO (Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md, Seção
// 4.5): antes escrevia o enum fechado tipo_fornecedor (TEXT), agora
// escreve tipo_fornecedor_id (FK p/ fornecedor_categorias) — parâmetro
// categoriaId é o id da linha em fornecedor_categorias, ou null para
// "Não classificado".
// Chamado por: FornecedoresTabela.tsx, FornecedoresMobileList.tsx,
//              app/fornecedores/page.tsx (handleAlterarTipo)
// ============================================================
export async function atualizarTipoFornecedor(
  id: number,
  categoriaId: number | null,
): Promise<Fornecedor> {
  const { data, error } = await supabase
    .from(TABELA)
    .update({ tipo_fornecedor_id: categoriaId }) // único campo alterado
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[fornecedoresService] atualizarTipoFornecedor error:', error)
    throw new Error(error.message)
  }

  return data as Fornecedor
}

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO: CHAVES PIX (Especificacao_Fornecedores_Pix_Categorias_
// WhatsApp.md, Seção 1). Tabela própria fornecedor_chaves_pix —
// 0..N chaves por fornecedor, no máximo 1 preferencial por vez.
// ────────────────────────────────────────────────────────────
// ============================================================

// ============================================================
// listarChavesPix()
// Retorna as chaves Pix não-deletadas de um fornecedor
// Ordenado por created_at para manter ordem estável de cadastro
// Chamado por: FornecedoresModal.tsx ao abrir em modo editar/visualizar
// ============================================================
export async function listarChavesPix(fornecedorId: number): Promise<ChavePix[]> {
  const { data, error } = await supabase
    .from(TABELA_CHAVES_PIX)
    .select('*')
    .eq('fornecedor_id', fornecedorId) // só as chaves deste fornecedor
    .is('deleted_at', null)            // soft-delete — nunca lista as excluídas
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[fornecedoresService] listarChavesPix error:', error)
    throw new Error(error.message)
  }

  return (data as ChavePix[]) ?? []
}

// ============================================================
// criarChavePix()
// Insere uma nova chave Pix para o fornecedor informado
// Sem validação de formato em valor (Seção 1.1) — só "não vazio",
// já garantido pela UI antes de chamar esta função
// preferencial nasce sempre false — marcar como preferencial é uma
// ação separada e explícita via definirChavePixPreferencial()
// Chamado por: FornecedoresModal.tsx, botão "Adicionar chave"
// ============================================================
export async function criarChavePix(
  fornecedorId: number,
  tipo: TipoChavePix,
  valor: string,
): Promise<ChavePix> {
  const { data, error } = await supabase
    .from(TABELA_CHAVES_PIX)
    .insert({
      fornecedor_id: fornecedorId, // FK — dono da chave
      tipo_chave: tipo,            // tipo selecionado no formulário
      valor_chave: valor,          // valor digitado — sem transformação
      // preferencial: usa o DEFAULT false da coluna — não enviado aqui
    })
    .select()
    .single()

  if (error) {
    console.error('[fornecedoresService] criarChavePix error:', error)
    throw new Error(error.message)
  }

  return data as ChavePix
}

// ============================================================
// atualizarChavePix()
// Atualiza tipo/valor de uma chave existente — NÃO toca em
// `preferencial` (Seção 1.5: só definirChavePixPreferencial() altera
// esse campo, garantindo que a troca sempre passe pelo RPC atômico)
// Chamado por: FornecedoresModal.tsx, edição de uma linha existente
// ============================================================
export async function atualizarChavePix(
  chaveId: number,
  tipo: TipoChavePix,
  valor: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABELA_CHAVES_PIX)
    .update({ tipo_chave: tipo, valor_chave: valor, updated_at: new Date().toISOString() })
    .eq('id', chaveId)

  if (error) {
    console.error('[fornecedoresService] atualizarChavePix error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// definirChavePixPreferencial()
// Único jeito de alterar `preferencial` — delega ao RPC
// set_chave_pix_preferencial (sql/fornecedores.sql, Seção 1.3), que
// desmarca a chave preferencial atual e marca a nova na mesma
// transação. Chamada via supabase.rpc() precisa disso porque dois
// UPDATEs separados do client JS não são atômicos entre si.
// Chamado por: FornecedoresModal.tsx, toggle estilo rádio por linha
// ============================================================
export async function definirChavePixPreferencial(
  fornecedorId: number,
  chaveId: number,
): Promise<void> {
  const { error } = await supabase.rpc('set_chave_pix_preferencial', {
    // fornecedorId pode chegar aqui como string ("1"), não number — fornecedores.id
    // é BIGINT e o Supabase serializa BIGINT como string no JSON de resposta (mesma
    // causa-raiz do bug da coluna "Chave Pix" na listagem, ver Seção 3.3 do handoff).
    // Number() garante o tipo correto antes de enviar ao RPC.
    p_fornecedor_id: Number(fornecedorId), // nome do parâmetro deve bater com a assinatura SQL do RPC
    p_chave_id: Number(chaveId),
  })

  if (error) {
    console.error('[fornecedoresService] definirChavePixPreferencial error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// excluirChavePix()
// Soft delete de uma chave Pix — nunca DELETE físico (convenção do
// projeto). Se a chave excluída era a preferencial, nenhuma outra é
// promovida automaticamente — o fornecedor simplesmente fica sem
// chave preferencial até o usuário escolher uma nova (Seção 1.5)
// Chamado por: FornecedoresModal.tsx, confirmação inline Sim/Não
// ============================================================
export async function excluirChavePix(chaveId: number): Promise<void> {
  const { error } = await supabase
    .from(TABELA_CHAVES_PIX)
    .update({ deleted_at: new Date().toISOString() }) // soft-delete
    .eq('id', chaveId)

  if (error) {
    console.error('[fornecedoresService] excluirChavePix error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// listarChavesPixPreferenciais()
// Retorna TODAS as chaves Pix marcadas como preferencial (não-
// deletadas), de todos os fornecedores — usado pela coluna "Chave
// Pix" da listagem (Especificacao_Fornecedores_Pix_Categorias_
// WhatsApp.md, Seção 3.1), que precisa desse dado mas o objeto
// Fornecedor não o contém (fica em tabela separada, não embutido
// no select('*') de fornecedores). Conjunto pequeno por construção:
// o índice único parcial do banco (uq_fornecedor_chave_pix_
// preferencial) garante no máximo 1 linha por fornecedor.
// Chamado por: app/fornecedores/page.tsx, repassado por prop para
//              FornecedoresTabela.tsx e FornecedoresMobileList.tsx
// ============================================================
export async function listarChavesPixPreferenciais(): Promise<ChavePix[]> {
  const { data, error } = await supabase
    .from(TABELA_CHAVES_PIX)
    .select('*')
    .eq('preferencial', true) // só as marcadas como preferencial
    .is('deleted_at', null)   // soft-delete — nunca inclui as excluídas

  if (error) {
    console.error('[fornecedoresService] listarChavesPixPreferenciais error:', error)
    throw new Error(error.message)
  }

  return (data as ChavePix[]) ?? []
}

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO: CATEGORIAS DE FORNECEDOR (Especificacao_Fornecedores_
// Pix_Categorias_WhatsApp.md, Seção 4). Tabela própria
// fornecedor_categorias — substitui o enum fechado tipo_fornecedor.
// Qualquer usuário logado pode criar/renomear/excluir — sem
// restrição de permissão (Seção 4.1).
// ────────────────────────────────────────────────────────────
// ============================================================

// ============================================================
// listarCategorias()
// Retorna as categorias ativas (não-deletadas), ordenadas por nome
// Chamado por: FornecedoresModal.tsx, CategoriasModal.tsx,
//              app/fornecedores/page.tsx (fetch único, repassado
//              via prop para Tabela/MobileList — evita 3 fetches
//              redundantes na mesma tela)
// ============================================================
export async function listarCategorias(): Promise<FornecedorCategoria[]> {
  const { data, error } = await supabase
    .from(TABELA_CATEGORIAS)
    .select('*')
    .is('deleted_at', null)         // soft-delete — nunca lista as excluídas
    .order('nome', { ascending: true }) // ordem alfabética — mais fácil de achar no <select>

  if (error) {
    console.error('[fornecedoresService] listarCategorias error:', error)
    throw new Error(error.message)
  }

  return (data as FornecedorCategoria[]) ?? []
}

// ============================================================
// criarCategoria()
// Insere uma nova categoria — nome único (case-insensitive) garantido
// pelo índice uq_fornecedor_categoria_nome no banco; erro de duplicidade
// sobe como Error normal, tratado pela UI (CategoriasModal.tsx)
// Chamado por: CategoriasModal.tsx, botão "Adicionar categoria"
// ============================================================
export async function criarCategoria(nome: string): Promise<FornecedorCategoria> {
  const { data, error } = await supabase
    .from(TABELA_CATEGORIAS)
    .insert({ nome }) // created_at/updated_at usam DEFAULT now() da coluna
    .select()
    .single()

  if (error) {
    console.error('[fornecedoresService] criarCategoria error:', error)
    throw new Error(error.message)
  }

  return data as FornecedorCategoria
}

// ============================================================
// renomearCategoria()
// Atualiza SOMENTE o nome de uma categoria existente
// Chamado por: CategoriasModal.tsx, controle de rename inline
// ============================================================
export async function renomearCategoria(categoriaId: number, novoNome: string): Promise<void> {
  const { error } = await supabase
    .from(TABELA_CATEGORIAS)
    .update({ nome: novoNome, updated_at: new Date().toISOString() })
    .eq('id', categoriaId)

  if (error) {
    console.error('[fornecedoresService] renomearCategoria error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// excluirCategoria()
// Único jeito de excluir uma categoria — delega ao RPC
// excluir_categoria_fornecedor (sql/fornecedores.sql, Seção 4.4), que
// primeiro reclassifica todo fornecedor que usava a categoria para
// "Não classificado" e só depois soft-deleta a categoria — nunca
// deixa um fornecedor apontando para categoria já excluída
// Chamado por: CategoriasModal.tsx, confirmação inline Sim/Não
// ============================================================
export async function excluirCategoria(categoriaId: number): Promise<void> {
  const { error } = await supabase.rpc('excluir_categoria_fornecedor', {
    p_categoria_id: categoriaId, // nome do parâmetro deve bater com a assinatura SQL do RPC
  })

  if (error) {
    console.error('[fornecedoresService] excluirCategoria error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// ────────────────────────────────────────────────────────────
// SEÇÃO: WHATSAPP FAVORITO (Especificacao_Fornecedores_Pix_
// Categorias_WhatsApp.md, Seção 2). contato_whatsapp é JSONB de
// linha única — sem RPC necessário (Seção 2.1): ler, modificar em
// memória e escrever de volta com um único UPDATE já é atômico por
// natureza (uma linha, uma coluna, um statement).
// ────────────────────────────────────────────────────────────
// ============================================================

// ============================================================
// definirContatoWhatsAppFavorito()
// Lê o array contato_whatsapp atual do fornecedor, marca favorito=true
// no índice informado e favorito=false em todos os outros, e grava o
// array inteiro de volta em um único update()
// Chamado por: FornecedoresModal.tsx → WhatsAppSection.tsx (toggle
// estilo rádio, disponível quando suportaFavorito={true})
// ============================================================
export async function definirContatoWhatsAppFavorito(
  fornecedorId: number,
  contatoIndice: number,
): Promise<void> {
  // Passo 1: lê o array atual — precisa do estado mais recente do banco,
  // não do estado local do form, pra evitar sobrescrever uma edição concorrente
  const { data: atual, error: erroLeitura } = await supabase
    .from(TABELA)
    .select('contato_whatsapp')
    .eq('id', fornecedorId)
    .single()

  if (erroLeitura) {
    console.error('[fornecedoresService] definirContatoWhatsAppFavorito (leitura) error:', erroLeitura)
    throw new Error(erroLeitura.message)
  }

  const contatos = (atual?.contato_whatsapp as ContatoWhatsApp[] | null) ?? []

  // Passo 2: recalcula o array em memória — só o índice alvo fica true
  const atualizado = contatos.map((c, i) => ({
    ...c,
    favorito: i === contatoIndice,
  }))

  // Passo 3: grava o array inteiro de volta — uma linha, uma coluna,
  // um statement — já atômico por natureza, sem necessidade de RPC
  const { error: erroEscrita } = await supabase
    .from(TABELA)
    .update({ contato_whatsapp: atualizado })
    .eq('id', fornecedorId)

  if (erroEscrita) {
    console.error('[fornecedoresService] definirContatoWhatsAppFavorito (escrita) error:', erroEscrita)
    throw new Error(erroEscrita.message)
  }
}

// ============================================================
// excluirFornecedor()
// Soft delete de um fornecedor — nunca DELETE físico (convenção do
// projeto, mesmo padrão de excluirChavePix()). DELETE físico falhava
// com "duplicate key/foreign key constraint" sempre que o fornecedor
// tinha despesas vinculadas (despesas.fornecedor_id), já que a FK
// bloqueia apagar uma linha ainda referenciada.
// Chamado por: FornecedoresTabela.tsx / FornecedoresMobileList.tsx
//              após confirmação inline do usuário
// ============================================================
export async function excluirFornecedor(id: number): Promise<void> {
  const { error } = await supabase
    .from(TABELA)
    .update({ deleted_at: new Date().toISOString() }) // soft-delete
    .eq('id', id)

  if (error) {
    console.error('[fornecedoresService] excluirFornecedor error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// exportarCSV()
// Exporta a lista atual de fornecedores (filtrada) como CSV
// Campos: id, fantasia, razao, cnpj, cpf, cidade, uf, fone1, email, contato, website
// Chamado por: ExportDropdown.tsx ao selecionar "CSV"
// ============================================================
export function exportarCSV(fornecedores: Fornecedor[]): void {
  const dados = fornecedores.map(f => ({
    Código: f.id,
    'Nome Fantasia': f.fantasia ?? '',
    'Razão Social': f.razao,
    CNPJ: f.cnpj ?? '',
    CPF: f.cpf ?? '',
    Cidade: f.cidade ?? '',
    UF: f.uf ?? '',
    Telefone: f.fone1 ?? '',
    'E-mail': f.email ?? '',
    Contato: f.contato ?? '',
    Website: f.website ?? '',
  }))

  const csv = Papa.unparse(dados, { delimiter: ';' })

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `fornecedores_babinete_${dataHoje()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// exportarExcel()
// Exporta a lista atual de fornecedores (filtrada) como .xlsx
// Chamado por: ExportDropdown.tsx ao selecionar "Excel"
// ============================================================
export function exportarExcel(fornecedores: Fornecedor[]): void {
  const dados = fornecedores.map(f => ({
    Código: f.id,
    'Nome Fantasia': f.fantasia ?? '',
    'Razão Social': f.razao,
    CNPJ: f.cnpj ?? '',
    CPF: f.cpf ?? '',
    Cidade: f.cidade ?? '',
    UF: f.uf ?? '',
    Telefone: f.fone1 ?? '',
    'E-mail': f.email ?? '',
    Contato: f.contato ?? '',
    Website: f.website ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores')
  XLSX.writeFile(wb, `fornecedores_babinete_${dataHoje()}.xlsx`)
}

// ============================================================
// fazerBackup()
// Exporta a tabela fornecedores COMPLETA (sem filtros) como JSON
// Nome do arquivo inclui o usuário logado (mesmo padrão de Clientes)
// Chamado por: FornecedoresHeader.tsx e Basebar.tsx ao clicar em Backup
// ============================================================
export async function fazerBackup(usuario?: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    console.error('[fornecedoresService] fazerBackup error:', error)
    throw new Error(error.message)
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const sufixoUsuario = usuario ? `_${usuario}` : ''
  link.download = `backup_fornecedores_${dataHoje()}${sufixoUsuario}.json`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// restaurarBackup()
// Recebe array de fornecedores (lido do arquivo JSON de backup)
// e faz upsert completo na tabela — mantém id original
// Chamado por: FornecedoresHeader.tsx e Basebar.tsx após leitura do arquivo
// ============================================================
export async function restaurarBackup(fornecedores: Fornecedor[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const registros = fornecedores.map(({ created_at, updated_at, ...resto }) => resto)

  const { error } = await supabase
    .from(TABELA)
    .upsert(registros, { onConflict: 'id' })

  if (error) {
    console.error('[fornecedoresService] restaurarBackup error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// lerArquivoBackup()
// Lê o arquivo JSON selecionado pelo usuário e retorna
// o array de fornecedores para ser passado a restaurarBackup()
// Chamado por: FornecedoresHeader.tsx após o usuário selecionar arquivo
// ============================================================
export function lerArquivoBackup(file: File): Promise<Fornecedor[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const conteudo = e.target?.result as string
        const dados = JSON.parse(conteudo) as Fornecedor[]
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
// dataHoje()
// Retorna a data atual formatada para nome de arquivo
// ============================================================
function dataHoje(): string {
  return new Date().toISOString().slice(0, 10)
}
