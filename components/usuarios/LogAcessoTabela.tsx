// ============================================================
// components/usuarios/LogAcessoTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Log de Acesso (auditoria) — Etapa 1
// Função: Tabela paginada de logs_acesso, renderizada na aba "Log
//         de Acesso" de app/usuarios/page.tsx. Auto-contida — busca
//         e pagina os próprios dados via pages/api/logs/listar.ts,
//         diferente de UsuariosTabela.tsx (que recebe os dados como
//         prop da página-pai).
// Conecta com: pages/api/logs/listar.ts, types/logs.ts,
//              app/usuarios/page.tsx
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { LogAcesso, TipoEventoLog } from '@/types/logs'

const TAMANHO_PAGINA = 50

const ROTULO_EVENTO: Record<TipoEventoLog, string> = {
  login_sucesso: 'Login',
  login_falha: 'Login (falhou)',
  logout: 'Logout',
  criar: 'Criação',
  editar: 'Edição',
  excluir: 'Exclusão',
}

const COR_EVENTO: Record<TipoEventoLog, string> = {
  login_sucesso: '#16a34a',
  login_falha: '#dc2626',
  logout: '#5a84a6',
  criar: '#1a6094',
  editar: '#b45309',
  excluir: '#dc2626',
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
}

// ============================================================
// formatarLogsParaTxt() / baixarTxt()
// Exportação do Log de Acesso em texto puro — usada pelos botões
// "Exportar página" e "Exportar tudo". Formato: uma linha por
// registro, campos separados por " | ", cabeçalho com metadados.
// ============================================================
function formatarLogsParaTxt(logs: LogAcesso[], escopo: string): string {
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
  const linhas = [
    'Log de Acesso — Ceras Babinete Gestão Financeira',
    `Exportado em: ${geradoEm}`,
    `Escopo: ${escopo}`,
    `Total de registros: ${logs.length}`,
    '='.repeat(70),
    '',
    ...logs.map(log =>
      `${formatarDataHora(log.created_at)} | ${log.username} | ${ROTULO_EVENTO[log.tipo_evento]} | Módulo: ${log.modulo ?? '—'} | Registro: ${log.registro_descricao ?? '—'} | IP: ${log.ip_address ?? '—'}`
    ),
  ]
  return linhas.join('\n')
}

function baixarTxt(conteudo: string, nomeArquivo: string): void {
  const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function LogAcessoTabela() {
  const [logs, setLogs] = useState<LogAcesso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [exportandoTudo, setExportandoTudo] = useState(false)
  const [erroExport, setErroExport] = useState<string | null>(null)

  const carregarLogs = useCallback(async (paginaAlvo: number) => {
    setCarregando(true)
    setErro(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const res = await fetch(`/api/logs/listar?pagina=${paginaAlvo}&tamanhoPagina=${TAMANHO_PAGINA}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Falha ao buscar logs.')

      setLogs(json.logs)
      setTotal(json.total)
      setPagina(json.pagina)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregarLogs(1) }, [carregarLogs]) // eslint-disable-line react-hooks/set-state-in-effect

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA))

  function exportarPaginaAtual() {
    const nomeArquivo = `log-acesso_pagina-${pagina}_${new Date().toISOString().slice(0, 10)}.txt`
    baixarTxt(formatarLogsParaTxt(logs, `Página ${pagina} de ${totalPaginas} (${logs.length} registros desta página)`), nomeArquivo)
  }

  async function exportarTudo() {
    setExportandoTudo(true)
    setErroExport(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const todos: LogAcesso[] = []
      let paginaAtual = 1
      let totalGeral = Infinity
      const TAMANHO_LOTE = 200 // máximo aceito por pages/api/logs/listar.ts

      while (todos.length < totalGeral) {
        const res = await fetch(`/api/logs/listar?pagina=${paginaAtual}&tamanhoPagina=${TAMANHO_LOTE}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.erro ?? 'Falha ao buscar logs.')

        todos.push(...json.logs)
        totalGeral = json.total
        paginaAtual += 1
      }

      const nomeArquivo = `log-acesso_completo_${new Date().toISOString().slice(0, 10)}.txt`
      baixarTxt(formatarLogsParaTxt(todos, `Todos os registros (${todos.length} no total)`), nomeArquivo)
    } catch (err: unknown) {
      setErroExport(err instanceof Error ? err.message : 'Falha ao exportar todos os logs.')
    } finally {
      setExportandoTudo(false)
    }
  }

  if (carregando && logs.length === 0) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando...</div>
  }

  if (erro) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#dc2626', fontSize: '12px' }}>{erro}</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '8px' }}>
        <button
          onClick={exportarPaginaAtual}
          disabled={logs.length === 0}
          style={{
            padding: '5px 12px', fontSize: '11px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#fff', color: '#1a6094', border: '1px solid #dde8f0', borderRadius: '5px',
            cursor: logs.length === 0 ? 'default' : 'pointer', opacity: logs.length === 0 ? 0.4 : 1,
          }}
        >
          Exportar página (.txt)
        </button>
        <button
          onClick={exportarTudo}
          disabled={exportandoTudo || total === 0}
          style={{
            padding: '5px 12px', fontSize: '11px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#1a6094', color: '#fff', border: '1px solid #1a6094', borderRadius: '5px',
            cursor: exportandoTudo || total === 0 ? 'default' : 'pointer', opacity: exportandoTudo || total === 0 ? 0.6 : 1,
          }}
        >
          {exportandoTudo ? 'Exportando...' : 'Exportar tudo (.txt)'}
        </button>
      </div>

      {erroExport && (
        <div style={{ padding: '8px 10px', marginBottom: '8px', background: '#fef2f2', color: '#dc2626', fontSize: '11px', borderRadius: '5px' }}>
          {erroExport}
        </div>
      )}

      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #dde8f0', borderRadius: '8px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f0f4f7', textAlign: 'left' }}>
            <th style={{ padding: '8px 10px', color: '#1a6094', fontWeight: 700 }}>Data/Hora</th>
            <th style={{ padding: '8px 10px', color: '#1a6094', fontWeight: 700 }}>Usuário</th>
            <th style={{ padding: '8px 10px', color: '#1a6094', fontWeight: 700 }}>Evento</th>
            <th style={{ padding: '8px 10px', color: '#1a6094', fontWeight: 700 }}>Módulo</th>
            <th style={{ padding: '8px 10px', color: '#1a6094', fontWeight: 700 }}>Registro</th>
            <th style={{ padding: '8px 10px', color: '#1a6094', fontWeight: 700 }}>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#5a84a6' }}>Nenhum registro de acesso ainda.</td></tr>
          ) : (
            logs.map(log => (
              <tr key={log.id} style={{ borderTop: '1px solid #eef2f6' }}>
                <td style={{ padding: '7px 10px', color: '#3a6080', whiteSpace: 'nowrap' }}>{formatarDataHora(log.created_at)}</td>
                <td style={{ padding: '7px 10px', color: '#3a6080' }}>{log.username}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ color: COR_EVENTO[log.tipo_evento], fontWeight: 700 }}>{ROTULO_EVENTO[log.tipo_evento]}</span>
                </td>
                <td style={{ padding: '7px 10px', color: '#3a6080' }}>{log.modulo ?? '—'}</td>
                <td style={{ padding: '7px 10px', color: '#3a6080' }}>{log.registro_descricao ?? '—'}</td>
                <td style={{ padding: '7px 10px', color: '#5a84a6' }}>{log.ip_address ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderTop: '1px solid #dde8f0', fontSize: '11px', color: '#5a84a6' }}>
        <span>{total} registro{total === 1 ? '' : 's'} — página {pagina} de {totalPaginas}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => carregarLogs(pagina - 1)}
            disabled={pagina <= 1 || carregando}
            style={{ padding: '3px 10px', border: '1px solid #dde8f0', borderRadius: '4px', background: '#fff', cursor: pagina <= 1 ? 'default' : 'pointer', opacity: pagina <= 1 ? 0.4 : 1 }}
          >
            Anterior
          </button>
          <button
            onClick={() => carregarLogs(pagina + 1)}
            disabled={pagina >= totalPaginas || carregando}
            style={{ padding: '3px 10px', border: '1px solid #dde8f0', borderRadius: '4px', background: '#fff', cursor: pagina >= totalPaginas ? 'default' : 'pointer', opacity: pagina >= totalPaginas ? 0.4 : 1 }}
          >
            Próxima
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
