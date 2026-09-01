// ============================================================
// components/fornecedores/FornecedoresModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Modal completo Novo/Editar/Visualizar Fornecedor
//         COM CNPJ Auto-Fill via BrasilAPI (primary) + CNPJá (fallback)
//         Funciona em modo 'novo' e 'editar' — conforme aprovado
//         Especificacao_Fornecedores_Pix_Categorias_WhatsApp.md:
//         Chaves Pix (Seção 1, indisponível em modo 'novo' — sem
//         fornecedor.id ainda), categoria dinâmica + link "Gerenciar
//         categorias" (Seção 4), favorito de contato WhatsApp (Seção 2)
// Conecta com: app/fornecedores/page.tsx (categorias, onCategoriasAlteradas)
//              fornecedoresService.ts, lib/localidades.ts
//              WhatsAppSection.tsx (reutilizado de Clientes)
//              CategoriasModal.tsx (novo, Seção 4.6)
//              types/fornecedores.ts
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import {
  criarFornecedor,
  editarFornecedor,
  verificarDuplicidadeFornecedor,
  listarChavesPix,
  criarChavePix,
  atualizarChavePix,
  definirChavePixPreferencial,
  excluirChavePix,
  definirContatoWhatsAppFavorito,
} from '@/lib/fornecedoresService'
import { getUFs, getCidades } from '@/lib/localidades'
import WhatsAppSection from '@/components/clientes/WhatsAppSection'
import CategoriasModal from '@/components/fornecedores/CategoriasModal'
import type {
  Fornecedor,
  FornecedorInsert,
  ContatoWhatsApp,
  ModoModal,
  ChavePix,
  TipoChavePix,
  FornecedorCategoria,
} from '@/types/fornecedores'
import { OPCOES_TIPO_CHAVE_PIX } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresModalProps {
  modo: ModoModal
  fornecedor?: Fornecedor | null
  onFechar: () => void
  onSalvo: () => void
  categorias: FornecedorCategoria[]   // Lista buscada UMA VEZ em app/fornecedores/page.tsx — evita
                                       // fetch redundante entre Modal/Tabela/MobileList na mesma tela
  onCategoriasAlteradas: () => void   // Repassado ao CategoriasModal — chamado após qualquer criação/
                                       // rename/exclusão de categoria para o pai re-buscar a lista
}

// ============================================================
// Estado inicial do formulário
// ============================================================
const FORM_INICIAL: FornecedorInsert = {
  razao: '',
  fantasia: '',
  end: '',
  num: '',
  bairro: '',
  cep: '',
  cidade: '',
  uf: '',
  cnpj: '',
  cpf: '',
  ie: '',
  fone1: '',
  fone2: '',
  contato: '',
  fone_contato: '',
  email: '',
  email_contato: '',
  website: '',
  dados_bancarios: '',
  tipo_fornecedor_id: null, // não classificado — mesmo default do banco (Módulo Relatórios, 2.6)
  data_nascimento: '',
  observacoes: '',
  contato_whatsapp: [],
}

// ============================================================
// Helpers de máscara
// ============================================================
function mascaraCNPJ(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function mascaraCEP(cep: string): string {
  const d = cep.replace(/\D/g, '').slice(0, 8)
  return d.replace(/^(\d{5})(\d{3})$/, '$1-$2')
}

function mascaraTelefone(tel: string): string {
  const d = tel.replace(/\D/g, '').slice(0, 11)
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  return d
}

// ============================================================
// Helpers de normalização de dados
// Aplicados tanto nos dados recebidos das APIs (BrasilAPI / CNPJá)
// quanto nos campos digitados manualmente ao salvar
// Garante consistência no banco independente da fonte do dado
// ============================================================

// normalizarTexto — remove espaços extras nas bordas
// Evita "  Empresa Ltda  " ser gravado diferente de "Empresa Ltda"
function normalizarTexto(s: string): string {
  return (s ?? '').trim()
}

// normalizarEmail — minúsculas + trim
// "Vendas@Empresa.COM.BR" e "vendas@empresa.com.br" são o mesmo endereço
function normalizarEmail(s: string): string {
  return (s ?? '').trim().toLowerCase()
}

// normalizarUF — maiúsculas + trim (segurança contra API retornar "pr" ou " PR ")
function normalizarUF(s: string): string {
  return (s ?? '').trim().toUpperCase()
}

// normalizarCidade — encontra o nome EXATO de localidades_br.json
// BrasilAPI retorna "MARINGÁ" (CAPS), localidades_br.json tem "Maringá" (Title Case)
// Comparação é case-insensitive + ignora acentos para máxima tolerância
// Se não encontrar match exato, retorna o texto original trimado
function normalizarCidade(cidade: string, uf: string): string {
  if (!cidade || !uf) return normalizarTexto(cidade)
  const lista = getCidades(uf)
  // Remove acentos e converte para minúscula para comparação neutra
  const sem = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const cidadeSem = sem(cidade.trim())
  // Retorna a string exata do JSON se achar, ou o valor trimado original
  return lista.find(c => sem(c) === cidadeSem) ?? normalizarTexto(cidade)
}

// ============================================================
// FornecedoresModal
// ============================================================
export default function FornecedoresModal({
  modo,
  fornecedor,
  onFechar,
  onSalvo,
  categorias,
  onCategoriasAlteradas,
}: FornecedoresModalProps) {

  const [form, setForm] = useState<FornecedorInsert>(FORM_INICIAL)
  const [cidades, setCidades] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Estados do CNPJ Auto-Fill
  const [consultando, setConsultando] = useState(false)
  const [erroCnpj, setErroCnpj] = useState<string>('')

  // ── Estados do bloco "Gerenciar categorias" (Seção 4.6) ──
  const [categoriasModalAberto, setCategoriasModalAberto] = useState(false)

  // ── Estados do bloco "Chaves Pix" (Seção 1.6) — indisponível em
  // modo 'novo' porque depende de fornecedor.id, que só existe após
  // o primeiro Gravar (mesma decisão aprovada para este cenário) ──
  const [chavesPix, setChavesPix] = useState<ChavePix[]>([])
  const [carregandoChavesPix, setCarregandoChavesPix] = useState(false)
  const [erroChavePix, setErroChavePix] = useState('')
  const [processandoChavePix, setProcessandoChavePix] = useState(false)
  // Formulário "Adicionar chave"
  const [adicionandoChavePix, setAdicionandoChavePix] = useState(false)
  const [novoTipoChave, setNovoTipoChave] = useState<TipoChavePix>('cpf')
  const [novoValorChave, setNovoValorChave] = useState('')
  // Edição inline de uma chave existente (tipo/valor — nunca preferencial)
  const [editandoChaveId, setEditandoChaveId] = useState<number | null>(null)
  const [edicaoTipoChave, setEdicaoTipoChave] = useState<TipoChavePix>('cpf')
  const [edicaoValorChave, setEdicaoValorChave] = useState('')
  // Confirmação inline de exclusão de uma chave
  const [confirmandoExcluirChaveId, setConfirmandoExcluirChaveId] = useState<number | null>(null)

  // ── Estado de erro do favorito WhatsApp (Seção 2.3) — inline,
  // nunca alert()/confirm() (convenção do projeto) ──
  const [erroFavoritoWhatsApp, setErroFavoritoWhatsApp] = useState('')

  const ufs = getUFs()
  const readOnly = modo === 'visualizar'
  // true quando o fornecedor já existe no banco — Chaves Pix e favorito
  // WhatsApp dependem de fornecedor.id, indisponível em modo 'novo'
  const fornecedorSalvo = modo !== 'novo' && !!fornecedor?.id

  // ============================================================
  // Efeito: pré-preenche ao abrir
  // ============================================================
  useEffect(() => {
    if (modo === 'novo') {
      setForm(FORM_INICIAL) // eslint-disable-line react-hooks/set-state-in-effect
      setCidades([])
      setErros({})
      setErroCnpj('')
    } else if ((modo === 'editar' || modo === 'visualizar') && fornecedor) {
      setForm({
        razao: fornecedor.razao ?? '',
        fantasia: fornecedor.fantasia ?? '',
        end: fornecedor.end ?? '',
        num: fornecedor.num ?? '',
        bairro: fornecedor.bairro ?? '',
        cep: fornecedor.cep ?? '',
        cidade: fornecedor.cidade ?? '',
        uf: fornecedor.uf ?? '',
        cnpj: fornecedor.cnpj ?? '',
        cpf: fornecedor.cpf ?? '',
        ie: fornecedor.ie ?? '',
        fone1: fornecedor.fone1 ?? '',
        fone2: fornecedor.fone2 ?? '',
        contato: fornecedor.contato ?? '',
        fone_contato: fornecedor.fone_contato ?? '',
        email: fornecedor.email ?? '',
        email_contato: fornecedor.email_contato ?? '',
        website: fornecedor.website ?? '',
        dados_bancarios: fornecedor.dados_bancarios ?? '',
        tipo_fornecedor_id: fornecedor.tipo_fornecedor_id ?? null,
        data_nascimento: fornecedor.data_nascimento ?? '',
        observacoes: fornecedor.observacoes ?? '',
        contato_whatsapp: fornecedor.contato_whatsapp ?? [],
      })
      if (fornecedor.uf) setCidades(getCidades(fornecedor.uf))
      setErros({})
      setErroCnpj('')
    }
  }, [modo, fornecedor])

  // ============================================================
  // Efeito: carrega as Chaves Pix do fornecedor (Seção 1.6)
  // Só busca quando há fornecedor.id (modo 'editar'/'visualizar') —
  // em modo 'novo' o bloco fica desabilitado, sem chamada ao serviço
  // ============================================================
  useEffect(() => {
    if (fornecedorSalvo && fornecedor?.id) {
      setCarregandoChavesPix(true) // eslint-disable-line react-hooks/set-state-in-effect -- efeito de carregamento sob condição (fornecedor.id mudou), não render em cascata não-controlado
      setErroChavePix('')
      listarChavesPix(fornecedor.id)
        .then(lista => setChavesPix(lista))
        .catch((err: unknown) => {
          setErroChavePix(err instanceof Error ? err.message : 'Erro ao carregar chaves Pix.')
        })
        .finally(() => setCarregandoChavesPix(false))
    } else {
      setChavesPix([])
    }
    // Reseta os formulários de adicionar/editar chave ao trocar de fornecedor/modo —
    // evita carregar um formulário aberto de um fornecedor anterior
    setAdicionandoChavePix(false)
    setNovoTipoChave('cpf')
    setNovoValorChave('')
    setEditandoChaveId(null)
    setConfirmandoExcluirChaveId(null)
    setErroFavoritoWhatsApp('')
  }, [fornecedorSalvo, fornecedor?.id])

  // ============================================================
  // handleChange
  // ============================================================
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (erros[name]) setErros(prev => ({ ...prev, [name]: '' }))
    if (name === 'cnpj') setErroCnpj('')
  }

  // ============================================================
  // handleUFChange
  // ============================================================
  function handleUFChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const uf = e.target.value
    setForm(prev => ({ ...prev, uf, cidade: '' }))
    setCidades(getCidades(uf))
  }

  // ============================================================
  // handleTipoFornecedorChange
  // Select de categoria dinâmica (Módulo Relatórios, 2.6 + Especificacao_
  // Fornecedores_Pix_Categorias_WhatsApp.md, Seção 4) — diferente de
  // handleChange genérico, converte a opção vazia ('') para null
  // explicitamente ("Não classificado"), e o valor não-vazio (id da
  // categoria, sempre string vinda do DOM) para number — a coluna
  // tipo_fornecedor_id é INTEGER, não aceita string
  // ============================================================
  function handleTipoFornecedorChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const valor = e.target.value
    setForm(prev => ({
      ...prev,
      tipo_fornecedor_id: valor === '' ? null : Number(valor),
    }))
  }

  // ============================================================
  // handleWhatsApp
  // ============================================================
  function handleWhatsApp(contatos: ContatoWhatsApp[]) {
    setForm(prev => ({ ...prev, contato_whatsapp: contatos }))
  }

  // ============================================================
  // handleDefinirFavoritoWhatsApp
  // Chamado por WhatsAppSection (prop onDefinirFavorito) quando o
  // usuário clica no toggle de favorito de um contato (Seção 2.3).
  // Grava IMEDIATAMENTE no banco (fornecedor.id obrigatório — por
  // isso suportaFavorito só é true quando fornecedorSalvo é true) e
  // reflete o resultado no estado local do form, mesmo padrão de
  // handleWhatsApp
  // ============================================================
  async function handleDefinirFavoritoWhatsApp(indice: number) {
    if (!fornecedor?.id) return // segurança — botão fica indisponível neste caso via suportaFavorito
    setErroFavoritoWhatsApp('')
    try {
      await definirContatoWhatsAppFavorito(fornecedor.id, indice)
      // Recalcula localmente o mesmo resultado que o serviço gravou —
      // evita um novo fetch só para refletir a troca de favorito
      setForm(prev => ({
        ...prev,
        contato_whatsapp: (prev.contato_whatsapp ?? []).map((c, i) => ({
          ...c,
          favorito: i === indice,
        })),
      }))
    } catch (err: unknown) {
      setErroFavoritoWhatsApp(
        err instanceof Error ? err.message : 'Erro ao definir contato favorito.'
      )
    }
  }

  // ============================================================
  // ────────────────────────────────────────────────────────────
  // SEÇÃO: HANDLERS DAS CHAVES PIX (Especificacao_Fornecedores_
  // Pix_Categorias_WhatsApp.md, Seção 1.6). Todas as ações abaixo
  // gravam IMEDIATAMENTE no banco via lib/fornecedoresService.ts —
  // não passam pelo payload de handleSalvar, mesmo padrão já usado
  // por CategoriasModal.tsx (Seção 4.6)
  // ────────────────────────────────────────────────────────────
  // ============================================================

  // ============================================================
  // handleAdicionarChavePix
  // Cria uma nova chave a partir do formulário "Adicionar chave"
  // Ambos os campos (tipo, valor) são obrigatórios — sem outra
  // validação de formato (Seção 1.1)
  // ============================================================
  async function handleAdicionarChavePix() {
    if (!fornecedor?.id) return // segurança — bloco fica indisponível neste caso (fornecedorSalvo=false)
    if (!novoValorChave.trim()) return // valor obrigatório

    setProcessandoChavePix(true)
    setErroChavePix('')
    try {
      const nova = await criarChavePix(fornecedor.id, novoTipoChave, novoValorChave.trim())
      setChavesPix(prev => [...prev, nova]) // acrescenta a chave recém-criada à lista local
      setNovoTipoChave('cpf')
      setNovoValorChave('')
      setAdicionandoChavePix(false)
    } catch (err: unknown) {
      setErroChavePix(err instanceof Error ? err.message : 'Erro ao adicionar chave Pix.')
    } finally {
      setProcessandoChavePix(false)
    }
  }

  // ============================================================
  // handleDefinirChavePreferencial
  // Toggle estilo rádio — chama o RPC via definirChavePixPreferencial()
  // e recalcula localmente qual chave fica com preferencial=true,
  // mesmo padrão de handleDefinirFavoritoWhatsApp acima
  // ============================================================
  async function handleDefinirChavePreferencial(chaveId: number) {
    if (!fornecedor?.id) return
    setProcessandoChavePix(true)
    setErroChavePix('')
    try {
      await definirChavePixPreferencial(fornecedor.id, chaveId)
      setChavesPix(prev => prev.map(c => ({ ...c, preferencial: c.id === chaveId })))
    } catch (err: unknown) {
      setErroChavePix(err instanceof Error ? err.message : 'Erro ao definir chave preferencial.')
    } finally {
      setProcessandoChavePix(false)
    }
  }

  // ============================================================
  // handleIniciarEdicaoChave / handleConfirmarEdicaoChave /
  // handleCancelarEdicaoChave
  // Edição inline de tipo/valor de uma chave existente — NUNCA
  // altera `preferencial` (só definirChavePixPreferencial faz isso,
  // Seção 1.5). A Seção 1.6 não descreve explicitamente um botão de
  // edição por linha, mas o serviço atualizarChavePix() existe e
  // precisa de um gatilho na UI — decisão de engenharia: mesmo
  // padrão de edição inline já usado em CategoriasModal.tsx (Seção 4.6)
  // ============================================================
  function handleIniciarEdicaoChave(chave: ChavePix) {
    setEditandoChaveId(chave.id)
    setEdicaoTipoChave(chave.tipo_chave)
    setEdicaoValorChave(chave.valor_chave)
    setErroChavePix('')
  }

  async function handleConfirmarEdicaoChave() {
    if (editandoChaveId === null) return
    if (!edicaoValorChave.trim()) return // valor vazio não é gravado

    setProcessandoChavePix(true)
    setErroChavePix('')
    try {
      await atualizarChavePix(editandoChaveId, edicaoTipoChave, edicaoValorChave.trim())
      setChavesPix(prev =>
        prev.map(c =>
          c.id === editandoChaveId
            ? { ...c, tipo_chave: edicaoTipoChave, valor_chave: edicaoValorChave.trim() }
            : c
        )
      )
      setEditandoChaveId(null)
    } catch (err: unknown) {
      setErroChavePix(err instanceof Error ? err.message : 'Erro ao atualizar chave Pix.')
    } finally {
      setProcessandoChavePix(false)
    }
  }

  function handleCancelarEdicaoChave() {
    setEditandoChaveId(null)
  }

  // ============================================================
  // handleExcluirChavePix
  // Soft delete via excluirChavePix() — sem promoção automática de
  // outra chave a preferencial (Seção 1.5)
  // ============================================================
  async function handleExcluirChavePix(chaveId: number) {
    setProcessandoChavePix(true)
    setErroChavePix('')
    try {
      await excluirChavePix(chaveId)
      setChavesPix(prev => prev.filter(c => c.id !== chaveId))
      setConfirmandoExcluirChaveId(null)
    } catch (err: unknown) {
      setErroChavePix(err instanceof Error ? err.message : 'Erro ao excluir chave Pix.')
      setConfirmandoExcluirChaveId(null) // fecha a confirmação mesmo em erro — evita ficar travado
    } finally {
      setProcessandoChavePix(false)
    }
  }

  // ============================================================
  // aplicarDadosAPI
  // Aplica os dados retornados da API no formulário
  // ============================================================
  function aplicarDadosAPI(dados: Partial<FornecedorInsert>) {
    // Aplica UF primeiro e carrega lista de cidades antes de definir a cidade
    // Sem isso, o select de cidade tenta selecionar um valor que ainda não
    // está na lista, resultando em campo vazio mesmo com dados da API
    if (dados.uf) {
      const cidadesUF = getCidades(dados.uf)
      setCidades(cidadesUF)
    }
    // Aplica todos os dados (incluindo cidade) após cidades estarem disponíveis
    setForm(prev => ({ ...prev, ...dados }))
  }

  // ============================================================
  // consultarCNPJ
  // Fluxo: validação → verificar campos preenchidos → BrasilAPI
  //        → fallback CNPJá → aplicar ou mostrar erro
  // Disponível em modo 'novo' e 'editar' — não em 'visualizar'
  // ============================================================
  async function consultarCNPJ() {
    setErroCnpj('')
    const cnpjLimpo = (form.cnpj ?? '').replace(/\D/g, '')

    // Validação de 14 dígitos
    if (cnpjLimpo.length !== 14) {
      setErroCnpj('CNPJ inválido — digite os 14 dígitos')
      return
    }

    // Verifica se há campos preenchidos que seriam sobrescritos
    const camposPreenchidos = [
      form.razao, form.fantasia, form.end, form.num, form.bairro,
      form.cep, form.cidade, form.uf, form.email, form.fone1, form.ie
    ].some(v => v && v.trim() !== '')

    if (camposPreenchidos) {
      const confirmar = confirm(
        'Alguns campos já estão preenchidos. Deseja sobrescrever com os dados da consulta?'
      )
      if (!confirmar) return
    }

    setConsultando(true)
    try {
      // ---- Primary: BrasilAPI ----
      let dados: Partial<FornecedorInsert> | null = null

      try {
        const resp = await fetch(
          `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (resp.ok) {
          const json = await resp.json()
          dados = mapBrasilAPI(json, cnpjLimpo)
        }
      } catch {
        // BrasilAPI falhou — tenta fallback
      }

      // ---- Fallback: CNPJá ----
      if (!dados) {
        try {
          const resp = await fetch(
            `https://open.cnpja.com/office/${cnpjLimpo}`,
            { signal: AbortSignal.timeout(8000) }
          )
          if (resp.ok) {
            const json = await resp.json()
            dados = mapCNPJa(json, cnpjLimpo)
          }
        } catch {
          // CNPJá também falhou
        }
      }

      if (dados) {
        aplicarDadosAPI(dados)
      } else {
        setErroCnpj('CNPJ não encontrado. Preencha os campos manualmente.')
      }
    } finally {
      setConsultando(false)
    }
  }

  // ============================================================
  // mapBrasilAPI — mapeia resposta BrasilAPI → campos do form
  // Aplica normalização em todos os campos para garantir padrão
  // consistente independente do formato retornado pela API
  // ============================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapBrasilAPI(json: any, cnpjLimpo: string): Partial<FornecedorInsert> {
    const cep = (json.cep ?? '').replace(/\D/g, '')
    const ddd = normalizarTexto(json.ddd_telefone_1 ?? '')
    // Normaliza UF antes de usá-la para lookup de cidade
    const uf = normalizarUF(json.uf ?? '')

    return {
      razao:    normalizarTexto(json.razao_social ?? ''),          // trim — registro oficial sempre vem em CAPS
      fantasia: normalizarTexto(json.nome_fantasia ?? ''),         // trim — mantém casing da API
      cnpj:     mascaraCNPJ(cnpjLimpo),                           // já mascarado
      end:      normalizarTexto(json.logradouro ?? ''),            // trim
      num:      normalizarTexto(json.numero ?? ''),                // trim
      bairro:   normalizarTexto(json.bairro ?? ''),                // trim
      cep:      mascaraCEP(cep),                                   // já mascarado
      uf,                                                          // normalizado acima
      cidade:   normalizarCidade(json.municipio ?? '', uf),        // match exato no localidades_br.json
      email:    normalizarEmail(json.email ?? ''),                 // lowercase + trim
      fone1:    ddd ? mascaraTelefone(ddd.replace(/\D/g, '')) : '', // já mascarado
    }
  }

  // ============================================================
  // mapCNPJa — mapeia resposta CNPJá → campos do form
  // Aplica normalização em todos os campos (mesmo padrão de mapBrasilAPI)
  // ============================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapCNPJa(json: any, cnpjLimpo: string): Partial<FornecedorInsert> {
    const addr = json.address ?? {}
    const cep = (addr.zip ?? '').replace(/\D/g, '')
    const phone = json.phones?.[0]
    const fone1 = phone
      ? mascaraTelefone(`${phone.area ?? ''}${phone.number ?? ''}`)
      : ''

    // Normaliza UF antes de usá-la para lookup de IE e cidade
    const uf = normalizarUF(addr.state ?? '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regIE = json.registrations?.find((r: any) => r.state === uf)

    return {
      razao:    normalizarTexto(json.company?.name ?? ''),         // trim
      fantasia: normalizarTexto(json.alias ?? ''),                 // trim
      cnpj:     mascaraCNPJ(cnpjLimpo),                           // já mascarado
      end:      normalizarTexto(addr.street ?? ''),                // trim
      num:      normalizarTexto(addr.number ?? ''),                // trim
      bairro:   normalizarTexto(addr.district ?? ''),              // trim
      cep:      mascaraCEP(cep),                                   // já mascarado
      uf,                                                          // normalizado acima
      cidade:   normalizarCidade(addr.city ?? '', uf),             // match exato no localidades_br.json
      email:    normalizarEmail(json.emails?.[0]?.address ?? ''),  // lowercase + trim
      fone1,                                                       // já mascarado
      ie:       normalizarTexto(regIE?.number ?? ''),              // trim
    }
  }

  // ============================================================
  // validar
  // ============================================================
  function validar(): boolean {
    const novosErros: Record<string, string> = {}

    if (!form.razao.trim()) {
      novosErros.razao = 'Razão Social é obrigatória.'
    }

    const cnpjLimpo = (form.cnpj ?? '').replace(/[^0-9]/g, '')
    const cpfLimpo = (form.cpf ?? '').replace(/[^0-9]/g, '')
    if (!cnpjLimpo && !cpfLimpo) {
      novosErros.cnpj = 'Informe o CNPJ ou CPF.'
    }

    if (form.cep && !/^\d{5}-\d{3}$/.test(form.cep)) {
      novosErros.cep = 'CEP inválido. Use o formato 00000-000.'
    }

    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  // ============================================================
  // handleSalvar
  // Normaliza TODOS os campos antes de enviar ao Supabase
  // Garante padrão consistente independente de como o usuário digitou
  // ou de qual API preencheu os dados
  // ============================================================
  async function handleSalvar() {
    if (!validar()) return
    setSalvando(true)
    try {
      // Monta payload normalizado — aplica as mesmas funções usadas no auto-fill
      // para garantir que dados digitados manualmente sigam o mesmo padrão
      const payload: FornecedorInsert = {
        razao:           normalizarTexto(form.razao),
        fantasia:        normalizarTexto(form.fantasia ?? ''),
        end:             normalizarTexto(form.end ?? ''),
        num:             normalizarTexto(form.num ?? ''),
        bairro:          normalizarTexto(form.bairro ?? ''),
        cep:             normalizarTexto(form.cep ?? ''),
        uf:              normalizarUF(form.uf ?? ''),
        cidade:          normalizarTexto(form.cidade ?? ''),
        cnpj:            normalizarTexto(form.cnpj ?? ''),
        cpf:             normalizarTexto(form.cpf ?? ''),
        ie:              normalizarTexto(form.ie ?? ''),
        fone1:           normalizarTexto(form.fone1 ?? ''),
        fone2:           normalizarTexto(form.fone2 ?? ''),
        contato:         normalizarTexto(form.contato ?? ''),
        fone_contato:    normalizarTexto(form.fone_contato ?? ''),
        email:           normalizarEmail(form.email ?? ''),          // lowercase
        email_contato:   normalizarEmail(form.email_contato ?? ''),  // lowercase
        website:         normalizarTexto(form.website ?? ''),
        dados_bancarios: normalizarTexto(form.dados_bancarios ?? ''),
        tipo_fornecedor_id: form.tipo_fornecedor_id ?? null, // <select> fechado — sem string vazia a normalizar
        observacoes:     normalizarTexto(form.observacoes ?? ''),
        contato_whatsapp: form.contato_whatsapp ?? [],
        // data_nascimento: '' → null (Postgres rejeita string vazia em coluna date)
        data_nascimento: form.data_nascimento?.trim() !== '' ? form.data_nascimento : null,
      }

      // Verifica duplicidade de CNPJ/CPF antes de salvar
      // excludeId: ignora o próprio registro em caso de edição
      const excludeId = modo === 'editar' && fornecedor ? fornecedor.id : undefined
      const duplicado = await verificarDuplicidadeFornecedor(
        payload.cnpj ?? '',
        payload.cpf ?? '',
        excludeId
      )
      if (duplicado) {
        setSalvando(false)
        setErros({ cnpj: `CNPJ/CPF já cadastrado para: ${duplicado.razao} (Cód. ${duplicado.id})` })
        return
      }
      if (modo === 'novo') {
        await criarFornecedor(payload)
      } else if (modo === 'editar' && fornecedor) {
        await editarFornecedor({ ...payload, id: fornecedor.id })
      }
      onSalvo()
      onFechar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      alert(`Erro ao salvar: ${msg}`)
      console.error(err)
    } finally {
      setSalvando(false)
    }
  }

  if (!modo) return null

  const titulo =
    modo === 'novo'
      ? 'Novo Fornecedor'
      : modo === 'editar'
      ? 'Editar Fornecedor'
      : 'Visualizar Fornecedor'

  // ============================================================
  // Render
  // Fragmento externo (<>) porque CategoriasModal.tsx renderiza como
  // um segundo overlay independente (zIndex 1100, acima deste modal,
  // que continua montado atrás) — não pode ficar aninhado dentro da
  // mesma div de overlay sem herdar seu contexto de posicionamento
  // ============================================================
  return (
    <>
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
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
            {titulo}
          </span>
          <button
            onClick={onFechar}
            aria-label="Fechar modal"
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

          {/* Row 1: Código | Razão Social | Nome Fantasia — sem Lista */}
          <div style={rowStyle}>
            <div style={colStyle('80px')}>
              <label style={labelStyle}>Código</label>
              <input
                value={fornecedor?.id ?? 'Auto'}
                readOnly
                style={{ ...inputStyle, background: '#f0f4f7', color: '#5a84a6' }}
              />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Razão Social *</label>
              <input
                name="razao"
                value={form.razao}
                onChange={handleChange}
                readOnly={readOnly}
                placeholder="Razão Social"
                style={{ ...inputStyle, borderColor: erros.razao ? '#dc2626' : '#dde8f0' }}
              />
              {erros.razao && <span style={erroStyle}>{erros.razao}</span>}
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Nome Fantasia</label>
              <input
                name="fantasia"
                value={form.fantasia ?? ''}
                onChange={handleChange}
                readOnly={readOnly}
                placeholder="Nome Fantasia"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 2: Endereço | Número | Bairro | CEP */}
          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>Endereço</label>
              <input name="end" value={form.end ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="Endereço" style={inputStyle} />
            </div>
            <div style={colStyle('80px')}>
              <label style={labelStyle}>Número</label>
              <input name="num" value={form.num ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="Nº" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Bairro</label>
              <input name="bairro" value={form.bairro ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="Bairro" style={inputStyle} />
            </div>
            <div style={colStyle('110px')}>
              <label style={labelStyle}>CEP</label>
              <input
                name="cep"
                value={form.cep ?? ''}
                onChange={handleChange}
                readOnly={readOnly}
                placeholder="00000-000"
                style={{ ...inputStyle, borderColor: erros.cep ? '#dc2626' : '#dde8f0' }}
              />
              {erros.cep && <span style={erroStyle}>{erros.cep}</span>}
            </div>
          </div>

          {/* Row 3: UF | Cidade | CNPJ + botão Consultar | CPF | I. Estadual */}
          <div style={rowStyle}>
            <div style={colStyle('80px')}>
              <label style={labelStyle}>UF</label>
              <select
                name="uf"
                value={form.uf ?? ''}
                onChange={handleUFChange}
                disabled={readOnly}
                style={selectStyle}
              >
                <option value="">UF</option>
                {ufs.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            <div style={colStyle()}>
              <label style={labelStyle}>Cidade</label>
              <select
                name="cidade"
                value={form.cidade ?? ''}
                onChange={handleChange}
                disabled={readOnly || cidades.length === 0}
                style={selectStyle}
              >
                <option value="">
                  {cidades.length === 0 ? 'Selecione a UF' : 'Selecione a cidade'}
                </option>
                {cidades.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* CNPJ + botão Consultar — minWidth maior para caber 00.000.000/0000-00 */}
            <div style={{ ...colStyle(), minWidth: '200px' }}>
              <label style={labelStyle}>CNPJ</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  name="cnpj"
                  value={form.cnpj ?? ''}
                  onChange={handleChange}
                  readOnly={readOnly}
                  placeholder="Digite o CNPJ sem pontuação"
                  style={{
                    ...inputStyle,
                    flex: 1,
                    borderColor: erros.cnpj ? '#dc2626' : '#dde8f0',
                    color: form.cnpj ? '#3a6080' : '#9ab0c4',
                  }}
                />
                {/* Botão Consultar — visível em novo e editar, não em visualizar */}
                {!readOnly && (
                  <button
                    onClick={consultarCNPJ}
                    disabled={consultando}
                    title="Consultar CNPJ nas bases públicas"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '0 8px',
                      height: '28px',
                      fontSize: '10px',
                      fontWeight: 700,
                      fontFamily: 'Tahoma, Geneva, sans-serif',
                      background: consultando ? '#e8f0f7' : '#1a6094',
                      color: consultando ? '#5a84a6' : '#ffffff',
                      border: '1px solid #1a6094',
                      borderRadius: '4px',
                      cursor: consultando ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {consultando ? (
                      <>
                        <i className="ti ti-loader-2" style={{ fontSize: '12px' }} aria-hidden="true" />
                        Consultando...
                      </>
                    ) : (
                      <>
                        <i className="ti ti-search" style={{ fontSize: '12px' }} aria-hidden="true" />
                        Consultar
                      </>
                    )}
                  </button>
                )}
              </div>
              {/* Erro de validação do CNPJ */}
              {erros.cnpj && <span style={erroStyle}>{erros.cnpj}</span>}
              {/* Erro inline da consulta API */}
              {erroCnpj && (
                <span style={{ ...erroStyle, color: '#b45309' }}>{erroCnpj}</span>
              )}
            </div>

            <div style={colStyle()}>
              <label style={labelStyle}>CPF</label>
              <input name="cpf" value={form.cpf ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="000.000.000-00" style={inputStyle} />
            </div>

            <div style={colStyle()}>
              <label style={labelStyle}>I. Estadual</label>
              <input name="ie" value={form.ie ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="I. Estadual" style={inputStyle} />
            </div>
          </div>

          {/* Row 4: Telefone 1 | Telefone 2 | Contato | Fone Contato */}
          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>Telefone 1</label>
              <input name="fone1" value={form.fone1 ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="(00) 00000-0000" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Telefone 2</label>
              <input name="fone2" value={form.fone2 ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="(00) 00000-0000" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Contato</label>
              <input name="contato" value={form.contato ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="Nome do contato" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Fone Contato</label>
              <input name="fone_contato" value={form.fone_contato ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="(00) 00000-0000" style={inputStyle} />
            </div>
          </div>

          {/* Row 5: E-mail | E-mail Contato | Website */}
          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>E-mail</label>
              <input name="email" value={form.email ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="email@empresa.com.br" type="email" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>E-mail Contato</label>
              <input name="email_contato" value={form.email_contato ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="contato@empresa.com.br" type="email" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>Website</label>
              <input name="website" value={form.website ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="www.empresa.com.br" style={inputStyle} />
            </div>
          </div>

          {/* Row 6: Data de Nascimento | Tipo de Fornecedor (Módulo Relatórios, 2.6) */}
          <div style={rowStyle}>
            <div style={colStyle('180px')}>
              <label style={labelStyle}>Data de Nascimento</label>
              <input
                name="data_nascimento"
                value={form.data_nascimento ?? ''}
                onChange={handleChange}
                readOnly={readOnly}
                type="date"
                style={inputStyle}
              />
            </div>
            <div style={colStyle('260px')}>
              <label style={labelStyle}>Tipo de Fornecedor</label>
              {/* Classificação usada pelo relatório "Gastos por tipo de
                  fornecedor" — opcional, fica "Não classificado" (null)
                  até o usuário definir manualmente. Lista de categorias
                  agora é dinâmica (fornecedor_categorias), gerenciável
                  pelo usuário via CategoriasModal.tsx (Seção 4) — a lista
                  em si (prop `categorias`) vem de app/fornecedores/page.tsx,
                  buscada uma única vez para a tela inteira */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  name="tipo_fornecedor_id"
                  value={form.tipo_fornecedor_id ?? ''}
                  onChange={handleTipoFornecedorChange}
                  disabled={readOnly}
                  style={{ ...selectStyle, flex: 1 }}
                >
                  <option value="">Não classificado</option>
                  {categorias.map(categoria => (
                    <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                  ))}
                </select>
                {/* Link "Gerenciar categorias" — oculto em modo visualizar,
                    abre CategoriasModal.tsx por cima deste modal (Seção 4.6) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setCategoriasModalAberto(true)}
                    title="Gerenciar categorias de fornecedor"
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      fontFamily: 'Tahoma, Geneva, sans-serif',
                      background: '#ffffff',
                      color: '#1a6094',
                      border: '1px solid #1a6094',
                      borderRadius: '4px',
                      padding: '0 8px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <i className="ti ti-settings" style={{ fontSize: '11px', marginRight: '3px' }} aria-hidden="true" />
                    Gerenciar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid #dde8f0', margin: '12px 0' }} />

          {/* WhatsApp Business — reutilizado de Clientes. suportaFavorito só
              fica true com fornecedor já salvo (Seção 2.3 depende de
              fornecedor.id) — em modo 'novo' cai para false automaticamente
              e a nota abaixo explica o motivo */}
          <WhatsAppSection
            contatos={form.contato_whatsapp ?? []}
            onChange={handleWhatsApp}
            readOnly={readOnly}
            suportaFavorito={fornecedorSalvo}
            onDefinirFavorito={handleDefinirFavoritoWhatsApp}
            notaFavoritoIndisponivel={
              !fornecedorSalvo && !readOnly
                ? 'Salve o fornecedor primeiro para marcar um contato como favorito.'
                : undefined
            }
          />
          {/* Erro inline da ação de favoritar — nunca alert()/confirm() */}
          {erroFavoritoWhatsApp && (
            <p style={{ ...erroStyle, marginTop: '4px' }}>{erroFavoritoWhatsApp}</p>
          )}

          {/* Dados Bancários — inclui o bloco "Chaves Pix" (Seção 1.6),
              posicionado acima do textarea de dados_bancarios (Ponto
              discricionário 1 da especificação — ambos os lados são
              aceitáveis, desde que dentro desta seção) */}
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Dados Bancários</label>

            {/* ── Bloco Chaves Pix ── */}
            <div
              style={{
                background: '#f0f7fc',
                border: '1px solid #c4d8eb',
                borderRadius: '6px',
                padding: '10px 12px',
                marginTop: '4px',
                marginBottom: '8px',
                fontFamily: 'Tahoma, Geneva, sans-serif',
              }}
            >
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
                    color: '#1a6094',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Chaves Pix
                </span>
                {/* Botão "Adicionar chave" — só com fornecedor salvo, fora de
                    modo visualizar, e formulário de adição ainda fechado */}
                {!readOnly && fornecedorSalvo && !adicionandoChavePix && (
                  <button
                    type="button"
                    onClick={() => setAdicionandoChavePix(true)}
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      fontFamily: 'Tahoma, Geneva, sans-serif',
                      background: '#ffffff',
                      color: '#1a6094',
                      border: '1px solid #1a6094',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    + Adicionar chave
                  </button>
                )}
              </div>

              {/* Nota — indisponível em modo 'novo' (sem fornecedor.id ainda) */}
              {!fornecedorSalvo && (
                <p style={{ fontSize: '10px', color: '#5a84a6', fontStyle: 'italic', margin: 0 }}>
                  Salve o fornecedor primeiro para cadastrar chaves Pix.
                </p>
              )}

              {/* Erro inline — nunca alert()/confirm() */}
              {fornecedorSalvo && erroChavePix && (
                <p style={{ ...erroStyle, marginBottom: '6px' }}>{erroChavePix}</p>
              )}

              {/* Lista de chaves existentes */}
              {fornecedorSalvo && carregandoChavesPix && (
                <p style={{ fontSize: '10px', color: '#5a84a6', margin: 0 }}>Carregando chaves Pix...</p>
              )}
              {fornecedorSalvo && !carregandoChavesPix && chavesPix.length === 0 && !adicionandoChavePix && (
                <p style={{ fontSize: '10px', color: '#5a84a6', margin: 0 }}>Nenhuma chave Pix cadastrada.</p>
              )}
              {fornecedorSalvo && !carregandoChavesPix && chavesPix.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {chavesPix.map(chave => (
                    <div
                      key={chave.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        background: '#ffffff',
                        border: '1px solid #c4d8eb',
                        borderRadius: '4px',
                        gap: '6px',
                      }}
                    >
                      {editandoChaveId === chave.id ? (
                        // ── Modo edição inline (tipo + valor) ──
                        <>
                          <select
                            value={edicaoTipoChave}
                            onChange={e => setEdicaoTipoChave(e.target.value as TipoChavePix)}
                            disabled={processandoChavePix}
                            style={{ ...selectStyle, width: 'auto', flexShrink: 0 }}
                          >
                            {OPCOES_TIPO_CHAVE_PIX.map(op => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={edicaoValorChave}
                            onChange={e => setEdicaoValorChave(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleConfirmarEdicaoChave()}
                            disabled={processandoChavePix}
                            autoFocus
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          <button
                            onClick={handleConfirmarEdicaoChave}
                            disabled={processandoChavePix || !edicaoValorChave.trim()}
                            title="Confirmar"
                            style={{ ...btnPixStyle, color: '#15803d' }}
                          >
                            <i className="ti ti-check" aria-hidden="true" />
                          </button>
                          <button
                            onClick={handleCancelarEdicaoChave}
                            disabled={processandoChavePix}
                            title="Cancelar"
                            style={btnPixStyle}
                          >
                            <i className="ti ti-x" aria-hidden="true" />
                          </button>
                        </>
                      ) : confirmandoExcluirChaveId === chave.id ? (
                        // ── Confirmação inline de exclusão — nunca window.confirm() ──
                        <>
                          <span style={{ fontSize: '10px', color: '#b45309', flex: 1 }}>
                            Excluir esta chave Pix?
                          </span>
                          <button
                            onClick={() => handleExcluirChavePix(chave.id)}
                            disabled={processandoChavePix}
                            title="Confirmar exclusão"
                            style={{ ...btnPixStyle, color: '#dc2626', fontSize: '10px', width: 'auto', padding: '2px 6px' }}
                          >
                            Excluir
                          </button>
                          <button
                            onClick={() => setConfirmandoExcluirChaveId(null)}
                            disabled={processandoChavePix}
                            title="Cancelar"
                            style={{ ...btnPixStyle, fontSize: '10px', width: 'auto', padding: '2px 6px' }}
                          >
                            Não
                          </button>
                        </>
                      ) : (
                        // ── Linha padrão — toggle preferencial + tipo/valor + ações ──
                        <>
                          {/* Toggle preferencial — estilo rádio, mesmo padrão do favorito
                              WhatsApp (WhatsAppSection.tsx) */}
                          {!readOnly && (
                            <button
                              onClick={() => handleDefinirChavePreferencial(chave.id)}
                              disabled={processandoChavePix}
                              title={chave.preferencial ? 'Chave preferencial' : 'Definir como preferencial'}
                              aria-label={chave.preferencial ? 'Chave preferencial' : 'Definir como preferencial'}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '20px',
                                height: '20px',
                                padding: 0,
                                fontSize: '13px',
                                background: 'transparent',
                                border: 'none',
                                color: chave.preferencial ? '#f59e0b' : '#c4d8eb',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {chave.preferencial ? '★' : '☆'}
                            </button>
                          )}
                          {readOnly && chave.preferencial && (
                            <span style={{ color: '#f59e0b', fontSize: '13px' }}>★</span>
                          )}
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#1a6094', flexShrink: 0 }}>
                            {OPCOES_TIPO_CHAVE_PIX.find(op => op.value === chave.tipo_chave)?.label ?? chave.tipo_chave}
                          </span>
                          <span style={{ fontSize: '11px', color: '#2c4a60', flex: 1, wordBreak: 'break-all' }}>
                            {chave.valor_chave}
                          </span>
                          {!readOnly && (
                            <>
                              <button
                                onClick={() => handleIniciarEdicaoChave(chave)}
                                title="Editar chave"
                                style={btnPixStyle}
                              >
                                <i className="ti ti-writing" aria-hidden="true" />
                              </button>
                              <button
                                onClick={() => setConfirmandoExcluirChaveId(chave.id)}
                                title="Remover chave"
                                style={{ ...btnPixStyle, color: '#dc2626' }}
                              >
                                <i className="ti ti-trash" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Formulário "Adicionar chave" */}
              {fornecedorSalvo && adicionandoChavePix && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      value={novoTipoChave}
                      onChange={e => setNovoTipoChave(e.target.value as TipoChavePix)}
                      disabled={processandoChavePix}
                      style={{ ...selectStyle, width: 'auto', flexShrink: 0 }}
                    >
                      {OPCOES_TIPO_CHAVE_PIX.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Valor da chave"
                      value={novoValorChave}
                      onChange={e => setNovoValorChave(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAdicionarChavePix()}
                      disabled={processandoChavePix}
                      autoFocus
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={handleAdicionarChavePix}
                      disabled={processandoChavePix || !novoValorChave.trim()}
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'Tahoma, Geneva, sans-serif',
                        background: '#1a6094',
                        color: '#ffffff',
                        border: '1px solid #1a6094',
                        borderRadius: '4px',
                        padding: '4px 12px',
                        cursor: processandoChavePix || !novoValorChave.trim() ? 'not-allowed' : 'pointer',
                        opacity: processandoChavePix || !novoValorChave.trim() ? 0.6 : 1,
                      }}
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => { setAdicionandoChavePix(false); setNovoValorChave(''); setNovoTipoChave('cpf') }}
                      disabled={processandoChavePix}
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

            <textarea
              name="dados_bancarios"
              value={form.dados_bancarios ?? ''}
              onChange={handleChange}
              readOnly={readOnly}
              placeholder="BRADESCO - AG: 0000-0 - C/C: 00000-0"
              rows={2}
              style={{ ...inputStyle, height: 'auto', minHeight: '56px', width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 8px' }}
            />
          </div>

          {/* Observações */}
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Observações</label>
            <textarea
              name="observacoes"
              value={form.observacoes ?? ''}
              onChange={handleChange}
              readOnly={readOnly}
              placeholder="Observações..."
              rows={3}
              style={{ ...inputStyle, height: 'auto', minHeight: '56px', width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 8px' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            background: '#f7fafc',
            borderTop: '1px solid #dde8f0',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
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
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>

          {!readOnly && (
            <button
              onClick={handleSalvar}
              disabled={salvando}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'Tahoma, Geneva, sans-serif',
                background: '#1a6094',
                color: '#ffffff',
                border: '1px solid #1a6094',
                borderRadius: '5px',
                cursor: salvando ? 'wait' : 'pointer',
                opacity: salvando ? 0.7 : 1,
              }}
            >
              <i className="ti ti-device-floppy" style={{ fontSize: '14px' }} aria-hidden="true" />
              {salvando ? 'Salvando...' : '💾 Gravar'}
            </button>
          )}
        </div>
      </div>
    </div>

    {/* CategoriasModal — segundo overlay independente, aberto por cima
        deste (Seção 4.6). onCategoriasAlteradas repassa direto o
        callback recebido do pai (app/fornecedores/page.tsx), que é
        quem detém a lista `categorias` e faz o re-fetch */}
    <CategoriasModal
      aberto={categoriasModalAberto}
      categorias={categorias}
      onFechar={() => setCategoriasModalAberto(false)}
      onCategoriasAlteradas={onCategoriasAlteradas}
    />
    </>
  )
}

// ============================================================
// Estilos auxiliares
// ============================================================
const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '8px',
  flexWrap: 'wrap',
}

function colStyle(width?: string): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flex: width ? `0 0 ${width}` : 1,
    minWidth: width ?? '80px',
  }
}

const labelStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  color: '#1a6094',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontFamily: 'Tahoma, Geneva, sans-serif',
}

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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const erroStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#dc2626',
  fontFamily: 'Tahoma, Geneva, sans-serif',
}

// Botão de ação pequeno (editar/excluir/confirmar) das linhas do
// bloco Chaves Pix — mesmo padrão de btnAcaoStyle em FornecedoresTabela.tsx
const btnPixStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '22px',
  height: '22px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: '3px',
  fontSize: '12px',
  color: '#1a6094',
  flexShrink: 0,
}
