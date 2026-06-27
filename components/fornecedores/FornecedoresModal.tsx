// ============================================================
// components/fornecedores/FornecedoresModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Modal completo Novo/Editar/Visualizar Fornecedor
//         COM CNPJ Auto-Fill via BrasilAPI (primary) + CNPJá (fallback)
//         Funciona em modo 'novo' e 'editar' — conforme aprovado
// Conecta com: app/fornecedores/page.tsx
//              fornecedoresService.ts, lib/localidades.ts
//              WhatsAppSection.tsx (reutilizado de Clientes)
//              types/fornecedores.ts
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { criarFornecedor, editarFornecedor, verificarDuplicidadeFornecedor } from '@/lib/fornecedoresService'
import { getUFs, getCidades } from '@/lib/localidades'
import WhatsAppSection from '@/components/clientes/WhatsAppSection'
import type { Fornecedor, FornecedorInsert, ContatoWhatsApp, ModoModal } from '@/types/fornecedores'

// ============================================================
// Props
// ============================================================
interface FornecedoresModalProps {
  modo: ModoModal
  fornecedor?: Fornecedor | null
  onFechar: () => void
  onSalvo: () => void
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
// FornecedoresModal
// ============================================================
export default function FornecedoresModal({
  modo,
  fornecedor,
  onFechar,
  onSalvo,
}: FornecedoresModalProps) {

  const [form, setForm] = useState<FornecedorInsert>(FORM_INICIAL)
  const [cidades, setCidades] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Estados do CNPJ Auto-Fill
  const [consultando, setConsultando] = useState(false)
  const [erroCnpj, setErroCnpj] = useState<string>('')

  const ufs = getUFs()
  const readOnly = modo === 'visualizar'

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
  // handleWhatsApp
  // ============================================================
  function handleWhatsApp(contatos: ContatoWhatsApp[]) {
    setForm(prev => ({ ...prev, contato_whatsapp: contatos }))
  }

  // ============================================================
  // aplicarDadosAPI
  // Aplica os dados retornados da API no formulário
  // ============================================================
  function aplicarDadosAPI(dados: Partial<FornecedorInsert>) {
    setForm(prev => ({ ...prev, ...dados }))
    // Atualiza cidades se UF foi preenchida
    if (dados.uf) setCidades(getCidades(dados.uf))
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
  // ============================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapBrasilAPI(json: any, cnpjLimpo: string): Partial<FornecedorInsert> {
    const cep = (json.cep ?? '').replace(/\D/g, '')
    const ddd = json.ddd_telefone_1 ?? ''

    return {
      razao: json.razao_social ?? '',
      fantasia: json.nome_fantasia && json.nome_fantasia.trim() !== '' ? json.nome_fantasia : '',
      cnpj: mascaraCNPJ(cnpjLimpo),
      end: json.logradouro ?? '',
      num: json.numero ?? '',
      bairro: json.bairro ?? '',
      cep: mascaraCEP(cep),
      uf: json.uf ?? '',
      cidade: json.municipio ?? '',
      email: json.email ?? '',
      fone1: ddd ? mascaraTelefone(ddd.replace(/\D/g, '')) : '',
    }
  }

  // ============================================================
  // mapCNPJa — mapeia resposta CNPJá → campos do form
  // ============================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapCNPJa(json: any, cnpjLimpo: string): Partial<FornecedorInsert> {
    const addr = json.address ?? {}
    const cep = (addr.zip ?? '').replace(/\D/g, '')
    const phone = json.phones?.[0]
    const fone1 = phone
      ? mascaraTelefone(`${phone.area ?? ''}${phone.number ?? ''}`)
      : ''

    // IE: busca em registrations pelo estado
    const uf = addr.state ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regIE = json.registrations?.find((r: any) => r.state === uf)
    const ie = regIE?.number ?? ''

    return {
      razao: json.company?.name ?? '',
      fantasia: json.alias && json.alias.trim() !== '' ? json.alias : '',
      cnpj: mascaraCNPJ(cnpjLimpo),
      end: addr.street ?? '',
      num: addr.number ?? '',
      bairro: addr.district ?? '',
      cep: mascaraCEP(cep),
      uf,
      cidade: addr.city ?? '',
      email: json.emails?.[0]?.address ?? '',
      fone1,
      ie,
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
  // ============================================================
  async function handleSalvar() {
    if (!validar()) return
    setSalvando(true)
    try {
      // Verifica duplicidade de CNPJ/CPF antes de salvar
      // excludeId: ignora o próprio registro em caso de edição
      const excludeId = modo === 'editar' && fornecedor ? fornecedor.id : undefined
      const duplicado = await verificarDuplicidadeFornecedor(
        form.cnpj ?? '',
        form.cpf ?? '',
        excludeId
      )
      if (duplicado) {
        setSalvando(false)
        setErros({ cnpj: `CNPJ/CPF já cadastrado para: ${duplicado.razao} (Cód. ${duplicado.id})` })
        return
      }
      if (modo === 'novo') {
        await criarFornecedor(form)
      } else if (modo === 'editar' && fornecedor) {
        await editarFornecedor({ ...form, id: fornecedor.id })
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
  // ============================================================
  return (
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
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
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

            {/* CNPJ + botão Consultar */}
            <div style={colStyle()}>
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

          {/* Row 6: Data de Nascimento — modal-only */}
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
          </div>

          {/* Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid #dde8f0', margin: '12px 0' }} />

          {/* WhatsApp Business — reutilizado de Clientes */}
          <WhatsAppSection
            contatos={form.contato_whatsapp ?? []}
            onChange={handleWhatsApp}
            readOnly={readOnly}
          />

          {/* Dados Bancários */}
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Dados Bancários</label>
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
