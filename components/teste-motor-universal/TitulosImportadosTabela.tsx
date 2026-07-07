// ============================================================
// components/teste-motor-universal/TitulosImportadosTabela.tsx
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Tabela de APRESENTAÇÃO dos títulos já gravados via o Motor
//         Universal (teste_titulos_gerados), no mesmo modelo estético
//         de components/contas-receber/ContasReceberTabela.tsx do
//         sistema oficial — cores, tipografia Tahoma, pills de status,
//         linhas alternadas/hover, formatação de valores e datas.
// Conecta com: pages/api/teste-motor-universal/titulos.ts (fonte dos dados),
//              app/teste-motor-universal/page.tsx (consumidor)
//
// ESCOPO: SOMENTE apresentação visual, sem ações de editar/cancelar/
// baixar/gerar 2ª via — essas funções ficam para quando a lógica for
// portada ao módulo oficial de Contas a Pagar (decisão explícita do
// usuário: "as outras funções vemos quando formos implantar o sistema").
// ============================================================

'use client'

// ------------------------------------------------------------
// TIPO: shape de um título, conforme retornado por
// pages/api/teste-motor-universal/titulos.ts (já com o embed do
// documento de origem via a FK interna)
// ------------------------------------------------------------
export interface TituloImportado {
  id: string
  documento_importado_id: string
  numero_parcela: number
  total_parcelas: number
  favorecido_nome: string
  favorecido_cnpj_cpf: string | null
  valor: number
  data_vencimento: string
  linha_digitavel: string | null
  codigo_barras: string | null
  nosso_numero: string | null
  pode_gerar_segunda_via: boolean
  status: string
  criado_em: string
  teste_documentos_importados: {
    tipo_arquivo: string
    origem_despesa_status: string
    json_universal: {
      categoriaFinanceira: string
      origemDespesa: { tipo: string }
    }
  } | null
}

interface TitulosImportadosTabelaProps {
  titulos: TituloImportado[]
}

// ------------------------------------------------------------
// Função auxiliar: formatarMoeda
// Mesmo padrão de formatação usado em contasReceberService.ts
// ------------------------------------------------------------
function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ------------------------------------------------------------
// Função auxiliar: formatarDataBR
// Converte data ISO (YYYY-MM-DD) para o formato brasileiro DD/MM/AAAA
// ------------------------------------------------------------
function formatarDataBR(dataIso: string): string {
  if (!dataIso) return '—'
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

// ------------------------------------------------------------
// Componente principal: TitulosImportadosTabela
// ------------------------------------------------------------
export default function TitulosImportadosTabela({ titulos }: TitulosImportadosTabelaProps) {
  return (
    <div>
      {/* ── Banner de pílulas de contadores, mesmo modelo visual do
      ContadoresBanner em app/receber/page.tsx ── */}
      <ContadoresPorStatus titulos={titulos} />

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
            fontSize: '11px',
            tableLayout: 'fixed',
            minWidth: '860px',
          }}
        >
          {/* ── Cabeçalho — mesmas cores/tipografia do sistema oficial ── */}
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
              <th style={thStyle('8%')}>Vencimento</th>
              <th style={thStyle('10%')}>Tipo Doc.</th>
              <th style={thStyle('12%')}>Categoria</th>
              <th style={thStyle('20%')}>Favorecido</th>
              <th style={thStyle('12%')}>CNPJ / CPF</th>
              <th style={thStyle('8%')}>Parcela</th>
              <th style={thStyle('10%', true)}>Valor</th>
              <th style={thStyle('10%', true)}>Origem</th>
              <th style={thStyle('10%', true)}>Status</th>
            </tr>
          </thead>

          {/* ── Corpo ── */}
          <tbody>
            {titulos.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    textAlign: 'center',
                    padding: '32px',
                    color: '#5a84a6',
                    fontSize: '12px',
                  }}
                >
                  Nenhum título gravado ainda.
                </td>
              </tr>
            ) : (
              titulos.map((titulo, index) => {
                const isAlternado = index % 2 !== 0
                const bgRow = isAlternado ? '#f7fafc' : '#ffffff'
                const textColor = '#2c4a60'

                const categoriaFinanceira = titulo.teste_documentos_importados?.json_universal.categoriaFinanceira ?? '—'
                const origemTipo = titulo.teste_documentos_importados?.json_universal.origemDespesa.tipo ?? '—'

                return (
                  <tr
                    key={titulo.id}
                    style={{
                      background: bgRow,
                      borderBottom: '1px solid #e8f0f7',
                    }}
                  >
                    {/* Vencimento */}
                    <td style={tdBase(textColor)}>{formatarDataBR(titulo.data_vencimento)}</td>

                    {/* Tipo de Documento */}
                    <td style={{ ...tdBase(textColor), fontSize: '10px', color: '#5a84a6' }}>
                      {titulo.teste_documentos_importados?.tipo_arquivo ?? '—'}
                    </td>

                    {/* Categoria Financeira */}
                    <td style={{ ...tdBase(textColor), fontSize: '10px' }}>{categoriaFinanceira}</td>

                    {/* Favorecido — bold, cor de destaque igual "Nº Doc." no modelo original */}
                    <td
                      style={{
                        ...tdBase(textColor),
                        fontWeight: 700,
                        color: '#1a6094',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {titulo.favorecido_nome}
                    </td>

                    {/* CNPJ / CPF — monospace, igual ao modelo original */}
                    <td
                      style={{
                        ...tdBase(textColor),
                        fontFamily: "'Courier New', monospace",
                        fontSize: '10px',
                        color: '#7a9db8',
                      }}
                    >
                      {titulo.favorecido_cnpj_cpf ?? '—'}
                    </td>

                    {/* Parcela */}
                    <td style={tdBase(textColor)}>
                      {titulo.numero_parcela}/{titulo.total_parcelas}
                    </td>

                    {/* Valor — bold, alinhado à direita, cor de destaque */}
                    <td
                      style={{
                        ...tdBase(textColor),
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#1a6094',
                      }}
                    >
                      {formatarMoeda(titulo.valor)}
                    </td>

                    {/* Origem da Despesa — pill pequena */}
                    <td style={{ ...tdBase(textColor), textAlign: 'center' }}>
                      <OrigemBadge tipo={origemTipo} />
                    </td>

                    {/* Status — pill, mesmo padrão StatusBadge do modelo original */}
                    <td style={{ ...tdBase(textColor), textAlign: 'center' }}>
                      <StatusBadge status={titulo.status} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Componente: ContadoresPorStatus
// Banner de pílulas de contadores, mesmo modelo visual do
// ContadoresBanner já usado em app/receber/page.tsx
// ------------------------------------------------------------
function ContadoresPorStatus({ titulos }: { titulos: TituloImportado[] }) {
  const emAberto = titulos.filter((t) => t.status === 'em_aberto').length
  const pagos = titulos.filter((t) => t.status === 'pago').length
  const total = titulos.length

  if (total === 0) return null

  const pilulas = [
    { label: 'Em Aberto', valor: emAberto, bg: '#dcfce7', cor: '#166534' },
    { label: 'Pagos', valor: pagos, bg: '#eaf3de', cor: '#27ae60' },
  ].filter((p) => p.valor > 0)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        margin: '0 0 10px',
        padding: '6px 12px',
        background: '#f7fafc',
        border: '1px solid #dde8f0',
        borderRadius: '5px',
        flexWrap: 'wrap',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <span style={{ fontSize: '11px', color: '#5a84a6', marginRight: '2px', whiteSpace: 'nowrap' }}>
        Total: {total} título(s) —
      </span>
      {pilulas.map((p) => (
        <span
          key={p.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '2px 10px',
            borderRadius: '10px',
            background: p.bg,
            color: p.cor,
            fontSize: '11px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            border: `1px solid ${p.cor}22`,
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{p.valor}</span>
          {p.label}
        </span>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Componente: StatusBadge
// Pill de status do título — mesmo padrão visual do StatusBadge em
// ContasReceberTabela.tsx, simplificado (esta tabela de teste só tem
// o status 'em_aberto' até que a função de baixa seja portada ao
// sistema oficial)
// ------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const cores: Record<string, { bg: string; text: string; label: string }> = {
    em_aberto: { bg: '#dcfce7', text: '#166534', label: 'Em Aberto' },
    pago: { bg: '#eaf3de', text: '#27ae60', label: 'Pago' },
  }
  const cor = cores[status] ?? { bg: '#f0f4f7', text: '#5a84a6', label: status }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: '10px',
        fontSize: '10px',
        fontWeight: 700,
        background: cor.bg,
        color: cor.text,
        whiteSpace: 'nowrap',
      }}
    >
      {cor.label}
    </span>
  )
}

// ------------------------------------------------------------
// Componente: OrigemBadge
// Pill pequena indicando se a despesa é empresarial ou pessoal_socio —
// dado exclusivo deste módulo (não existe em Contas a Receber), mas
// desenhado no mesmo padrão visual de pill para manter consistência
// ------------------------------------------------------------
function OrigemBadge({ tipo }: { tipo: string }) {
  const cores: Record<string, { bg: string; text: string; label: string }> = {
    empresarial: { bg: '#e0ecf7', text: '#1a6094', label: 'Empresarial' },
    pessoal_socio: { bg: '#fce7f3', text: '#9d174d', label: 'Pessoal' },
  }
  const cor = cores[tipo] ?? { bg: '#f0f4f7', text: '#5a84a6', label: tipo }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: '10px',
        fontSize: '10px',
        fontWeight: 700,
        background: cor.bg,
        color: cor.text,
        whiteSpace: 'nowrap',
      }}
    >
      {cor.label}
    </span>
  )
}

// ── Estilos utilitários — idênticos aos de ContasReceberTabela.tsx ──

function thStyle(width?: string, centered?: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    fontWeight: 700,
    textAlign: centered ? 'center' : 'left',
    whiteSpace: 'nowrap',
    ...(width ? { width } : {}),
  }
}

function tdBase(color: string): React.CSSProperties {
  return {
    padding: '5px 5px',
    color,
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  }
}
