// ============================================================
// components/receitas/ImportarXmlButton.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Componente headless de import em lote de XMLs procNFe
//         Expõe triggerImport() via ref para ser acionado
//         pelo botão externo (ReceitasHeader / BasebarReceitas)
//         Exibe relatório inline após o processamento
// Conecta com: app/receitas/page.tsx (ref + onImportado)
//              lib/xmlParser.ts (parsearXml, ErroValidacao)
//              lib/receitasService.ts (verificarChaveAcessoDuplicada,
//                criarReceita, uploadXml, buscarClientePorCpfCnpj)
//              lib/contasReceberService.ts (criarTitulosDeReceita)
//              lib/transportadorasService.ts (upsertTransportadora)
// ============================================================

'use client'

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { parsearXml, ErroValidacao } from '@/lib/xmlParser'
import {
  verificarChaveAcessoDuplicada,
  criarReceita,
  uploadXml,
  buscarClientePorCpfCnpj,
} from '@/lib/receitasService'
import { criarTitulosDeReceita } from '@/lib/contasReceberService'
import { upsertTransportadora } from '@/lib/transportadorasService'
import type { ResultadoImportXml } from '@/types/receitas'

// ============================================================
// Handle exposto via ref — permite acionar o file picker
// de qualquer botão pai (header desktop ou basebar mobile)
// ============================================================
export interface ImportarXmlHandle {
  triggerImport: () => void
}

interface ImportarXmlButtonProps {
  onImportado: () => void
  onErro?: (msg: string) => void
}

const ImportarXmlButton = forwardRef(
  function ImportarXmlButton(
    { onImportado, onErro }: ImportarXmlButtonProps,
    ref: React.Ref<ImportarXmlHandle>
  ) {

    const inputRef = useRef<HTMLInputElement>(null)
    const [processando, setProcessando] = useState(false)
    const [resultado, setResultado]     = useState<ResultadoImportXml | null>(null)

    // Auto-dismiss do painel de resultado após 8 segundos
    // Evita que o painel fique montado com dados obsoletos entre importações
    useEffect(() => {
      if (!resultado) return
      const t = setTimeout(() => setResultado(null), 8000)
      return () => clearTimeout(t)
    }, [resultado])

    // Expõe triggerImport() para o componente pai via ref
    useImperativeHandle(ref, () => ({
      triggerImport() {
        inputRef.current?.click()
      },
    }))

    async function handleArquivos(e: React.ChangeEvent<HTMLInputElement>) {
      const files: File[] = Array.from(e.target.files ?? [])
      if (files.length === 0) return

      setProcessando(true)
      setResultado(null)

      const res: ResultadoImportXml = { success: 0, errors: [] }

      // Sequencial — evita race conditions em clientes/transportadoras
      for (const file of files) {
        try {
          const xmlString = await file.text()

          // 1. Parse e validação
          const parsed = parsearXml(xmlString)

          // 2. Chave de acesso duplicada
          const duplicado = await verificarChaveAcessoDuplicada(parsed.chaveAcesso)
          if (duplicado) {
            res.errors.push({ file: file.name, reason: 'NF já importada anteriormente' })
            continue
          }

          // 3. Upsert transportadora
          let transportadoraId: string | null = null
          if (parsed.transportadora) {
            const transp = await upsertTransportadora(parsed.transportadora)
            transportadoraId = transp.id
          }

          // 4. Lookup cliente por CPF/CNPJ (sem criar — dados históricos vêm do XML)
          // Captura o objeto completo para ter acesso ao nome fantasia
          let clienteId:      number | null = null
          let clienteFantasia: string | null = null
          if (parsed.receita.cliente_cpf_cnpj) {
            const cliente = await buscarClientePorCpfCnpj(parsed.receita.cliente_cpf_cnpj)
            clienteId      = cliente?.id       ?? null
            clienteFantasia = cliente?.fantasia ?? null
          }

          // 5. Monta ReceitaInsert com IDs resolvidos
          const receitaInsert = {
            ...parsed.receita,
            transportadora_id: transportadoraId,
            cliente_id:        clienteId,
            xml_storage_path:  `${parsed.chaveAcesso}.xml`,
          }

          // 6. Insere receita + itens + duplicatas
          // criarReceita retorna { receita, duplicatas } — duplicatas têm ids do Postgres
          const { receita: novaReceita, duplicatas: duplicatasInseridas } =
            await criarReceita(receitaInsert, parsed.itens, parsed.duplicatas)

          // 7. Cria títulos em Contas a Receber para cada duplicata
          // Não bloqueante — erros aqui não desfazem a Receita já gravada
          if (duplicatasInseridas.length > 0) {
            const resultCR = await criarTitulosDeReceita({
              receita: {
                id:                novaReceita.id,
                numero_nf:         novaReceita.numero_nf,
                cliente_nome:      novaReceita.cliente_nome      ?? '',
                cliente_cpf_cnpj:  novaReceita.cliente_cpf_cnpj ?? '',
                cliente_fantasia:  clienteFantasia,  // Nome fantasia do cadastro de Clientes
                cliente_email:     novaReceita.cliente_email     ?? null,
                cliente_fone:      novaReceita.cliente_fone      ?? null,
                cliente_municipio: novaReceita.cliente_municipio ?? null,
                cliente_uf:        novaReceita.cliente_uf        ?? null,
                cliente_id:        clienteId,
              },
              duplicatas: duplicatasInseridas.map(d => ({
                id:               d.id,
                numero_duplicata: d.numero_duplicata,
                data_vencimento:  d.data_vencimento,
                valor:            d.valor,
              })),
            })
            if (resultCR.erros.length > 0) {
              // Erros em Contas a Receber são registrados mas não bloqueiam o import
              console.warn('[ImportarXmlButton] criarTitulosDeReceita erros:', resultCR.erros)
            }
          }

          // 8. Upload do XML bruto para Storage
          await uploadXml(parsed.chaveAcesso, xmlString)

          res.success++

        } catch (err: unknown) {
          if (err instanceof ErroValidacao) {
            res.errors.push({ file: file.name, reason: err.reason })
          } else {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            res.errors.push({ file: file.name, reason: msg })
            onErro?.(msg)
          }
        }
      }

      setResultado(res)
      setProcessando(false)
      e.target.value = ''

      if (res.success > 0) onImportado()
    }

    return (
      <div>
        {/* Input file oculto — acionado via ref.triggerImport() */}
        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          multiple
          style={{ display: 'none' }}
          onChange={handleArquivos}
        />

        {/* Indicador de progresso — visível enquanto importa */}
        {processando && (
          <div style={{
            padding: '8px 12px', background: '#e8f0f7',
            border: '1px solid #c4d8eb', borderRadius: '5px',
            fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif',
            color: '#1a6094', marginTop: '8px',
          }}>
            <i className="ti ti-loader" style={{ marginRight: '6px' }} />
            Importando XMLs...
          </div>
        )}

        {/* Relatório inline de resultado */}
        {resultado && !processando && (
          <div style={{
            marginTop: '8px', padding: '10px 14px',
            background: '#f7fafc', border: '1px solid #dde8f0',
            borderRadius: '6px', fontSize: '12px',
            fontFamily: 'Tahoma, Geneva, sans-serif',
          }}>
            {resultado.success > 0 && (
              <div style={{ color: '#27ae60', fontWeight: 700, marginBottom: resultado.errors.length > 0 ? '6px' : 0 }}>
                <i className="ti ti-check" style={{ marginRight: '5px' }} />
                {resultado.success} {resultado.success === 1 ? 'NF importada' : 'NFs importadas'} com sucesso
              </div>
            )}
            {resultado.errors.length > 0 && (
              <div>
                <div style={{ color: '#a32d2d', fontWeight: 700, marginBottom: '4px' }}>
                  <i className="ti ti-alert-triangle" style={{ marginRight: '5px' }} />
                  {resultado.errors.length} {resultado.errors.length === 1 ? 'erro' : 'erros'}:
                </div>
                {resultado.errors.map((e: { file: string; reason: string }, i: number) => (
                  <div key={i} style={{ color: '#a32d2d', paddingLeft: '14px', marginBottom: '2px' }}>
                    <strong>{e.file}</strong> — {e.reason}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setResultado(null)}
              style={{ marginTop: '8px', fontSize: '11px', color: '#5a84a6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    )
  }
)

export default ImportarXmlButton
