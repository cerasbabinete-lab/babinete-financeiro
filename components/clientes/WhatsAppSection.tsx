// ============================================================
// components/clientes/WhatsAppSection.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Seção WhatsApp Business dentro do modal de cliente
//         Permite adicionar e remover contatos {name, phone}
//         Armazenados como array JSONB em contato_whatsapp
// Conecta com: ClientesModal.tsx (contatos, onChange, readOnly)
//              types/clientes.ts (ContatoWhatsApp)
// ============================================================

'use client'

import { useState } from 'react'
import type { ContatoWhatsApp } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface WhatsAppSectionProps {
  contatos: ContatoWhatsApp[]                        // Array atual de contatos
  onChange: (contatos: ContatoWhatsApp[]) => void    // Callback ao alterar lista
  readOnly?: boolean                                  // Modo visualizar — sem edição
}

// ============================================================
// WhatsAppSection
// ============================================================
export default function WhatsAppSection({
  contatos,
  onChange,
  readOnly = false,
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
              <div>
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
