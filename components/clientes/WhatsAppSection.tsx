// ============================================================
// components/clientes/WhatsAppSection.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes (compartilhado com Fornecedores)
// Função: Seção WhatsApp Business dentro do modal de cliente/fornecedor
//         Permite adicionar e remover contatos {name, phone,
//         favorito?}. Armazenados como array JSONB em contato_whatsapp
//         Favorito (Especificacao_Fornecedores_Pix_Categorias_
//         WhatsApp.md, Seção 2.2) fica atrás da prop opcional
//         suportaFavorito — sem comportamento novo quando omitida,
//         portanto INERTE para Clientes nesta entrega (nenhuma tela
//         de Clientes passa suportaFavorito={true}).
// Conecta com: ClientesModal.tsx (contatos, onChange, readOnly —
//              sem suportaFavorito/onDefinirFavorito, uso inalterado)
//              FornecedoresModal.tsx (usa suportaFavorito={true} +
//              onDefinirFavorito, ver Seção 2.2 da especificação)
//              types/clientes.ts (ContatoWhatsApp, campo favorito)
// ============================================================

'use client'

import { useState } from 'react'
import type { ContatoWhatsApp } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface WhatsAppSectionProps {
  contatos: ContatoWhatsApp[]                        // Array atual de contatos
  onChange: (contatos: ContatoWhatsApp[]) => void    // Callback ao alterar lista (adicionar/remover)
  readOnly?: boolean                                  // Modo visualizar — sem edição

  // ── Campos novos (Seção 2.2) — opcionais, sem valor = comportamento
  // idêntico ao anterior a esta mudança (usado por Clientes hoje) ──
  suportaFavorito?: boolean                           // true = renderiza o toggle de favorito por contato
  onDefinirFavorito?: (indice: number) => void        // Chamado ao clicar no toggle — quem usa o componente
                                                       // decide COMO persistir (ex: FornecedoresModal.tsx chama
                                                       // definirContatoWhatsAppFavorito() e depois atualiza
                                                       // `contatos` via onChange). Este componente permanece
                                                       // "burro" — não conhece fornecedorId nem services.
  notaFavoritoIndisponivel?: string                   // Texto opcional exibido no lugar do toggle quando o
                                                       // recurso existe mas está indisponível agora (ex:
                                                       // fornecedor ainda não salvo) — quem usa decide o texto
}

// ============================================================
// WhatsAppSection
// ============================================================
export default function WhatsAppSection({
  contatos,
  onChange,
  readOnly = false,
  suportaFavorito = false,
  onDefinirFavorito,
  notaFavoritoIndisponivel,
}: WhatsAppSectionProps) {

  // Controla visibilidade do formulário de novo contato
  const [adicionando, setAdicionando] = useState(false)

  // Campos do novo contato sendo digitado
  const [novoNome, setNovoNome] = useState('')
  const [novoFone, setNovoFone] = useState('')

  // ============================================================
  // handleAdicionar
  // Valida e adiciona novo contato à lista
  // ============================================================
  function handleAdicionar() {
    if (!novoFone.trim()) return // Telefone é obrigatório
    const novo: ContatoWhatsApp = {
      name: novoNome.trim(),
      phone: novoFone.trim(),
      favorito: false, // explícito — nasce não-favorito, evita undefined ambíguo
    }
    onChange([...contatos, novo])
    // Reseta o formulário
    setNovoNome('')
    setNovoFone('')
    setAdicionando(false)
  }

  // ============================================================
  // handleRemover
  // Remove contato pelo índice
  // ============================================================
  function handleRemover(index: number) {
    const atualizado = contatos.filter((_, i) => i !== index)
    onChange(atualizado)
  }

  // ============================================================
  // handleCancelar
  // Cancela adição e reseta formulário
  // ============================================================
  function handleCancelar() {
    setNovoNome('')
    setNovoFone('')
    setAdicionando(false)
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        background: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: '6px',
        padding: '10px 12px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
        marginTop: '8px',
      }}
    >
      {/* Header da seção */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#15803d',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          💬 WhatsApp Business
        </span>

        {/* Botão adicionar — oculto em modo read-only */}
        {!readOnly && !adicionando && (
          <button
            onClick={() => setAdicionando(true)}
            style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'Tahoma, Geneva, sans-serif',
              background: '#ffffff',
              color: '#15803d',
              border: '1px solid #15803d',
              borderRadius: '4px',
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            + Adicionar Contato
          </button>
        )}
      </div>

      {/* Lista de contatos salvos */}
      {contatos.length === 0 && !adicionando ? (
        <p
          style={{
            fontSize: '11px',
            color: '#5a84a6',
            margin: 0,
          }}
        >
          {readOnly
            ? 'Nenhum contato cadastrado.'
            : "Nenhum contato cadastrado. Clique em 'Adicionar Contato'."}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {contatos.map((c, index) => (
            <div
              // Chave estável combinando phone+name+index
              // key={index} puro causa reuso incorreto de DOM ao remover do meio da lista
              key={`${c.phone}-${c.name}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                background: '#ffffff',
                border: '1px solid #86efac',
                borderRadius: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Toggle de favorito — só quando suportaFavorito=true (Seção 2.2).
                    Comportamento estilo rádio: clicar em um desmarca os outros —
                    a lógica de "desmarcar os outros" acontece no service
                    (definirContatoWhatsAppFavorito), não aqui — este componente
                    só dispara a intenção via onDefinirFavorito */}
                {suportaFavorito && (
                  <button
                    onClick={() => onDefinirFavorito?.(index)}
                    disabled={readOnly || !onDefinirFavorito}
                    title={c.favorito ? 'Contato favorito' : 'Definir como favorito'}
                    aria-label={c.favorito ? 'Contato favorito' : `Definir ${c.name || c.phone} como favorito`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      marginRight: '6px',
                      padding: 0,
                      fontSize: '13px',
                      background: 'transparent',
                      border: 'none',
                      color: c.favorito ? '#f59e0b' : '#c4d8eb', // dourado quando favorito, cinza-claro quando não
                      cursor: readOnly ? 'default' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {c.favorito ? '★' : '☆'}
                  </button>
                )}
                {/* Nome do contato */}
                {c.name && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#15803d',
                      marginRight: '8px',
                    }}
                  >
                    {c.name}
                  </span>
                )}
                {/* Telefone */}
                <span style={{ fontSize: '11px', color: '#5a84a6' }}>
                  {c.phone}
                </span>
              </div>

              {/* Botão remover — oculto em modo read-only */}
              {!readOnly && (
                <button
                  onClick={() => handleRemover(index)}
                  title="Remover contato"
                  aria-label={`Remover contato ${c.name || c.phone}`}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'Tahoma, Geneva, sans-serif',
                    background: '#ffffff',
                    color: '#dc2626',
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Nota opcional — quem usa o componente decide o texto (ou omite).
          FornecedoresModal.tsx passa isto em modo 'novo', quando o favorito
          Pix já está indisponível pela mesma razão (sem fornecedor.id ainda,
          Seção 1.6) — mantém o aviso consistente entre Chaves Pix e WhatsApp */}
      {notaFavoritoIndisponivel && !readOnly && (
        <p style={{ fontSize: '10px', color: '#5a84a6', fontStyle: 'italic', margin: '6px 0 0' }}>
          {notaFavoritoIndisponivel}
        </p>
      )}

      {/* Formulário inline para novo contato */}
      {adicionando && (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {/* Campo Nome */}
          <input
            type="text"
            placeholder="Nome do contato (opcional)"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            style={inputStyle}
            autoFocus
          />

          {/* Campo Telefone */}
          <input
            type="text"
            placeholder="Telefone WhatsApp (ex: 44999990000)"
            value={novoFone}
            onChange={e => setNovoFone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdicionar()}
            style={inputStyle}
          />

          {/* Botões salvar / cancelar */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleAdicionar}
              disabled={!novoFone.trim()}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'Tahoma, Geneva, sans-serif',
                background: '#15803d',
                color: '#ffffff',
                border: '1px solid #15803d',
                borderRadius: '4px',
                padding: '4px 12px',
                cursor: novoFone.trim() ? 'pointer' : 'not-allowed',
                opacity: novoFone.trim() ? 1 : 0.5,
              }}
            >
              Salvar
            </button>
            <button
              onClick={handleCancelar}
              style={{
                fontSize: '11px',
                fontFamily: 'Tahoma, Geneva, sans-serif',
                background: '#ffffff',
                color: '#3a6080',
                border: '1px solid #c4d8eb',
                borderRadius: '4px',
                padding: '4px 12px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Estilo reutilizável para inputs do formulário
// ============================================================
const inputStyle: React.CSSProperties = {
  height: '28px',
  padding: '0 8px',
  fontSize: '11px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#3a6080',
  background: '#ffffff',
  border: '1px solid #86efac',
  borderRadius: '4px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
