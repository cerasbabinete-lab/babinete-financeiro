// ============================================================
// components/despesas/DespesasHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Header da tela desktop — título, contador e botões
//         "Importar XML" / "Importar Documento" (esquerda) +
//         Backup, Restaurar, Exportar, Nova Despesa (direita)
//         FEATURE (a pedido do usuário): Backup/Restaurar/Exportar
//         adicionados para replicar o mesmo padrão já existente em
//         Receitas, Contas a Receber, Clientes e Fornecedores
//         Réplica visual de ReceitasHeader.tsx.
// Conecta com: app/despesas/page.tsx (callbacks e totalDespesas)
//              despesasService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownDespesas.tsx (dropdown CSV/Excel)
// Sem alert() / confirm() — erros e confirmações via callbacks
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/despesasService'
import type { Despesa } from '@/types/despesas'
import ExportDropdownDespesas from './ExportDropdownDespesas'

// ============================================================
// Props
// ============================================================
interface DespesasHeaderProps {
  totalDespesas: number            // Contador exibido ao lado do título
  despesas: Despesa[]              // Lista atual filtrada (para exportar/backup)
  usuario?: string                 // Usuário logado — usado no nome do arquivo
  onImportarXml: () => void        // Abre o file picker de import XML (NFS-e / NF-e compra)
  onImportarDocumento: () => void  // Abre o file picker de import via IA (PDF/imagem/TXT/DOC/XLS/XLSX)
  onNovaDespesa: () => void        // Abre modal no modo 'novo' (lançamento manual)
  onRestaurado: () => void         // Callback após restore — recarrega lista
  onErro: (msg: string) => void    // Callback para exibir erro inline na página
  onSucesso: (msg: string) => void // Callback para exibir sucesso inline na página
}

// ============================================================
// DespesasHeader
// Renderiza apenas em desktop (mobile usa BasebarDespesas.tsx)
// ============================================================
export default function DespesasHeader({
  totalDespesas,
  despesas,
  usuario,
  onImportarXml,
  onImportarDocumento,
  onNovaDespesa,
  onRestaurado,
  onErro,
  onSucesso,
}: DespesasHeaderProps) {

  const inputRestaurarRef = useRef<HTMLInputElement>(null)
  const [loadingBackup,  setLoadingBackup]  = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)

  // Estilo base compartilhado pelos botões de importação — evita repetição de objeto
  const botaoBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'Tahoma, Geneva, sans-serif',
    borderRadius: '5px',
    cursor: 'pointer',
    border: '1px solid #1a6094',
  }

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
  // handleRestaurarClick
  // ============================================================
  function handleRestaurarClick() {
    inputRestaurarRef.current?.click()
  }

  // ============================================================
  // handleArquivoSelecionado
  // Lê o arquivo JSON e executa a restauração (via rota de servidor —
  // ver justificativa em lib/despesasService.ts::restaurarBackup)
  // Confirmação via UI inline — sem confirm()
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {/* Esquerda: título + contador + botões de importação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

        {/* Título + contador */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094' }}>
            Despesas
          </span>
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
            {totalDespesas} {totalDespesas === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {/* Importar XML — NFS-e ou NF-e de compra, auto-detectado no client */}
        <button
          onClick={onImportarXml}
          title="Importar NFS-e ou NF-e de compra (XML)"
          style={{ ...botaoBase, background: '#1a6094', color: '#ffffff' }}
        >
          <i className="ti ti-file-import" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar XML
        </button>

        {/* Importar Documento — pipeline Gemini, aceita PDF/imagem/TXT/DOC/XLS/XLSX */}
        <button
          onClick={onImportarDocumento}
          title="Importar documento via IA (PDF, imagem, TXT, DOC, XLS, XLSX)"
          style={{ ...botaoBase, background: '#ffffff', color: '#1a6094' }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar Documento
        </button>

      </div>

      {/* Direita: Backup, Restaurar, Exportar, Nova Despesa */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

        {/* Backup */}
        <button
          onClick={handleBackup}
          disabled={loadingBackup}
          title="Exportar backup completo da tabela despesas"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#1a6094',
            color: '#ffffff',
            border: '1px solid #1a6094',
            borderRadius: '5px',
            cursor: loadingBackup ? 'wait' : 'pointer',
            opacity: loadingBackup ? 0.7 : 1,
          }}
        >
          <i className="ti ti-database-export" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingBackup ? 'Gerando...' : 'Backup'}
        </button>

        {/* Restaurar */}
        <button
          onClick={handleRestaurarClick}
          disabled={loadingRestore}
          title="Restaurar backup da tabela despesas"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#ffffff',
            color: '#3a6080',
            border: '1px solid #c4d8eb',
            borderRadius: '5px',
            cursor: loadingRestore ? 'wait' : 'pointer',
            opacity: loadingRestore ? 0.7 : 1,
          }}
        >
          <i className="ti ti-restore" style={{ fontSize: '14px' }} aria-hidden="true" />
          {loadingRestore ? 'Restaurando...' : 'Restaurar'}
        </button>

        {/* Input file oculto para Restaurar */}
        <input
          ref={inputRestaurarRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleArquivoSelecionado}
        />

        {/* Exportar CSV / Excel */}
        <ExportDropdownDespesas despesas={despesas} usuario={usuario ?? ''} />

        {/* Nova Despesa */}
        <button
          onClick={onNovaDespesa}
          title="Cadastrar nova despesa manualmente"
          style={{ ...botaoBase, background: '#1a6094', color: '#ffffff' }}
        >
          <i className="ti ti-plus" style={{ fontSize: '14px' }} aria-hidden="true" />
          Nova Despesa
        </button>

      </div>
    </div>
  )
}
