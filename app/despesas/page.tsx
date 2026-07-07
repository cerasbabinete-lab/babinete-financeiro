// ============================================================
// app/despesas/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Página principal — orquestra todos os componentes
//         Gerencia estado global: lista, filtros, modal, drawer
//         Detecta desktop/mobile via matchMedia
//         Requer autenticação Supabase
//         Gerencia os 2 pipelines de import: XML (parse no client,
//         via lib/despesas/nfseXmlParser.ts / nfeCompraXmlParser.ts)
//         e Documento/IA (upload direto para a API route)
// Conecta com: todos os componentes do módulo despesas e layout
// ============================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buscarDespesas, contarDespesas, cancelarDespesa } from '@/lib/despesasService'
import { parsearNfseXml, ErroValidacaoNfse } from '@/lib/despesas/nfseXmlParser'
import { parsearNfeCompraXml, ErroValidacaoNfeCompra } from '@/lib/despesas/nfeCompraXmlParser'
import type { Despesa, FiltrosDespesas, ModoModalDespesa, ResultadoProcessamentoDespesa } from '@/types/despesas'

// Layout
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

// Módulo Despesas
import DespesasHeader from '@/components/despesas/DespesasHeader'
import DespesasFiltros from '@/components/despesas/DespesasFiltros'
import DespesasTabela from '@/components/despesas/DespesasTabela'
import DespesasMobileList from '@/components/despesas/DespesasMobileList'
import DespesasModal from '@/components/despesas/DespesasModal'
import BasebarDespesas from '@/components/despesas/BasebarDespesas'

// ============================================================
// Filtros iniciais
// ============================================================
const FILTROS_INICIAIS: FiltrosDespesas = {
  busca: '',
  categoriaFinanceira: '',
  origemTipo: '',
  vencimentoDe: '',
  vencimentoAte: '',
  status: '',
}

export default function DespesasPage() {

  const router = useRouter()

  // ── Auth ──
  const [usuario, setUsuario] = useState<string>('')
  const [authCarregando, setAuthCarregando] = useState(true)

  // ── Dados ──
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)

  // ── Filtros ──
  const [filtros, setFiltros] = useState<FiltrosDespesas>(FILTROS_INICIAIS)

  // ── Modal ──
  const [modoModal, setModoModal] = useState<ModoModalDespesa>(null)
  const [despesaSelecionada, setDespesaSelecionada] = useState<Despesa | null>(null)
  const [resultadoImportacao, setResultadoImportacao] = useState<ResultadoProcessamentoDespesa | null>(null)

  // ── Mobile ──
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  // ── Refs para os file pickers ocultos (XML e Documento/IA) ──
  const inputXmlRef = useRef<HTMLInputElement>(null)
  const inputDocumentoRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)

  // ── Feedback inline ──
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null)
  const [msgErro, setMsgErro] = useState<string | null>(null)

  // Detecção mobile — isMobile inicia como null para evitar hidratação SSR
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Auth — getUser() para validação server-side do JWT
  useEffect(() => {
    supabase.auth.getUser().then((result) => {
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

  // ── Carregar despesas ──
  const carregarDespesas = useCallback(async () => {
    setCarregando(true)
    try {
      const [lista, count] = await Promise.all([
        buscarDespesas(filtros),
        contarDespesas(),
      ])
      setDespesas(lista)
      setTotal(count)
    } catch (err) {
      console.error('[DespesasPage] carregarDespesas error:', err)
      setMsgErro(err instanceof Error ? err.message : 'Erro ao carregar despesas')
    } finally {
      setCarregando(false)
    }
  }, [filtros])

  // Efeito de carregamento inicial — mesmo padrão de data-fetch-on-mount
  // já usado (sem correção) em app/receitas/page.tsx:144 e
  // app/receber/page.tsx:190. Buscar dados em resposta a uma mudança de
  // estado (autenticação concluída) é o caso de uso descrito na própria
  // documentação do React para efeitos; mantido consistente com o padrão
  // já estabelecido no restante do projeto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!authCarregando) carregarDespesas()
  }, [authCarregando, carregarDespesas])

  // Auto-hide feedback após 4s / 6s
  useEffect(() => {
    if (!msgSucesso) return
    const t = setTimeout(() => setMsgSucesso(null), 4000)
    return () => clearTimeout(t)
  }, [msgSucesso])

  useEffect(() => {
    if (!msgErro) return
    const t = setTimeout(() => setMsgErro(null), 6000)
    return () => clearTimeout(t)
  }, [msgErro])

  // ── Obtém o Bearer token da sessão atual ──
  async function obterToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ── Importar XML — dispara o file picker oculto ──
  function handleImportarXml() {
    inputXmlRef.current?.click()
  }

  // ── Importar Documento (IA) — dispara o file picker oculto ──
  function handleImportarDocumento() {
    inputDocumentoRef.current?.click()
  }

  // ── Processa o XML selecionado: detecta NFS-e x NF-e de compra pelo
  // conteúdo, roda o parser correspondente NO CLIENT (DOMParser), e
  // envia o resultado já parseado para a API route rodar o pipeline
  // compartilhado (fornecedor, classificação, duplicidade) ──
  async function handleArquivoXmlSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    try {
      const texto = await file.text()

      // Detecção simples pelo conteúdo: NFS-e nacional sempre tem a tag
      // infNFSe; qualquer outro XML procNFe é tratado como NF-e de compra
      const ehNfse = texto.toLowerCase().includes('infnfse')

      const documento = ehNfse ? parsearNfseXml(texto) : parsearNfeCompraXml(texto)
      const tipoOrigem = ehNfse ? 'xml_nfse' : 'xml_nfe_compra'

      const token = await obterToken()
      const res = await fetch('/api/despesas/importar-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ documento, tipoOrigem }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ erro: 'Erro desconhecido' }))
        throw new Error(json.erro ?? 'Erro ao processar XML')
      }

      const resultado: ResultadoProcessamentoDespesa = await res.json()
      setResultadoImportacao(resultado)
      setModoModal('revisar')

    } catch (err: unknown) {
      const msg =
        err instanceof ErroValidacaoNfse || err instanceof ErroValidacaoNfeCompra
          ? err.message
          : err instanceof Error ? err.message : 'Erro ao importar XML'
      setMsgErro(msg)
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  // ── Processa o documento (PDF/imagem/TXT/DOC/XLS/XLSX) selecionado:
  // converte para base64 via FileReader.readAsDataURL() (NUNCA loop
  // manual de bytes — bug de performance já documentado) e envia para
  // a API route, que chama o Gemini e roda o pipeline compartilhado ──
  async function handleArquivoDocumentoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    try {
      const arquivoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const resultado = reader.result as string
          // Remove o prefixo "data:...;base64," antes de enviar
          resolve(resultado.split(',')[1] ?? '')
        }
        reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
        reader.readAsDataURL(file)
      })

      const token = await obterToken()
      const res = await fetch('/api/despesas/importar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ arquivoBase64, mimeType: file.type || 'application/octet-stream' }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ erro: 'Erro desconhecido' }))
        throw new Error(json.erro ?? 'Erro ao processar documento')
      }

      const resultado: ResultadoProcessamentoDespesa = await res.json()
      setResultadoImportacao(resultado)
      setModoModal('revisar')

    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao importar documento')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  // ── Handlers modal ──
  function handleNovaDespesa() { setDespesaSelecionada(null); setResultadoImportacao(null); setModoModal('novo') }
  function handleEditar(d: Despesa) { setDespesaSelecionada(d); setResultadoImportacao(null); setModoModal('editar') }
  function handleFecharModal() { setModoModal(null); setDespesaSelecionada(null); setResultadoImportacao(null) }
  function handleSalvo() { carregarDespesas(); handleFecharModal(); setMsgSucesso('Despesa gravada com sucesso.') }
  function handleLimparFiltros() { setFiltros(FILTROS_INICIAIS) }

  async function handleExcluir(d: Despesa) {
    try {
      await cancelarDespesa(d.id)
      carregarDespesas()
    } catch (err: unknown) {
      setMsgErro(err instanceof Error ? err.message : 'Erro ao cancelar despesa')
    }
  }

  // ── Guarda hidratação SSR ──
  if (isMobile === null || authCarregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Tahoma, Geneva, sans-serif', fontSize: '13px', color: '#5a84a6', background: '#f0f4f7' }}>
        Carregando...
      </div>
    )
  }

  // ============================================================
  // Render — Desktop
  // ============================================================
  if (!isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
        <Topbar usuario={usuario} />
        <NavBar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          <DespesasHeader
            totalDespesas={total}
            onImportarXml={handleImportarXml}
            onImportarDocumento={handleImportarDocumento}
            onNovaDespesa={handleNovaDespesa}
          />

          <InputsOcultos
            inputXmlRef={inputXmlRef}
            inputDocumentoRef={inputDocumentoRef}
            onArquivoXmlSelecionado={handleArquivoXmlSelecionado}
            onArquivoDocumentoSelecionado={handleArquivoDocumentoSelecionado}
          />

          <FeedbackBanner
            importando={importando}
            msgSucesso={msgSucesso}
            msgErro={msgErro}
            onFecharSucesso={() => setMsgSucesso(null)}
            onFecharErro={() => setMsgErro(null)}
          />

          <DespesasFiltros
            filtros={filtros}
            onFiltrosChange={setFiltros}
            onLimpar={handleLimparFiltros}
          />

          {carregando ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
              Carregando despesas...
            </div>
          ) : (
            <DespesasTabela
              despesas={despesas}
              onEditar={handleEditar}
              onExcluir={handleExcluir}
            />
          )}
        </main>

        {modoModal && (
          <DespesasModal
            modo={modoModal}
            despesa={despesaSelecionada}
            resultadoImportacao={resultadoImportacao}
            onFechar={handleFecharModal}
            onSalvo={handleSalvo}
          />
        )}
      </div>
    )
  }

  // ============================================================
  // Render — Mobile
  // ============================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f7', fontFamily: 'Tahoma, Geneva, sans-serif', paddingBottom: '70px' }}>
      <TopbarMobile usuario={usuario} onOpenDrawer={() => setDrawerAberto(true)} />
      <Drawer isOpen={drawerAberto} onClose={() => setDrawerAberto(false)} />

      <InputsOcultos
            inputXmlRef={inputXmlRef}
            inputDocumentoRef={inputDocumentoRef}
            onArquivoXmlSelecionado={handleArquivoXmlSelecionado}
            onArquivoDocumentoSelecionado={handleArquivoDocumentoSelecionado}
          />

      <main style={{ flex: 1, padding: '10px 12px' }}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a6094' }}>Despesas</div>
          <div style={{ fontSize: '9px', color: '#5a84a6' }}>{total} registros</div>
        </div>

        <FeedbackBanner
            importando={importando}
            msgSucesso={msgSucesso}
            msgErro={msgErro}
            onFecharSucesso={() => setMsgSucesso(null)}
            onFecharErro={() => setMsgErro(null)}
          />

        <DespesasFiltros
          filtros={filtros}
          onFiltrosChange={setFiltros}
          onLimpar={handleLimparFiltros}
        />

        {carregando ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#5a84a6', fontSize: '12px' }}>
            Carregando despesas...
          </div>
        ) : (
          <DespesasMobileList
            despesas={despesas}
            onEditar={handleEditar}
            onExcluir={handleExcluir}
          />
        )}
      </main>

      <BasebarDespesas
        onImportarXml={handleImportarXml}
        onImportarDocumento={handleImportarDocumento}
        onNovaDespesa={handleNovaDespesa}
      />

      {modoModal && (
        <DespesasModal
          modo={modoModal}
          despesa={despesaSelecionada}
          resultadoImportacao={resultadoImportacao}
          onFechar={handleFecharModal}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  )
}

// ============================================================
// InputsOcultos
// Componente de MÓDULO (fora de DespesasPage) — os dois file pickers
// ocultos, compartilhados entre desktop e mobile. Declarado fora do
// componente principal para não ser recriado a cada render (o que
// disparava react-hooks/static-components e podia causar remount dos
// inputs, perdendo o estado interno do <input type="file">).
// ============================================================
interface InputsOcultosProps {
  inputXmlRef: React.RefObject<HTMLInputElement | null>
  inputDocumentoRef: React.RefObject<HTMLInputElement | null>
  onArquivoXmlSelecionado: (e: React.ChangeEvent<HTMLInputElement>) => void
  onArquivoDocumentoSelecionado: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function InputsOcultos({ inputXmlRef, inputDocumentoRef, onArquivoXmlSelecionado, onArquivoDocumentoSelecionado }: InputsOcultosProps) {
  return (
    <>
      <input ref={inputXmlRef} type="file" accept=".xml" style={{ display: 'none' }} onChange={onArquivoXmlSelecionado} />
      <input
        ref={inputDocumentoRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx"
        style={{ display: 'none' }}
        onChange={onArquivoDocumentoSelecionado}
      />
    </>
  )
}

// ============================================================
// FeedbackBanner
// Componente de MÓDULO (fora de DespesasPage) — banners de status
// (processando/sucesso/erro), mesmo motivo de InputsOcultos acima.
// ============================================================
interface FeedbackBannerProps {
  importando: boolean
  msgSucesso: string | null
  msgErro: string | null
  onFecharSucesso: () => void
  onFecharErro: () => void
}

function FeedbackBanner({ importando, msgSucesso, msgErro, onFecharSucesso, onFecharErro }: FeedbackBannerProps) {
  return (
    <>
      {importando && (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#e8f0f7', border: '1px solid #c4d8eb', borderRadius: '5px', color: '#1a6094', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif' }}>
          <i className="ti ti-loader-2" style={{ marginRight: '6px' }} />Processando documento...
        </div>
      )}
      {msgSucesso && (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#eaf3de', border: '1px solid #b7d98f', borderRadius: '5px', color: '#3b6d11', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
          <span><i className="ti ti-check" style={{ marginRight: '6px' }} />{msgSucesso}</span>
          <button onClick={onFecharSucesso} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b6d11' }}>✕</button>
        </div>
      )}
      {msgErro && (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '5px', color: '#a32d2d', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
          <span><i className="ti ti-alert-triangle" style={{ marginRight: '6px' }} />{msgErro}</span>
          <button onClick={onFecharErro} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d' }}>✕</button>
        </div>
      )}
    </>
  )
}
