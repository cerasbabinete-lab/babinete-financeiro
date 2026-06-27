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
} from '@/types/fornecedores'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA = 'fornecedores'

// ============================================================
// buscarFornecedores()
// Retorna lista de fornecedores aplicando busca textual
// Sem filtros de lista/status — não existem neste módulo
// Ordenado por id crescente (mesmo padrão de Clientes)
// Chamado por: app/fornecedores/page.tsx
// ============================================================
export async function buscarFornecedores(filtros: FiltrosFornecedores): Promise<Fornecedor[]> {
  let query = supabase.from(TABELA).select('*')

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
  const cnpjLimpo = cnpj.replace(/[^0-9]/g, '')
  const cpfLimpo  = cpf.replace(/[^0-9]/g, '')

  if (!cnpjLimpo && !cpfLimpo) return null

  let query = supabase.from(TABELA).select('id, razao, cnpj, cpf')

  const filtros: string[] = []
  if (cnpjLimpo) filtros.push(`cnpj.ilike.%${cnpjLimpo}%`)
  if (cpfLimpo)  filtros.push(`cpf.ilike.%${cpfLimpo}%`)
  query = query.or(filtros.join(','))

  const { data, error } = await query.limit(5)

  if (error) {
    console.error('[fornecedoresService] verificarDuplicidadeFornecedor error:', error)
    return null
  }

  if (!data || data.length === 0) return null

  const duplicados = data.filter(f => {
    if (excludeId !== undefined && f.id === excludeId) return false
    const fCnpj = (f.cnpj ?? '').replace(/[^0-9]/g, '')
    const fCpf  = (f.cpf  ?? '').replace(/[^0-9]/g, '')
    return (cnpjLimpo && fCnpj === cnpjLimpo) || (cpfLimpo && fCpf === cpfLimpo)
  })

  return duplicados.length > 0 ? duplicados[0] : null
}

// ============================================================
// criarFornecedor()
// Insere um novo fornecedor e retorna o registro criado
// Chamado por: FornecedoresModal.tsx ao clicar em 💾 Gravar (modo novo)
// ============================================================
export async function criarFornecedor(fornecedor: FornecedorInsert): Promise<Fornecedor> {
  const { data, error } = await supabase
    .from(TABELA)
    .insert(fornecedor)
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
    .update(campos)
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
