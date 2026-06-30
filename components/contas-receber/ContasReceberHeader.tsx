// ============================================================
// components/contas-receber/ContasReceberHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Header desktop — título, contadores, botões Importar
//         TXT BB / REM / Retorno (RET + XLS) + Backup / Restaurar /
//         Exportar / Novo. "Importar Retorno" processa o arquivo em
//         memória e abre uma prévia (ImportarRetornoPreviewModal)
//         antes de gravar qualquer mudança no banco
// Conecta com: app/receber/page.tsx
//              contasReceberService.ts (backup, restaurar, processamento, preview)
//              txtBbParser.ts, remParser.ts, retParser.ts, xlsParser.ts
//              ExportDropdownContasReceber.tsx, ImportarRetornoPreviewModal.tsx
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
  processarRegistrosXls,
  gerarPreviewImportacao,
} from '@/lib/contasReceberService'
import type { ItemPreviewImportacao } from '@/lib/contasReceberService'
import { parseTxtBb, calcularHashSha256 } from '@/lib/txtBbParser'
import { parseRem } from '@/lib/remParser'
import { parseRet } from '@/lib/retParser'
import { parseXls, calcularHashXls } from '@/lib/xlsParser'
import type { ContaReceber, RegistroRetSegmentoT, RegistroXls } from '@/types/contasReceber'
import ExportDropdownContasReceber from './ExportDropdownContasReceber'
import ImportarRetornoPreviewModal from './ImportarRetornoPreviewModal'

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
  const [loadingRet,    setLoadingRet]    = useState(false) // Loading do parse + geração da prévia (antes de gravar)
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [loadingRestaur, setLoadingRestaur] = useState(false)

  // ── Estado da prévia de importação de Retorno (RET ou XLS) ──
  // Guarda os dados já parseados do arquivo (em memória, nada gravado
  // ainda) até o usuário confirmar na ImportarRetornoPreviewModal —
  // a forma do array varia conforme a origem, por isso a união abaixo
  const [previewDados, setPreviewDados] = useState<
    | { origem: 'ret'; nomeArquivo: string; hash: string; ocorrencias: RegistroRetSegmentoT[] }
    | { origem: 'xls'; nomeArquivo: string; hash: string; registros: RegistroXls[] }
    | null
  >(null)
  const [previewMudancas,       setPreviewMudancas]       = useState<ItemPreviewImportacao[]>([])
  const [previewNaoEncontrados, setPreviewNaoEncontrados] = useState<ItemPreviewImportacao[]>([])
  const [confirmandoPreview,    setConfirmandoPreview]    = useState(false) // Loading do botão "Confirmar e Aplicar"

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
  // handleImportarRetorno
  // Lê o arquivo de Retorno selecionado — aceita .RET (CNAB 240) e
  // .XLS (relatório de consulta do BB) — detecta o tipo pela extensão,
  // parseia em memória e gera a prévia das mudanças via
  // gerarPreviewImportacao(). NADA é gravado no banco aqui — a
  // gravação só acontece em handleConfirmarPreview(), após o usuário
  // revisar e confirmar na ImportarRetornoPreviewModal (Pergunta 20a)
  // ============================================================
  async function handleImportarRetorno(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRet(true)
    try {
      // Detecta o tipo de arquivo pela extensão — .xls usa o fluxo XLS,
      // qualquer outra extensão (.ret, .txt) usa o fluxo RET CNAB 240
      const ehXls = /\.xlsx?$/i.test(file.name)

      if (ehXls) {
        // ── Fluxo XLS ────────────────────────────────────────
        const hash = await calcularHashXls(file) // Hash binário — XLS não pode ser lido como texto

        const jaImportadoEm = await verificarHashRemessa(hash)
        if (jaImportadoEm) {
          onErro(`Este arquivo XLS já foi importado em ${formatarDataBR(jaImportadoEm)}.`)
          return
        }

        const registros = await parseXls(file)
        if (registros.length === 0) {
          onErro('Nenhum registro válido encontrado no arquivo XLS (verifique se a coluna "Nosso Número" está presente).')
          return
        }

        // Gera a prévia — mesma lógica de matching usada na gravação real
        const { mudancas, naoEncontrados } = await gerarPreviewImportacao('xls', registros)

        setPreviewDados({ origem: 'xls', nomeArquivo: file.name, hash, registros })
        setPreviewMudancas(mudancas)
        setPreviewNaoEncontrados(naoEncontrados)

      } else {
        // ── Fluxo RET (CNAB 240) ─────────────────────────────
        const conteudo = await lerArquivoTexto(file)
        const hash     = await calcularHashSha256(conteudo)

        const jaImportadoEm = await verificarHashRemessa(hash)
        if (jaImportadoEm) {
          onErro(`Este arquivo RET já foi importado em ${formatarDataBR(jaImportadoEm)}.`)
          return
        }

        const ocorrencias = parseRet(conteudo)
        if (ocorrencias.length === 0) {
          onErro('Nenhum Segmento T (ocorrência) encontrado no arquivo RET CNAB 240.')
          return
        }

        const { mudancas, naoEncontrados } = await gerarPreviewImportacao('ret', ocorrencias)

        setPreviewDados({ origem: 'ret', nomeArquivo: file.name, hash, ocorrencias })
        setPreviewMudancas(mudancas)
        setPreviewNaoEncontrados(naoEncontrados)
      }
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao processar arquivo de Retorno')
    } finally {
      setLoadingRet(false)
      e.target.value = '' // Permite reimportar mesmo arquivo após correção
    }
  }

  // ============================================================
  // handleConfirmarPreview
  // Aplica de fato a importação já parseada em previewDados — chamado
  // ao clicar "Confirmar e Aplicar" na ImportarRetornoPreviewModal.
  // Só agora os dados são gravados no banco (processarRegistrosRet/Xls)
  // ============================================================
  async function handleConfirmarPreview() {
    if (!previewDados) return
    setConfirmandoPreview(true)
    try {
      if (previewDados.origem === 'xls') {
        const resultado = await processarRegistrosXls(previewDados.registros)
        await registrarRemessaImportada(
          'xls',
          previewDados.nomeArquivo,
          previewDados.hash,
          previewDados.registros.length,
          resultado.baixados + resultado.atualizados,
          resultado.naoEncontrados,
        )
        onSucesso(
          `XLS processado: ${resultado.baixados} baixados, ` +
          `${resultado.atualizados} atualizados, ` +
          `${resultado.naoEncontrados} não encontrados.`,
        )
      } else {
        const resultado = await processarRegistrosRet(previewDados.ocorrencias)
        await registrarRemessaImportada(
          'ret',
          previewDados.nomeArquivo,
          previewDados.hash,
          previewDados.ocorrencias.length,
          resultado.baixados + resultado.atualizados,
          resultado.naoEncontrados,
        )
        onSucesso(
          `RET processado: ${resultado.baixados} baixados, ` +
          `${resultado.atualizados} atualizados, ` +
          `${resultado.naoEncontrados} não encontrados, ` +
          `${resultado.ocorrenciasInformativas} informativas.`,
        )
      }
      onImportado()
      setPreviewDados(null) // Fecha a modal de prévia
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao aplicar importação de Retorno')
    } finally {
      setConfirmandoPreview(false)
    }
  }

  // ============================================================
  // handleCancelarPreview
  // Fecha a modal de prévia sem gravar nada — descarta os dados
  // parseados em memória (o arquivo precisa ser selecionado de novo
  // se o usuário quiser tentar a importação outra vez)
  // ============================================================
  function handleCancelarPreview() {
    setPreviewDados(null)
    setPreviewMudancas([])
    setPreviewNaoEncontrados([])
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

        {/* Importar Retorno — aceita .RET (CNAB 240) e .XLS (relatório BB), abre prévia antes de aplicar */}
        <button
          onClick={() => refRet.current?.click()}
          disabled={loadingRet}
          title="Importar Retorno bancário — aceita .RET (CNAB 240) ou .XLS (relatório BB)"
          style={{ ...btnPrimary, opacity: loadingRet ? 0.7 : 1, cursor: loadingRet ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-file-download" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRet ? 'Processando...' : 'Importar Retorno'}
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
      <input ref={refTxtBb}   type="file" accept=".txt"            style={{ display: 'none' }} onChange={handleImportarTxtBb} />
      <input ref={refRem}     type="file" accept=".rem,.txt"       style={{ display: 'none' }} onChange={handleImportarRem} />
      <input ref={refRet}     type="file" accept=".ret,.txt,.xls,.xlsx" style={{ display: 'none' }} onChange={handleImportarRetorno} />
      <input ref={refRestaur} type="file" accept=".json"           style={{ display: 'none' }} onChange={handleRestaurar} />

      {/* ── Modal de prévia da importação de Retorno — só aparece após parse bem-sucedido ── */}
      {previewDados && (
        <ImportarRetornoPreviewModal
          origem={previewDados.origem}
          nomeArquivo={previewDados.nomeArquivo}
          mudancas={previewMudancas}
          naoEncontrados={previewNaoEncontrados}
          confirmando={confirmandoPreview}
          onConfirmar={handleConfirmarPreview}
          onCancelar={handleCancelarPreview}
        />
      )}

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
