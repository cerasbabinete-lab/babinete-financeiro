// ============================================================
// components/fornecedores/FornecedoresMobileList.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Lista mobile simplificada de fornecedores
//         Clone de ClientesMobileList.tsx — SEM linha de Lista
//         Cada item mostra Nome Fantasia, Cidade/UF, Chave Pix,
//         WhatsApp (fundo verde), botões de ação — Chave Pix/
//         WhatsApp e select de Tipo dinâmico adicionados por
//         Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md,
//         Seções 3.2 e 4
// Conecta com: app/fornecedores/page.tsx (fornecedores, onEditar,
//              onVisualizar, onExcluir, categorias, chavesPixPreferenciais)
//              types/fornecedores.ts (Fornecedor, FornecedorCategoria, ChavePix)
// ============================================================

'use client'

import { useState } from 'react'
import type { Fornecedor, FornecedorCategoria, ChavePix } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresMobileListProps {
  fornecedores: Fornecedor[]
  onEditar: (fornecedor: Fornecedor) => void
  onVisualizar: (fornecedor: Fornecedor) => void
  onExcluir: (fornecedor: Fornecedor) => void
  // Classificação rápida inline (Módulo Relatórios, 2.6) — mesmo
  // mecanismo de FornecedoresTabela.tsx, versão mobile
  // MIGRADO (Seção 4.5): parâmetro passa a ser o id da categoria (FK)
  onAlterarTipo: (fornecedor: Fornecedor, categoriaId: number | null) => void
  categorias: FornecedorCategoria[]   // Lista dinâmica — buscada uma vez em app/fornecedores/page.tsx (Seção 4)
  chavesPixPreferenciais: ChavePix[]  // Todas as chaves preferenciais de todos os fornecedores (Seção 3.1/3.2)
}

// ============================================================
// FornecedoresMobileList
// ============================================================
export default function FornecedoresMobileList({
  fornecedores,
  onEditar,
  onVisualizar,
  onExcluir,
  onAlterarTipo,
  categorias,
  chavesPixPreferenciais,
}: FornecedoresMobileListProps) {

  // id do fornecedor aguardando confirmação de exclusão (null = nenhum)
  const [confirmandoExcluirId, setConfirmandoExcluirId] = useState<number | null>(null)

  // ============================================================
  // getChavePixDoFornecedor / getWhatsAppFavoritoDoFornecedor
  // Mesma lógica de FornecedoresTabela.tsx (Seção 3.1/3.2) — mantida
  // duplicada aqui em vez de extraída para um helper compartilhado
  // porque a spec não autoriza criar nenhum arquivo além de
  // CategoriasModal.tsx nesta entrega (Seção 5)
  // BUGFIX (confirmado por Maycon em produção, 01/09/2026): mesma
  // causa e mesmo fix de FornecedoresTabela.tsx — fornecedores.id é
  // BIGINT (vem como string do Supabase/PostgREST), fornecedor_
  // chaves_pix.fornecedor_id é INTEGER (vem como number). Comparação
  // via String() dos dois lados, imune a qual formato vier
  // ============================================================
  function getChavePixDoFornecedor(fornecedorId: number): string {
    const chave = chavesPixPreferenciais.find(c => String(c.fornecedor_id) === String(fornecedorId))
    return chave?.valor_chave ?? '—'
  }

  function getWhatsAppFavoritoDoFornecedor(fornecedor: Fornecedor): string {
    const contatos = fornecedor.contato_whatsapp ?? []
    const favorito = contatos.find(c => c.favorito)
    if (favorito) return favorito.phone
    if (contatos.length === 1) return contatos[0].phone
    return '—'
  }

  if (fornecedores.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#5a84a6',
          fontSize: '12px',
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        Nenhum fornecedor encontrado.
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      {fornecedores.map((fornecedor) => (
        <div
          key={fornecedor.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: '#ffffff',
            borderBottom: '1px solid #e8f0f7',
          }}
        >
          {/* Informações do fornecedor — sem linha de Lista */}
          <div style={{ flex: 1, minWidth: 0 }}>

            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#1a6094',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {fornecedor.fantasia || fornecedor.razao || '—'}
            </div>

            <div
              style={{
                fontSize: '9px',
                color: '#5a84a6',
                marginTop: '2px',
              }}
            >
              {fornecedor.cidade && fornecedor.uf
                ? `${fornecedor.cidade}/${fornecedor.uf}`
                : fornecedor.cidade || fornecedor.uf || '—'}
            </div>

            {/* Tipo de Fornecedor — select inline, salva ao trocar
                (Módulo Relatórios, 2.6). MIGRADO (Seção 4.5): lista
                dinâmica de fornecedor_categorias em vez do enum fechado */}
            <select
              value={fornecedor.tipo_fornecedor_id ?? ''}
              onChange={e => {
                const valor = e.target.value
                onAlterarTipo(fornecedor, valor === '' ? null : Number(valor))
              }}
              onClick={e => e.stopPropagation()} // não deve disparar nenhum toque no card
              style={selectMobileStyle}
              aria-label={`Tipo de fornecedor: ${fornecedor.fantasia || fornecedor.razao}`}
            >
              <option value="">Não classificado</option>
              {categorias.map(categoria => (
                <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </select>

            {/* Chave Pix — chave preferencial (Seção 3.2). Sem cor de
                fundo especial (só a linha WhatsApp recebe, mesma regra
                da versão desktop, Seção 3.1) */}
            <div style={{ fontSize: '9px', color: '#5a84a6', marginTop: '4px' }}>
              Pix: {getChavePixDoFornecedor(fornecedor.id)}
            </div>

            {/* WhatsApp — telefone do contato favorito (Seção 3.2).
                Fundo verde claro — mesmo token de WhatsAppSection.tsx
                (#f0fdf4/#86efac), reaproveitado na versão desktop também */}
            <div
              style={{
                fontSize: '9px',
                color: '#15803d',
                marginTop: '4px',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '3px',
                padding: '2px 5px',
                display: 'inline-block',
              }}
            >
              WhatsApp: {getWhatsAppFavoritoDoFornecedor(fornecedor)}
            </div>

          </div>

          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '6px', marginLeft: '10px', flexShrink: 0 }}>

            {confirmandoExcluirId === fornecedor.id ? (
              // Confirmação inline de exclusão — sem alert/confirm
              <>
                <button
                  onClick={() => { onExcluir(fornecedor); setConfirmandoExcluirId(null) }}
                  title="Confirmar exclusão"
                  style={{ ...btnMobileStyle, color: '#dc2626', borderColor: '#fca5a5', fontSize: '9px', width: 'auto', padding: '0 7px' }}
                >
                  Excluir
                </button>
                <button
                  onClick={() => setConfirmandoExcluirId(null)}
                  title="Cancelar"
                  style={{ ...btnMobileStyle, fontSize: '9px', width: 'auto', padding: '0 7px' }}
                >
                  Não
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onEditar(fornecedor)}
                  title="Editar fornecedor"
                  aria-label={`Editar ${fornecedor.fantasia}`}
                  style={btnMobileStyle}
                >
                  <i className="ti ti-writing" style={{ fontSize: '14px' }} aria-hidden="true" />
                </button>

                <button
                  onClick={() => onVisualizar(fornecedor)}
                  title="Visualizar fornecedor"
                  aria-label={`Visualizar ${fornecedor.fantasia}`}
                  style={btnMobileStyle}
                >
                  <i className="ti ti-eye" style={{ fontSize: '14px' }} aria-hidden="true" />
                </button>

                <button
                  onClick={() => setConfirmandoExcluirId(fornecedor.id)}
                  title="Excluir fornecedor"
                  aria-label={`Excluir ${fornecedor.fantasia}`}
                  style={{ ...btnMobileStyle, color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  <i className="ti ti-trash" style={{ fontSize: '14px' }} aria-hidden="true" />
                </button>
              </>
            )}

          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
const selectMobileStyle: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '9px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#2c4a60',
  padding: '3px 4px',
  border: '1px solid #dde8f0',
  borderRadius: '4px',
  background: '#ffffff',
  maxWidth: '160px',
}

const btnMobileStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  background: '#ffffff',
  border: '1px solid #c4d8eb',
  borderRadius: '4px',
  color: '#1a6094',
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'Tahoma, Geneva, sans-serif',
  fontSize: '12px',
}
