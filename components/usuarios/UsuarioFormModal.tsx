// ============================================================
// components/usuarios/UsuarioFormModal.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Modal Novo/Editar Usuário — duas abas (Dados/Permissões),
//         padrão de abas NOVO para este projeto (nenhum outro
//         módulo tem abas — Especificação §9, "genuinely new UI
//         pattern"), construído o mais simples possível, sem
//         animação, seguindo a linguagem visual já estabelecida.
//         Salvar único para a tela toda (Dados + Permissões juntos)
//         — decisão confirmada por Maycon em sessão de build.
// Conecta com: app/usuarios/page.tsx, lib/supabase.ts (token Bearer),
//              types/usuarios.ts, pages/api/usuarios/criar.ts,
//              pages/api/usuarios/atualizar.ts,
//              pages/api/usuarios/atualizar-permissoes.ts
// ============================================================

'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { senhaValida, emailValido, validarCpfCnpj, gerarSenhaAleatoria } from '@/lib/validacoesUsuarios'
import type {
  Usuario,
  UsuarioPermissao,
  UsuarioInsert,
  ModuloPermissao,
  AcaoPermissao,
  PermissaoTogglePayload,
} from '@/types/usuarios'
import { MODULO_PERMISSAO_LABELS, ACAO_PERMISSAO_LABELS } from '@/types/usuarios'

// ============================================================
// Constantes locais — mesma ordem fixa de lib/usuariosService.ts
// (MODULOS_FIXOS / ACOES_FIXAS), duplicadas aqui porque são só
// para renderização da UI, não lógica de negócio
// ============================================================
const MODULOS_FIXOS: ModuloPermissao[] = [
  'clientes', 'fornecedores', 'receitas', 'contas_receber',
  'despesas', 'contas_a_pagar', 'relatorios', 'usuarios',
  'dashboard', 'backup',
]
const ACOES_FIXAS: AcaoPermissao[] = ['criar', 'editar', 'excluir', 'exportar', 'visualizar']

// ============================================================
// Props
// ============================================================
interface UsuarioFormModalProps {
  modo: 'novo' | 'editar'
  usuarioInicial?: Usuario | null           // Preenchido quando modo === 'editar'
  permissoesIniciais?: UsuarioPermissao[] | null  // Preenchido quando modo === 'editar' (50 linhas)
  onFechar: () => void
  onSalvo: () => void                       // Chamado após salvar com sucesso — recarrega a lista e fecha
}

// ============================================================
// Formulário Dados — estado inicial
// ============================================================
interface FormDados {
  nome_completo: string
  username: string
  cpf_cnpj: string
  data_nascimento: string
  celular_whatsapp: string
  email_pessoal: string
  status: 'ativo' | 'inativo'
}

const FORM_DADOS_INICIAL: FormDados = {
  nome_completo: '',
  username: '',
  cpf_cnpj: '',
  data_nascimento: '',
  celular_whatsapp: '',
  email_pessoal: '',
  status: 'ativo',
}

// ============================================================
// mascaraTelefone()
// Mesma lógica de components/fornecedores/FornecedoresModal.tsx —
// reaproveitada aqui (não exportada de lá, é uma função local
// naquele arquivo também, então duplicar é consistente com o
// próprio padrão do projeto para esse tipo de helper de UI)
// ============================================================
function mascaraTelefone(tel: string): string {
  const d = tel.replace(/\D/g, '').slice(0, 11)
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  return d
}

// ============================================================
// derivarEmailTecnicoPreview()
// Mesma fórmula de lib/usuariosService.ts (derivarEmailTecnico) —
// duplicada aqui só para exibição ao vivo no formulário enquanto o
// Admin digita, sem chamar o servidor a cada tecla. O valor real
// gravado no banco é sempre recalculado no servidor, este é só um
// preview.
// ============================================================
function derivarEmailTecnicoPreview(username: string): string {
  return username ? `${username}@login.cerasbabinete.com.br` : ''
}

// ============================================================
// UsuarioFormModal
// ============================================================
export default function UsuarioFormModal({
  modo: modoInicial,
  usuarioInicial,
  permissoesIniciais,
  onFechar,
  onSalvo,
}: UsuarioFormModalProps) {

  // modo pode virar 'editar' internamente após uma criação bem
  // sucedida — permite abrir a aba Permissões sem fechar o modal
  const [modo, setModo] = useState<'novo' | 'editar'>(modoInicial)
  const [usuarioId, setUsuarioId] = useState<string | null>(usuarioInicial?.id ?? null)

  const [abaAtiva, setAbaAtiva] = useState<'dados' | 'permissoes'>('dados')

  const [form, setForm] = useState<FormDados>(
    usuarioInicial
      ? {
          nome_completo: usuarioInicial.nome_completo,
          username: usuarioInicial.username,
          cpf_cnpj: usuarioInicial.cpf_cnpj,
          data_nascimento: usuarioInicial.data_nascimento,
          celular_whatsapp: usuarioInicial.celular_whatsapp,
          email_pessoal: usuarioInicial.email_pessoal,
          status: usuarioInicial.status,
        }
      : FORM_DADOS_INICIAL,
  )

  // Mapa aninhado modulo -> acao -> permitido, inicializado a partir
  // das 50 linhas recebidas (ou vazio/tudo false se ainda não há
  // usuário criado)
  const [permissoes, setPermissoes] = useState<Record<string, Record<string, boolean>>>(() => {
    const mapa: Record<string, Record<string, boolean>> = {}
    for (const modulo of MODULOS_FIXOS) {
      mapa[modulo] = {}
      for (const acao of ACOES_FIXAS) {
        const linha = permissoesIniciais?.find(p => p.modulo === modulo && p.acao === acao)
        mapa[modulo][acao] = linha?.permitido ?? false
      }
    }
    return mapa
  })
  // Cópia do estado original de permissões — usada para calcular só
  // o que mudou, e enviar apenas o diff pra atualizar-permissoes.ts
  const [permissoesOriginais] = useState(permissoes)

  // ehAlvoAdmin removido — decisão original (Admin com permissões
  // fixas, não editáveis) foi revertida por Maycon em 26/08/2026.
  // Permissões do Admin agora são editáveis como as de qualquer
  // outro usuário, sem bloqueio nem aqui nem no servidor (ver
  // lib/usuariosService.ts, atualizarPermissoesUsuario())

  const [erros, setErros] = useState<Partial<Record<keyof FormDados, string>>>({})
  // Senha digitada pelo Admin na criação — não faz parte de FormDados
  // porque não é um campo espelhado 1:1 com a tabela usuarios (nunca
  // é lida de volta, só escrita). Decisão de 26/08/2026: sistema não
  // sorteia mais senha.
  const [senha, setSenha] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Mensagem de sucesso pós-criação — substitui a antiga tela de
  // "senha gerada" (não existe mais o que exibir: o Admin já sabe a
  // senha, pois foi ele quem digitou)
  const [sucessoCriacao, setSucessoCriacao] = useState(false)

  // ============================================================
  // obterToken() — mesmo padrão de app/pagar/page.tsx
  // ============================================================
  async function obterToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ============================================================
  // handleChange — atualiza um campo do formulário Dados
  // ============================================================
  function handleChange(campo: keyof FormDados, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }))
    setErros(prev => ({ ...prev, [campo]: undefined }))
  }

  // ============================================================
  // handleTogglePermissao — inverte um checkbox da matriz
  // ============================================================
  function handleTogglePermissao(modulo: ModuloPermissao, acao: AcaoPermissao) {
    setPermissoes(prev => ({
      ...prev,
      [modulo]: { ...prev[modulo], [acao]: !prev[modulo][acao] },
    }))
  }

  // ============================================================
  // handleToggleTodasDoModulo — checkbox "Todas" de um bloco de
  // módulo: se todas as 5 ações já estiverem marcadas, desmarca
  // todas; caso contrário, marca todas (item pedido por Maycon, 26/08/2026)
  // ============================================================
  function handleToggleTodasDoModulo(modulo: ModuloPermissao) {
    const todasMarcadas = ACOES_FIXAS.every(acao => permissoes[modulo][acao])
    setPermissoes(prev => ({
      ...prev,
      [modulo]: Object.fromEntries(ACOES_FIXAS.map(acao => [acao, !todasMarcadas])),
    }))
  }

  // ============================================================
  // handleToggleTodasGeral — checkbox "Todas" global, no topo da
  // aba Permissões: se absolutamente tudo já estiver marcado,
  // desmarca tudo; caso contrário, marca tudo (item pedido por
  // Maycon, 26/08/2026)
  // ============================================================
  function handleToggleTodasGeral() {
    const tudoMarcado = MODULOS_FIXOS.every(modulo => ACOES_FIXAS.every(acao => permissoes[modulo][acao]))
    const novoMapa: Record<string, Record<string, boolean>> = {}
    for (const modulo of MODULOS_FIXOS) {
      novoMapa[modulo] = Object.fromEntries(ACOES_FIXAS.map(acao => [acao, !tudoMarcado]))
    }
    setPermissoes(novoMapa)
  }

  // ============================================================
  // validarDados() — validação client-side, espelha (mas não
  // substitui) a validação server-side em pages/api/usuarios/*.ts
  // ============================================================
  function validarDados(): boolean {
    const novosErros: Partial<Record<keyof FormDados, string>> = {}
    if (!form.nome_completo.trim()) novosErros.nome_completo = 'Obrigatório'
    if (!form.username.trim()) novosErros.username = 'Obrigatório'
    if (!form.cpf_cnpj.trim()) novosErros.cpf_cnpj = 'Obrigatório'
    else if (!validarCpfCnpj(form.cpf_cnpj)) novosErros.cpf_cnpj = 'CPF/CNPJ inválido'
    if (!form.data_nascimento.trim()) novosErros.data_nascimento = 'Obrigatório'
    if (!form.celular_whatsapp.trim()) novosErros.celular_whatsapp = 'Obrigatório'
    if (!form.email_pessoal.trim()) novosErros.email_pessoal = 'Obrigatório'
    else if (!emailValido(form.email_pessoal)) novosErros.email_pessoal = 'E-mail inválido'

    setErros(novosErros)

    // Senha só é validada na criação — na edição, a troca de senha
    // acontece pelo fluxo de Resetar Senha, não por aqui
    let senhaOk = true
    if (modo === 'novo') {
      if (!senha.trim()) { setErroSenha('Obrigatório'); senhaOk = false }
      else if (!senhaValida(senha)) { setErroSenha('Mínimo de 6 caracteres'); senhaOk = false }
      else setErroSenha(null)
    }

    return Object.keys(novosErros).length === 0 && senhaOk
  }

  // ============================================================
  // handleSalvar — Salvar único para toda a tela (Dados +
  // Permissões, quando aplicável)
  // ============================================================
  async function handleSalvar() {
    setErroGeral(null)
    if (!validarDados()) {
      setAbaAtiva('dados')  // Garante que os erros fiquem visíveis
      return
    }

    setSalvando(true)
    const token = await obterToken()

    try {
      if (modo === 'novo') {
        // Função 1 — cria o usuário com a senha digitada pelo Admin.
        // Permissões ainda não existem configuráveis neste momento
        // (Especificação §2.1: "not configured during the creation form")
        const payload: UsuarioInsert = { ...form, senha }
        const res = await fetch('/api/usuarios/criar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.erro ?? 'Erro ao criar usuário')

        // Sem tela de senha — o Admin já sabe qual é, foi ele quem
        // digitou (decisão de 26/08/2026). Só confirma o sucesso e
        // já libera a aba Permissões deste usuário recém-criado.
        setSucessoCriacao(true)
        setUsuarioId(json.usuario.id)
        setModo('editar')
        setAbaAtiva('permissoes')
      } else {
        // Função 3 — atualiza Dados
        const resDados = await fetch('/api/usuarios/atualizar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ id: usuarioId, ...form }),
        })
        const jsonDados = await resDados.json()
        if (!resDados.ok) throw new Error(jsonDados.erro ?? 'Erro ao atualizar usuário')

        // Função 3 — atualiza Permissões, só se algo mudou e o alvo
        // não for o Admin (Admin nunca gera diff, checkboxes travados)
        const mudancas: PermissaoTogglePayload[] = []
        for (const modulo of MODULOS_FIXOS) {
          for (const acao of ACOES_FIXAS) {
            if (permissoes[modulo][acao] !== permissoesOriginais[modulo][acao]) {
              mudancas.push({ modulo, acao, permitido: permissoes[modulo][acao] })
            }
          }
        }

        if (mudancas.length > 0) {
          const resPerm = await fetch('/api/usuarios/atualizar-permissoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ usuarioId, mudancas }),
          })
          const jsonPerm = await resPerm.json()
          if (!resPerm.ok) throw new Error(jsonPerm.erro ?? 'Erro ao atualizar permissões')
        }

        onSalvo()
      }
    } catch (err: unknown) {
      setErroGeral(err instanceof Error ? err.message : 'Erro desconhecido ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  // ============================================================
  // Render principal — modal com abas
  // ============================================================
  // Overlay sem fechamento por clique fora — decisão explícita
  // (27/08/2026): é um formulário com dados digitados, fechar sem
  // querer perde a edição. Só fecha pelo X ou pelo botão Cancelar
  // (ambos chamam onFechar diretamente), ou automaticamente após
  // salvar com sucesso.
  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>

        {/* Header */}
        <div style={headerStyle}>
          <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700 }}>
            {modo === 'novo' ? 'Novo Usuário' : `Editar: ${usuarioInicial?.nome_completo ?? form.nome_completo}`}
          </span>
          <button onClick={onFechar} aria-label="Fechar modal" style={botaoFecharStyle}>✕</button>
        </div>

        {/* Abas — padrão novo para o projeto, simples, sem animação */}
        <div style={{ display: 'flex', borderBottom: '1px solid #dde8f0', flexShrink: 0 }}>
          <button
            onClick={() => setAbaAtiva('dados')}
            style={abaBotaoStyle(abaAtiva === 'dados')}
          >
            Dados
          </button>
          <button
            onClick={() => { if (modo === 'editar') setAbaAtiva('permissoes') }}
            disabled={modo === 'novo'}
            title={modo === 'novo' ? 'Disponível após salvar o cadastro' : undefined}
            style={{ ...abaBotaoStyle(abaAtiva === 'permissoes'), opacity: modo === 'novo' ? 0.4 : 1, cursor: modo === 'novo' ? 'not-allowed' : 'pointer' }}
          >
            Permissões
          </button>
        </div>

        {/* Corpo scrollável */}
        <div style={{ overflowY: 'auto', padding: '16px', flex: 1 }}>

          {erroGeral && (
            <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '11px', marginBottom: '12px' }}>
              {erroGeral}
            </div>
          )}

          {sucessoCriacao && (
            <div style={{ padding: '8px 10px', background: '#e6f4ea', border: '1px solid #a8d9b8', borderRadius: '6px', color: '#1e7a3d', fontSize: '11px', marginBottom: '12px' }}>
              Usuário criado com sucesso. Configure as permissões na aba ao lado, se necessário.
            </div>
          )}

          {abaAtiva === 'dados' ? (
            <>
              <div style={rowStyle}>
                <div style={colStyle()}>
                  <label style={labelStyle}>Nome completo *</label>
                  <input value={form.nome_completo} onChange={e => handleChange('nome_completo', e.target.value)} style={{ ...inputStyle, borderColor: erros.nome_completo ? '#dc2626' : '#dde8f0' }} />
                  {erros.nome_completo && <span style={erroCampoStyle}>{erros.nome_completo}</span>}
                </div>
              </div>

              <div style={rowStyle}>
                <div style={colStyle()}>
                  <label style={labelStyle}>Username *</label>
                  <input value={form.username} onChange={e => handleChange('username', e.target.value.trim())} style={{ ...inputStyle, borderColor: erros.username ? '#dc2626' : '#dde8f0' }} />
                  {erros.username && <span style={erroCampoStyle}>{erros.username}</span>}
                </div>
                <div style={colStyle()}>
                  <label style={labelStyle}>E-mail técnico</label>
                  <input value={derivarEmailTecnicoPreview(form.username)} readOnly style={{ ...inputStyle, background: '#f0f4f7', color: '#5a84a6' }} />
                </div>
              </div>

              {modo === 'novo' && (
                <div style={rowStyle}>
                  <div style={colStyle()}>
                    <label style={labelStyle}>Senha *</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={senha}
                        onChange={e => { setSenha(e.target.value); setErroSenha(null) }}
                        placeholder="Mínimo 6 caracteres"
                        style={{ ...inputStyle, borderColor: erroSenha ? '#dc2626' : '#dde8f0' }}
                      />
                      <button
                        type="button"
                        onClick={() => { setSenha(gerarSenhaAleatoria()); setErroSenha(null) }}
                        title="Gerar senha aleatória"
                        style={{ ...inputStyle, width: 'auto', whiteSpace: 'nowrap', cursor: 'pointer', background: '#f0f4f7', color: '#1a6094', fontWeight: 600 }}
                      >
                        Gerar senha
                      </button>
                    </div>
                    {erroSenha && <span style={erroCampoStyle}>{erroSenha}</span>}
                    <span style={{ fontSize: '9px', color: '#5a84a6' }}>
                      Guarde esta senha em local seguro — o sistema não permite consultá-la depois.
                    </span>
                  </div>
                </div>
              )}

              <div style={rowStyle}>
                <div style={colStyle()}>
                  <label style={labelStyle}>CPF/CNPJ *</label>
                  <input value={form.cpf_cnpj} onChange={e => handleChange('cpf_cnpj', e.target.value)} style={{ ...inputStyle, borderColor: erros.cpf_cnpj ? '#dc2626' : '#dde8f0' }} />
                  {erros.cpf_cnpj && <span style={erroCampoStyle}>{erros.cpf_cnpj}</span>}
                </div>
                <div style={colStyle('150px')}>
                  <label style={labelStyle}>Data de nascimento *</label>
                  <input type="date" value={form.data_nascimento} onChange={e => handleChange('data_nascimento', e.target.value)} style={{ ...inputStyle, borderColor: erros.data_nascimento ? '#dc2626' : '#dde8f0' }} />
                  {erros.data_nascimento && <span style={erroCampoStyle}>{erros.data_nascimento}</span>}
                </div>
              </div>

              <div style={rowStyle}>
                <div style={colStyle()}>
                  <label style={labelStyle}>Celular/WhatsApp *</label>
                  <input
                    value={form.celular_whatsapp}
                    onChange={e => handleChange('celular_whatsapp', mascaraTelefone(e.target.value))}
                    placeholder="(44) 99999-9999"
                    style={{ ...inputStyle, borderColor: erros.celular_whatsapp ? '#dc2626' : '#dde8f0' }}
                  />
                  {erros.celular_whatsapp && <span style={erroCampoStyle}>{erros.celular_whatsapp}</span>}
                </div>
                <div style={colStyle()}>
                  <label style={labelStyle}>E-mail pessoal *</label>
                  <input value={form.email_pessoal} onChange={e => handleChange('email_pessoal', e.target.value)} style={{ ...inputStyle, borderColor: erros.email_pessoal ? '#dc2626' : '#dde8f0' }} />
                  {erros.email_pessoal && <span style={erroCampoStyle}>{erros.email_pessoal}</span>}
                </div>
              </div>

              <div style={rowStyle}>
                <div style={colStyle('160px')}>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => handleChange('status', e.target.value)} style={selectStyle}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Checkbox global "Todas" — abrange todos os módulos e ações de uma vez (item pedido por Maycon, 26/08/2026) */}
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700,
                  color: '#1a6094', cursor: 'pointer', marginBottom: '14px', padding: '8px 10px',
                  background: '#edf4fb', border: '1px solid #c4d8eb', borderRadius: '6px',
                }}
              >
                <input
                  type="checkbox"
                  checked={MODULOS_FIXOS.every(modulo => ACOES_FIXAS.every(acao => permissoes[modulo][acao]))}
                  onChange={handleToggleTodasGeral}
                />
                Todas (todos os módulos e ações)
              </label>

              {MODULOS_FIXOS.map(modulo => {
                const todasDoModuloMarcadas = ACOES_FIXAS.every(acao => permissoes[modulo][acao])
                return (
                  <div key={modulo} style={{ marginBottom: '12px', border: '1px solid #e8f0f7', borderRadius: '6px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a6094' }}>
                        {MODULO_PERMISSAO_LABELS[modulo]}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#5a84a6', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={todasDoModuloMarcadas}
                          onChange={() => handleToggleTodasDoModulo(modulo)}
                        />
                        Todas
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      {ACOES_FIXAS.map(acao => (
                        <label key={acao} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#3a6080', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={permissoes[modulo][acao]}
                            onChange={() => handleTogglePermissao(modulo, acao)}
                          />
                          {ACAO_PERMISSAO_LABELS[acao]}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={onFechar} style={botaoSecundarioStyle}>Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando} style={{ ...botaoPrimarioStyle, opacity: salvando ? 0.7 : 1, cursor: salvando ? 'wait' : 'pointer' }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Estilos auxiliares — mesmos valores de FornecedoresModal.tsx
// ============================================================
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  fontFamily: 'Tahoma, Geneva, sans-serif',
}

const boxStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: '8px', width: '100%', maxWidth: '640px',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  background: '#1a6094', padding: '10px 16px', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
}

const botaoFecharStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#ffffff', fontSize: '18px',
  cursor: 'pointer', lineHeight: 1, padding: '0 4px',
}

const footerStyle: React.CSSProperties = {
  background: '#f7fafc', borderTop: '1px solid #dde8f0', padding: '10px 16px',
  display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0,
}

const botaoSecundarioStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
  background: '#ffffff', color: '#3a6080', border: '1px solid #c4d8eb', borderRadius: '5px', cursor: 'pointer',
}

const botaoPrimarioStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 16px', fontSize: '12px', fontWeight: 700,
  fontFamily: 'Tahoma, Geneva, sans-serif', background: '#1a6094', color: '#ffffff', border: '1px solid #1a6094', borderRadius: '5px',
}

function abaBotaoStyle(ativa: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', fontSize: '12px', fontWeight: 700, fontFamily: 'Tahoma, Geneva, sans-serif',
    background: 'transparent', border: 'none', borderBottom: ativa ? '2px solid #1a6094' : '2px solid transparent',
    color: ativa ? '#1a6094' : '#7a8a99', cursor: 'pointer',
  }
}

const rowStyle: React.CSSProperties = { display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }

function colStyle(width?: string): React.CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: '3px', flex: width ? `0 0 ${width}` : 1, minWidth: width ?? '80px' }
}

const labelStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 700, color: '#1a6094', textTransform: 'uppercase',
  letterSpacing: '0.04em', fontFamily: 'Tahoma, Geneva, sans-serif',
}

const inputStyle: React.CSSProperties = {
  height: '28px', padding: '0 8px', fontSize: '12px', fontFamily: 'Tahoma, Geneva, sans-serif',
  color: '#3a6080', background: '#ffffff', border: '1px solid #dde8f0', borderRadius: '4px',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

const erroCampoStyle: React.CSSProperties = { fontSize: '10px', color: '#dc2626', fontFamily: 'Tahoma, Geneva, sans-serif' }
