// ============================================================
// components/receitas/ReceitasHeader.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Header da tela desktop — título, contador e botões
//         Importar XML (esquerda, destaque) + Backup, Restaurar,
//         Exportar, Nova Receita (direita)
// Conecta com: app/receitas/page.tsx (callbacks e totalReceitas)
//              receitasService.ts (fazerBackup, lerArquivoBackup, restaurarBackup)
//              ExportDropdownReceitas.tsx (dropdown CSV/Excel)
// Sem alert() / confirm() — erros e confirmações via callbacks
// ============================================================

'use client'

import { useRef, useState } from 'react'
import { fazerBackup, lerArquivoBackup, restaurarBackup } from '@/lib/receitasService'
import type { Receita } from '@/types/receitas'
import ExportDropdownReceitas from './ExportDropdownReceitas'

// ============================================================
// Props
// ============================================================
interface ReceitasHeaderProps {
  totalReceitas: number           // Contador exibido ao lado do título
  receitas: Receita[]             // Lista atual filtrada (para exportar)
  usuario?: string                // Usuário logado — usado no nome do arquivo
  onImportarXml: () => void       // Abre o file picker de import XML
  onNovaReceita: () => void       // Abre modal no modo 'novo'
  onRestaurado: () => void        // Callback após restore — recarrega lista
  onErro: (msg: string) => void   // Callback para exibir erro inline na página
  onSucesso: (msg: string) => void // Callback para exibir sucesso inline na página
}

// ============================================================
// ReceitasHeader
// Renderiza apenas em desktop (mobile usa BasebarReceitas.tsx)
// ============================================================
export default function ReceitasHeader({
  totalReceitas,
  receitas,
  usuario,
  onImportarXml,
  onNovaReceita,
  onRestaurado,
  onErro,
  onSucesso,
}: ReceitasHeaderProps) {

  const inputRestaurarRef = useRef<HTMLInputElement>(null)
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
  // handleRestaurarClick
  // ============================================================
  function handleRestaurarClick() {
    inputRestaurarRef.current?.click()
  }

  // ============================================================
  // handleArquivoSelecionado
  // Lê o arquivo JSON e executa o upsert
  // Confirmação via UI inline — sem confirm()
  // ============================================================
  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoadingRestore(true)
    try {
      const dados = await lerArquivoBackup(file)
      await restaurarBackup(dados)
      onSucesso(`Backup restaurado: ${dados.length} registros processados.`)
      onRestaurado()
    } catch (err: unknown) {
      onErro(err instanceof Error ? err.message : 'Erro ao restaurar backup')
    } finally {
      setLoadingRestore(false)
      e.target.value = ''
    }
  }

  // ============================================================
  // Render
  // ============================================================
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
      {/* Esquerda: título + contador + Importar XML */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

        {/* Título + contador */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6094' }}>
            Receitas
          </span>
          <span style={{ fontSize: '11px', color: '#5a84a6' }}>
            {totalReceitas} {totalReceitas === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {/* Importar XML — destaque primário, mais largo */}
        <button
          onClick={onImportarXml}
          title="Importar NF-e XML (procNFe)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#1a6094',
            color: '#ffffff',
            border: '1px solid #1a6094',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-file-import" style={{ fontSize: '14px' }} aria-hidden="true" />
          Importar XML
        </button>

      </div>

      {/* Direita: Backup, Restaurar, Exportar, Nova Receita */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

        {/* Backup */}
        <button
          onClick={handleBackup}
          disabled={loadingBackup}
          title="Exportar backup completo da tabela receitas"
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
          title="Restaurar backup da tabela receitas"
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
        <ExportDropdownReceitas receitas={receitas} usuario={usuario ?? ''} />

        {/* Nova Receita */}
        <button
          onClick={onNovaReceita}
          title="Cadastrar nova receita manualmente"
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
            cursor: 'pointer',
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: '14px' }} aria-hidden="true" />
          Nova Receita
        </button>

      </div>
    </div>
  )
}
