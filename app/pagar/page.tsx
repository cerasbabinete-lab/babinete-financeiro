// ============================================================
// app/pagar/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Página principal — orquestra todos os componentes do
//         módulo. Réplica estrutural de app/receber/page.tsx: auth
//         via getUser(), isMobile inicia null (guard SSR), Bearer
//         token nas chamadas às rotas de API.
// SIMPLIFICAÇÃO PRÓPRIA (não é réplica 1:1 de app/receber/page.tsx):
// em vez de dois blocos JSX inteiros separados (desktop/mobile),
// este arquivo usa um único corpo com peças condicionais por
// isMobile, para reduzir duplicação. Comportamento equivalente,
// estrutura de arquivo mais enxuta — sinalizar se o padrão exato de
// dois-blocos for preferido por consistência visual/manutenção.
// Conecta com: todos os componentes de components/pagar/ e
//              lib/contasAPagarService.ts, pages/api/pagar/*.ts
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolverUsernameExibicao } from '@/lib/authUsername'
import {
  buscarTitulos,
  buscarTitulosPendentesAnteriores,
  contarTitulos,
  buscarContadoresTitulos,
  buscarRosterCompleto,
  isTituloNearVencimento,
  type ContadoresTitulosPagar,
} from '@/lib/contasAPagarService'
import type {
  ContaAPagar,
  FiltrosContasAPagar,
  ModoModalPagar,
  FormaBaixaPagar,
  ItemPendenteConfirmacao,
  ResumoImportacaoPagar,
  BeneficiarioPessoalRosterPagar,
} from '@/types/contasAPagar'

// Layout
import Topbar        from '@/components/layout/Topbar'
import TopbarMobile   from '@/components/layout/TopbarMobile'
import NavBar         from '@/components/layout/NavBar'
import Drawer         from '@/components/layout/Drawer'

// Módulo Contas a Pagar
import ContasAPagarHeader from '@/components/pagar/ContasAPagarHeader'
import ContasAPagarFiltros from '@/components/pagar/ContasAPagarFiltros'
import ContasAPagarTabela from '@/components/pagar/ContasAPagarTabela'
import ContasAPagarMobileList from '@/components/pagar/ContasAPagarMobileList'
import ContasAPagarModal from '@/components/pagar/ContasAPagarModal'
import BasebarContasPagar from '@/components/pagar/BasebarContasPagar'
import ImportarConciliacaoPreviewModal from '@/components/pagar/ImportarConciliacaoPreviewModal'
import RosterBeneficiariosModal from '@/components/pagar/RosterBeneficiariosModal'

function filtrosVazios(): FiltrosContasAPagar {
  return { busca: '', vencimentoDe: '', vencimentoAte: '', status: '' }
}

// ============================================================
// Helpers de mês — QA fix (14/08/2026, a pedido do Maycon):
// reorganização da listagem por mês de vencimento, com pendências de
// meses anteriores fixas no topo quando o mês atual está selecionado
// ============================================================

// YYYY-MM do mês corrente, no fuso local (não UTC — evita virar o mês
// errado perto da meia-noite, mesmo cuidado já usado em limiteSuperiorIntervalo)
function mesAtualStr(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

// Primeiro e último dia (YYYY-MM-DD) de um mês "YYYY-MM"
function calcularFaixaDoMes(mesStr: string): { inicio: string; fim: string } {
  const [ano, mes] = mesStr.split('-').map(Number)
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(ano, mes, 0).getDate() // dia 0 do mês seguinte = último dia deste mês
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fim }
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatarLabelMesExtenso(mesStr: string): string {
  const [ano, mes] = mesStr.split('-').map(Number)
  return `${NOMES_MESES[mes - 1]} ${ano}`
}

// Desloca um mês "YYYY-MM" por N meses (positivo ou negativo) —
// usado pelas setas ◀▶ do seletor
function deslocarMes(mesStr: string, deslocamento: number): string {
  const [ano, mes] = mesStr.split('-').map(Number)
  const d = new Date(ano, mes - 1 + deslocamento, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Mesmo token visual de btnSetaStyle em ContasReceberFiltros.tsx —
// Contas a Pagar não tem o modo "Período Livre" (só um seletor de
// mês), então aqui as setas nunca ficam desabilitadas
const btnSetaMesStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '26px', height: '28px', background: '#ffffff',
  border: '1px solid #dde8f0', borderRadius: '4px',
  cursor: 'pointer', color: '#3a6080', fontSize: '13px',
}

// Gera a lista de meses do dropdown — 18 meses pra trás e 12 pra
// frente a partir de hoje. Faixa fixa (não descoberta via query no
// banco) — simples e cobre folgadamente o histórico do sistema, que
// começou a ser usado em produção em meados de 2026.
function gerarOpcoesDeMes(): string[] {
  const hoje = new Date()
  const opcoes: string[] = []
  for (let i = -18; i <= 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    opcoes.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return opcoes
}

export default function ContasAPagarPage() {
  const router = useRouter()

  // ── Auth ──
  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)

  // ── Dados ──
  const [titulos, setTitulos] = useState<ContaAPagar[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [contadores, setContadores] = useState<ContadoresTitulosPagar>({ emAberto: 0, atrasados: 0, pagoParcial: 0, pagos: 0, cancelados: 0 })

  // ── Filtros ──
  const [filtros, setFiltros] = useState<FiltrosContasAPagar>(filtrosVazios)

  // ── Mês selecionado (QA fix 14/08/2026) ──
  const [mesSelecionado, setMesSelecionado] = useState<string>(mesAtualStr())
  const [titulosPendentesAnteriores, setTitulosPendentesAnteriores] = useState<ContaAPagar[]>([])
  const [carregandoPendentes, setCarregandoPendentes] = useState(false)

  // ── Modal principal ──
  const [modoModal, setModoModal] = useState<ModoModalPagar>(null)
  const [tituloSelecionado, setTituloSelecionado] = useState<ContaAPagar | null>(null)
  const [abrirEmBaixa, setAbrirEmBaixa] = useState(false)

  // ── Preview de conciliação pendente ──
  const [itensPendentes, setItensPendentes] = useState<ItemPendenteConfirmacao[]>([])

  // ── Roster ──
  const [rosterAberto, setRosterAberto] = useState(false)
  const [roster, setRoster] = useState<BeneficiarioPessoalRosterPagar[]>([])

  // ── Mobile ──
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)

  // ── Feedback ──
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null)
  const [msgErro, setMsgErro] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then((result: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      const user = result.data?.user
      if (!user) { router.push('/login'); return }
      setUsuario(resolverUsernameExibicao(user.email))
      setAuthCarregando(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  const carregarTitulos = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, count, ctd] = await Promise.all([buscarTitulos(filtros), contarTitulos(), buscarContadoresTitulos()])
      if (!mountedRef.current) return
      setTitulos(lista)
      setTotal(count)
      setContadores(ctd)
    } catch (err: unknown) {
      console.error('[ContasAPagarPage] carregarTitulos error:', err)
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }, [filtros])

  useEffect(() => { if (!authCarregando) carregarTitulos() }, [authCarregando, carregarTitulos])

  // ── Mês selecionado — sincroniza a faixa de vencimento do filtro
  // sempre que o mês trocar, preservando busca/status já digitados
  // (QA fix 14/08/2026) ──
  useEffect(() => {
    const { inicio, fim } = calcularFaixaDoMes(mesSelecionado)
    setFiltros((f) => ({ ...f, vencimentoDe: inicio, vencimentoAte: fim }))
  }, [mesSelecionado])

  // ── Pendências de meses anteriores — só busca quando o mês
  // selecionado é o mês atual; nos demais meses a seção fica vazia e
  // escondida (QA fix 14/08/2026) ──
  const carregarPendentesAnteriores = useCallback(async () => {
    if (mesSelecionado !== mesAtualStr()) {
      setTitulosPendentesAnteriores([])
      return
    }
    setCarregandoPendentes(true)
    try {
      const { inicio } = calcularFaixaDoMes(mesSelecionado)
      const lista = await buscarTitulosPendentesAnteriores(inicio)
      if (!mountedRef.current) return
      setTitulosPendentesAnteriores(lista)
    } catch (err: unknown) {
      console.error('[ContasAPagarPage] carregarPendentesAnteriores error:', err)
    } finally {
      if (mountedRef.current) setCarregandoPendentes(false)
    }
  }, [mesSelecionado])

  useEffect(() => { if (!authCarregando) carregarPendentesAnteriores() }, [authCarregando, carregarPendentesAnteriores])

  useEffect(() => {
    if (!msgSucesso) return
    const t = setTimeout(() => { if (mountedRef.current) setMsgSucesso(null) }, 5000)
    return () => clearTimeout(t)
  }, [msgSucesso])
  useEffect(() => {
    if (!msgErro) return
    const t = setTimeout(() => { if (mountedRef.current) setMsgErro(null) }, 7000)
    return () => clearTimeout(t)
  }, [msgErro])

  // ── Token Bearer ──
  async function obterToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ── Handlers do modal principal ──
  function handleEditar(t: ContaAPagar) { setTituloSelecionado(t); setModoModal('editar'); setAbrirEmBaixa(false) }
  function handleVisualizar(t: ContaAPagar) { setTituloSelecionado(t); setModoModal('visualizar'); setAbrirEmBaixa(false) }
  function handleBaixarClick(t: ContaAPagar) { setTituloSelecionado(t); setModoModal('editar'); setAbrirEmBaixa(true) }
  function handleFecharModal() { setModoModal(null); setTituloSelecionado(null); setAbrirEmBaixa(false) }

  async function handleSalvar(titulo: ContaAPagar) {
    const token = await obterToken()
    const res = await fetch('/api/pagar/atualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        id: titulo.id,
        observacoes: titulo.observacoes,
        nosso_numero: titulo.nosso_numero,
        linha_digitavel: titulo.linha_digitavel,
      }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.erro ?? 'Erro ao salvar') }
    setMsgSucesso('Título atualizado.')
    handleFecharModal()
    carregarTitulos()
    carregarPendentesAnteriores()
  }

  async function handleBaixarManual(id: string, formaBaixa: FormaBaixaPagar, valorBaixa: number) {
    const token = await obterToken()
    const res = await fetch('/api/pagar/baixar-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, formaBaixa, valorBaixa }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.erro ?? 'Erro ao registrar baixa') }
    setMsgSucesso('Baixa registrada.')
    carregarTitulos()
    carregarPendentesAnteriores()
  }

  async function handleCancelar(id: string) {
    const token = await obterToken()
    const res = await fetch('/api/pagar/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { setMsgErro('Erro ao cancelar título.'); return }
    setMsgSucesso('Título cancelado.')
    handleFecharModal()
    carregarTitulos()
    carregarPendentesAnteriores()
  }

  async function handleReabrir(id: string) {
    const token = await obterToken()
    const res = await fetch('/api/pagar/reabrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { setMsgErro('Erro ao reabrir título.'); return }
    setMsgSucesso('Título reaberto.')
    handleFecharModal()
    carregarTitulos()
    carregarPendentesAnteriores()
  }

  // ── Gerar 2ª via avulsa de boleto ──
  async function handleGerarBoletoAvulso(t: ContaAPagar) {
    setMsgErro(null)
    try {
      const token = await obterToken()
      const res = await fetch(`/api/pagar/gerar-boleto-avulso?id=${t.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.erro ?? 'Erro ao gerar boleto')
      }
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao gerar 2ª via')
    }
  }

  // ── Import: Relatório BB ──
  async function handleSelecionarRelatorio(file: File) {
    setImportando(true)
    setMsgErro(null)
    try {
      const arquivoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
        reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
        reader.readAsDataURL(file)
      })

      const token = await obterToken()
      const res = await fetch('/api/pagar/importar-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ arquivoBase64, nomeArquivo: file.name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao importar Relatório BB')

      processarResumoImportacao(json.resumo as ResumoImportacaoPagar)
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao importar Relatório BB')
    } finally {
      setImportando(false)
      carregarTitulos()
      carregarPendentesAnteriores()
    }
  }

  // ── Leitura de arquivo TXT com detecção de encoding ──
  // QA fix (27/07/2026): arquivos exportados pelo BB às vezes vêm em
  // Windows-1252/Latin-1 (charset antigo do Windows), não UTF-8 —
  // file.text() SEMPRE assume UTF-8 e corrompe esses arquivos
  // silenciosamente (sem erro nenhum, só texto ilegível). Tenta UTF-8
  // estrito primeiro (fatal: true força erro se achar sequência de
  // bytes inválida pra UTF-8); se falhar, decodifica de novo como
  // windows-1252 (superset de Latin-1, cobre acentuação PT-BR)
  async function lerArquivoTextoComEncodingCorreto(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      return new TextDecoder('windows-1252').decode(buffer)
    }
  }

  // ── Import: Comprovante (PDF ou TXT) ──
  async function handleSelecionarComprovante(file: File) {
    setImportando(true)
    setMsgErro(null)
    try {
      const ehTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
      const token = await obterToken()

      let res: Response
      if (ehTxt) {
        const conteudoTxt = await lerArquivoTextoComEncodingCorreto(file)
        res = await fetch('/api/pagar/importar-comprovante', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ mimeType: 'text/plain', conteudoTxt }),
        })
      } else {
        const arquivoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
          reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
          reader.readAsDataURL(file)
        })
        res = await fetch('/api/pagar/importar-comprovante', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ mimeType: 'application/pdf', arquivoBase64 }),
        })
      }

      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao importar comprovante')

      processarResumoImportacao(json.resumo as ResumoImportacaoPagar)
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao importar comprovante')
    } finally {
      setImportando(false)
      carregarTitulos()
      carregarPendentesAnteriores()
    }
  }

  // ── Import: Boleto PDF de fornecedor (vincula Nosso Número + Linha
  // Digitável a um título já em aberto) — pedido explícito do
  // usuário: "mesmo procedimento de Importar Boleto, exatamente como
  // funciona em Contas a Receber". Mesmo padrão de upload de lá:
  // body BINÁRIO PURO (Content-Type: application/pdf), sem base64/
  // JSON como os outros 2 imports deste módulo — porque a rota
  // desliga o bodyParser do Next e lê o stream manualmente, mesmo
  // jeito que pages/api/importar-boleto-pdf.ts (Receber) já faz.
  async function handleSelecionarBoleto(file: File) {
    setImportando(true)
    setMsgErro(null)
    try {
      const token = await obterToken()
      const res = await fetch('/api/pagar/importar-boleto-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'Authorization': `Bearer ${token}` },
        body: file,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.erro ?? 'Erro ao importar boleto PDF')

      if (json.vinculado) {
        setMsgSucesso(json.descricao)
      } else {
        setMsgErro(json.descricao ?? 'Boleto não vinculado a nenhum título.')
      }
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao importar boleto PDF')
    } finally {
      setImportando(false)
      carregarTitulos()
      carregarPendentesAnteriores()
    }
  }

  // ── Processa o resumo comum aos dois fluxos de import ──
  function processarResumoImportacao(resumo: ResumoImportacaoPagar) {
    const pendentes = resumo.detalhes
      .filter((d) => d.tipo === 'pendente_confirmacao')
      .map((d) => (d as { tipo: 'pendente_confirmacao'; item: ItemPendenteConfirmacao }).item)

    if (pendentes.length > 0) {
      setItensPendentes(pendentes)
    }

    setMsgSucesso(
      `Importação concluída: ${resumo.baixasAutomaticas} baixa(s) automática(s), ` +
      `${resumo.despesasCriadasAutomaticamente} despesa(s) criada(s), ` +
      `${resumo.pendentesConfirmacao} pendente(s), ${resumo.naoEncontrados} não encontrado(s).`,
    )
  }

  async function handleConfirmarConciliacao(escolhas: ItemPendenteConfirmacao[]) {
    const token = await obterToken()
    const res = await fetch('/api/pagar/confirmar-conciliacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ escolhas }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.erro ?? 'Erro ao confirmar conciliação') }
    setItensPendentes([])
    setMsgSucesso('Conciliação confirmada.')
    carregarTitulos()
    carregarPendentesAnteriores()
  }

  // ── Roster ──
  async function handleAbrirRoster() {
    try {
      const lista = await buscarRosterCompleto()
      setRoster(lista)
      setRosterAberto(true)
    } catch {
      setMsgErro('Erro ao carregar roster.')
    }
  }

  async function handleSalvarRosterItem(id: string, campos: Partial<Omit<BeneficiarioPessoalRosterPagar, 'id'>>) {
    const token = await obterToken()
    const res = await fetch('/api/pagar/roster', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, campos }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.erro ?? 'Erro ao salvar beneficiário') }
    const lista = await buscarRosterCompleto()
    setRoster(lista)
  }

  if (authCarregando || isMobile === null) {
    return <div style={{ minHeight: '100vh', background: '#f0f4f7' }} />
  }

  // ── Banner "vence nos próximos 5 dias" — aviso visual, sem e-mail ──
  // Reaproveita isTituloNearVencimento (já existente em
  // contasAPagarService.ts, usado até aqui só pro estilo âmbar da
  // linha na tabela) — filtra a lista já carregada, sem nova consulta
  // ao banco. Diferente do banner equivalente de Contas a Receber
  // (AlertaBanner em app/receber/page.tsx), este NÃO é clicável e não
  // abre nenhum modal de envio de e-mail — só aviso visual, a pedido
  // do Maycon (sessão 12/07/2026).
  const titulosNearDue = titulos.filter(isTituloNearVencimento)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: isMobile ? '70px' : 0 }}>
      {isMobile ? (
        <>
          <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
          <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />
        </>
      ) : (
        <>
          <Topbar usuario={usuario} />
          <NavBar />
        </>
      )}

      <main style={{ flex: 1, padding: isMobile ? '10px 12px' : '20px 32px' }}>

        {msgSucesso && <div style={bannerStyle('#166534', '#dcfce7')}>{msgSucesso}</div>}
        {msgErro && <div style={bannerStyle('#d32f2f', '#fee2e2')}>{msgErro}</div>}

        {/* QA fix (28/08/2026, a pedido do Maycon): ordem dos blocos
            corrigida pra bater com Despesas/Receitas/Contas a Receber —
            cabeçalho (título+botões) SEMPRE primeiro, depois
            pills/contadores, depois aviso de vencimento, depois
            seletor de mês, depois a busca. Antes o seletor de mês
            (inserido numa sessão anterior) tinha ficado ANTES do
            cabeçalho por engano, invertendo a ordem só neste módulo. */}
        {!isMobile && (
          <ContasAPagarHeader
            totalTitulos={total}
            importando={importando}
            onSelecionarRelatorio={handleSelecionarRelatorio}
            onSelecionarComprovante={handleSelecionarComprovante}
            onSelecionarBoleto={handleSelecionarBoleto}
            onAbrirRoster={handleAbrirRoster}
            titulos={titulos}
            usuario={usuario}
            onRestaurado={() => { carregarTitulos(); carregarPendentesAnteriores() }}
            onErro={setMsgErro}
            onSucesso={setMsgSucesso}
          />
        )}

        {/* Título do módulo no mobile — ContasAPagarHeader (acima) só
            renderiza no desktop; sem isto a tela ficava sem cabeçalho
            de módulo no mobile, diferente do padrão usado em Contas a
            Receber/Receitas (fix a pedido do Maycon, 03/09/2026) */}
        {isMobile && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Contas a Pagar</div>
            <div style={{ fontSize: '12px', color: '#5a6b7a' }}>{total} títulos</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '11px' }}>
          <Pill cor="#166534" bg="#dcfce7" label={`Em Aberto: ${contadores.emAberto}`} />
          <Pill cor="#b45309" bg="#fef3c7" label={`Atrasados: ${contadores.atrasados}`} />
          <Pill cor="#92400e" bg="#fef3c7" label={`Pago Parcial: ${contadores.pagoParcial}`} />
          <Pill cor="#166534" bg="#dcfce7" label={`Pagos: ${contadores.pagos}`} />
          <Pill cor="#9ca3af" bg="#f3f4f6" label={`Cancelados: ${contadores.cancelados}`} />
        </div>

        {titulosNearDue.length > 0 && (
          <div
            style={{
              margin:       '0 0 10px',
              padding:      '8px 14px',
              background:   '#fff8e1',
              border:       '1px solid #ffe082',
              borderRadius: '5px',
              color:        '#7a5c00',
              fontSize:     '12px',
              fontFamily:   'Tahoma, Geneva, sans-serif',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
            }}
          >
            <i className="ti ti-bell-ringing" style={{ fontSize: '16px', flexShrink: 0 }} aria-hidden="true" />
            <span>
              <strong>{titulosNearDue.length} título{titulosNearDue.length !== 1 ? 's' : ''}</strong>
              {titulosNearDue.length === 1 ? ' vence' : ' vencem'} nos próximos 5 dias
            </span>
          </div>
        )}

        {/* ── Seletor de mês (QA fix 14/08/2026, a pedido do Maycon) ──
            Visual e interação alinhados ao padrão já existente em
            ContasReceberFiltros.tsx (setas ◀▶, nome do mês por
            extenso, mesmos tokens de estilo — selectStyle 28px,
            btnSetaStyle). Compartilhado entre desktop e mobile (fora
            de qualquer bloco isMobile), mesma cobertura de antes. ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', color: '#5a84a6', whiteSpace: 'nowrap', marginRight: '2px' }}>
            Vencimento:
          </span>
          <button
            onClick={() => setMesSelecionado(deslocarMes(mesSelecionado, -1))}
            title="Mês anterior"
            style={btnSetaMesStyle}
          >
            <i className="ti ti-chevron-left" aria-hidden="true" />
          </button>
          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            style={{
              height: '28px', padding: '0 8px', fontSize: '12px',
              fontFamily: 'Tahoma, Geneva, sans-serif', color: '#1a6094', fontWeight: 700,
              background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '4px',
              outline: 'none', cursor: 'pointer', width: '160px',
            }}
          >
            {gerarOpcoesDeMes().map((m) => (
              <option key={m} value={m}>
                {formatarLabelMesExtenso(m)}{m === mesAtualStr() ? ' (atual)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => setMesSelecionado(deslocarMes(mesSelecionado, 1))}
            title="Próximo mês"
            style={btnSetaMesStyle}
          >
            <i className="ti ti-chevron-right" aria-hidden="true" />
          </button>
        </div>

        <ContasAPagarFiltros filtros={filtros} onChange={setFiltros} />

        {/* ── Pendências de meses anteriores — só quando o mês
            selecionado é o atual (QA fix 14/08/2026) ── */}
        {mesSelecionado === mesAtualStr() && !carregandoPendentes && titulosPendentesAnteriores.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px',
              fontSize: '12px', fontWeight: 700, color: '#b45309',
            }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: '14px' }} aria-hidden="true" />
              Pendências de meses anteriores ({titulosPendentesAnteriores.length})
            </div>
            {isMobile ? (
              <ContasAPagarMobileList titulos={titulosPendentesAnteriores} onVisualizar={handleVisualizar} onEditar={handleEditar} onCancelar={(t) => handleCancelar(t.id)} onBaixar={handleBaixarClick} />
            ) : (
              <ContasAPagarTabela titulos={titulosPendentesAnteriores} onVisualizar={handleVisualizar} onEditar={handleEditar} onCancelar={(t) => handleCancelar(t.id)} onBaixar={handleBaixarClick} onGerarBoletoAvulso={handleGerarBoletoAvulso} />
            )}
          </div>
        )}

        {mesSelecionado === mesAtualStr() && titulosPendentesAnteriores.length > 0 && (
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094', marginBottom: '6px' }}>
            Títulos de {formatarLabelMesExtenso(mesSelecionado)}
          </div>
        )}

        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando títulos...</div>
        ) : isMobile ? (
          <ContasAPagarMobileList titulos={titulos} onVisualizar={handleVisualizar} onEditar={handleEditar} onCancelar={(t) => handleCancelar(t.id)} onBaixar={handleBaixarClick} />
        ) : (
          <ContasAPagarTabela titulos={titulos} onVisualizar={handleVisualizar} onEditar={handleEditar} onCancelar={(t) => handleCancelar(t.id)} onBaixar={handleBaixarClick} onGerarBoletoAvulso={handleGerarBoletoAvulso} />
        )}
      </main>

      {isMobile && (
        <BasebarContasPagar
          importando={importando}
          onSelecionarRelatorio={handleSelecionarRelatorio}
          onSelecionarComprovante={handleSelecionarComprovante}
          onSelecionarBoleto={handleSelecionarBoleto}
          onAbrirRoster={handleAbrirRoster}
          titulos={titulos}
          usuario={usuario}
          onRestaurado={() => { carregarTitulos(); carregarPendentesAnteriores() }}
          onErro={setMsgErro}
          onSucesso={setMsgSucesso}
        />
      )}

      <ContasAPagarModal
        titulo={tituloSelecionado}
        modo={modoModal}
        abrirEmBaixa={abrirEmBaixa}
        onFechar={handleFecharModal}
        onSalvar={handleSalvar}
        onBaixar={handleBaixarManual}
        onCancelar={handleCancelar}
        onReabrir={handleReabrir}
      />

      {itensPendentes.length > 0 && (
        <ImportarConciliacaoPreviewModal itens={itensPendentes} onFechar={() => setItensPendentes([])} onConfirmar={handleConfirmarConciliacao} />
      )}

      {rosterAberto && (
        <RosterBeneficiariosModal roster={roster} onFechar={() => setRosterAberto(false)} onSalvar={handleSalvarRosterItem} />
      )}
    </div>
  )
}

function bannerStyle(cor: string, bg: string): React.CSSProperties {
  return { background: bg, color: cor, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', marginBottom: '10px' }
}

function Pill({ cor, bg, label }: { cor: string; bg: string; label: string }) {
  return <span style={{ background: bg, color: cor, borderRadius: '10px', padding: '3px 10px', fontWeight: 600 }}>{label}</span>
}
