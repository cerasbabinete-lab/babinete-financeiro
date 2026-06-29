// ============================================================
// components/contas-receber/ContasReceberHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Header desktop — título, contadores, botões Importar
//         TXT BB / REM / RET + Backup / Restaurar / Exportar / Novo
//         Processa arquivos bancários via parsers e service
// Conecta com: app/receber/page.tsx
//              contasReceberService.ts (backup, restaurar, processamento)
//              txtBbParser.ts, remParser.ts, retParser.ts
//              ExportDropdownContasReceber.tsx
//              types/contasReceber.ts
// Sem alert() ou confirm() — mensagens via callbacks onErro/onSucesso
// ============================================================

'use client'

import { useRef, useState } from 'react'
import {
  fazerBackup,
  lerArquivoBackup,
  restaurarBackup,
  verificarHashRemessa,
  registrarRemessaImportada,
  processarRegistrosTxtBb,
  processarRegistrosRem,
  processarRegistrosRet,
} from '@/lib/contasReceberService'
import { parseTxtBb, calcularHashSha256 } from '@/lib/txtBbParser'
import { parseRem } from '@/lib/remParser'
import { parseRet } from '@/lib/retParser'
import type { ContaReceber } from '@/types/contasReceber'
import ExportDropdownContasReceber from './ExportDropdownContasReceber'

interface ContasReceberHeaderProps {
  totalTitulos: number         // Contagem total de títulos (header)
  titulos:      ContaReceber[] // Lista filtrada atual (para exportar)
  usuario?:     string         // Usuário logado — sufixo de arquivos
  onNovoLancamento: () => void // Abre modal em modo 'novo'
  onRestaurado:     () => void // Callback após restauração de backup
  onErro:    (msg: string) => void   // Exibe erro inline na página
  onSucesso: (msg: string) => void   // Exibe sucesso inline na página
  onImportado:      () => void // Callback após qualquer import concluído
}

export default function ContasReceberHeader({
  totalTitulos,
  titulos,
  usuario,
  onNovoLancamento,
  onRestaurado,
  onErro,
  onSucesso,
  onImportado,
}: ContasReceberHeaderProps) {

  // ── Refs para file pickers ocultos ────────────────────────
  const refTxtBb    = useRef<HTMLInputElement>(null)
  const refRem      = useRef<HTMLInputElement>(null)
  const refRet      = useRef<HTMLInputElement>(null)
  const refRestaur  = useRef<HTMLInputElement>(null)

  // ── Estados de loading por operação ──────────────────────
  const [loadingTxtBb,  setLoadingTxtBb]  = useState(false)
  const [loadingRem,    setLoadingRem]    = useState(false)
  const [loadingRet,    setLoadingRet]    = useState(false)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestaur, setLoadingRestaur] = useState(false)

  // ============================================================
  // handleImportarTxtBb
  // Lê o arquivo TXT BB, verifica duplicata por hash, processa
  // ============================================================
  async function handleImportarTxtBb(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingTxtBb(true)
    try {
      const conteudo = await lerArquivoTexto(file)
      const hash     = await calcularHashSha256(conteudo)

      // Verifica se o arquivo já foi importado antes
      const jaImportadoEm = await verificarHashRemessa(hash)
      if (jaImportadoEm) {
        onErro(`Este arquivo já foi importado em ${formatarDataBR(jaImportadoEm)}.`)
        return
      }

      // Parseia as linhas de dados do TXT BB
      const registros = parseTxtBb(conteudo)
      if (registros.length === 0) {
        onErro('Nenhum registro de dados encontrado no arquivo TXT BB.')
        return
      }

      // Processa os registros no banco (vincula nosso_numero ou cria avulso)
      const resultado = await processarRegistrosTxtBb(registros)

      // Registra o arquivo como importado com os contadores
      await registrarRemessaImportada(
        'txt_bb',
        file.name,
        hash,
        registros.length,
        resultado.vinculados,
        resultado.naoEncontrados,
      )

      onSucesso(
        `TXT BB processado: ${resultado.vinculados} vinculados, ` +
        `${resultado.avulsosCriados} avulsos criados, ` +
        `${resultado.jaExistentes} já existentes.`,
      )
      onImportado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao processar TXT BB')
    } finally {
      setLoadingTxtBb(false)
      e.target.value = '' // Permite reimportar mesmo arquivo após correção
    }
  }

  // ============================================================
  // handleImportarRem
  // Lê o arquivo REM CNAB 240, verifica hash, processa Segmentos P
  // ============================================================
  async function handleImportarRem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRem(true)
    try {
      const conteudo = await lerArquivoTexto(file)
      const hash     = await calcularHashSha256(conteudo)

      const jaImportadoEm = await verificarHashRemessa(hash)
      if (jaImportadoEm) {
        onErro(`Este arquivo REM já foi importado em ${formatarDataBR(jaImportadoEm)}.`)
        return
      }

      // Parseia Segmentos P do CNAB 240
      const segmentos = parseRem(conteudo)
      if (segmentos.length === 0) {
        onErro('Nenhum Segmento P encontrado no arquivo REM CNAB 240.')
        return
      }

      const resultado = await processarRegistrosRem(segmentos)

      await registrarRemessaImportada(
        'rem',
        file.name,
        hash,
        segmentos.length,
        resultado.vinculados,
        resultado.naoEncontrados,
      )

      onSucesso(
        `REM processado: ${resultado.vinculados} vinculados, ` +
        `${resultado.naoEncontrados} não encontrados, ` +
        `${resultado.jaExistentes} já existentes.`,
      )
      onImportado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao processar REM')
    } finally {
      setLoadingRem(false)
      e.target.value = ''
    }
  }

  // ============================================================
  // handleImportarRet
  // Lê o arquivo RET CNAB 240, verifica hash, processa Segmentos T
  // ============================================================
  async function handleImportarRet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRet(true)
    try {
      const conteudo = await lerArquivoTexto(file)
      const hash     = await calcularHashSha256(conteudo)

      const jaImportadoEm = await verificarHashRemessa(hash)
      if (jaImportadoEm) {
        onErro(`Este arquivo RET já foi importado em ${formatarDataBR(jaImportadoEm)}.`)
        return
      }

      // Parseia Segmentos T do CNAB 240
      const ocorrencias = parseRet(conteudo)
      if (ocorrencias.length === 0) {
        onErro('Nenhum Segmento T (ocorrência) encontrado no arquivo RET CNAB 240.')
        return
      }

      const resultado = await processarRegistrosRet(ocorrencias)

      await registrarRemessaImportada(
        'ret',
        file.name,
        hash,
        ocorrencias.length,
        resultado.baixados + resultado.atualizados,
        resultado.naoEncontrados,
      )

      onSucesso(
        `RET processado: ${resultado.baixados} baixados, ` +
        `${resultado.atualizados} atualizados, ` +
        `${resultado.naoEncontrados} não encontrados, ` +
        `${resultado.ocorrenciasInformativas} informativas.`,
      )
      onImportado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao processar RET')
    } finally {
      setLoadingRet(false)
      e.target.value = ''
    }
  }

  // ============================================================
  // handleBackup
  // Gera JSON do backup completo da tabela contas_receber
  // ============================================================
  async function handleBackup() {
    setLoadingBackup(true)
    try {
      await fazerBackup(usuario)
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao gerar backup')
    } finally {
      setLoadingBackup(false)
    }
  }

  // ============================================================
  // handleRestaurar
  // Lê o JSON de backup e faz upsert na tabela contas_receber
  // ============================================================
  async function handleRestaurar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRestaur(true)
    try {
      const dados = await lerArquivoBackup(file)
      await restaurarBackup(dados)
      onSucesso(`Backup restaurado: ${dados.length} registros processados.`)
      onRestaurado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao restaurar backup')
    } finally {
      setLoadingRestaur(false)
      e.target.value = ''
    }
  }

  // ── Estilos compartilhados ────────────────────────────────
  const btnPrimary: React.CSSProperties = {
    display:      'flex',
    alignItems:   'center',
    gap:          '5px',
    padding:      '5px 10px',
    fontSize:     '12px',
    fontWeight:   700,
    fontFamily:   'Tahoma, Geneva, sans-serif',
    background:   '#1a6094',
    color:        '#ffffff',
    border:       '1px solid #1a6094',
    borderRadius: '5px',
    cursor:       'pointer',
  }

  const btnOutline: React.CSSProperties = {
    ...btnPrimary,
    background: '#ffffff',
    color:      '#3a6080',
    border:     '1px solid #c4d8eb',
  }

  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      marginBottom:    '12px',
      fontFamily:      'Tahoma, Geneva, sans-serif',
    }}>

      {/* ── Lado Esquerdo: título + contador + botões de import ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

        {/* Título + contador */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094' }}>
            Contas a Receber
          </span>
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
            {totalTitulos} {totalTitulos === 1 ? 'título' : 'títulos'}
          </span>
        </div>

        {/* Importar TXT BB */}
        <button
          onClick={() => refTxtBb.current?.click()}
          disabled={loadingTxtBb}
          title="Importar arquivo TXT BB (formato MIGRATE)"
          style={{ ...btnPrimary, opacity: loadingTxtBb ? 0.7 : 1, cursor: loadingTxtBb ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-file-import" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingTxtBb ? 'Importando...' : 'TXT BB'}
        </button>

        {/* Importar REM */}
        <button
          onClick={() => refRem.current?.click()}
          disabled={loadingRem}
          title="Importar arquivo de remessa REM CNAB 240"
          style={{ ...btnPrimary, opacity: loadingRem ? 0.7 : 1, cursor: loadingRem ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-file-upload" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRem ? 'Importando...' : 'Importar REM'}
        </button>

        {/* Importar RET */}
        <button
          onClick={() => refRet.current?.click()}
          disabled={loadingRet}
          title="Importar arquivo de retorno RET CNAB 240"
          style={{ ...btnPrimary, opacity: loadingRet ? 0.7 : 1, cursor: loadingRet ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-file-download" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRet ? 'Importando...' : 'Importar RET'}
        </button>

      </div>

      {/* ── Lado Direito: Backup / Restaurar / Exportar / Novo ── */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

        {/* Backup */}
        <button
          onClick={handleBackup}
          disabled={loadingBackup}
          title="Exportar backup completo da tabela contas_receber"
          style={{ ...btnPrimary, opacity: loadingBackup ? 0.7 : 1, cursor: loadingBackup ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-database-export" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingBackup ? 'Gerando...' : 'Backup'}
        </button>

        {/* Restaurar */}
        <button
          onClick={() => refRestaur.current?.click()}
          disabled={loadingRestaur}
          title="Restaurar backup da tabela contas_receber"
          style={{ ...btnOutline, opacity: loadingRestaur ? 0.7 : 1, cursor: loadingRestaur ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-restore" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRestaur ? 'Restaurando...' : 'Restaurar'}
        </button>

        {/* Exportar CSV / Excel — split button com dropdown */}
        <ExportDropdownContasReceber titulos={titulos} usuario={usuario ?? ''} />

        {/* Novo Lançamento */}
        <button
          onClick={onNovoLancamento}
          title="Registrar novo lançamento manual"
          style={btnPrimary}
        >
          <i className="ti ti-plus" style={{ fontSize: '14px' }} aria-hidden="true" />
          Novo Lançamento
        </button>

      </div>

      {/* ── File pickers ocultos ─────────────────────────────── */}
      <input ref={refTxtBb}   type="file" accept=".txt"        style={{ display: 'none' }} onChange={handleImportarTxtBb} />
      <input ref={refRem}     type="file" accept=".rem,.txt"   style={{ display: 'none' }} onChange={handleImportarRem} />
      <input ref={refRet}     type="file" accept=".ret,.txt"   style={{ display: 'none' }} onChange={handleImportarRet} />
      <input ref={refRestaur} type="file" accept=".json"       style={{ display: 'none' }} onChange={handleRestaurar} />

    </div>
  )
}

// ============================================================
// lerArquivoTexto()
// Lê um File como texto UTF-8 usando FileReader
// ============================================================
function lerArquivoTexto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error(`Erro ao ler arquivo: ${file.name}`))
    reader.readAsText(file, 'utf-8')
  })
}

// ============================================================
// formatarDataBR()
// Formata ISO timestamp para exibição dd/mm/yyyy em mensagens
// ============================================================
function formatarDataBR(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
