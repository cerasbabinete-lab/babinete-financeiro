// ============================================================
// components/fornecedores/CategoriasModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Modal de gerenciamento das categorias de fornecedor
//         (fornecedor_categorias) — criar, renomear, excluir.
//         Toda ação grava IMEDIATAMENTE no banco — não existe botão
//         "Gravar" aqui, mesmo padrão da tela de Log de Acesso do
//         Módulo Usuários (Especificacao_Fornecedores_Pix_Categorias_
//         WhatsApp.md, Seção 4.6). Fecha só via X ou Cancelar —
//         nunca por clique no overlay (convenção do projeto).
// Conecta com: lib/fornecedoresService.ts (listarCategorias — feita
//              pelo pai, criarCategoria, renomearCategoria,
//              excluirCategoria), types/fornecedores.ts
//              (FornecedorCategoria), FornecedoresModal.tsx (abre
//              este modal via link "Gerenciar categorias")
// ============================================================

'use client'

// Hook de estado local do React — controla os inputs e as
// confirmações inline desta tela
import { useState } from 'react'

// Funções de escrita no banco — cada uma grava imediatamente,
// sem passar por um payload consolidado como o resto do módulo
import { criarCategoria, renomearCategoria, excluirCategoria } from '@/lib/fornecedoresService'

// Tipo do registro de categoria — vem de types/fornecedores.ts,
// mesma fonte usada pelo pai (FornecedoresModal.tsx / app/fornecedores/page.tsx)
import type { FornecedorCategoria } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface CategoriasModalProps {
  aberto: boolean                    // Controla se o modal está visível — pai decide quando renderizar
  categorias: FornecedorCategoria[]  // Lista atual — buscada UMA VEZ pelo pai (app/fornecedores/page.tsx)
                                      // e repassada por prop, evitando fetch redundante em cada tela
  onFechar: () => void               // Fecha o modal — X ou botão "Fechar"
  onCategoriasAlteradas: () => void  // Chamado após qualquer criação/rename/exclusão bem-sucedida,
                                      // para o pai re-buscar listarCategorias() e propagar a lista
                                      // atualizada de volta para Modal/Tabela/MobileList
}

// ============================================================
// CategoriasModal
// ============================================================
export default function CategoriasModal({
  aberto,
  categorias,
  onFechar,
  onCategoriasAlteradas,
}: CategoriasModalProps) {

  // ── Estado do formulário "Adicionar categoria" ──
  const [novoNome, setNovoNome] = useState('')          // Texto digitado no campo de nova categoria
  const [adicionando, setAdicionando] = useState(false) // true durante a chamada a criarCategoria()

  // ── Estado do rename inline ──
  const [renomeandoId, setRenomeandoId] = useState<number | null>(null) // id da categoria em edição de nome (null = nenhuma)
  const [valorRenomeando, setValorRenomeando] = useState('')            // texto digitado durante o rename

  // ── Estado da confirmação inline de exclusão ──
  const [confirmandoExcluirId, setConfirmandoExcluirId] = useState<number | null>(null) // id aguardando confirmação (null = nenhum)

  // ── Estado de processamento genérico e erro — evita cliques
  // duplicados em qualquer ação e mostra falhas de forma inline
  // (nunca alert()/confirm(), convenção do projeto) ──
  const [processando, setProcessando] = useState(false) // true durante qualquer chamada em andamento
  const [erro, setErro] = useState('')                  // mensagem de erro inline, vazio = sem erro

  // ============================================================
  // handleAdicionar
  // Cria uma nova categoria a partir do texto digitado
  // Nome único (case-insensitive) é garantido pelo índice do banco —
  // erro de duplicidade sobe como Error normal e cai no catch abaixo
  // ============================================================
  async function handleAdicionar() {
    const nome = novoNome.trim() // remove espaços extras nas bordas
    if (!nome) return            // campo vazio — não chama o serviço

    setAdicionando(true) // trava o botão "Adicionar" durante a chamada
    setErro('')          // limpa erro anterior antes de tentar de novo
    try {
      await criarCategoria(nome)       // grava imediatamente no banco
      setNovoNome('')                  // limpa o campo após sucesso
      onCategoriasAlteradas()          // avisa o pai para re-buscar a lista
    } catch (err: unknown) {
      // catch (err: unknown) obrigatório — nunca err: any (convenção do projeto)
      setErro(err instanceof Error ? err.message : 'Erro ao adicionar categoria.')
    } finally {
      setAdicionando(false) // libera o botão independente de sucesso ou falha
    }
  }

  // ============================================================
  // handleIniciarRenomear
  // Abre o campo de edição inline para a categoria clicada
  // ============================================================
  function handleIniciarRenomear(categoria: FornecedorCategoria) {
    setRenomeandoId(categoria.id)      // marca esta categoria como "em edição"
    setValorRenomeando(categoria.nome) // pré-preenche com o nome atual
    setErro('')                        // limpa erro de uma ação anterior, se houver
  }

  // ============================================================
  // handleConfirmarRenomear
  // Grava o novo nome digitado — chamado pelo botão de confirmar
  // ou pela tecla Enter no campo de rename
  // ============================================================
  async function handleConfirmarRenomear() {
    if (renomeandoId === null) return // segurança — não deveria chamar sem uma categoria em edição
    const nome = valorRenomeando.trim()
    if (!nome) return // nome vazio não é gravado — usuário precisa cancelar em vez de esvaziar

    setProcessando(true)
    setErro('')
    try {
      await renomearCategoria(renomeandoId, nome) // grava imediatamente no banco
      setRenomeandoId(null)                       // fecha o modo de edição
      setValorRenomeando('')
      onCategoriasAlteradas()                     // avisa o pai para re-buscar a lista
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao renomear categoria.')
    } finally {
      setProcessando(false)
    }
  }

  // ============================================================
  // handleCancelarRenomear
  // Fecha o modo de edição sem gravar nada
  // ============================================================
  function handleCancelarRenomear() {
    setRenomeandoId(null)
    setValorRenomeando('')
  }

  // ============================================================
  // handleExcluir
  // Confirma e executa a exclusão — chama o RPC excluir_categoria_
  // fornecedor via excluirCategoria(), que já reclassifica qualquer
  // fornecedor vinculado para "Não classificado" antes de excluir
  // (sql/fornecedores.sql, RPC excluir_categoria_fornecedor)
  // ============================================================
  async function handleExcluir(categoriaId: number) {
    setProcessando(true)
    setErro('')
    try {
      await excluirCategoria(categoriaId) // RPC — reclassifica fornecedores e soft-deleta a categoria
      setConfirmandoExcluirId(null)       // fecha a confirmação inline
      onCategoriasAlteradas()             // avisa o pai para re-buscar a lista
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir categoria.')
      setConfirmandoExcluirId(null) // fecha a confirmação mesmo em erro — evita ficar travado
    } finally {
      setProcessando(false)
    }
  }

  // Modal não renderiza nada quando fechado — mesmo padrão de
  // FornecedoresModal.tsx (if (!modo) return null)
  if (!aberto) return null

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        position: 'fixed',   // cobre a tela inteira, sobrepõe o FornecedoresModal por trás
        inset: 0,
        background: 'rgba(0,0,0,0.45)', // mesmo overlay escuro de FornecedoresModal.tsx
        zIndex: 1100,        // acima do FornecedoresModal (zIndex 1000), que continua aberto atrás
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'Tahoma, Geneva, sans-serif', // fonte padrão do projeto em todo componente visual
      }}
      // Sem onClick aqui de propósito — modal fecha só via X ou
      // "Fechar" (Seção 4.6 + convenção do projeto: nunca overlay click)
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '420px',   // modal "pequeno", conforme pedido na Seção 4.6
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header — mesmo estilo de FornecedoresModal.tsx */}
        <div
          style={{
            background: '#1a6094',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700 }}>
            Gerenciar Categorias
          </span>
          <button
            onClick={onFechar}
            aria-label="Fechar modal de categorias"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Corpo scrollável */}
        <div style={{ overflowY: 'auto', padding: '16px', flex: 1 }}>

          {/* Erro inline — substitui alert(), convenção do projeto */}
          {erro && (
            <p
              style={{
                fontSize: '11px',
                color: '#dc2626',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '4px',
                padding: '6px 8px',
                margin: '0 0 10px',
              }}
            >
              {erro}
            </p>
          )}

          {/* Formulário "Adicionar categoria" */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <input
              type="text"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}       // atualiza o texto conforme o usuário digita
              onKeyDown={e => e.key === 'Enter' && handleAdicionar()} // Enter = mesmo efeito do botão
              placeholder="Nova categoria"
              disabled={adicionando}
              style={inputStyle}
            />
            <button
              onClick={handleAdicionar}
              disabled={adicionando || !novoNome.trim()} // trava sem texto ou durante a chamada
              style={{
                ...botaoPrimarioStyle,
                cursor: adicionando || !novoNome.trim() ? 'not-allowed' : 'pointer',
                opacity: adicionando || !novoNome.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {adicionando ? 'Adicionando...' : '+ Adicionar'}
            </button>
          </div>

          {/* Lista de categorias ativas */}
          {categorias.length === 0 ? (
            <p style={{ fontSize: '11px', color: '#5a84a6', textAlign: 'center', padding: '16px 0' }}>
              Nenhuma categoria cadastrada.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {categorias.map(categoria => (
                <div
                  key={categoria.id} // id numérico único — chave estável, sem necessidade de índice
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: '#f7fafc',
                    border: '1px solid #dde8f0',
                    borderRadius: '4px',
                    gap: '6px',
                  }}
                >
                  {renomeandoId === categoria.id ? (
                    // ── Modo edição inline do nome ──
                    <>
                      <input
                        type="text"
                        value={valorRenomeando}
                        onChange={e => setValorRenomeando(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleConfirmarRenomear()}
                        autoFocus
                        disabled={processando}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleConfirmarRenomear}
                        disabled={processando || !valorRenomeando.trim()}
                        title="Confirmar novo nome"
                        style={{ ...botaoAcaoStyle, color: '#15803d' }}
                      >
                        <i className="ti ti-check" aria-hidden="true" />
                      </button>
                      <button
                        onClick={handleCancelarRenomear}
                        disabled={processando}
                        title="Cancelar edição"
                        style={botaoAcaoStyle}
                      >
                        <i className="ti ti-x" aria-hidden="true" />
                      </button>
                    </>
                  ) : confirmandoExcluirId === categoria.id ? (
                    // ── Confirmação inline de exclusão — nunca window.confirm() ──
                    <>
                      <span style={{ fontSize: '10px', color: '#b45309', flex: 1 }}>
                        Excluir &quot;{categoria.nome}&quot;? Fornecedores vinculados ficam
                        &quot;Não classificado&quot;.
                      </span>
                      <button
                        onClick={() => handleExcluir(categoria.id)}
                        disabled={processando}
                        title="Confirmar exclusão"
                        style={{ ...botaoAcaoStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 6px' }}
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => setConfirmandoExcluirId(null)}
                        disabled={processando}
                        title="Cancelar exclusão"
                        style={{ ...botaoAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 6px' }}
                      >
                        Não
                      </button>
                    </>
                  ) : (
                    // ── Linha padrão — nome + ações ──
                    <>
                      <span style={{ fontSize: '11px', color: '#2c4a60', flex: 1 }}>
                        {categoria.nome}
                      </span>
                      <button
                        onClick={() => handleIniciarRenomear(categoria)}
                        title="Renomear categoria"
                        aria-label={`Renomear ${categoria.nome}`}
                        style={botaoAcaoStyle}
                      >
                        <i className="ti ti-writing" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => setConfirmandoExcluirId(categoria.id)}
                        title="Excluir categoria"
                        aria-label={`Excluir ${categoria.nome}`}
                        style={{ ...botaoAcaoStyle, color: '#dc2626' }}
                      >
                        <i className="ti ti-trash" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — SEM botão "Gravar" (Seção 4.6: toda ação já grava
            imediatamente) — só "Fechar" */}
        <div
          style={{
            background: '#f7fafc',
            borderTop: '1px solid #dde8f0',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onFechar}
            style={{
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#ffffff',
              color: '#3a6080',
              border: '1px solid #c4d8eb',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Estilos auxiliares — mesmo padrão visual de FornecedoresModal.tsx
// e FornecedoresTabela.tsx (Tahoma, cores do design system do projeto)
// ============================================================
const inputStyle: React.CSSProperties = {
  height: '28px',
  padding: '0 8px',
  fontSize: '12px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#3a6080',
  background: '#ffffff',
  border: '1px solid #dde8f0',
  borderRadius: '4px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const botaoPrimarioStyle: React.CSSProperties = {
  padding: '0 12px',
  height: '28px',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'Tahoma, Geneva, sans-serif',
  background: '#1a6094',
  color: '#ffffff',
  border: '1px solid #1a6094',
  borderRadius: '4px',
}

const botaoAcaoStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '3px',
  fontSize: '13px',
  color: '#1a6094',
  flexShrink: 0,
}
