// ============================================================
// lib/clientesService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Todas as operações de dados do módulo clientes
//         Camada de serviço entre UI e Supabase
// Conecta com: supabase.ts (cliente), types/clientes.ts (tipos)
//              ClientesTabela.tsx, ClientesModal.tsx,
//              ExportDropdown.tsx, ClientesHeader.tsx, Basebar.tsx
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
  // IMPORTANTE: sanitiza o termo antes de interpolar na string .or()
  // Os caracteres , ( ) têm significado especial na sintaxe do filtro
  // Supabase e podem quebrar a query silenciosamente se não removidos
  if (filtros.busca && filtros.busca.trim() !== '') {
    const termoSanitizado = filtros.busca.trim().replace(/[,()]/g, '')
    const termo = `%${termoSanitizado}%`
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
export function exportarCSV(clientes: Cliente[], usuario: string): void {
  // Sanitiza o nome do usuário para uso seguro no nome do arquivo
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'
  // Seleciona e mapeia os campos para exportação
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
  link.download = `clientes_babinete_${dataHoje()}_${nomeSeguro}.csv`
  // Adiciona ao DOM para compatibilidade cross-browser (Firefox requer)
  document.body.appendChild(link)
  link.click()
  // setTimeout garante que o Firefox consiga buscar o blob antes de revogá-lo
  // chamada síncrona após click() falha silenciosamente no Firefox
  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(link)
  }, 100)
}

// ============================================================
// exportarExcel()
// Exporta a lista atual de clientes (filtrada) como .xlsx
// Usa SheetJS (xlsx) para geração client-side
// Chamado por: ExportDropdown.tsx ao selecionar "Excel"
// ============================================================
export function exportarExcel(clientes: Cliente[], usuario: string): void {
  // Sanitiza o nome do usuário para uso seguro no nome do arquivo
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'
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
  // SheetJS gera o blob e dispara o download internamente via writeFile
  // Não há URL para revogar — download é síncrono e seguro em todos os browsers
  XLSX.writeFile(wb, `clientes_babinete_${dataHoje()}_${nomeSeguro}.xlsx`)
}

// ============================================================
// fazerBackup()
// Exporta a tabela clientes COMPLETA (sem filtros) como JSON
// e envia direto para o Supabase Storage (bucket: backups)
// O arquivo NÃO é baixado localmente — fica salvo na nuvem
// Parâmetro usuario: 1º nome do usuário logado — incluído no
// nome do arquivo para identificar quem gerou o backup
// Exemplo de nome: backup_clientes_2026-06-15_maycon.json
// Chamado por: ClientesHeader.tsx e Basebar.tsx ao clicar em Backup
// ============================================================
export async function fazerBackup(usuario: string): Promise<void> {
  // Busca todos os registros da tabela ordenados por id
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    console.error('[clientesService] fazerBackup error:', error)
    throw new Error(error.message)
  }

  // Sanitiza o nome do usuário para uso seguro no nome do arquivo
  // Remove caracteres especiais que podem causar problema no Storage
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'

  // Nome inclui data + hora + usuário — garante unicidade sem precisar de upsert
  // Exemplo: backup_clientes_2026-06-15_14h32m07s_maycon.json
  const agora = new Date()
  const hora = `${String(agora.getHours()).padStart(2,'0')}h${String(agora.getMinutes()).padStart(2,'0')}m${String(agora.getSeconds()).padStart(2,'0')}s`
  const nomeArquivo = `backup_clientes_${dataHoje()}_${hora}_${nomeSeguro}.json`

  // Converte os dados para JSON e cria um Blob para upload
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })

  // Envia o arquivo para o bucket 'backups' no Supabase Storage
  // upsert: false — nome único por data+hora garante que nunca haverá colisão
  // Evita a necessidade de política UPDATE no RLS (só INSERT é necessário)
  const { error: uploadError } = await supabase.storage
    .from('backups')
    .upload(nomeArquivo, blob, {
      contentType: 'application/json',
      upsert: false,
    })

  if (uploadError) {
    console.error('[clientesService] fazerBackup upload error:', uploadError)
    throw new Error(`Erro ao salvar backup na nuvem: ${uploadError.message}`)
  }
}

// ============================================================
// listarBackups()
// Lista todos os arquivos de backup disponíveis no bucket 'backups'
// Retorna array de nomes de arquivo ordenados do mais recente ao mais antigo
// Chamado por: ClientesHeader.tsx e Basebar.tsx ao clicar em Restaurar
// ============================================================
export async function listarBackups(): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from('backups')
    .list('', { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) {
    console.error('[clientesService] listarBackups error:', error)
    throw new Error(error.message)
  }

  // Retorna apenas os nomes dos arquivos, do mais recente ao mais antigo
  return (data ?? []).map(f => f.name)
}

// ============================================================
// baixarBackup()
// Baixa o conteúdo de um arquivo de backup específico do Storage
// e retorna o array de clientes para ser passado a restaurarBackup()
// Chamado por: ClientesHeader.tsx e Basebar.tsx após usuário escolher arquivo
// ============================================================
export async function baixarBackup(nomeArquivo: string): Promise<Cliente[]> {
  // Faz download do arquivo como blob do Supabase Storage
  const { data, error } = await supabase.storage
    .from('backups')
    .download(nomeArquivo)

  if (error || !data) {
    console.error('[clientesService] baixarBackup error:', error)
    throw new Error(error?.message ?? 'Erro ao baixar backup')
  }

  // Converte o blob para texto e faz parse do JSON
  const texto = await data.text()
  const parsed = JSON.parse(texto)

  // Valida estrutura básica antes de retornar
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Formato de backup inválido: esperado array não-vazio.')
  }
  if (typeof parsed[0].id !== 'number' || typeof parsed[0].razao !== 'string') {
    throw new Error('Formato de backup inválido: registros não correspondem ao schema esperado.')
  }

  return parsed as Cliente[]
}

// ============================================================
// restaurarBackup()
// Recebe array de clientes (lido do arquivo JSON de backup)
// e faz upsert completo na tabela — mantém id original
// Estratégia: upsert por id (insert ou update se já existir)
// Chamado por: ClientesHeader.tsx e Basebar.tsx após leitura do arquivo
// ============================================================
// Valores válidos para o campo nomelista — usados na validação de backup
const NOMELISTA_VALIDOS = ['0', '1', '2', '3', '4', 'VAREJO']

export async function restaurarBackup(clientes: Cliente[]): Promise<void> {
  // Valida schema de cada registro antes do upsert
  // Evita que dados corrompidos ou malformados entrem no banco
  clientes.forEach((c, i) => {
    // id deve ser número inteiro positivo
    if (typeof c.id !== 'number' || !Number.isInteger(c.id) || c.id <= 0) {
      throw new Error(`Registro #${i + 1}: campo 'id' inválido (${c.id}). Esperado: inteiro positivo.`)
    }
    // razao deve ser string não-vazia (campo obrigatório na tabela)
    if (typeof c.razao !== 'string' || c.razao.trim() === '') {
      throw new Error(`Registro #${i + 1} (id=${c.id}): campo 'razao' inválido. Esperado: string não-vazia.`)
    }
    // nomelista deve ser um dos valores permitidos pelo sistema
    if (!NOMELISTA_VALIDOS.includes(c.nomelista)) {
      throw new Error(`Registro #${i + 1} (id=${c.id}): 'nomelista' inválido (${c.nomelista}). Esperado: ${NOMELISTA_VALIDOS.join(', ')}.`)
    }
  })

  // Remove campos gerados automaticamente (created_at, updated_at)
  // para evitar conflito com triggers do Supabase durante upsert
  // Desestrutura created_at e updated_at para excluí-los do upsert
  // (campos gerados por trigger Supabase — não devem ser sobrescritos)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        const dados = JSON.parse(conteudo)
        // Valida que o resultado é um array não-vazio antes de retornar
        // JSON.parse aceita null, {}, números — todos passariam sem este check
        if (!Array.isArray(dados) || dados.length === 0) {
          reject(new Error('Formato de backup inválido: esperado array não-vazio.'))
          return
        }
        // Valida que o primeiro elemento tem os campos mínimos obrigatórios
        // Evita que um array de objetos arbitrários seja aceito como backup
        const primeiro = dados[0]
        if (typeof primeiro.id !== 'number' || typeof primeiro.razao !== 'string') {
          reject(new Error('Formato de backup inválido: registros não correspondem ao schema esperado.'))
          return
        }
        resolve(dados as Cliente[])
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
