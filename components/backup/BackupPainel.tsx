// ============================================================
// components/backup/BackupPainel.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Backup
// Função: Conteúdo da tela /backup — backup completo, backup e
//         exportação por tabela, e restauração (upsert ou
//         substituição total) — ver Especificacao_Modulo_Backup.md.
//         Estilo 100% inline (React.CSSProperties), mesmo padrão de
//         components/despesas/DespesasHeader.tsx — este projeto não
//         usa classes CSS.
// Sem alert()/confirm() — confirmações e feedback via banners inline,
// mesma convenção de todo o resto do sistema.
// Conecta com: lib/backupService.ts, app/backup/page.tsx
// ============================================================

'use client'

import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  TABELAS_BACKUP_ORDEM,
  TABELA_LABEL,
  type TabelaBackup,
  type BackupCompleto,
  type ArquivoBackupNuvem,
  fazerBackupCompleto,
  fazerBackupTabela,
  exportarCSV,
  exportarExcel,
  lerArquivoBackup,
  restaurarBackup,
  listarTodosBackupsNuvem,
  baixarBackupNuvem,
} from '@/lib/backupService'

const COR_PRIMARIA = '#1a6094'
const COR_BORDA = '#d7e0e6'
const COR_TEXTO_MUTED = '#7188a0'
const FRASE_CONFIRMACAO_SUBSTITUICAO = 'SUBSTITUIR TUDO'

interface BackupPainelProps {
  usuario: string
  isMobile: boolean
}

export default function BackupPainel({ usuario, isMobile }: BackupPainelProps) {
  const [selecionadas, setSelecionadas] = useState<Set<TabelaBackup>>(new Set())
  const [processando, setProcessando] = useState<string | null>(null)
  const [msgErro, setMsgErro] = useState<string | null>(null)
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null)

  const [arquivoRestauracao, setArquivoRestauracao] = useState<File | null>(null)
  const [backupLido, setBackupLido] = useState<BackupCompleto | null>(null)
  const [modoSubstituicaoTotal, setModoSubstituicaoTotal] = useState(false)
  const [fraseDigitada, setFraseDigitada] = useState('')
  const [etapaConfirmacaoRestauro, setEtapaConfirmacaoRestauro] = useState(false)

  const [backupsNuvem, setBackupsNuvem] = useState<ArquivoBackupNuvem[] | null>(null)
  const [baixandoNuvem, setBaixandoNuvem] = useState<string | null>(null)
  const carregandoNuvem = backupsNuvem === null

  function carregarBackupsNuvem() {
    listarTodosBackupsNuvem()
      .then((lista) => setBackupsNuvem(lista))
      .catch((err: unknown) => setMsgErro(err instanceof Error ? err.message : 'Falha ao listar backups na nuvem.'))
  }

  useEffect(() => {
    carregarBackupsNuvem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function aoBaixarDaNuvem(nome: string) {
    setMsgErro(null); setMsgSucesso(null)
    setBaixandoNuvem(nome)
    try {
      await baixarBackupNuvem(nome)
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : `Falha ao baixar "${nome}".`)
    } finally {
      setBaixandoNuvem(null)
    }
  }

  function alternarSelecao(tabela: TabelaBackup) {
    setSelecionadas((prev) => {
      const nova = new Set(prev)
      if (nova.has(tabela)) nova.delete(tabela)
      else nova.add(tabela)
      return nova
    })
  }

  async function aoClicarBackupCompleto() {
    setMsgErro(null); setMsgSucesso(null)
    setProcessando('backup-completo')
    try {
      const aviso = await fazerBackupCompleto(usuario)
      setMsgSucesso(aviso ?? 'Backup completo arquivado no Supabase e no Google Drive com sucesso.')
      carregarBackupsNuvem()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Falha ao gerar backup completo.')
    } finally {
      setProcessando(null)
    }
  }

  async function aoClicarBackupTabela(tabela: TabelaBackup) {
    setMsgErro(null); setMsgSucesso(null)
    setProcessando(`backup-${tabela}`)
    try {
      const aviso = await fazerBackupTabela(tabela, usuario)
      setMsgSucesso(aviso ?? `Backup de "${TABELA_LABEL[tabela]}" arquivado no Supabase e no Google Drive com sucesso.`)
      carregarBackupsNuvem()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : `Falha ao gerar backup de "${tabela}".`)
    } finally {
      setProcessando(null)
    }
  }

  async function aoClicarExportar(tabela: TabelaBackup, formato: 'csv' | 'excel') {
    setMsgErro(null); setMsgSucesso(null)
    setProcessando(`export-${tabela}`)
    try {
      if (formato === 'csv') await exportarCSV(tabela, usuario)
      else await exportarExcel(tabela, usuario)
      setMsgSucesso(`Exportação de "${TABELA_LABEL[tabela]}" concluída.`)
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : `Falha ao exportar "${tabela}".`)
    } finally {
      setProcessando(null)
    }
  }

  async function aoSelecionarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setArquivoRestauracao(file)
    setBackupLido(null)
    setEtapaConfirmacaoRestauro(false)
    setFraseDigitada('')
    setMsgErro(null); setMsgSucesso(null)
    if (!file) return
    try {
      // Lê o arquivo já na seleção — só assim é possível mostrar quem gerou o
      // backup (gerado_por) e quando, antes do usuário decidir restaurar.
      const backup = await lerArquivoBackup(file)
      setBackupLido(backup)
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo selecionado.')
      setArquivoRestauracao(null)
    }
  }

  async function aoConfirmarRestauracao() {
    if (!arquivoRestauracao || !backupLido) return
    if (modoSubstituicaoTotal && fraseDigitada !== FRASE_CONFIRMACAO_SUBSTITUICAO) {
      setMsgErro(`Digite exatamente "${FRASE_CONFIRMACAO_SUBSTITUICAO}" para confirmar a substituição total.`)
      return
    }
    setMsgErro(null); setMsgSucesso(null)
    setProcessando('restaurar')
    try {
      const backup = backupLido
      const alvo = selecionadas.size > 0 ? Array.from(selecionadas) : undefined
      const resultados = await restaurarBackup(backup, alvo, modoSubstituicaoTotal)
      const comErro = resultados.filter((r) => r.erro)
      const total = resultados.reduce((soma, r) => soma + r.processados, 0)
      if (comErro.length > 0) {
        setMsgErro(`Restauração parcial: ${total} registro(s) processado(s), mas houve erro em ${comErro.map((r) => TABELA_LABEL[r.tabela]).join(', ')}.`)
      } else {
        setMsgSucesso(`Restauração concluída: ${total} registro(s) processado(s).`)
      }
      setEtapaConfirmacaoRestauro(false)
      setArquivoRestauracao(null)
      setBackupLido(null)
      setFraseDigitada('')
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Falha ao restaurar backup.')
    } finally {
      setProcessando(null)
    }
  }

  // ── Estilos (inline, mesmo padrão de DespesasHeader.tsx) ──────────
  const secaoStyle: CSSProperties = {
    background: '#fff',
    border: `1px solid ${COR_BORDA}`,
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '16px',
  }
  const tituloSecaoStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: 700,
    color: COR_PRIMARIA,
    marginBottom: '8px',
  }
  const textoMutedStyle: CSSProperties = {
    fontSize: '11px',
    color: COR_TEXTO_MUTED,
    marginBottom: '12px',
  }
  const botaoBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'Tahoma, Geneva, sans-serif',
    borderRadius: '5px',
    cursor: 'pointer',
    border: `1px solid ${COR_PRIMARIA}`,
    background: '#fff',
    color: COR_PRIMARIA,
  }
  const botaoPrimario: CSSProperties = { ...botaoBase, background: COR_PRIMARIA, color: '#fff' }
  const botaoPequeno: CSSProperties = { ...botaoBase, padding: '3px 10px', fontSize: '10.5px' }
  const bannerBase: CSSProperties = {
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    marginBottom: '16px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
  }

  return (
    <div>
      {msgErro && (
        <div style={{ ...bannerBase, background: '#fff3f3', border: '1px solid #f0b8b8', color: '#c0392b' }}>
          {msgErro}
        </div>
      )}
      {msgSucesso && (
        <div style={{ ...bannerBase, background: '#f0f9f2', border: '1px solid #b8e0c4', color: '#2c9d5b' }}>
          {msgSucesso}
        </div>
      )}

      <div style={secaoStyle}>
        <div style={tituloSecaoStyle}>Backup completo do sistema</div>
        <div style={textoMutedStyle}>Baixa um único arquivo (.json) com as 18 tabelas abaixo, na íntegra.</div>
        <button style={botaoPrimario} onClick={aoClicarBackupCompleto} disabled={processando !== null}>
          <i className="ti ti-database-export" aria-hidden="true" /> Backup completo
        </button>
      </div>

      <div style={secaoStyle}>
        <div style={tituloSecaoStyle}>Backups na nuvem</div>
        <div style={textoMutedStyle}>
          Todos os arquivos já arquivados no bucket <code>backups</code> — de qualquer módulo do
          sistema, não só deste. Nenhum backup é baixado localmente por padrão; use &quot;Baixar&quot;
          para trazer uma cópia para o computador quando precisar.
        </div>
        {carregandoNuvem && <div style={{ fontSize: '11px', color: COR_TEXTO_MUTED }}>Carregando…</div>}
        {!carregandoNuvem && backupsNuvem && backupsNuvem.length === 0 && (
          <div style={{ fontSize: '11px', color: COR_TEXTO_MUTED }}>Nenhum backup arquivado ainda.</div>
        )}
        {!carregandoNuvem && backupsNuvem && backupsNuvem.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '10.5px' : '11.5px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${COR_BORDA}`, textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px', color: COR_PRIMARIA }}>Arquivo</th>
                  <th style={{ padding: '6px 4px', color: COR_PRIMARIA }}>Arquivado em</th>
                  <th style={{ padding: '6px 4px', color: COR_PRIMARIA }} />
                </tr>
              </thead>
              <tbody>
                {backupsNuvem.map((arq) => (
                  <tr key={arq.nome} style={{ borderBottom: `1px solid ${COR_BORDA}` }}>
                    <td style={{ padding: '6px 4px', fontFamily: 'monospace', fontSize: '10.5px' }}>{arq.nome}</td>
                    <td style={{ padding: '6px 4px', color: COR_TEXTO_MUTED }}>
                      {arq.criadoEm ? new Date(arq.criadoEm).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <button
                        style={botaoPequeno}
                        onClick={() => aoBaixarDaNuvem(arq.nome)}
                        disabled={baixandoNuvem !== null}
                      >
                        {baixandoNuvem === arq.nome ? 'Baixando…' : 'Baixar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={secaoStyle}>
        <div style={tituloSecaoStyle}>Por tabela</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '10.5px' : '11.5px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${COR_BORDA}`, textAlign: 'left' }}>
                <th style={{ padding: '6px 4px', width: '24px' }} />
                <th style={{ padding: '6px 4px', color: COR_PRIMARIA }}>Tabela</th>
                <th style={{ padding: '6px 4px', color: COR_PRIMARIA }}>Backup</th>
                <th style={{ padding: '6px 4px', color: COR_PRIMARIA }}>Exportar</th>
              </tr>
            </thead>
            <tbody>
              {TABELAS_BACKUP_ORDEM.map((tabela) => (
                <tr key={tabela} style={{ borderBottom: `1px solid ${COR_BORDA}` }}>
                  <td style={{ padding: '6px 4px' }}>
                    <input
                      type="checkbox"
                      checked={selecionadas.has(tabela)}
                      onChange={() => alternarSelecao(tabela)}
                      aria-label={`Selecionar ${TABELA_LABEL[tabela]} para restauração`}
                    />
                  </td>
                  <td style={{ padding: '6px 4px' }}>{TABELA_LABEL[tabela]}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <button style={botaoPequeno} onClick={() => aoClicarBackupTabela(tabela)} disabled={processando !== null}>
                      <i className="ti ti-database-export" aria-hidden="true" />
                    </button>
                  </td>
                  <td style={{ padding: '6px 4px', display: 'flex', gap: '6px' }}>
                    <button style={botaoPequeno} onClick={() => aoClicarExportar(tabela, 'csv')} disabled={processando !== null}>CSV</button>
                    <button style={botaoPequeno} onClick={() => aoClicarExportar(tabela, 'excel')} disabled={processando !== null}>Excel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={secaoStyle}>
        <div style={tituloSecaoStyle}>Restaurar</div>
        <div style={textoMutedStyle}>
          Selecione um arquivo de backup (.json). Se nenhuma tabela estiver marcada acima, todas as
          tabelas presentes no arquivo serão restauradas. A restauração nunca apaga registros — apenas
          insere ou atualiza (upsert) — a menos que &quot;substituição total&quot; esteja marcado abaixo.
        </div>

        <input type="file" accept=".json" onChange={aoSelecionarArquivo} style={{ fontSize: '11px', marginBottom: '10px' }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#c0392b', marginBottom: '10px' }}>
          <input
            type="checkbox"
            checked={modoSubstituicaoTotal}
            onChange={(e) => { setModoSubstituicaoTotal(e.target.checked); setFraseDigitada('') }}
          />
          Substituição total (apaga cada tabela selecionada antes de restaurar — irreversível)
        </label>

        {arquivoRestauracao && backupLido && !etapaConfirmacaoRestauro && (
          <div>
            <div style={{ fontSize: '11px', color: COR_TEXTO_MUTED, marginBottom: '8px' }}>
              Backup gerado por <strong>{backupLido.gerado_por}</strong> em{' '}
              {new Date(backupLido.gerado_em).toLocaleString('pt-BR')}
            </div>
            <button style={botaoPrimario} onClick={() => setEtapaConfirmacaoRestauro(true)} disabled={processando !== null}>
              <i className="ti ti-restore" aria-hidden="true" /> Restaurar &quot;{arquivoRestauracao.name}&quot;
            </button>
          </div>
        )}

        {etapaConfirmacaoRestauro && (
          <div style={{ background: '#f7f9fb', border: `1px solid ${COR_BORDA}`, borderRadius: '6px', padding: '12px', marginTop: '8px' }}>
            <p style={{ fontSize: '12px', marginBottom: '10px' }}>
              Confirma a restauração de{' '}
              {selecionadas.size > 0 ? Array.from(selecionadas).map((t) => TABELA_LABEL[t]).join(', ') : 'todas as tabelas do arquivo'}
              {modoSubstituicaoTotal ? ' — em modo SUBSTITUIÇÃO TOTAL (irreversível)' : ''}?
              {backupLido && (
                <>
                  {' '}Backup gerado por <strong>{backupLido.gerado_por}</strong> em{' '}
                  {new Date(backupLido.gerado_em).toLocaleString('pt-BR')}.
                </>
              )}
            </p>
            {modoSubstituicaoTotal && (
              <input
                type="text"
                placeholder={`Digite "${FRASE_CONFIRMACAO_SUBSTITUICAO}" para confirmar`}
                value={fraseDigitada}
                onChange={(e) => setFraseDigitada(e.target.value)}
                style={{ fontSize: '11px', padding: '4px 8px', marginBottom: '10px', width: '260px', border: `1px solid ${COR_BORDA}`, borderRadius: '4px' }}
              />
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={botaoPrimario} onClick={aoConfirmarRestauracao} disabled={processando !== null}>Confirmar restauração</button>
              <button style={botaoBase} onClick={() => setEtapaConfirmacaoRestauro(false)} disabled={processando !== null}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
