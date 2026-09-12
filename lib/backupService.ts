// lib/backupService.ts
//
// Serviço do módulo Backup — backup/restauração completa ou seletiva do sistema.
// Segue a convenção do projeto: service file autocontido, sem cross-import de
// outros lib/<modulo>Service.ts.
//
// ⚠️ Pontos a confirmar contra o repositório real antes de mesclar
// (ver Especificacao_Modulo_Backup.md, Seção 8):
//   - path de import do cliente Supabase (`@/lib/supabase`)
//   - forma real de obter o token/sessão do usuário logado

import { supabase } from '@/lib/supabase';
import { replicarBackupNoDrive } from '@/lib/backupDrive';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Ordem topológica de restauração — respeita TODAS as foreign keys do schema atual,
// consultado diretamente no banco (projeto Supabase hfustjtycznspillcybe) nesta sessão.
// A ORDEM DESTE ARRAY É REGRA DE NEGÓCIO — nunca reordenar sem reconferir as FKs
// (ver Especificacao_Modulo_Backup.md, Seção 3.3).
export const TABELAS_BACKUP_ORDEM = [
  'fornecedor_categorias',
  'transportadoras',
  'clientes',
  'fornecedores',
  'fornecedor_chaves_pix',
  'beneficiarios_pessoais',
  'receitas',
  'receitas_itens',
  'receitas_duplicatas',
  'contas_receber',
  'contas_receber_eventos',
  'despesas',
  'despesas_parcelas',
  'contas_a_pagar',
  'contas_a_pagar_eventos',
  'pagar_comprovantes_processados',
  'remessas_importadas',
  'pagar_arquivos_importados',
] as const;

export type TabelaBackup = (typeof TABELAS_BACKUP_ORDEM)[number];

// Deliberadamente FORA do escopo deste módulo: usuarios, usuarios_permissoes, logs_acesso.
// Ver Especificacao_Modulo_Backup.md, Seção 3.1, para a justificativa completa.

export const TABELA_LABEL: Record<TabelaBackup, string> = {
  fornecedor_categorias: 'Categorias de Fornecedor',
  transportadoras: 'Transportadoras',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  fornecedor_chaves_pix: 'Chaves Pix de Fornecedor',
  beneficiarios_pessoais: 'Beneficiários Pessoais',
  receitas: 'Receitas (NF-e)',
  receitas_itens: 'Itens de Receita',
  receitas_duplicatas: 'Duplicatas de Receita',
  contas_receber: 'Contas a Receber',
  contas_receber_eventos: 'Eventos de Contas a Receber',
  despesas: 'Despesas',
  despesas_parcelas: 'Parcelas de Despesa',
  contas_a_pagar: 'Contas a Pagar',
  contas_a_pagar_eventos: 'Eventos de Contas a Pagar',
  pagar_comprovantes_processados: 'Comprovantes Processados (Pagar)',
  remessas_importadas: 'Remessas Bancárias Importadas',
  pagar_arquivos_importados: 'Arquivos Importados (Pagar)',
};

export interface BackupCompleto {
  gerado_em: string; // ISO 8601
  gerado_por: string; // username de quem gerou este backup — sempre presente, nunca vazio
  versao_formato: 1;
  tabelas: Partial<Record<TabelaBackup, unknown[]>>;
}

export interface ResultadoRestauracao {
  tabela: TabelaBackup;
  processados: number;
  erro?: string;
}

/** Busca todas as linhas de uma tabela (dump completo — inclusive registros soft-deletados). */
async function buscarTodasLinhas(tabela: TabelaBackup): Promise<unknown[]> {
  const { data, error } = await supabase.from(tabela).select('*');
  if (error) {
    throw new Error(`Falha ao ler "${tabela}" para backup: ${error.message}`);
  }
  return data ?? [];
}

function dataArquivo(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Arquiva o payload de backup no bucket 'backups' — não baixa mais localmente. */
async function arquivarNaNuvem(payload: unknown, nomeArquivo: string): Promise<void> {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const { error } = await supabase.storage
    .from('backups')
    .upload(nomeArquivo, blob, { contentType: 'application/json', upsert: false });
  if (error) {
    throw new Error(`Falha ao arquivar backup na nuvem: ${error.message}`);
  }
}

function exigirUsuario(usuario: string): void {
  if (!usuario || !usuario.trim()) {
    throw new Error('Não foi possível identificar o usuário logado — backup cancelado.');
  }
}

/** Gera e arquiva na nuvem (bucket 'backups' + Google Drive) um backup .json com as 18 tabelas do módulo. */
export async function fazerBackupCompleto(usuario: string): Promise<string | undefined> {
  exigirUsuario(usuario);
  const tabelas: Partial<Record<TabelaBackup, unknown[]>> = {};
  for (const tabela of TABELAS_BACKUP_ORDEM) {
    tabelas[tabela] = await buscarTodasLinhas(tabela);
  }

  const payload: BackupCompleto = {
    gerado_em: new Date().toISOString(),
    gerado_por: usuario,
    versao_formato: 1,
    tabelas,
  };

  const nomeArquivo = `backup_completo_${dataArquivo()}_${usuario}.json`;
  await arquivarNaNuvem(payload, nomeArquivo);
  const resultadoDrive = await replicarBackupNoDrive(nomeArquivo, JSON.stringify(payload, null, 2));
  if (!resultadoDrive.ok) {
    return `Backup arquivado no Supabase, mas falhou ao duplicar no Google Drive: ${resultadoDrive.erro}`;
  }
}

/** Gera e arquiva na nuvem (bucket 'backups' + Google Drive) um backup .json de uma única tabela. */
export async function fazerBackupTabela(tabela: TabelaBackup, usuario: string): Promise<string | undefined> {
  exigirUsuario(usuario);
  const linhas = await buscarTodasLinhas(tabela);
  const payload: BackupCompleto = {
    gerado_em: new Date().toISOString(),
    gerado_por: usuario,
    versao_formato: 1,
    tabelas: { [tabela]: linhas },
  };
  const nomeArquivo = `backup_${tabela}_${dataArquivo()}_${usuario}.json`;
  await arquivarNaNuvem(payload, nomeArquivo);
  const resultadoDrive = await replicarBackupNoDrive(nomeArquivo, JSON.stringify(payload, null, 2));
  if (!resultadoDrive.ok) {
    return `Backup arquivado no Supabase, mas falhou ao duplicar no Google Drive: ${resultadoDrive.erro}`;
  }
}

/** Lê um arquivo de backup selecionado pelo usuário e valida seu formato mínimo. */
export function lerArquivoBackup(file: File): Promise<BackupCompleto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed || typeof parsed !== 'object' || !parsed.tabelas) {
          reject(new Error('Arquivo de backup inválido: estrutura não reconhecida.'));
          return;
        }
        if (!parsed.gerado_por || typeof parsed.gerado_por !== 'string' || !parsed.gerado_por.trim()) {
          reject(new Error('Arquivo de backup inválido: não é possível identificar quem gerou este backup (campo "gerado_por" ausente).'));
          return;
        }
        resolve(parsed as BackupCompleto);
      } catch {
        reject(new Error('Arquivo de backup inválido: não foi possível interpretar o JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo selecionado.'));
    reader.readAsText(file);
  });
}

/**
 * Restaura um backup (completo ou parcial) via rota server-side.
 * NUNCA escreve diretamente do browser — mesmo para tabelas cuja RLS hoje permitiria
 * escrita direta (decisão deliberada do comitê para esta funcionalidade específica;
 * ver Especificacao_Modulo_Backup.md, Seção 3.2).
 *
 * @param backup                 conteúdo já parseado (ver lerArquivoBackup)
 * @param tabelasSelecionadas    subconjunto de tabelas a restaurar; default = todas presentes no arquivo
 * @param modoSubstituicaoTotal  modo destrutivo (delete + insert) — requer permissão 'excluir' no módulo backup
 */
export async function restaurarBackup(
  backup: BackupCompleto,
  tabelasSelecionadas?: TabelaBackup[],
  modoSubstituicaoTotal = false
): Promise<ResultadoRestauracao[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Sessão expirada — faça login novamente antes de restaurar.');
  }

  const tabelasNoArquivo = Object.keys(backup.tabelas) as TabelaBackup[];
  const tabelasAlvo = (tabelasSelecionadas ?? tabelasNoArquivo)
    .filter((t): t is TabelaBackup => TABELAS_BACKUP_ORDEM.includes(t))
    // garante a ordem topológica correta independentemente da ordem de seleção do usuário
    .sort((a, b) => TABELAS_BACKUP_ORDEM.indexOf(a) - TABELAS_BACKUP_ORDEM.indexOf(b));

  const resp = await fetch('/api/backup/restaurar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tabelas: Object.fromEntries(tabelasAlvo.map((t) => [t, backup.tabelas[t] ?? []])),
      modoSubstituicaoTotal,
    }),
  });

  const json = await resp.json();
  if (!resp.ok && resp.status !== 207) {
    throw new Error(json?.erro ?? 'Falha ao restaurar backup.');
  }
  return json.resultados as ResultadoRestauracao[];
}

// --- Exportação (CSV/Excel) de uma tabela inteira a partir desta tela central ---
// Reaproveita o mesmo par de bibliotecas já usado nos outros módulos (papaparse / xlsx).

export async function exportarCSV(tabela: TabelaBackup, usuario: string): Promise<void> {
  const linhas = await buscarTodasLinhas(tabela);
  const csv = Papa.unparse(linhas as Record<string, unknown>[]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tabela}_${dataArquivo()}_${usuario}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportarExcel(tabela: TabelaBackup, usuario: string): Promise<void> {
  const linhas = await buscarTodasLinhas(tabela);
  const ws = XLSX.utils.json_to_sheet(linhas as Record<string, unknown>[]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabela.slice(0, 31)); // limite de 31 caracteres do Excel para nome de aba
  XLSX.writeFile(wb, `${tabela}_${dataArquivo()}_${usuario}.xlsx`);
}

// --- Backups na nuvem (bucket 'backups') — lista TODOS os arquivos arquivados por
// QUALQUER módulo (Clientes, Fornecedores, Receitas, Despesas, Contas a Receber,
// Contas a Pagar e este próprio módulo), não só os deste módulo. Cada módulo já
// nomeia seus arquivos de forma autodescritiva (backup_<modulo>_<data>_<usuario>.json),
// então uma listagem genérica do bucket basta — não precisa de subpastas por módulo.
// Ver Especificacao_Modulo_Backup.md, Seção 3.7.

export interface ArquivoBackupNuvem {
  nome: string;
  criadoEm: string | null;
  tamanhoBytes: number | null;
}

export async function listarTodosBackupsNuvem(): Promise<ArquivoBackupNuvem[]> {
  const { data, error } = await supabase.storage
    .from('backups')
    .list('', { sortBy: { column: 'created_at', order: 'desc' } });
  if (error) {
    throw new Error(`Falha ao listar backups na nuvem: ${error.message}`);
  }
  return (data ?? []).map((f) => ({
    nome: f.name,
    criadoEm: f.created_at ?? null,
    tamanhoBytes: (f.metadata as { size?: number } | null)?.size ?? null,
  }));
}

/** Baixa um arquivo do bucket 'backups' para o computador do usuário (cópia local a partir da nuvem). */
export async function baixarBackupNuvem(nomeArquivo: string): Promise<void> {
  const { data, error } = await supabase.storage.from('backups').download(nomeArquivo);
  if (error || !data) {
    throw new Error(error?.message ?? 'Falha ao baixar backup da nuvem.');
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
