// ============================================================
// components/fornecedores/FornecedoresModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Fornecedores
// Função: Modal completo Novo/Editar/Visualizar Fornecedor
//         Clone de ClientesModal.tsx — SEM dropdown Lista,
//         COM Website, Dados Bancários e Data de Nascimento
// Conecta com: app/fornecedores/page.tsx (modo, fornecedor, onFechar, onSalvo)
//              fornecedoresService.ts (criarFornecedor, editarFornecedor)
//              lib/localidades.ts (getUFs, getCidades — reutilizado de Clientes)
//              WhatsAppSection.tsx (reutilizado de Clientes — sem alteração)
//              types/fornecedores.ts (Fornecedor, ModoModal)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { criarFornecedor, editarFornecedor } from '@/lib/fornecedoresService'
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
// Estado inicial do formulário (fornecedor em branco)
// Sem nomelista — não existe neste módulo
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

  const ufs = getUFs()
  const readOnly = modo === 'visualizar'

  // ============================================================
  // Efeito: pré-preenche o formulário ao abrir
  // ============================================================
  useEffect(() => {
    if (modo === 'novo') {
      setForm(FORM_INICIAL)
      setCidades([])
      setErros({})
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
  // validar
  // Mesma regra de Clientes: Razão Social obrigatória, CNPJ ou CPF
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
      if (modo === 'novo') {
        await criarFornecedor(form)
      } else if (modo === 'editar' && fornecedor) {
        await editarFornecedor({ ...form, id: fornecedor.id })
      }
      onSalvo()
      onFechar()
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`)
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
        {/* Header do modal */}
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
        <div
          style={{
            overflowY: 'auto',
            padding: '16px',
            flex: 1,
          }}
        >
          {/* Row 1: Código | Razão Social | Nome Fantasia — SEM Lista */}
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

          {/* Row 3: UF | Cidade | CNPJ | CPF | I. Estadual */}
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

            <div style={colStyle()}>
              <label style={labelStyle}>CNPJ</label>
              <input
                name="cnpj"
                value={form.cnpj ?? ''}
                onChange={handleChange}
                readOnly={readOnly}
                placeholder="00.000.000/0000-00"
                style={{ ...inputStyle, borderColor: erros.cnpj ? '#dc2626' : '#dde8f0' }}
              />
              {erros.cnpj && <span style={erroStyle}>{erros.cnpj}</span>}
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

          {/* Row 5: E-mail | E-mail Contato | Website (campo novo) */}
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

          {/* Row 6: Data de Nascimento — modal-only, campo novo */}
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

          {/* Seção WhatsApp Business — componente reutilizado de Clientes, sem alteração */}
          <WhatsAppSection
            contatos={form.contato_whatsapp ?? []}
            onChange={handleWhatsApp}
            readOnly={readOnly}
          />

          {/* Dados Bancários — campo novo, mesmo tratamento visual de Observações */}
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Dados Bancários</label>
            <textarea
              name="dados_bancarios"
              value={form.dados_bancarios ?? ''}
              onChange={handleChange}
              readOnly={readOnly}
              placeholder="BRADESCO - AG: 0000-0 - C/C: 00000-0"
              rows={2}
              style={{
                ...inputStyle,
                height: 'auto',
                minHeight: '56px',
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                padding: '6px 8px',
              }}
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
              style={{
                ...inputStyle,
                height: 'auto',
                minHeight: '56px',
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                padding: '6px 8px',
              }}
            />
          </div>
        </div>

        {/* Footer sticky */}
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
// Estilos auxiliares — idênticos ao ClientesModal.tsx
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
