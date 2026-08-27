// ============================================================
// types/logs.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria)
// Função: Tipagem da tabela logs_acesso e tipos auxiliares usados
//         pela camada de serviço, rotas de API e UI.
// Conecta com: lib/logsService.ts, pages/api/logs/*.ts,
//              components/usuarios/LogAcessoTabela.tsx (Etapa 1)
// Referência: sql/logs.sql
// ============================================================

export type TipoEventoLog =
  | 'login_sucesso'
  | 'login_falha'
  | 'logout'
  | 'criar'
  | 'editar'
  | 'excluir'

export interface LogAcesso {
  id: string
  usuario_id: string | null
  username: string
  tipo_evento: TipoEventoLog
  modulo: string | null
  registro_id: string | null
  registro_descricao: string | null
  ip_address: string | null
  created_at: string
}

// Payload aceito por registrarLog() — usuario_id é opcional porque
// login_falha pode não resolver a nenhum usuário real (username
// digitado errado)
export interface LogAcessoInsert {
  usuarioId?: string | null
  username: string
  tipoEvento: TipoEventoLog
  modulo?: string | null
  registroId?: string | null
  registroDescricao?: string | null
  ipAddress?: string | null
}

export interface ListarLogsResultado {
  logs: LogAcesso[]
  total: number
  pagina: number
  tamanhoPagina: number
}
