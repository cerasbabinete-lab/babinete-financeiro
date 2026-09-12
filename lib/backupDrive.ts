// ============================================================
// lib/backupDrive.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Backup
// Função: Pequeno helper compartilhado entre TODOS os
//         lib/<modulo>Service.ts — chama pages/api/backup/replicar-drive.ts
//         para duplicar um backup recém-arquivado no Supabase Storage
//         também no Google Drive (cerasbabinete@gmail.com, pasta
//         SGFB/Backups).
// EXCEÇÃO DELIBERADA à convenção do projeto de não cross-importar entre
// lib/<modulo>Service.ts: isto não é lógica de negócio de nenhum módulo,
// é infraestrutura pura (uma chamada HTTP). Duplicar isto em 7 arquivos
// diferentes seria pior do que este único ponto compartilhado — mesmo
// raciocínio já usado para o Supabase Storage (ver
// Especificacao_Modulo_Backup.md, Seção 3.7).
// O Supabase Storage continua sendo a fonte de verdade: uma falha aqui
// NUNCA derruba o backup em si — quem chama decide como avisar o
// usuário (ver replicarBackupNoDrive, que nunca lança exceção).
// ============================================================

import { supabase } from '@/lib/supabase'

export interface ResultadoReplicacaoDrive {
  ok: boolean
  erro?: string
}

/**
 * Envia uma cópia do backup (já arquivado no Supabase Storage) para o
 * Google Drive. NUNCA lança exceção — retorna { ok: false, erro } em caso
 * de falha, para que quem chamou decida como avisar o usuário sem
 * derrubar o backup principal, que já foi concluído no Supabase.
 */
export async function replicarBackupNoDrive(
  nomeArquivo: string,
  conteudo: string,
): Promise<ResultadoReplicacaoDrive> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      return { ok: false, erro: 'Sessão expirada — não foi possível duplicar no Google Drive.' }
    }

    const resp = await fetch('/api/backup/replicar-drive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nomeArquivo, conteudo }),
    })

    if (!resp.ok) {
      const corpo = await resp.json().catch(() => ({}))
      return { ok: false, erro: corpo?.erro ?? 'Falha ao duplicar no Google Drive.' }
    }

    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, erro: err instanceof Error ? err.message : 'Falha ao duplicar no Google Drive.' }
  }
}
