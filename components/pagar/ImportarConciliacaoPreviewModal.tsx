// ============================================================
// components/pagar/ImportarConciliacaoPreviewModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Tela de prévia dos itens pendentes de confirmação gerados
//         pelo Motor de Conciliação (mais de um título em aberto do
//         mesmo fornecedor, ou nenhum valor batendo exatamente).
//         Usuário revisa item a item, escolhe o título correspondente
//         (ou opta por pular), confirma em lote no final.
//         Equivalente funcional de ImportarRetornoPreviewModal.tsx
//         (Contas a Receber), adaptado ao shape de ItemPendenteConfirmacao.
// Conecta com: app/pagar/page.tsx (recebe o resumo já retornado pelas
//              rotas de import), pages/api/pagar/confirmar-conciliacao.ts
// ============================================================

'use client'

import { useState } from 'react'
import type { ItemPendenteConfirmacao } from '@/types/contasAPagar'
import { formatarCnpjCpf, formatarMoeda, formatarDataBR } from '@/lib/contasAPagarService'

interface ImportarConciliacaoPreviewModalProps {
  itens:      ItemPendenteConfirmacao[]
  onFechar:   () => void
  onConfirmar: (escolhas: ItemPendenteConfirmacao[]) => Promise<void>
}

export default function ImportarConciliacaoPreviewModal({ itens, onFechar, onConfirmar }: ImportarConciliacaoPreviewModalProps) {
  // Cópia local editável — cada item ganha um tituloEscolhidoId
  // conforme o usuário seleciona, inicializado null (= pular)
  const [escolhas, setEscolhas] = useState<ItemPendenteConfirmacao[]>(itens.map((i) => ({ ...i })))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function selecionarTitulo(index: number, tituloId: string | null) {
    setEscolhas((prev) => prev.map((item, i) => (i === index ? { ...item, tituloEscolhidoId: tituloId } : item)))
  }

  async function handleConfirmar() {
    setEnviando(true)
    setErro(null)
    try {
      await onConfirmar(escolhas)
      onFechar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar conciliação')
    } finally {
      setEnviando(false)
    }
  }

  const resolvidos = escolhas.filter((e) => e.tituloEscolhidoId !== null).length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, fontFamily: 'Tahoma, Geneva, sans-serif' }}>
      <div style={{ background: '#ffffff', borderRadius: '10px', padding: '20px', width: '94%', maxWidth: '680px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>Confirmação de Conciliação Pendente</div>
          <button onClick={onFechar} style={{ border: 'none', background: 'transparent', color: '#7a8a99', fontSize: '18px', cursor: 'pointer' }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ fontSize: '11px', color: '#7a8a99', marginBottom: '14px' }}>
          {itens.length} item(ns) precisam de confirmação manual — {resolvidos} já resolvido(s).
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {escolhas.map((item, index) => (
            <div key={index} style={{ border: '1px solid #dde8f0', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <div><strong>{item.favorecidoIdentificado}</strong> ({formatarCnpjCpf(item.cnpjCpfIdentificado)})</div>
                <div style={{ fontWeight: 700, color: '#1a6094' }}>{formatarMoeda(item.valor)} — {formatarDataBR(item.data)}</div>
              </div>

              {item.titulosEmAbertoDoFornecedor.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#7a8a99' }}>Nenhum título em aberto encontrado para este fornecedor.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {item.titulosEmAbertoDoFornecedor.map((t) => (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`escolha-${index}`}
                        checked={item.tituloEscolhidoId === t.id}
                        onChange={() => selecionarTitulo(index, t.id)}
                      />
                      Doc. {t.numero_documento ?? '—'} · Vence {formatarDataBR(t.data_vencimento)} · {formatarMoeda(t.valor)}
                    </label>
                  ))}
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', marginTop: '6px', color: '#7a8a99' }}>
                <input type="radio" name={`escolha-${index}`} checked={item.tituloEscolhidoId === null} onChange={() => selecionarTitulo(index, null)} />
                Pular (não encontrado / decidir depois)
              </label>
            </div>
          ))}
        </div>

        {erro && <div style={{ marginTop: '10px', color: '#d32f2f', fontSize: '11px' }}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onFechar} style={{ border: '1px solid #dde8f0', background: 'transparent', color: '#5a6b7a', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button disabled={enviando} onClick={handleConfirmar} style={{ background: '#1a6094', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>
            {enviando ? 'Aplicando...' : `Confirmar (${escolhas.length} itens)`}
          </button>
        </div>
      </div>
    </div>
  )
}
