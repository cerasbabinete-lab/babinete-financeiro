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
import {
  buscarTitulos,
  contarTitulos,
  buscarContadoresTitulos,
  buscarRosterCompleto,
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
      setUsuario((user.email ?? '').split('@')[0])
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
      body: JSON.stringify({ id: titulo.id, observacoes: titulo.observacoes }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.erro ?? 'Erro ao salvar') }
    setMsgSucesso('Título atualizado.')
    handleFecharModal()
    carregarTitulos()
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
        const conteudoTxt = await file.text()
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

      <main style={{ flex: 1, padding: isMobile ? '10px 12px' : '20px 32px', maxWidth: isMobile ? undefined : '1200px', width: '100%', margin: '0 auto' }}>

        {msgSucesso && <div style={bannerStyle('#166534', '#dcfce7')}>{msgSucesso}</div>}
        {msgErro && <div style={bannerStyle('#d32f2f', '#fee2e2')}>{msgErro}</div>}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '11px' }}>
          <Pill cor="#166534" bg="#dcfce7" label={`Em Aberto: ${contadores.emAberto}`} />
          <Pill cor="#b45309" bg="#fef3c7" label={`Atrasados: ${contadores.atrasados}`} />
          <Pill cor="#92400e" bg="#fef3c7" label={`Pago Parcial: ${contadores.pagoParcial}`} />
          <Pill cor="#166534" bg="#dcfce7" label={`Pagos: ${contadores.pagos}`} />
          <Pill cor="#9ca3af" bg="#f3f4f6" label={`Cancelados: ${contadores.cancelados}`} />
        </div>

        {!isMobile && (
          <ContasAPagarHeader
            totalTitulos={total}
            importando={importando}
            onSelecionarRelatorio={handleSelecionarRelatorio}
            onSelecionarComprovante={handleSelecionarComprovante}
            onAbrirRoster={handleAbrirRoster}
          />
        )}

        <ContasAPagarFiltros filtros={filtros} onChange={setFiltros} />

        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>Carregando títulos...</div>
        ) : isMobile ? (
          <ContasAPagarMobileList titulos={titulos} onVisualizar={handleVisualizar} onEditar={handleEditar} onCancelar={(t) => handleCancelar(t.id)} onBaixar={handleBaixarClick} />
        ) : (
          <ContasAPagarTabela titulos={titulos} onVisualizar={handleVisualizar} onEditar={handleEditar} onCancelar={(t) => handleCancelar(t.id)} onBaixar={handleBaixarClick} />
        )}
      </main>

      {isMobile && (
        <BasebarContasPagar
          importando={importando}
          onSelecionarRelatorio={handleSelecionarRelatorio}
          onSelecionarComprovante={handleSelecionarComprovante}
          onAbrirRoster={handleAbrirRoster}
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
