// ============================================================
// lib/clientesService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Todas as operações de dados do módulo clientes
//         Camada de serviço entre UI e Supabase
// Conecta com: supabase.ts (cliente), types/clientes.ts (tipos)
//              ClientesTabela.tsx, ClientesModal.tsx,
//              ExportDropdown.tsx, ClientesHeader.tsx
// ============================================================

import { supabase } from '@/lib/supabase'
import type {
  Cliente,
  ClienteInsert,
  ClienteUpdate,
  FiltrosClientes,
} from '@/types/clientes'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ============================================================
// CONSTANTES
// ============================================================

// Nome da tabela no Supabase
const TABELA = 'clientes'

// Colunas exibidas na tabela e exportadas
const COLUNAS_EXPORT = [
  'id', 'fantasia', 'razao', 'cnpj', 'cpf',
  'cidade', 'uf', 'fone1', 'email', 'contato', 'nomelista',
]

// ============================================================
// buscarClientes()
// Retorna lista de clientes aplicando filtros de busca,
// lista e status. Usa ilike para busca case-insensitive
// e combina múltiplos campos com .or()
// Chamado por: app/clientes/page.tsx no useEffect e nos filtros
// ============================================================
export async function buscarClientes(filtros: FiltrosClientes): Promise<Cliente[]> {
  let query = supabase.from(TABELA).select('*')

  // Filtro de status: ativos = nomelista != '0', inativos = nomelista = '0'
  if (filtros.status === 'ativos') {
    query = query.neq('nomelista', '0')
  } else if (filtros.status === 'inativos') {
    query = query.eq('nomelista', '0')
  }
  // 'todos' = sem filtro de status

  // Filtro de lista: filtra por valor exato de nomelista
  if (filtros.lista && filtros.lista !== 'todas') {
    query = query.eq('nomelista', filtros.lista)
  }

  // Busca textual em múltiplos campos simultaneamente
  if (filtros.busca && filtros.busca.trim() !== '') {
    const termo = `%${filtros.busca.trim()}%`
    query = query.or(
      `fantasia.ilike.${termo},razao.ilike.${termo},cnpj.ilike.${termo},cpf.ilike.${termo},cidade.ilike.${termo}`
    )
  }

  // Ordena por código (id) crescente
  query = query.order('id', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('[clientesService] buscarClientes error:', error)
    throw new Error(error.message)
  }

  return (data as Cliente[]) ?? []
}

// ============================================================
// contarClientesAtivos()
// Retorna o total de clientes com nomelista != '0'
// Exibido como "468 clientes ativos" no header e mobile
// Chamado por: app/clientes/page.tsx após cada save/inativação
// ============================================================
export async function contarClientesAtivos(): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .neq('nomelista', '0')

  if (error) {
    console.error('[clientesService] contarClientesAtivos error:', error)
    return 0
  }

  return count ?? 0
}

// ============================================================
// buscarClientePorId()
// Retorna um cliente pelo id — usado para pré-preencher
// o modal de edição/visualização
// Chamado por: ClientesTabela.tsx ao clicar em ✏️ ou 👁
// ============================================================
export async function buscarClientePorId(id: number): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('[clientesService] buscarClientePorId error:', error)
    return null
  }

  return data as Cliente
}

// ============================================================
// criarCliente()
// Insere um novo cliente na tabela e retorna o registro criado
// id é gerado automaticamente pelo Supabase (SERIAL)
// Chamado por: ClientesModal.tsx ao clicar em 💾 Gravar (modo novo)
// ============================================================
export async function criarCliente(cliente: ClienteInsert): Promise<Cliente> {
  const { data, error } = await supabase
    .from(TABELA)
    .insert(cliente)
    .select()
    .single()

  if (error) {
    console.error('[clientesService] criarCliente error:', error)
    throw new Error(error.message)
  }

  return data as Cliente
}

// ============================================================
// editarCliente()
// Atualiza um cliente existente pelo id
// updated_at é atualizado automaticamente pelo trigger Supabase
// Chamado por: ClientesModal.tsx ao clicar em 💾 Gravar (modo editar)
// ============================================================
export async function editarCliente(cliente: ClienteUpdate): Promise<Cliente> {
  const { id, ...campos } = cliente

  const { data, error } = await supabase
    .from(TABELA)
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[clientesService] editarCliente error:', error)
    throw new Error(error.message)
  }

  return data as Cliente
}

// ============================================================
// exportarCSV()
// Exporta a lista atual de clientes (filtrada) como CSV
// Usa papaparse para geração client-side
// Chamado por: ExportDropdown.tsx ao selecionar "CSV"
// ============================================================
export function exportarCSV(clientes: Cliente[]): void {
  // Seleciona apenas as colunas definidas em COLUNAS_EXPORT
  const dados = clientes.map(c => ({
    Código: c.id,
    'Nome Fantasia': c.fantasia ?? '',
    'Razão Social': c.razao,
    CNPJ: c.cnpj ?? '',
    CPF: c.cpf ?? '',
    Cidade: c.cidade ?? '',
    UF: c.uf ?? '',
    Telefone: c.fone1 ?? '',
    'E-mail': c.email ?? '',
    Contato: c.contato ?? '',
    Lista: c.nomelista,
  }))

  const csv = Papa.unparse(dados, { delimiter: ';' })

  // Cria link de download e dispara automaticamente
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `clientes_babinete_${dataHoje()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// exportarExcel()
// Exporta a lista atual de clientes (filtrada) como .xlsx
// Usa SheetJS (xlsx) para geração client-side
// Chamado por: ExportDropdown.tsx ao selecionar "Excel"
// ============================================================
export function exportarExcel(clientes: Cliente[]): void {
  const dados = clientes.map(c => ({
    Código: c.id,
    'Nome Fantasia': c.fantasia ?? '',
    'Razão Social': c.razao,
    CNPJ: c.cnpj ?? '',
    CPF: c.cpf ?? '',
    Cidade: c.cidade ?? '',
    UF: c.uf ?? '',
    Telefone: c.fone1 ?? '',
    'E-mail': c.email ?? '',
    Contato: c.contato ?? '',
    Lista: c.nomelista,
  }))

  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  XLSX.writeFile(wb, `clientes_babinete_${dataHoje()}.xlsx`)
}

// ============================================================
// fazerBackup()
// Exporta a tabela clientes COMPLETA (sem filtros) como JSON
// Inclui todos os campos para restauração fiel
// Nome do arquivo inclui o usuário logado que gerou o backup
// Chamado por: ClientesHeader.tsx e Basebar.tsx ao clicar em Backup
// ============================================================
export async function fazerBackup(usuario?: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    console.error('[clientesService] fazerBackup error:', error)
    throw new Error(error.message)
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const sufixoUsuario = usuario ? `_${usuario}` : ''
  link.download = `backup_clientes_${dataHoje()}${sufixoUsuario}.json`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// restaurarBackup()
// Recebe array de clientes (lido do arquivo JSON de backup)
// e faz upsert completo na tabela — mantém id original
// Estratégia: upsert por id (insert ou update se já existir)
// Chamado por: ClientesHeader.tsx e Basebar.tsx após leitura do arquivo
// ============================================================
export async function restaurarBackup(clientes: Cliente[]): Promise<void> {
  // Remove campos gerados automaticamente para evitar conflitos
  const registros = clientes.map(({ created_at, updated_at, ...resto }) => resto)

  const { error } = await supabase
    .from(TABELA)
    .upsert(registros, { onConflict: 'id' })

  if (error) {
    console.error('[clientesService] restaurarBackup error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// lerArquivoBackup()
// Lê o arquivo JSON selecionado pelo usuário e retorna
// o array de clientes para ser passado a restaurarBackup()
// Chamado por: ClientesHeader.tsx após o usuário selecionar arquivo
// ============================================================
export function lerArquivoBackup(file: File): Promise<Cliente[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const conteudo = e.target?.result as string
        const dados = JSON.parse(conteudo) as Cliente[]
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
// Exemplo: '2026-06-14'
// Usado internamente por exportarCSV, exportarExcel, fazerBackup
// ============================================================
function dataHoje(): string {
  return new Date().toISOString().slice(0, 10)
}
