// ============================================================
// components/clientes/ClientesModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Modal completo para Novo Cliente, Editar Cliente
//         e Visualizar Cliente (read-only)
//         Contém todos os campos do spec + validações + WhatsApp
// Conecta com: app/clientes/page.tsx (modo, cliente, onFechar, onSalvo)
//              clientesService.ts (criarCliente, editarCliente)
//              localidades.ts (getUFs, getCidades)
//              WhatsAppSection.tsx (contatos WhatsApp)
//              types/clientes.ts (Cliente, ModoModal, OPCOES_LISTA)
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { criarCliente, editarCliente, verificarDuplicidadeCliente } from '@/lib/clientesService'
import { getUFs, getCidades } from '@/lib/localidades'
import WhatsAppSection from './WhatsAppSection'
import type { Cliente, ClienteInsert, ContatoWhatsApp, ModoModal } from '@/types/clientes'
import { OPCOES_LISTA } from '@/types/clientes'

// ============================================================
// Props
// ============================================================
interface ClientesModalProps {
  modo: ModoModal                        // 'novo' | 'editar' | 'visualizar' | null
  cliente?: Cliente | null               // Cliente pré-preenchido (editar/visualizar)
  onFechar: () => void                   // Fecha o modal sem salvar
  onSalvo: () => void                    // Callback após salvar — recarrega lista
}

// ============================================================
// Estado inicial do formulário (cliente em branco)
// ============================================================
const FORM_INICIAL: ClienteInsert = {
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
  nomelista: '1',
  observacoes: '',
  contato_whatsapp: [],
  telefone_whatsapp: '',
  data_nascimento: '',
}

// ============================================================
// Helpers de normalização de dados
// Aplicados ao payload antes de enviar ao Supabase em handleSalvar
// Garante consistência no banco independente de como o usuário digitou
// Mesmo padrão usado em FornecedoresModal.tsx
// ============================================================

// normalizarTexto — remove espaços extras nas bordas
function normalizarTexto(s: string): string {
  return (s ?? '').trim()
}

// normalizarEmail — minúsculas + trim
// "Vendas@Empresa.COM.BR" e "vendas@empresa.com.br" são o mesmo endereço
function normalizarEmail(s: string): string {
  return (s ?? '').trim().toLowerCase()
}

// normalizarUF — maiúsculas + trim (segurança contra entrada manual em minúsculas)
function normalizarUF(s: string): string {
  return (s ?? '').trim().toUpperCase()
}

// ============================================================
// ClientesModal
// ============================================================
export default function ClientesModal({
  modo,
  cliente,
  onFechar,
  onSalvo,
}: ClientesModalProps) {

  // Estado do formulário
  const [form, setForm] = useState<ClienteInsert>(FORM_INICIAL)

  // Lista de cidades filtrada pela UF selecionada
  const [cidades, setCidades] = useState<string[]>([])

  // Estado de loading durante o save
  const [salvando, setSalvando] = useState(false)

  // Erros de validação por campo
  const [erros, setErros] = useState<Record<string, string>>({})

  // Lista de UFs carregada uma vez
  const ufs = getUFs()

  // Read-only quando modo é 'visualizar'
  const readOnly = modo === 'visualizar'

  // ============================================================
  // Efeito: pré-preenche o formulário ao abrir
  // ============================================================
  useEffect(() => {
    if (modo === 'novo') {
      setForm(FORM_INICIAL) // eslint-disable-line react-hooks/set-state-in-effect
      setCidades([])
      setErros({})
    } else if ((modo === 'editar' || modo === 'visualizar') && cliente) {
      setForm({
        razao: cliente.razao ?? '',
        fantasia: cliente.fantasia ?? '',
        end: cliente.end ?? '',
        num: cliente.num ?? '',
        bairro: cliente.bairro ?? '',
        cep: cliente.cep ?? '',
        cidade: cliente.cidade ?? '',
        uf: cliente.uf ?? '',
        cnpj: cliente.cnpj ?? '',
        cpf: cliente.cpf ?? '',
        ie: cliente.ie ?? '',
        fone1: cliente.fone1 ?? '',
        fone2: cliente.fone2 ?? '',
        contato: cliente.contato ?? '',
        fone_contato: cliente.fone_contato ?? '',
        email: cliente.email ?? '',
        email_contato: cliente.email_contato ?? '',
        nomelista: cliente.nomelista ?? '1',
        observacoes: cliente.observacoes ?? '',
        contato_whatsapp: cliente.contato_whatsapp ?? [],
        telefone_whatsapp: cliente.telefone_whatsapp ?? '',
        data_nascimento: cliente.data_nascimento ?? '',
      })
      // Carrega cidades da UF do cliente
      if (cliente.uf) setCidades(getCidades(cliente.uf))
      setErros({})
    }
  }, [modo, cliente])

  // ============================================================
  // handleChange
  // Atualiza campo do formulário pelo nome
  // ============================================================
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    // Limpa erro do campo ao digitar
    if (erros[name]) setErros(prev => ({ ...prev, [name]: '' }))
  }

  // ============================================================
  // handleUFChange
  // Atualiza UF e recarrega lista de cidades
  // ============================================================
  function handleUFChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const uf = e.target.value
    setForm(prev => ({ ...prev, uf, cidade: '' }))
    setCidades(getCidades(uf))
  }

  // ============================================================
  // handleWhatsApp
  // Atualiza array de contatos WhatsApp
  // ============================================================
  function handleWhatsApp(contatos: ContatoWhatsApp[]) {
    setForm(prev => ({ ...prev, contato_whatsapp: contatos }))
  }

  // ============================================================
  // validar
  // Valida campos obrigatórios e formatos
  // Retorna true se válido
  // ============================================================
  function validar(): boolean {
    const novosErros: Record<string, string> = {}

    // Razão Social obrigatória
    if (!form.razao.trim()) {
      novosErros.razao = 'Razão Social é obrigatória.'
    }

    // CNPJ ou CPF — ao menos um deve estar preenchido
    const cnpjLimpo = (form.cnpj ?? '').replace(/[^0-9]/g, '')
    const cpfLimpo = (form.cpf ?? '').replace(/[^0-9]/g, '')
    if (!cnpjLimpo && !cpfLimpo) {
      novosErros.cnpj = 'Informe o CNPJ ou CPF.'
    }

    // CEP formato 00000-000 (se preenchido)
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
  // ============================================================
  async function handleSalvar() {
    if (!validar()) return
    setSalvando(true)
    try {
      // Monta payload normalizado — trim em todos os campos de texto,
      // lowercase em e-mails, '' → null em data_nascimento (Postgres rejeita
      // string vazia em coluna date)
      const payload: ClienteInsert = {
        razao:             normalizarTexto(form.razao),
        fantasia:          normalizarTexto(form.fantasia ?? ''),
        end:               normalizarTexto(form.end ?? ''),
        num:               normalizarTexto(form.num ?? ''),
        bairro:            normalizarTexto(form.bairro ?? ''),
        cep:               normalizarTexto(form.cep ?? ''),
        uf:                normalizarUF(form.uf ?? ''),
        cidade:            normalizarTexto(form.cidade ?? ''),
        cnpj:              normalizarTexto(form.cnpj ?? ''),
        cpf:               normalizarTexto(form.cpf ?? ''),
        ie:                normalizarTexto(form.ie ?? ''),
        fone1:             normalizarTexto(form.fone1 ?? ''),
        fone2:             normalizarTexto(form.fone2 ?? ''),
        contato:           normalizarTexto(form.contato ?? ''),
        fone_contato:      normalizarTexto(form.fone_contato ?? ''),
        email:             normalizarEmail(form.email ?? ''),          // lowercase
        email_contato:     normalizarEmail(form.email_contato ?? ''),  // lowercase
        nomelista:         form.nomelista ?? '1',                      // valor controlado — não normalizar
        observacoes:       normalizarTexto(form.observacoes ?? ''),
        contato_whatsapp:  form.contato_whatsapp ?? [],
        telefone_whatsapp: normalizarTexto(form.telefone_whatsapp ?? ''),
        // data_nascimento: '' → null (Postgres rejeita string vazia em coluna date)
        data_nascimento: form.data_nascimento?.trim() !== '' ? form.data_nascimento : null,
      }

      // Verifica duplicidade de CNPJ/CPF antes de salvar
      // excludeId: ignora o próprio registro em caso de edição
      const excludeId = modo === 'editar' && cliente ? cliente.id : undefined
      const duplicado = await verificarDuplicidadeCliente(
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
        await criarCliente(payload)
      } else if (modo === 'editar' && cliente) {
        await editarCliente({ ...payload, id: cliente.id })
      }
      onSalvo()
      onFechar()
    } catch (err: unknown) {
      alert(`Erro ao salvar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
      console.error(err)
    } finally {
      setSalvando(false)
    }
  }

  // Não renderiza se modo for null
  if (!modo) return null

  // ============================================================
  // Título do modal conforme modo
  // ============================================================
  const titulo =
    modo === 'novo'
      ? 'Novo Cliente'
      : modo === 'editar'
      ? 'Editar Cliente'
      : 'Visualizar Cliente'

  // ============================================================
  // Render
  // ============================================================
  return (
    // Overlay escuro
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
      {/* Card do modal */}
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
          {/* Row 1: Código | Razão Social | Nome Fantasia | Lista */}
          <div style={rowStyle}>
            {/* Código — auto, read-only */}
            <div style={colStyle('80px')}>
              <label style={labelStyle}>Código</label>
              <input
                value={cliente?.id ?? 'Auto'}
                readOnly
                style={{ ...inputStyle, background: '#f0f4f7', color: '#5a84a6' }}
              />
            </div>

            {/* Razão Social */}
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

            {/* Nome Fantasia */}
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

            {/* Lista */}
            <div style={colStyle('110px')}>
              <label style={labelStyle}>Lista</label>
              <select
                name="nomelista"
                value={form.nomelista}
                onChange={handleChange}
                disabled={readOnly}
                style={selectStyle}
              >
                {OPCOES_LISTA.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
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
            {/* UF */}
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

            {/* Cidade */}
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

            {/* CNPJ */}
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

            {/* CPF */}
            <div style={colStyle()}>
              <label style={labelStyle}>CPF</label>
              <input name="cpf" value={form.cpf ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="000.000.000-00" style={inputStyle} />
            </div>

            {/* I. Estadual */}
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

          {/* Row 5: E-mail | E-mail Contato */}
          <div style={rowStyle}>
            <div style={colStyle()}>
              <label style={labelStyle}>E-mail</label>
              <input name="email" value={form.email ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="email@empresa.com.br" type="email" style={inputStyle} />
            </div>
            <div style={colStyle()}>
              <label style={labelStyle}>E-mail Contato</label>
              <input name="email_contato" value={form.email_contato ?? ''} onChange={handleChange} readOnly={readOnly} placeholder="contato@empresa.com.br" type="email" style={inputStyle} />
            </div>
          </div>

          {/* Row 6: Data de Nascimento — modal-only, nunca exibido na tabela/lista */}
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

          {/* Seção WhatsApp Business */}
          <WhatsAppSection
            contatos={form.contato_whatsapp ?? []}
            onChange={handleWhatsApp}
            readOnly={readOnly}
          />

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
          {/* Cancelar / Fechar */}
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

          {/* Gravar — oculto em modo visualizar */}
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
