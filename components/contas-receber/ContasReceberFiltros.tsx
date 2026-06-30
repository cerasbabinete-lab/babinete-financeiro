// ============================================================
// components/contas-receber/ContasReceberFiltros.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Barra de filtros — busca textual, status, e dois modos
//         de visualização por vencimento (não usados ao mesmo tempo):
//         - "Por Mês" (padrão): dropdown Mês/Ano + setas ◀▶, mostra
//           só o mês selecionado, abre no mês atual (Pergunta 8)
//         - "Período Livre": Data Início/Fim manuais, cruza meses;
//           ativa automaticamente ao preencher os campos de data,
//           e ao limpá-los volta sozinho pro modo Por Mês (mês atual)
//         Os dois modos escrevem nos MESMOS campos vencimentoDe/
//         vencimentoAte de FiltrosContasReceber — não há campo novo
//         no tipo, só duas formas diferentes de preenchê-los
// Conecta com: app/receber/page.tsx (onFiltrosChange, filtros)
//              types/contasReceber.ts (FiltrosContasReceber, STATUS_LABELS)
// ============================================================

'use client'

import { useEffect, useRef, useState } from 'react'
import type { FiltrosContasReceber } from '@/types/contasReceber'
import { STATUS_LABELS } from '@/types/contasReceber'

interface ContasReceberFiltrosProps {
  filtros:          FiltrosContasReceber            // Estado atual dos filtros
  onFiltrosChange:  (f: FiltrosContasReceber) => void // Callback ao mudar qualquer filtro
  onLimpar:         () => void                       // Reseta todos os filtros
}

// ── Opções de status para o dropdown ──
const OPCOES_STATUS = [
  { value: '',                label: 'Todos os status' },
  { value: 'em_aberto',       label: STATUS_LABELS.em_aberto },
  { value: 'pago',            label: STATUS_LABELS.pago },
  { value: 'recebido_pix_ted', label: STATUS_LABELS.recebido_pix_ted },
  { value: 'protestado',      label: STATUS_LABELS.protestado },
  { value: 'enviado_cartorio', label: STATUS_LABELS.enviado_cartorio },
  { value: 'cancelado',       label: STATUS_LABELS.cancelado },
]

// ── Nomes dos meses para o dropdown "Por Mês" ──
const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ============================================================
// primeiroDiaMes() / ultimoDiaMes()
// Calculam os limites ISO (YYYY-MM-DD) do mês de uma data —
// usados para preencher vencimentoDe/vencimentoAte no modo Por Mês
// ============================================================
function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function ultimoDiaMes(d: Date): string {
  // Dia 0 do mês seguinte = último dia do mês atual
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`
}

// ============================================================
// gerarOpcoesMes()
// Gera as opções do dropdown Mês/Ano — de 12 meses atrás até
// 12 meses à frente do mês de referência, suficiente para o
// uso normal sem precisar rolar uma lista enorme
// ============================================================
function gerarOpcoesMes(referencia: Date): { valor: string; label: string }[] {
  const opcoes: { valor: string; label: string }[] = []
  for (let offset = -12; offset <= 12; offset++) {
    const d = new Date(referencia.getFullYear(), referencia.getMonth() + offset, 1)
    opcoes.push({
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${NOMES_MESES[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return opcoes
}

export default function ContasReceberFiltros({
  filtros,
  onFiltrosChange,
  onLimpar,
}: ContasReceberFiltrosProps) {

  // Estado do painel expandido/colapsado (Status + Período Livre)
  const [aberto, setAberto] = useState(false)

  // Estado local do input de busca (debounce para não disparar a cada tecla)
  const [inputBusca, setInputBusca] = useState(filtros.busca)

  // Mês/ano atualmente selecionado no modo "Por Mês" — inicia no mês
  // corrente (Pergunta 8: abre por padrão no mês atual)
  const [mesAtual, setMesAtual] = useState<Date>(() => new Date())

  // true quando o usuário preencheu manualmente o Período Livre —
  // nesse caso o seletor de mês fica visualmente inativo, já que os
  // dois modos não são usados ao mesmo tempo (decisão do brainstorm)
  const [modoPeriodoLivre, setModoPeriodoLivre] = useState(false)

  // Ref para o timeout de debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza inputBusca quando filtros.busca muda externamente (ex: limpar)
  // L-2 FIX: cancela debounce pendente ANTES de setar o novo valor
  // Sem isso, um timeout agendado poderia restaurar o texto após o limpar
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current) // Cancela timeout pendente
    setInputBusca(filtros.busca)                               // Sincroniza com valor externo
  }, [filtros.busca])

  // Limpa o debounce ao desmontar para evitar setState em componente desmontado
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Atualiza busca com debounce de 300ms
  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInputBusca(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltrosChange({ ...filtros, busca: val })
    }, 300)
  }

  // ============================================================
  // aplicarMes()
  // Aplica o filtro "Por Mês" — preenche vencimentoDe/vencimentoAte
  // com os limites do mês informado e marca o modo como ativo
  // ============================================================
  function aplicarMes(data: Date) {
    setMesAtual(data)
    setModoPeriodoLivre(false)
    onFiltrosChange({
      ...filtros,
      vencimentoDe:  primeiroDiaMes(data),
      vencimentoAte: ultimoDiaMes(data),
    })
  }

  // ── Setas de navegação ◀▶ ──
  function mesAnterior() { aplicarMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1)) }
  function mesProximo()  { aplicarMes(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1)) }

  // Seleção direta no dropdown Mês/Ano — valor no formato "YYYY-MM"
  function handleSelecionarMes(e: React.ChangeEvent<HTMLSelectElement>) {
    const [ano, mes] = e.target.value.split('-').map(Number)
    aplicarMes(new Date(ano, mes - 1, 1))
  }

  // ============================================================
  // handleVencimentoManual()
  // Chamado quando o usuário edita os campos de Data Início/Fim do
  // Período Livre. Preenchido (qualquer um dos dois) → ativa o modo
  // Período Livre. Os dois vazios → volta sozinho pro modo Por Mês,
  // reaplicando o MÊS ATUAL (Pergunta 12: "volta pro mês atual")
  // ============================================================
  function handleVencimentoManual(campo: 'vencimentoDe' | 'vencimentoAte', valor: string) {
    const novosFiltros = { ...filtros, [campo]: valor }

    if (novosFiltros.vencimentoDe || novosFiltros.vencimentoAte) {
      // Pelo menos uma data preenchida — modo Período Livre ativo
      setModoPeriodoLivre(true)
      onFiltrosChange(novosFiltros)
    } else {
      // Os dois campos ficaram vazios — volta para o modo Por Mês,
      // sempre reiniciando no mês corrente (não no último mês visitado)
      const hoje = new Date()
      setModoPeriodoLivre(false)
      setMesAtual(hoje)
      onFiltrosChange({
        ...filtros,
        vencimentoDe:  primeiroDiaMes(hoje),
        vencimentoAte: ultimoDiaMes(hoje),
      })
    }
  }

  // Opções do dropdown — calculadas a partir do mês selecionado, não
  // de "hoje", para a lista acompanhar a navegação pelas setas
  const opcoesMes = gerarOpcoesMes(mesAtual)
  const valorMesAtual = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}`

  // ── Estilos reutilizáveis ─────────────────────────────────
  const inputStyle: React.CSSProperties = {
    height:     '28px',
    padding:    '0 8px',
    fontSize:   '12px',
    fontFamily: 'Tahoma, Geneva, sans-serif',
    color:      '#3a6080',
    background: '#ffffff',
    border:     '1px solid #dde8f0',
    borderRadius: '4px',
    outline:    'none',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  }

  const btnToggleStyle: React.CSSProperties = {
    display:      'flex',
    alignItems:   'center',
    gap:          '4px',
    padding:      '0 10px',
    height:       '28px',
    fontSize:     '12px',
    fontWeight:   600,
    fontFamily:   'Tahoma, Geneva, sans-serif',
    background:   aberto ? '#e8f3fc' : '#f0f4f7',
    color:        '#3a6080',
    border:       '1px solid #c4d8eb',
    borderRadius: '4px',
    cursor:       'pointer',
  }

  const btnLimparStyle: React.CSSProperties = {
    ...btnToggleStyle,
    // AUDITORIA FIX (visual): cor anterior (#7a9db8 sobre fundo transparente)
    // fazia o botão parecer desabilitado mesmo sendo 100% funcional.
    // Agora usa o mesmo contraste do botão "Filtros" ao lado.
    background: '#f0f4f7',
    border:     '1px solid #c4d8eb',
    color:      '#3a6080',
  }

  const btnSetaStyle: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '26px',
    height:         '28px',
    background:     '#ffffff',
    border:         '1px solid #dde8f0',
    borderRadius:   '4px',
    cursor:         modoPeriodoLivre ? 'not-allowed' : 'pointer',
    color:          modoPeriodoLivre ? '#c5d8e8' : '#3a6080',
    fontSize:       '13px',
  }

  return (
    <div style={{ marginBottom: '10px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>

      {/* ── Linha do modo "Por Mês" — sempre visível, padrão ativo ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
        opacity: modoPeriodoLivre ? 0.5 : 1, // Visualmente "inativo" enquanto o Período Livre está em uso
      }}>
        <span style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap', marginRight: '2px' }}>
          Vencimento:
        </span>
        <button
          onClick={mesAnterior}
          disabled={modoPeriodoLivre}
          title="Mês anterior"
          style={btnSetaStyle}
        >
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <select
          value={valorMesAtual}
          onChange={handleSelecionarMes}
          disabled={modoPeriodoLivre}
          style={{ ...selectStyle, width: '150px', fontWeight: 700, color: '#1a6094', cursor: modoPeriodoLivre ? 'not-allowed' : 'pointer' }}
        >
          {opcoesMes.map(op => (
            <option key={op.valor} value={op.valor}>{op.label}</option>
          ))}
        </select>
        <button
          onClick={mesProximo}
          disabled={modoPeriodoLivre}
          title="Próximo mês"
          style={btnSetaStyle}
        >
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </button>
        {modoPeriodoLivre && (
          <span style={{ fontSize: '11px', color: '#b07d00', marginLeft: '4px' }}>
            (Período Livre ativo — limpe as datas no painel "Filtros" para voltar)
          </span>
        )}
      </div>

      {/* ── Linha principal: busca + toggle ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: aberto ? '8px' : 0 }}>

        {/* Campo de busca textual */}
        <input
          type="text"
          value={inputBusca}
          onChange={handleBusca}
          placeholder="Buscar por nome, CNPJ/CPF, Nº doc ou Nosso Número..."
          style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
        />

        {/* Botão toggle do painel de filtros */}
        <button onClick={() => setAberto((v: boolean) => !v)} style={btnToggleStyle}>
          <i className={`ti ${aberto ? 'ti-filter-off' : 'ti-filter'}`} style={{ fontSize: '13px' }} aria-hidden="true" />
          Filtros
          <i className={`ti ${aberto ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: '11px' }} aria-hidden="true" />
        </button>

        {/* Botão Limpar — visível sempre; também reseta o modo Por Mês pro mês atual */}
        <button
          onClick={() => { setMesAtual(new Date()); setModoPeriodoLivre(false); onLimpar() }}
          title="Limpar todos os filtros"
          style={btnLimparStyle}
        >
          <i className="ti ti-x" style={{ fontSize: '12px' }} aria-hidden="true" />
          Limpar
        </button>

      </div>

      {/* ── Painel expandido: Período Livre + Status ── */}
      {aberto && (
        <div style={{
          display:     'flex',
          gap:         '10px',
          flexWrap:    'wrap',
          alignItems:  'center',
          padding:     '10px 12px',
          background:  '#f7fafc',
          border:      '1px solid #dde8f0',
          borderRadius: '6px',
        }}>

          <span style={{ fontSize: '10px', color: '#7a9db8', width: '100%', marginBottom: '-2px' }}>
            Período Livre — preencha para ver títulos de vários meses ao mesmo tempo:
          </span>

          {/* Vencimento De — Período Livre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap' }}>
              Vencimento de
            </label>
            <input
              type="date"
              value={filtros.vencimentoDe}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleVencimentoManual('vencimentoDe', e.target.value)}
              style={{ ...inputStyle, width: '130px' }}
            />
          </div>

          {/* Vencimento Até — Período Livre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap' }}>
              até
            </label>
            <input
              type="date"
              value={filtros.vencimentoAte}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleVencimentoManual('vencimentoAte', e.target.value)}
              style={{ ...inputStyle, width: '130px' }}
            />
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap' }}>
              Status
            </label>
            <select
              value={filtros.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFiltrosChange({ ...filtros, status: e.target.value })}
              style={{ ...selectStyle, width: '160px' }}
            >
              {OPCOES_STATUS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

        </div>
      )}
    </div>
  )
}
