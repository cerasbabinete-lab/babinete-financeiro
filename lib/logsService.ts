// ============================================================
// lib/logsService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria)
// Função: Registro e listagem de eventos de acesso/auditoria.
//         Etapa 1 (27/08/2026): login/logout. Eventos de CRUD
//         (criar/editar/excluir) por módulo serão adicionados
//         incrementalmente — cada módulo, ao ser plugado, passa a
//         chamar registrarLog() nas suas próprias rotas de API.
// Conecta com: types/logs.ts, pages/api/logs/*.ts, sql/logs.sql
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LogAcessoInsert, ListarLogsResultado } from '@/types/logs'

const TABELA_LOGS = 'logs_acesso'

// ============================================================
// registrarLog()
// Insere uma linha em logs_acesso. Nunca lança erro para o
// chamador — falha ao registrar um log NUNCA deve derrubar a ação
// real (login, criação de registro, etc.), só fica no console do
// servidor. Isto é auditoria complementar, não parte do fluxo
// crítico do sistema.
// Chamado por: pages/api/logs/registrar-login.ts,
//              pages/api/logs/registrar-logout.ts, e (a partir da
//              Etapa 2) as rotas de criar/atualizar/excluir de cada
//              módulo já plugado
// ============================================================
export async function registrarLog(
  payload: LogAcessoInsert,
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client.from(TABELA_LOGS).insert({
    usuario_id: payload.usuarioId ?? null,
    username: payload.username,
    tipo_evento: payload.tipoEvento,
    modulo: payload.modulo ?? null,
    registro_id: payload.registroId ?? null,
    registro_descricao: payload.registroDescricao ?? null,
    ip_address: payload.ipAddress ?? null,
  })

  if (error) {
    console.error('[logsService] registrarLog error:', error)
  }
}

// ============================================================
// listarLogs()
// Paginação tradicional (offset/limit), diferente do
// paginarConsulta() de lib/relatorios/paginacao.ts — aquele busca
// TODAS as linhas de uma vez para relatórios; aqui a tela de log é
// navegada página por página, então buscar tudo de uma vez seria
// desperdício conforme o histórico cresce.
// Chamado por: pages/api/logs/listar.ts
// ============================================================
export async function listarLogs(
  client: SupabaseClient,
  pagina: number = 1,
  tamanhoPagina: number = 50,
): Promise<ListarLogsResultado> {
  const inicio = (pagina - 1) * tamanhoPagina
  const fim = inicio + tamanhoPagina - 1

  const { data, error, count } = await client
    .from(TABELA_LOGS)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(inicio, fim)

  if (error) {
    console.error('[logsService] listarLogs error:', error)
    throw new Error(error.message)
  }

  return {
    logs: data ?? [],
    total: count ?? 0,
    pagina,
    tamanhoPagina,
  }
}
