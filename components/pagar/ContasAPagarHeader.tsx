// ============================================================
// components/pagar/ContasAPagarHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Header desktop — título+contador inline com os botões de
//         import (Relatório BB / Comprovante / Boleto) e Roster à
//         esquerda; Backup / Restaurar / Exportar à direita.
//         QA fix (20/08/2026, a pedido do Maycon): reescrito pra
//         seguir a ESTRUTURA e os TOKENS DE ESTILO exatos de
//         ContasReceberHeader.tsx (btnPrimary preenchido azul /
//         btnOutline contorno), não só visualmente parecido — a
//         versão anterior usava um estilo de botão próprio (contorno
//         branco pra tudo, título empilhado em bloco separado dos
//         botões) que destoava dos outros módulos.
// Conecta com: app/pagar/page.tsx
//              lib/contasAPagarService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownContasAPagar.tsx
// Sem alert() / confirm() — erros e confirmações via callbacks
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/contasAPagarService'
import type { ContaAPagar } from '@/types/contasAPagar'
import ExportDropdownContasAPagar from './ExportDropdownContasAPagar'

interface ContasAPagarHeaderProps {
  totalTitulos:            number
  importando:              boolean
  onSelecionarRelatorio:   (file: File) => void
  onSelecionarComprovante: (file: File) => void
  onSelecionarBoleto:      (file: File) => void
  onAbrirRoster:           () => void
  titulos:                 ContaAPagar[]      // Lista atual filtrada/visível (para exportar/backup)
  usuario?:                string             // Usuário logado — usado no nome do arquivo
  onRestaurado:            () => void         // Callback após restore — recarrega lista
  onErro:                  (msg: string) => void
  onSucesso:               (msg: string) => void
}

export default function ContasAPagarHeader({
  totalTitulos,
  importando,
  onSelecionarRelatorio,
  onSelecionarComprovante,
  onSelecionarBoleto,
  onAbrirRoster,
  titulos,
  usuario,
  onRestaurado,
  onErro,
  onSucesso,
}: ContasAPagarHeaderProps) {

  // ── Refs para file pickers ocultos ────────────────────────
  const inputRelatorioRef   = useRef<HTMLInputElement>(null)
  const inputComprovanteRef = useRef<HTMLInputElement>(null)
  const inputBoletoRef      = useRef<HTMLInputElement>(null)
  const inputRestaurarRef   = useRef<HTMLInputElement>(null)

  // ── Loading states ────────────────────────────────────────
  const [loadingBackup,  setLoadingBackup]  = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // ============================================================
  // handleBackup
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
  // handleArquivoSelecionado (Restaurar)
  // ============================================================
  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingRestore(true)
    try {
      const dados = await lerArquivoBackup(file)
      const { processados } = await restaurarBackup(dados)
      onSucesso(`Backup restaurado: ${processados} registros processados.`)
      onRestaurado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao restaurar backup')
    } finally {
      setLoadingRestore(false)
      e.target.value = ''
    }
  }

  // ── Estilos compartilhados — mesmos tokens exatos de
  // ContasReceberHeader.tsx / DespesasHeader.tsx ──
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
    cursor:       importando ? 'not-allowed' : 'pointer',
    opacity:      importando ? 0.7 : 1,
  }

  const btnOutline: React.CSSProperties = {
    ...btnPrimary,
    background: '#ffffff',
    color:      '#3a6080',
    border:     '1px solid #c4d8eb',
  }

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      marginBottom:   '12px',
      flexWrap:       'wrap',
      gap:            '10px',
      fontFamily:     'Tahoma, Geneva, sans-serif',
    }}>

      {/* ── Lado Esquerdo: título + contador + botões de import + Roster ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

        {/* Título + contador */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094' }}>
            Contas a Pagar
          </span>
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
            {totalTitulos} {totalTitulos === 1 ? 'título' : 'títulos'}
          </span>
        </div>

        {/* Importar Relatório BB */}
        <button
          disabled={importando}
          onClick={() => inputRelatorioRef.current?.click()}
          title="Importar Relatório de Pagamentos do BB (PDF)"
          style={btnPrimary}
        >
          <i className="ti ti-file-invoice" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar Relatório BB
        </button>
        <input ref={inputRelatorioRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarRelatorio(f); e.target.value = '' }} />

        {/* Importar Comprovante — TXT (Pix multi-recibo ou lote de boleto) ou PDF (boleto individual) */}
        <button
          disabled={importando}
          onClick={() => inputComprovanteRef.current?.click()}
          title="Importar comprovante de pagamento — TXT (Pix ou lote de boleto) ou PDF (boleto individual)"
          style={btnPrimary}
        >
          <i className="ti ti-receipt" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar Comprovante (TXT)
        </button>
        <input ref={inputComprovanteRef} type="file" accept="application/pdf,text/plain" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarComprovante(f); e.target.value = '' }} />

        {/* Importar Boleto — vincula Nosso Número + Linha Digitável a
            um título já lançado, mesmo procedimento de
            ContasReceberHeader.tsx (body binário puro, não base64) */}
        <button
          disabled={importando}
          onClick={() => inputBoletoRef.current?.click()}
          title="Importar boleto PDF — vincula Nosso Número e Linha Digitável ao título"
          style={btnPrimary}
        >
          <i className="ti ti-barcode" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar Boleto
        </button>
        <input ref={inputBoletoRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSelecionarBoleto(f); e.target.value = '' }} />

        {/* Roster — ícone utilitário, sem equivalente em Receber (módulo
            próprio de Pagar), mantido discreto/outline pra não competir
            visualmente com as ações primárias de import */}
        <button
          onClick={onAbrirRoster}
          title="Manutenção do roster de beneficiários"
          style={{ ...btnOutline, padding: '5px 8px', cursor: 'pointer', opacity: 1 }}
        >
          <i className="ti ti-users-group" style={{ fontSize: '14px' }} aria-hidden="true" />
        </button>

      </div>

      {/* ── Lado Direito: Backup / Restaurar / Exportar ──
          Sem "Novo Título" — este módulo nunca cria título do zero
          pela UI (Especificação §7, Non-negotiable) ── */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

        {/* Backup */}
        <button
          onClick={handleBackup}
          disabled={loadingBackup}
          title="Exportar backup completo da tabela contas_a_pagar"
          style={{ ...btnPrimary, opacity: loadingBackup ? 0.7 : 1, cursor: loadingBackup ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-database-export" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingBackup ? 'Gerando...' : 'Backup'}
        </button>

        {/* Restaurar */}
        <button
          onClick={() => inputRestaurarRef.current?.click()}
          disabled={loadingRestore}
          title="Restaurar backup da tabela contas_a_pagar"
          style={{ ...btnOutline, opacity: loadingRestore ? 0.7 : 1, cursor: loadingRestore ? 'wait' : 'pointer' }}
        >
          <i className="ti ti-restore" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRestore ? 'Restaurando...' : 'Restaurar'}
        </button>
        <input ref={inputRestaurarRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={handleArquivoSelecionado} />

        {/* Exportar CSV / Excel — split button com dropdown */}
        <ExportDropdownContasAPagar titulos={titulos} usuario={usuario ?? ''} />

      </div>
    </div>
  )
}
