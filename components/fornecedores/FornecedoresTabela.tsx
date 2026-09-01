// ============================================================
// components/fornecedores/FornecedoresTabela.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Tabela desktop com fornecedores filtrados
//         Clone de ClientesTabela.tsx — SEM coluna Lista
//         Colunas: Cód. | Nome Fantasia | Razão Social | CNPJ/CPF
//                  Cidade/UF | Telefone | E-mail | Chave Pix |
//                  Contato | WhatsApp | Tipo | Ações
//         Chave Pix/WhatsApp e select de Tipo dinâmico adicionados
//         por Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md,
//         Seções 3 e 4. Layout NÃO usa table-layout:fixed nem
//         colunas percentuais — o arquivo original já não seguia
//         esse padrão (scroll horizontal + larguras px pontuais),
//         então as 2 colunas novas seguem o MESMO padrão real do
//         arquivo em vez de introduzir uma reestruturação não
//         autorizada (confirmado com Maycon antes desta entrega)
// Conecta com: app/fornecedores/page.tsx (fornecedores, onEditar,
//              onVisualizar, onExcluir, categorias)
//              types/fornecedores.ts (Fornecedor, FornecedorCategoria)
// ============================================================

'use client'

import { useState } from 'react'
import type { Fornecedor, FornecedorCategoria, ChavePix } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresTabelaProps {
  fornecedores: Fornecedor[]
  onEditar: (fornecedor: Fornecedor) => void
  onVisualizar: (fornecedor: Fornecedor) => void
  onExcluir: (fornecedor: Fornecedor) => void
  // Classificação rápida inline (Módulo Relatórios, 2.6) — permite
  // classificar os 19 fornecedores existentes em massa, um select por
  // linha, sem precisar abrir o modal completo de edição. A chamada
  // real ao serviço (atualizarTipoFornecedor) acontece no componente
  // pai (app/fornecedores/page.tsx), que também atualiza o estado local
  // MIGRADO (Seção 4.5): parâmetro passa a ser o id da categoria (FK),
  // não mais o enum fechado
  onAlterarTipo: (fornecedor: Fornecedor, categoriaId: number | null) => void
  categorias: FornecedorCategoria[]           // Lista dinâmica — buscada uma vez em app/fornecedores/page.tsx (Seção 4)
  chavesPixPreferenciais: ChavePix[]          // Todas as chaves preferenciais de todos os fornecedores (Seção 3.1) —
                                               // filtradas por fornecedor_id linha a linha abaixo
}

// ============================================================
// FornecedoresTabela
// ============================================================
export default function FornecedoresTabela({
  fornecedores,
  onEditar,
  onVisualizar,
  onExcluir,
  onAlterarTipo,
  categorias,
  chavesPixPreferenciais,
}: FornecedoresTabelaProps) {

  const [hoverId, setHoverId] = useState<number | null>(null)

  // ============================================================
  // getChavePixDoFornecedor
  // Encontra a chave Pix preferencial deste fornecedor na lista
  // recebida por prop (Seção 3.1: "— (dash) se nenhuma existir")
  // BUGFIX (confirmado por Maycon em produção, 01/09/2026):
  // fornecedores.id é BIGINT — Supabase/PostgREST serializa BIGINT
  // como STRING no JSON (evita perda de precisão em números grandes),
  // enquanto fornecedor_chaves_pix.fornecedor_id é INTEGER e vem como
  // number. `===` direto (number === string) sempre dava false, então
  // a coluna nunca encontrava a chave mesmo com o dado certo no banco.
  // Fix: compara como String dos dois lados, imune a qual dos dois
  // (ou os dois) vier como string em tempo de execução
  // ============================================================
  function getChavePixDoFornecedor(fornecedorId: number): string {
    const chave = chavesPixPreferenciais.find(c => String(c.fornecedor_id) === String(fornecedorId))
    return chave?.valor_chave ?? '—'
  }

  // ============================================================
  // getWhatsAppFavoritoDoFornecedor
  // Regra da Seção 3.1: mostra o telefone do contato favorito; se
  // nenhum estiver marcado, mostra o único existente (se houver
  // exatamente 1); se 0 ou 2+ sem nenhum marcado, mostra "—"
  // ============================================================
  function getWhatsAppFavoritoDoFornecedor(fornecedor: Fornecedor): string {
    const contatos = fornecedor.contato_whatsapp ?? []
    const favorito = contatos.find(c => c.favorito)
    if (favorito) return favorito.phone
    if (contatos.length === 1) return contatos[0].phone // fallback — só 1 contato, mostra mesmo sem marcação
    return '—'
  }
  // id do fornecedor aguardando confirmação de exclusão (null = nenhum)
  const [confirmandoExcluirId, setConfirmandoExcluirId] = useState<number | null>(null)

  function formatarCidadeUF(cidade?: string, uf?: string): string {
    if (cidade && uf) return `${cidade}/${uf}`
    if (cidade) return cidade
    if (uf) return uf
    return '—'
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        border: '1px solid #dde8f0',
        borderRadius: '8px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '10px',
          minWidth: '1050px', // +200px pelas 2 colunas novas (Chave Pix, WhatsApp) — mesmo padrão de scroll horizontal já usado neste arquivo
        }}
      >
        {/* Cabeçalho — sem coluna Lista */}
        <thead>
          <tr
            style={{
              background: '#1a6094',
              color: '#ffffff',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            <th style={thStyle('42px')}>Cód.</th>
            <th style={thStyle()}>Nome Fantasia</th>
            <th style={thStyle()}>Razão Social</th>
            <th style={thStyle()}>CNPJ/CPF</th>
            <th style={thStyle()}>Cidade/UF</th>
            <th style={thStyle()}>Telefone</th>
            <th style={thStyle()}>E-mail</th>
            <th style={thStyle('100px')}>Chave Pix</th>
            <th style={thStyle()}>Contato</th>
            <th style={thStyle('100px')}>WhatsApp</th>
            <th style={thStyle('150px')}>Tipo</th>
            <th style={thStyle('80px', true)}>Ações</th>
          </tr>
        </thead>

        <tbody>
          {fornecedores.length === 0 ? (
            <tr>
              <td
                colSpan={12}
                style={{
                  textAlign: 'center',
                  padding: '32px',
                  color: '#5a84a6',
                  fontSize: '12px',
                }}
              >
                Nenhum fornecedor encontrado.
              </td>
            </tr>
          ) : (
            fornecedores.map((fornecedor, index) => {
              const isHover = hoverId === fornecedor.id
              const isAlternado = index % 2 !== 0

              return (
                <tr
                  key={fornecedor.id}
                  onMouseEnter={() => setHoverId(fornecedor.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: isHover
                      ? '#edf4fb'
                      : isAlternado
                      ? '#f7fafc'
                      : '#ffffff',
                    borderBottom: '1px solid #e8f0f7',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={tdStyle('42px')}>{fornecedor.id}</td>

                  <td style={{ ...tdStyle(), fontWeight: 700, color: '#1a6094' }}>
                    {fornecedor.fantasia || '—'}
                  </td>

                  <td style={tdStyle()}>{fornecedor.razao || '—'}</td>

                  <td style={tdStyle()}>
                    {fornecedor.cnpj && fornecedor.cnpj !== '___.___.___-__'
                      ? fornecedor.cnpj
                      : fornecedor.cpf && fornecedor.cpf !== '___.___.___-__'
                      ? fornecedor.cpf
                      : '—'}
                  </td>

                  <td style={tdStyle()}>
                    {formatarCidadeUF(fornecedor.cidade, fornecedor.uf)}
                  </td>

                  <td style={tdStyle()}>{fornecedor.fone1 || '—'}</td>

                  <td style={{
                    ...tdStyle(),
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {fornecedor.email || '—'}
                  </td>

                  {/* Chave Pix — chave preferencial (Seção 3.1). SEM cor de
                      fundo especial (só a coluna WhatsApp recebe, Seção 3.1) */}
                  <td style={tdStyle('100px')}>
                    {getChavePixDoFornecedor(fornecedor.id)}
                  </td>

                  <td style={tdStyle()}>{fornecedor.contato || '—'}</td>

                  {/* WhatsApp — telefone do contato favorito (Seção 3.1).
                      Fundo verde claro — token reaproveitado de
                      WhatsAppSection.tsx (#f0fdf4/#86efac), único já
                      existente no app para o tema "WhatsApp" */}
                  <td style={{ ...tdStyle('100px'), background: '#f0fdf4' }}>
                    {getWhatsAppFavoritoDoFornecedor(fornecedor)}
                  </td>

                  {/* Tipo de Fornecedor — select inline, salva ao trocar,
                      sem precisar abrir o modal (Módulo Relatórios, 2.6).
                      MIGRADO (Seção 4.5): lista dinâmica de fornecedor_
                      categorias em vez do enum fechado — value do <option>
                      vira string no DOM, por isso o Number() na conversão */}
                  <td style={{ ...tdStyle('150px'), whiteSpace: 'normal' }}>
                    <select
                      value={fornecedor.tipo_fornecedor_id ?? ''}
                      onChange={e => {
                        const valor = e.target.value
                        onAlterarTipo(fornecedor, valor === '' ? null : Number(valor))
                      }}
                      style={selectInlineStyle}
                      aria-label={`Tipo de fornecedor: ${fornecedor.fantasia || fornecedor.razao}`}
                    >
                      <option value="">Não classificado</option>
                      {categorias.map(categoria => (
                        <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                      ))}
                    </select>
                  </td>

                  {/* Ações */}
                  <td style={{ ...tdStyle('80px'), textAlign: 'center' }}>
                    {confirmandoExcluirId === fornecedor.id ? (
                      // Confirmação inline — sem alert/confirm
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button
                          onClick={() => { onExcluir(fornecedor); setConfirmandoExcluirId(null) }}
                          title="Confirmar exclusão"
                          style={{ ...btnAcaoStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          Excluir
                        </button>
                        <button
                          onClick={() => setConfirmandoExcluirId(null)}
                          title="Cancelar exclusão"
                          style={{ ...btnAcaoStyle, fontSize: '10px', width: 'auto', padding: '2px 5px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>

                        <button
                          onClick={() => onEditar(fornecedor)}
                          title="Editar fornecedor"
                          aria-label={`Editar ${fornecedor.fantasia}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-writing" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => onVisualizar(fornecedor)}
                          title="Visualizar fornecedor"
                          aria-label={`Visualizar ${fornecedor.fantasia}`}
                          style={btnAcaoStyle}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e0ecf7')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-eye" aria-hidden="true" />
                        </button>

                        <button
                          onClick={() => setConfirmandoExcluirId(fornecedor.id)}
                          title="Excluir fornecedor"
                          aria-label={`Excluir ${fornecedor.fantasia}`}
                          style={{ ...btnAcaoStyle, color: '#dc2626' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>

                      </div>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
function thStyle(width?: string, centered?: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    fontWeight: 700,
    textAlign: centered ? 'center' : 'left',
    whiteSpace: 'nowrap',
    ...(width ? { width } : {}),
  }
}

function tdStyle(width?: string): React.CSSProperties {
  return {
    padding: '6px 8px',
    color: '#2c4a60',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    ...(width ? { width } : {}),
  }
}

const selectInlineStyle: React.CSSProperties = {
  width: '100%',
  fontSize: '10px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#2c4a60',
  padding: '3px 4px',
  border: '1px solid #dde8f0',
  borderRadius: '4px',
  background: '#ffffff',
  cursor: 'pointer',
}

const btnAcaoStyle: React.CSSProperties = {
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
}
