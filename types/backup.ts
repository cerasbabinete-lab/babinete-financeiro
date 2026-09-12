// types/backup.ts
//
// Tipos compartilhados do módulo Backup.
// A lista e a ordem de TabelaBackup vêm de lib/backupService.ts (fonte única da verdade —
// ver Seção 3.3 da especificação: a ordem do array É a regra de negócio de FK).

import type { TabelaBackup } from '@/lib/backupService';

export interface BackupCompleto {
  gerado_em: string; // ISO 8601
  gerado_por: string; // username de quem gerou
  versao_formato: 1;
  tabelas: Partial<Record<TabelaBackup, unknown[]>>;
}

export interface ResultadoRestauracao {
  tabela: TabelaBackup;
  processados: number;
  erro?: string;
}

export interface RequisicaoRestauracao {
  tabelas: Partial<Record<TabelaBackup, Record<string, unknown>[]>>;
  modoSubstituicaoTotal?: boolean;
}
