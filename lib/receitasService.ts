// ============================================================
// lib/receitasService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Todas as operações de dados do módulo receitas
//         Camada de serviço entre UI e Supabase
// Conecta com: supabase.ts, types/receitas.ts,
//              ReceitasTabela.tsx, ReceitasModal.tsx,
//              ReceitasMobileList.tsx, ReceitasHeader.tsx,
//              ImportarXmlButton.tsx, ExportDropdown.tsx
// ============================================================

import { supabase } from '@/lib/supabase'
import type {
  Receita,
  ReceitaInsert,
  ReceitaUpdate,
  ReceitaItem,
  Duplicata,
  Transportadora,
  FiltrosReceitas,
} from '@/types/receitas'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA          = 'receitas'
const TABELA_ITENS    = 'receitas_itens'
const TABELA_DUPLIC   = 'receitas_duplicatas'
const BUCKET_XML      = 'receitas_xml'
const BUCKET_BACKUPS  = 'backups'

// ============================================================
// buscarReceitas()
// Retorna lista de receitas aplicando filtros.
// Join com transportadoras e count de duplicatas via select.
// Ordenado por data_emissao DESC (mais recente primeiro).
// Chamado por: app/receitas/page.tsx no useEffect e filtros
// ============================================================
export async function buscarReceitas(filtros: FiltrosReceitas): Promise<Receita[]> {
  let query = supabase
    .from(TABELA)
    .select(`
      *,
      transportadora:transportadoras(*),
      duplicatas:receitas_duplicatas(*),
      itens:receitas_itens(*),
      cliente:clientes(fantasia)
    `)

  // Busca textual: nome, CNPJ/CPF (sem pontuação), número NF
  if (filtros.busca && filtros.busca.trim() !== '') {
    const termo     = `%${filtros.busca.trim()}%`
    const termoDig  = `%${filtros.busca.trim().replace(/[^0-9]/g, '')}%`
    const partes: string[] = [
      `cliente_nome.ilike.${termo}`,
      `cliente_cpf_cnpj.ilike.${termoDig}`,
      `natureza_operacao.ilike.${termo}`,
    ]
    // numero_nf é integer — não suporta ilike, mas suporta .eq quando o termo é numérico válido
    const termoInt = parseInt(filtros.busca.trim(), 10)
    if (!isNaN(termoInt)) {
      partes.push(`numero_nf.eq.${termoInt}`)
    }
    query = query.or(partes.join(','))
  }

  // Filtro data emissão início
  if (filtros.dataEmissaoDe && filtros.dataEmissaoDe !== '') {
    query = query.gte('data_emissao', filtros.dataEmissaoDe)
  }

  // Filtro data emissão fim — inclui o dia inteiro
  if (filtros.dataEmissaoAte && filtros.dataEmissaoAte !== '') {
    query = query.lte('data_emissao', filtros.dataEmissaoAte + 'T23:59:59')
  }

  // Filtro transportadora
  if (filtros.transportadoraId && filtros.transportadoraId !== '') {
    query = query.eq('transportadora_id', filtros.transportadoraId)
  }

  query = query.order('data_emissao', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('[receitasService] buscarReceitas error:', error)
    throw new Error(error.message)
  }

  let receitas = (data as Receita[]) ?? []

  // Filtros de prazo e forma de pagamento são aplicados client-side
  // pois dependem de cálculo sobre as duplicatas já carregadas
  if (filtros.formaPagamento && filtros.formaPagamento !== '') {
    receitas = receitas.filter(r => {
      const fp = calcularFormaPagamento(r.duplicatas ?? [])
      return fp === filtros.formaPagamento
    })
  }

  if (filtros.prazo && filtros.prazo !== '') {
    receitas = receitas.filter(r => {
      const prazo = calcularPrazos(r.data_emissao, r.duplicatas ?? [])
      return prazo === filtros.prazo
    })
  }

  return receitas
}

// ============================================================
// contarReceitas()
// Retorna o total de registros na tabela (sem filtros)
// Exibido no header como "X receitas"
// Chamado por: app/receitas/page.tsx após cada operação
// ============================================================
export async function contarReceitas(): Promise<number> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('[receitasService] contarReceitas error:', error)
    return 0
  }

  return count ?? 0
}

// ============================================================
// buscarReceitaPorId()
// Retorna uma receita completa com itens, duplicatas e transportadora
// Usado para pré-preencher o modal de edição/visualização
// Chamado por: ReceitasTabela.tsx ao clicar em editar/visualizar
// ============================================================
export async function buscarReceitaPorId(id: string): Promise<Receita | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(`
      *,
      transportadora:transportadoras(*),
      duplicatas:receitas_duplicatas(*),
      itens:receitas_itens(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[receitasService] buscarReceitaPorId error:', error)
    return null
  }

  return data as Receita
}

// ============================================================
// buscarTransportadoras()
// Retorna todas as transportadoras para o filtro dropdown
// Ordenado por nome alfabético
// Chamado por: ReceitasFiltros.tsx para popular o select
// ============================================================
export async function buscarTransportadoras(): Promise<Transportadora[]> {
  const { data, error } = await supabase
    .from('transportadoras')
    .select('*')
    .order('nome', { ascending: true })

  if (error) {
    console.error('[receitasService] buscarTransportadoras error:', error)
    return []
  }

  return (data as Transportadora[]) ?? []
}

// ============================================================
// verificarChaveAcessoDuplicada()
// Verifica se já existe uma receita com a mesma chave de acesso
// Retorna true se duplicada — usada no import XML para rejeitar
// Chamado por: ImportarXmlButton.tsx antes de inserir
// ============================================================
export async function verificarChaveAcessoDuplicada(chaveAcesso: string): Promise<boolean> {
  const { count, error } = await supabase
    .from(TABELA)
    .select('*', { count: 'exact', head: true })
    .eq('chave_acesso', chaveAcesso)

  if (error) {
    console.error('[receitasService] verificarChaveAcessoDuplicada error:', error)
    return false
  }

  return (count ?? 0) > 0
}

// ============================================================
// criarReceita()
// Insere receita + itens + duplicatas em sequência
// Retorna a receita criada com id + duplicatas com ids
// Chamado por: ReceitasModal.tsx (modo novo) e ImportarXmlButton.tsx
// ============================================================
export async function criarReceita(
  receita: ReceitaInsert,
  itens: Omit<ReceitaItem, 'id' | 'receita_id' | 'created_at'>[],
  duplicatas: Omit<Duplicata, 'id' | 'receita_id' | 'created_at'>[],
): Promise<{ receita: Receita; duplicatas: Duplicata[] }> {
  // 1. Insere a receita principal
  const { data, error } = await supabase
    .from(TABELA)
    .insert(receita)
    .select()
    .single()

  if (error) {
    console.error('[receitasService] criarReceita error:', error)
    throw new Error(error.message)
  }

  const novaReceita = data as Receita

  // 2. Insere os itens (se houver)
  if (itens.length > 0) {
    const itensComId = itens.map(item => ({ ...item, receita_id: novaReceita.id }))
    const { error: erroItens } = await supabase.from(TABELA_ITENS).insert(itensComId)
    if (erroItens) {
      console.error('[receitasService] criarReceita itens error:', erroItens)
      throw new Error(erroItens.message)
    }
  }

  // 3. Insere as duplicatas e retorna com ids gerados pelo Postgres
  // Os UUIDs das duplicatas são necessários para criar os títulos em Contas a Receber
  let duplicatasInseridas: Duplicata[] = []
  if (duplicatas.length > 0) {
    const duplicatasComId = duplicatas.map(d => ({ ...d, receita_id: novaReceita.id }))
    const { data: dupData, error: erroDuplic } = await supabase
      .from(TABELA_DUPLIC)
      .insert(duplicatasComId)
      .select()                    // Retorna as duplicatas com id gerado
    if (erroDuplic) {
      console.error('[receitasService] criarReceita duplicatas error:', erroDuplic)
      throw new Error(erroDuplic.message)
    }
    duplicatasInseridas = (dupData as Duplicata[]) ?? []
  }

  return { receita: novaReceita, duplicatas: duplicatasInseridas }
}

// ============================================================
// editarReceita()
// Atualiza receita principal + substitui itens e duplicatas
// Estratégia: DELETE + INSERT para itens e duplicatas
// (mais simples e seguro que upsert granular)
// Chamado por: ReceitasModal.tsx (modo editar)
// ============================================================
export async function editarReceita(
  receita: ReceitaUpdate,
  itens: Omit<ReceitaItem, 'id' | 'receita_id' | 'created_at'>[],
  duplicatas: Omit<Duplicata, 'id' | 'receita_id' | 'created_at'>[],
): Promise<Receita> {
  const { id, ...campos } = receita

  // 1. Atualiza o cabeçalho da receita
  const { data, error } = await supabase
    .from(TABELA)
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[receitasService] editarReceita error:', error)
    throw new Error(error.message)
  }

  // 2. Substitui itens: delete todos + reinsere
  const { error: erroDelItens } = await supabase
    .from(TABELA_ITENS)
    .delete()
    .eq('receita_id', id)

  if (erroDelItens) {
    console.error('[receitasService] editarReceita delete itens error:', erroDelItens)
    throw new Error(erroDelItens.message)
  }

  if (itens.length > 0) {
    const itensComId = itens.map(item => ({ ...item, receita_id: id }))
    const { error: erroInsItens } = await supabase.from(TABELA_ITENS).insert(itensComId)
    if (erroInsItens) {
      console.error('[receitasService] editarReceita insert itens error:', erroInsItens)
      throw new Error(erroInsItens.message)
    }
  }

  // 3. Substitui duplicatas: delete todas + reinsere
  const { error: erroDelDuplic } = await supabase
    .from(TABELA_DUPLIC)
    .delete()
    .eq('receita_id', id)

  if (erroDelDuplic) {
    console.error('[receitasService] editarReceita delete duplicatas error:', erroDelDuplic)
    throw new Error(erroDelDuplic.message)
  }

  if (duplicatas.length > 0) {
    const duplicatasComId = duplicatas.map(d => ({ ...d, receita_id: id }))
    const { error: erroInsDuplic } = await supabase.from(TABELA_DUPLIC).insert(duplicatasComId)
    if (erroInsDuplic) {
      console.error('[receitasService] editarReceita insert duplicatas error:', erroInsDuplic)
      throw new Error(erroInsDuplic.message)
    }
  }

  return data as Receita
}

// ============================================================
// excluirReceita()
// Remove permanentemente uma receita pelo id
// CASCADE DELETE no banco cuida de itens e duplicatas
// Chamado por: ReceitasTabela.tsx / ReceitasMobileList.tsx
//              após confirmação inline do usuário
// ============================================================
export async function excluirReceita(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABELA)
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[receitasService] excluirReceita error:', error)
    throw new Error(error.message)
  }
}

// ============================================================
// uploadXml()
// Faz upload do XML bruto para o bucket receitas_xml
// Filename: {chave_acesso}.xml
// Chamado por: ImportarXmlButton.tsx após inserção bem-sucedida
// ============================================================
export async function uploadXml(chaveAcesso: string, xmlString: string): Promise<string> {
  const filename    = `${chaveAcesso}.xml`
  const xmlBlob     = new Blob([xmlString], { type: 'application/xml' })

  const { error } = await supabase.storage
    .from(BUCKET_XML)
    .upload(filename, xmlBlob, { upsert: true, contentType: 'application/xml' })

  if (error) {
    console.error('[receitasService] uploadXml error:', error)
    throw new Error(error.message)
  }

  return filename
}

// ============================================================
// downloadXml()
// Baixa o XML de uma receita do bucket receitas_xml
// Retorna o conteúdo como string para geração do DANFE
// Chamado por: app/api/danfe/route.ts
// ============================================================
export async function downloadXml(xmlStoragePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_XML)
    .download(xmlStoragePath)

  if (error || !data) {
    console.error('[receitasService] downloadXml error:', error)
    throw new Error(error?.message ?? 'Erro ao baixar XML do storage')
  }

  return await data.text()
}

// ============================================================
// exportarCSV()
// Exporta a lista atual de receitas (filtrada) como CSV
// Chamado por: ExportDropdown.tsx ao selecionar "CSV"
// ============================================================
export function exportarCSV(receitas: Receita[], usuario: string): void {
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'

  const dados = receitas.map(r => ({
    'Emissão':          formatarDataBR(r.data_emissao),
    'Nº NF':            r.numero_nf,
    'Série':            r.serie,
    'Cliente':          r.cliente_nome ?? '',
    'CNPJ/CPF':         formatarCnpjCpf(r.cliente_cpf_cnpj ?? ''),
    'Município':        r.cliente_municipio ?? '',
    'UF':               r.cliente_uf ?? '',
    'Transportadora':   r.transportadora?.nome ?? (r.modalidade_frete === 9 ? 'Sem frete' : ''),
    'Duplicatas':       (r.duplicatas ?? []).length,
    'Prazos':           calcularPrazos(r.data_emissao, r.duplicatas ?? []),
    'Forma Pgto':       calcularFormaPagamento(r.duplicatas ?? []),
    'Valor Total':      r.valor_nf,
    'Chave Acesso':     r.chave_acesso,
  }))

  const csv = Papa.unparse(dados, { delimiter: ';' })
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `receitas_${dataHoje()}_${nomeSeguro}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// exportarExcel()
// Exporta a lista atual de receitas (filtrada) como .xlsx
// Chamado por: ExportDropdown.tsx ao selecionar "Excel"
// ============================================================
export function exportarExcel(receitas: Receita[], usuario: string): void {
  const nomeSeguro = usuario.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'usuario'

  const dados = receitas.map(r => ({
    'Emissão':          formatarDataBR(r.data_emissao),
    'Nº NF':            r.numero_nf,
    'Série':            r.serie,
    'Cliente':          r.cliente_nome ?? '',
    'CNPJ/CPF':         formatarCnpjCpf(r.cliente_cpf_cnpj ?? ''),
    'Município':        r.cliente_municipio ?? '',
    'UF':               r.cliente_uf ?? '',
    'Transportadora':   r.transportadora?.nome ?? (r.modalidade_frete === 9 ? 'Sem frete' : ''),
    'Duplicatas':       (r.duplicatas ?? []).length,
    'Prazos':           calcularPrazos(r.data_emissao, r.duplicatas ?? []),
    'Forma Pgto':       calcularFormaPagamento(r.duplicatas ?? []),
    'Valor Total':      r.valor_nf,
    'Chave Acesso':     r.chave_acesso,
  }))

  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Receitas')
  XLSX.writeFile(wb, `receitas_${dataHoje()}_${nomeSeguro}.xlsx`)
}

// ============================================================
// fazerBackup()
// Exporta a tabela receitas COMPLETA como JSON
// Inclui itens e duplicatas de cada receita
// Chamado por: ReceitasHeader.tsx ao clicar em Backup
// ============================================================
export async function fazerBackup(usuario?: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(`
      *,
      itens:receitas_itens(*),
      duplicatas:receitas_duplicatas(*)
    `)
    .order('data_emissao', { ascending: false })

  if (error) {
    console.error('[receitasService] fazerBackup error:', error)
    throw new Error(error.message)
  }

  const json       = JSON.stringify(data, null, 2)
  const blob       = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url        = URL.createObjectURL(blob)
  const link       = document.createElement('a')
  link.href        = url
  const sufixo     = usuario ? `_${usuario}` : ''
  link.download    = `backup_receitas_${dataHoje()}${sufixo}.json`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// lerArquivoBackup()
// Lê o arquivo JSON selecionado pelo usuário e retorna
// o array de receitas para ser passado a restaurarBackup()
// Chamado por: ReceitasHeader.tsx após o usuário selecionar arquivo
// ============================================================
export function lerArquivoBackup(file: File): Promise<Receita[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const conteudo = e.target?.result as string
        const dados    = JSON.parse(conteudo) as Receita[]
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
// Recebe array de receitas e faz upsert na tabela principal
// Itens e duplicatas são substituídos via delete + insert
// Chamado por: ReceitasHeader.tsx após leitura do arquivo
// ============================================================
export async function restaurarBackup(receitas: Receita[]): Promise<void> {
  for (const receita of receitas) {
    const { itens, duplicatas, transportadora, created_at, updated_at, ...dadosReceita } = receita

    // Upsert da receita principal (conflict em chave_acesso)
    const { data, error } = await supabase
      .from(TABELA)
      .upsert(dadosReceita, { onConflict: 'chave_acesso' })
      .select('id')
      .single()

    if (error) {
      console.error('[receitasService] restaurarBackup receita error:', error)
      throw new Error(error.message)
    }

    const receitaId = (data as { id: string }).id

    // Substitui itens — deleta os existentes e reinsere do backup
    await supabase.from(TABELA_ITENS).delete().eq('receita_id', receitaId)
    if (itens && itens.length > 0) {
      const itensLimpos = itens.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ id: _id, receita_id: _rid, created_at: _ca, ...rest }) => ({ ...rest, receita_id: receitaId })
      )
      // Verifica erro do insert — evita perda silenciosa de dados fiscais
      const { error: erroInsItens } = await supabase.from(TABELA_ITENS).insert(itensLimpos)
      if (erroInsItens) throw new Error(`Erro ao restaurar itens: ${erroInsItens.message}`)
    }

    // Substitui duplicatas — deleta as existentes e reinsere do backup
    await supabase.from(TABELA_DUPLIC).delete().eq('receita_id', receitaId)
    if (duplicatas && duplicatas.length > 0) {
      const duplicatasLimpos = duplicatas.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ id: _id, receita_id: _rid, created_at: _ca, ...rest }) => ({ ...rest, receita_id: receitaId })
      )
      // Verifica erro do insert — evita perda silenciosa de dados fiscais
      const { error: erroInsDuplic } = await supabase.from(TABELA_DUPLIC).insert(duplicatasLimpos)
      if (erroInsDuplic) throw new Error(`Erro ao restaurar duplicatas: ${erroInsDuplic.message}`)
    }
  }
}

// ============================================================
// calcularPrazos()
// Calcula string de prazos a partir das duplicatas
// Exemplos: "0" (à vista), "30DD", "30/60DD", "25/50/75DD"
// Chamado por: ReceitasTabela.tsx, ReceitasMobileList.tsx,
//              exportarCSV(), exportarExcel()
// ============================================================
export function calcularPrazos(dataEmissao: string, duplicatas: Duplicata[]): string {
  // Retorna '0' se não há duplicatas (à vista)
  if (!duplicatas || duplicatas.length === 0) return '0'
  // Retorna '—' se dataEmissao não foi preenchida (ex: modo novo antes de salvar)
  if (!dataEmissao) return '—'
  const emissao = new Date(dataEmissao)
  // Retorna '—' se dataEmissao produziu data inválida
  if (isNaN(emissao.getTime())) return '—'

  const dias = duplicatas
    .slice()
    .sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime())
    .map(d => {
      const venc   = new Date(d.data_vencimento)
      const diff   = Math.round((venc.getTime() - emissao.getTime()) / (1000 * 60 * 60 * 24))
      return diff
    })

  if (dias.every(d => d === 0)) return '0'

  return dias.map(d => `${d}`).join('/') + 'DD'
}

// ============================================================
// calcularFormaPagamento()
// Deriva a forma de pagamento a partir do count de duplicatas
// NUNCA armazenada — sempre calculada em tempo de exibição
// ============================================================
export function calcularFormaPagamento(duplicatas: Duplicata[]): string {
  return duplicatas && duplicatas.length > 0 ? 'Boleto' : 'À vista'
}

// ============================================================
// formatarCnpjCpf()
// Formata CPF/CNPJ (sem pontuação) para exibição
// Ex: "18350838000170" → "18.350.838/0001-70"
//     "12345678901"    → "123.456.789-01"
// ============================================================
export function formatarCnpjCpf(valor: string): string {
  const digits = valor.replace(/[^0-9]/g, '')
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return valor
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
// Formata ISO date string para dd/mm/yyyy
// Ex: "2026-06-16T10:01:17-03:00" → "16/06/2026"
// ============================================================
export function formatarDataBR(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// ============================================================
// buscarClientePorCpfCnpj()
// Busca cliente na tabela clientes pelo CPF/CNPJ normalizado
// Usado no modal para autocomplete do campo CNPJ/CPF
// Retorna id e dados básicos do cliente se encontrado
// ============================================================
export async function buscarClientePorCpfCnpj(cpfCnpj: string): Promise<{
  id: number
  razao: string
  fantasia?: string
  end?: string
  num?: string
  bairro?: string
  cep?: string
  cidade?: string
  uf?: string
  ie?: string
  fone1?: string
  email?: string
} | null> {
  const digits = cpfCnpj.replace(/[^0-9]/g, '')
  if (!digits) return null

  // Tenta busca pelo valor sem pontuação e com pontuação
  const cnpjFmt = digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : null
  const cpfFmt = digits.length === 11
    ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    : null

  const filtros: string[] = []
  if (cnpjFmt) {
    filtros.push(`cnpj.ilike.%${cnpjFmt}%`)
    filtros.push(`cnpj.ilike.%${digits}%`)
  }
  if (cpfFmt) {
    filtros.push(`cpf.ilike.%${cpfFmt}%`)
    filtros.push(`cpf.ilike.%${digits}%`)
  }
  if (filtros.length === 0) return null

  const { data, error } = await supabase
    .from('clientes')
    .select('id, razao, fantasia, end, num, bairro, cep, cidade, uf, ie, fone1, email, cnpj, cpf')
    .or(filtros.join(','))
    .limit(5)

  if (error || !data || data.length === 0) return null

  // Confirmação exata por dígitos — verifica cnpj e cpf separadamente
  // Concatenar produziria string de 25 dígitos que jamais igualaria CNPJ(14) ou CPF(11)
  const match = data.find((c: { cnpj?: string; cpf?: string }) => {
    const cnpjDig = (c.cnpj ?? '').replace(/[^0-9]/g, '')
    const cpfDig  = (c.cpf  ?? '').replace(/[^0-9]/g, '')
    return cnpjDig === digits || cpfDig === digits
  })

  return match ?? null
}

// ============================================================
// dataHoje() — interno
// Retorna a data atual formatada para nome de arquivo
// Exemplo: '2026-06-28'
// ============================================================
function dataHoje(): string {
  return new Date().toISOString().slice(0, 10)
}

// ============================================================
// Re-exporta BUCKET_XML para uso em outros módulos
// (ex: API route do DANFE que precisa baixar o XML)
// ============================================================
export { BUCKET_XML, BUCKET_BACKUPS }
