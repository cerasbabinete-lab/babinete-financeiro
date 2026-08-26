// ============================================================
// lib/usuariosService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Todas as operações de dados do Módulo Usuários — camada
//         de serviço entre as rotas de API e o Supabase (tabelas
//         usuarios/usuarios_permissoes) + Supabase Auth Admin API.
//         DIFERENTE do padrão de contasAPagarService.ts/
//         despesasService.ts: aqui NENHUMA função aceita um valor
//         padrão `client: SupabaseClient = supabase` (client anon),
//         porque usuarios/usuarios_permissoes têm RLS habilitado
//         sem nenhuma policy de leitura (sql/usuarios.sql) — todo
//         acesso, inclusive leitura, tem que vir do client admin
//         (service role) instanciado dentro de cada rota
//         pages/api/usuarios/*.ts. Um valor padrão pro client anon
//         aqui mascararia silenciosamente uma falha de RLS.
// Conecta com: types/usuarios.ts, lib/usuariosMailer.ts,
//              pages/api/usuarios/*.ts, sql/usuarios.sql
// Referência: Especificacao_Modulo_Usuarios.md, Seção 5 (Functions
//             & Logic) — fonte de verdade da ordem de passos e
//             regras de rollback de cada função abaixo
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Usuario,
  UsuarioInsert,
  UsuarioUpdate,
  UsuarioPermissao,
  UsuarioComPermissoes,
  PermissaoTogglePayload,
  ModuloPermissao,
  AcaoPermissao,
} from '@/types/usuarios'
import { enviarEmailNovaSenha } from '@/lib/usuariosMailer'

// ============================================================
// CONSTANTES
// ============================================================
const TABELA_USUARIOS     = 'usuarios'             // Tabela principal de usuários do sistema
const TABELA_PERMISSOES   = 'usuarios_permissoes'   // Tabela de permissões (10 módulos x 5 ações por usuário)
const DOMINIO_LOGIN        = 'login.cerasbabinete.com.br'  // Domínio técnico fixo — Especificação §2.1 (email_tecnico)

// Lista fixa dos 10 módulos, na ordem exata da Especificação §2.1 —
// usada para gerar as 50 linhas de permissões na criação de um
// usuário e para renderizar a matriz na ordem correta na UI
const MODULOS_FIXOS: ModuloPermissao[] = [
  'clientes', 'fornecedores', 'receitas', 'contas_receber',
  'despesas', 'contas_a_pagar', 'relatorios', 'usuarios',
  'dashboard', 'backup',
]

// Lista fixa das 5 ações padrão, mesma ordem em toda a UI —
// Especificação §2.1
const ACOES_FIXAS: AcaoPermissao[] = [
  'criar', 'editar', 'excluir', 'exportar', 'visualizar',
]

// ============================================================
// ehAdmin()
// Verifica se um usuário autenticado é o Admin, usando dupla
// checagem (auth_user_id fixo E e-mail de login fixo) — decisão
// confirmada por Maycon em sessão de build. Os dois valores vêm de
// variáveis de ambiente.
// Decisão desta sessão (bootstrap temporário): o Admin fixo hoje é
// a conta REAL já existente no Supabase Auth (cerasbabinete@gmail.com,
// auth_user_id 290d11d7-b725-4e3c-8d31-f08d872830b6), reaproveitada
// como Admin pra evitar qualquer risco de Maycon ficar sem acesso
// durante a construção/testes deste módulo. Login com essa conta usa
// o username curto "ceras" (ver app/login/page.tsx — caso especial
// que não passa pela fórmula {username}@login.cerasbabinete.com.br).
// Mais adiante, já com o módulo funcionando, Maycon vai criar um
// Admin "de verdade" pela própria tela (username por fórmula) e
// então essas duas variáveis de ambiente serão atualizadas para
// apontar pro Admin novo — só depois disso a conta cerasbabinete@
// gmail.com será excluída do Auth (aplicação não quebra nesse
// momento, porque o Admin fixo já não depende mais dela).
// Chamado por: todas as rotas pages/api/usuarios/*.ts, para barrar
// o acesso de qualquer usuário que não seja o Admin (Especificação
// §2.3 — o módulo inteiro é Admin-only)
// ============================================================
export function ehAdmin(authUserId: string, emailLogin: string): boolean {
  const adminAuthUserId = process.env.ADMIN_AUTH_USER_ID  // UUID fixo do Admin no Supabase Auth
  const adminLoginEmail = process.env.ADMIN_LOGIN_EMAIL    // E-mail real fixo usado pelo Admin pra logar (hoje: cerasbabinete@gmail.com)

  // As duas condições precisam bater — dupla verificação, não uma OU a outra
  return authUserId === adminAuthUserId && emailLogin === adminLoginEmail
}

// ============================================================
// senhaValida()
// Piso mínimo de sanidade para a senha digitada pelo Admin (6
// caracteres) — não é exigência de complexidade, só evita campo
// vazio ou senha de 1-2 caracteres por engano. Decisão desta
// sessão (26/08/2026): sistema não sorteia mais senha, Admin digita
// diretamente na criação e no reset.
// Chamado por: pages/api/usuarios/criar.ts, pages/api/usuarios/resetar-senha.ts
// ============================================================
export function senhaValida(senha: string): boolean {
  return senha.trim().length >= 6
}

// ============================================================
// emailValido()
// Validação simples de formato de e-mail bem-formado — usada para
// email_pessoal (Especificação §5, Função 1, passo 4 e Função 3,
// edge cases). Não existe validador de e-mail em nenhum outro lugar
// do projeto para reaproveitar (confirmado por busca no repositório).
// Regex propositalmente simples (não cobre todos os casos exóticos
// da RFC 5322) — suficiente para pegar erros de digitação óbvios,
// consistente com o nível de rigor usado no resto do projeto.
// Chamado por: pages/api/usuarios/criar.ts, pages/api/usuarios/atualizar.ts
// ============================================================
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ============================================================
// derivarEmailTecnico()
// Deriva o e-mail técnico a partir do username — mesma fórmula
// usada no front (exibição read-only) e no back (valor real gravado
// e enviado à Auth Admin API). Centralizado aqui para não haver
// divergência entre os dois lados.
// Chamado por: criarUsuario(), atualizarUsuario() (quando username muda)
// ============================================================
export function derivarEmailTecnico(username: string): string {
  return `${username}@${DOMINIO_LOGIN}`
}

// ============================================================
// listarUsuariosAtivos()
// Retorna todos os usuários com deleted_at IS NULL, ordenados por
// nome — usada pela tela Lista de Usuários (via rota listar.ts,
// já que RLS bloqueia leitura direta do browser)
// Chamado por: pages/api/usuarios/listar.ts
// ============================================================
export async function listarUsuariosAtivos(client: SupabaseClient): Promise<Usuario[]> {
  const { data, error } = await client
    .from(TABELA_USUARIOS)
    .select('*')
    .is('deleted_at', null)          // Só usuários ativos — Especificação §4 (Lista de Usuários)
    .order('nome_completo', { ascending: true })

  if (error) {
    console.error('[usuariosService] listarUsuariosAtivos error:', error)
    throw new Error(error.message)
  }

  return data as Usuario[]
}

// ============================================================
// buscarUsuarioComPermissoes()
// Retorna um usuário específico junto com suas 50 linhas de
// permissões — usada para popular a tela de edição (abas Dados +
// Permissões) de uma vez só
// Chamado por: pages/api/usuarios/listar.ts (quando chamada com um
// id específico) ou por uma futura rota de detalhe, se necessária
// ============================================================
export async function buscarUsuarioComPermissoes(
  id: string,
  client: SupabaseClient,
): Promise<UsuarioComPermissoes | null> {
  const { data: usuario, error: erroUsuario } = await client
    .from(TABELA_USUARIOS)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (erroUsuario) {
    console.error('[usuariosService] buscarUsuarioComPermissoes (usuario) error:', erroUsuario)
    throw new Error(erroUsuario.message)
  }
  if (!usuario) return null  // Usuário não existe ou foi excluído — tratado como "não encontrado", não como erro

  const { data: permissoes, error: erroPermissoes } = await client
    .from(TABELA_PERMISSOES)
    .select('*')
    .eq('usuario_id', id)

  if (erroPermissoes) {
    console.error('[usuariosService] buscarUsuarioComPermissoes (permissoes) error:', erroPermissoes)
    throw new Error(erroPermissoes.message)
  }

  return {
    usuario: usuario as Usuario,
    permissoes: permissoes as UsuarioPermissao[],
  }
}

// ============================================================
// usernameDisponivel()
// Verifica se um username está livre para uso — escopado a
// deleted_at IS NULL (Especificação §2.2.1: username de um usuário
// excluído pode ser reutilizado por um novo registro)
// Chamado por: criarUsuario() e atualizarUsuario() (quando username muda)
// ============================================================
export async function usernameDisponivel(
  username: string,
  client: SupabaseClient,
  ignorarId?: string,   // Ao editar, ignora o próprio registro na checagem de unicidade
): Promise<boolean> {
  let query = client
    .from(TABELA_USUARIOS)
    .select('id')
    .eq('username', username)
    .is('deleted_at', null)

  if (ignorarId) {
    query = query.neq('id', ignorarId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[usuariosService] usernameDisponivel error:', error)
    throw new Error(error.message)
  }

  return (data ?? []).length === 0  // Disponível se nenhuma linha ativa usa esse username
}

// ============================================================
// criarUsuario()
// Função 1 da Especificação (§5) — orquestra, na ordem exata
// documentada:
//   1. Valida username disponível (chamador já validou campos
//      obrigatórios e formato de e-mail antes de chegar aqui)
//   2. Deriva email_tecnico
//   3. Cria o usuário no Supabase Auth (auth.admin.createUser)
//   4. Insere a linha em usuarios
//   5. Insere as 50 linhas em usuarios_permissoes
// ATUALIZAÇÃO (26/08/2026): a senha não é mais gerada pelo sistema
// — o Admin digita ela diretamente (dados.senha), decisão explícita
// de Maycon que reverte a Especificação §7, item 2. Validação de
// piso mínimo (senhaValida()) acontece na rota, antes de chegar aqui.
// Rollback: se o passo 4 falhar depois do Auth ter sido criado
// (passo 3), deleta o usuário do Auth (evita login órfão sem
// registro em usuarios). Se o passo 5 falhar depois do passo 4,
// desfaz TANTO o usuario quanto o Auth (operação tratada como
// falha total — Especificação §5, Função 1, edge cases).
// Chamado por: pages/api/usuarios/criar.ts
// ============================================================
export async function criarUsuario(
  dados: UsuarioInsert,
  client: SupabaseClient,   // Client admin — necessário tanto para as tabelas quanto para client.auth.admin.*
): Promise<{ usuario: Usuario }> {
  // Passo 1 — unicidade de username entre usuários ativos
  const disponivel = await usernameDisponivel(dados.username, client)
  if (!disponivel) {
    throw new Error(`O username "${dados.username}" já está em uso por outro usuário ativo.`)
  }

  // Passo 2 — email técnico derivado do username
  const emailTecnico = derivarEmailTecnico(dados.username)

  // Passo 3 — cria o login no Supabase Auth, com a senha digitada
  // pelo Admin (dados.senha). email_confirm: true pula a etapa de
  // confirmação por e-mail (não faz sentido aqui, já que o
  // "e-mail" é técnico/interno, não uma caixa real)
  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email: emailTecnico,
    password: dados.senha,
    email_confirm: true,
  })

  if (authError || !authData?.user) {
    console.error('[usuariosService] criarUsuario (Auth) error:', authError)
    throw new Error(authError?.message ?? 'Falha ao criar usuário na autenticação.')
  }

  const authUserId = authData.user.id

  // Passo 4 — insere a linha em usuarios
  const { data: usuarioInserido, error: erroInsertUsuario } = await client
    .from(TABELA_USUARIOS)
    .insert({
      nome_completo: dados.nome_completo,
      username: dados.username,
      email_tecnico: emailTecnico,
      cpf_cnpj: dados.cpf_cnpj,
      data_nascimento: dados.data_nascimento,
      celular_whatsapp: dados.celular_whatsapp,
      email_pessoal: dados.email_pessoal,
      status: dados.status,
      auth_user_id: authUserId,
    })
    .select()
    .single()

  if (erroInsertUsuario || !usuarioInserido) {
    console.error('[usuariosService] criarUsuario (insert usuarios) error:', erroInsertUsuario)
    // Rollback — remove o usuário órfão do Auth, já que não há registro em usuarios
    await client.auth.admin.deleteUser(authUserId).catch((rollbackErr) => {
      console.error('[usuariosService] criarUsuario rollback (deleteUser) falhou:', rollbackErr)
    })
    throw new Error(erroInsertUsuario?.message ?? 'Falha ao gravar o registro do usuário.')
  }

  // Passo 5 — insere as 50 linhas de permissões (10 módulos x 5 ações), todas permitido=false
  const linhasPermissoes = MODULOS_FIXOS.flatMap((modulo) =>
    ACOES_FIXAS.map((acao) => ({
      usuario_id: usuarioInserido.id,
      modulo,
      acao,
      permitido: false,
    })),
  )

  const { error: erroInsertPermissoes } = await client
    .from(TABELA_PERMISSOES)
    .insert(linhasPermissoes)

  if (erroInsertPermissoes) {
    console.error('[usuariosService] criarUsuario (insert permissoes) error:', erroInsertPermissoes)
    // Rollback total — desfaz o usuario E o Auth, tratando a operação inteira como falha
    // (Especificação §5, Função 1: "the whole operation should be treated as failed and rolled back")
    await client.from(TABELA_USUARIOS).delete().eq('id', usuarioInserido.id).then(
      () => {},
      (rollbackErr) => console.error('[usuariosService] criarUsuario rollback (delete usuarios) falhou:', rollbackErr),
    )
    await client.auth.admin.deleteUser(authUserId).catch((rollbackErr) => {
      console.error('[usuariosService] criarUsuario rollback (deleteUser) falhou:', rollbackErr)
    })
    throw new Error(erroInsertPermissoes.message)
  }

  return { usuario: usuarioInserido as Usuario }
}

// ============================================================
// atualizarUsuario()
// Função 3 da Especificação (§5, aba Dados) — update simples dos
// campos de usuarios. Se username vier preenchido e diferente do
// atual, recalcula email_tecnico e atualiza o e-mail no Auth junto
// (decisão confirmada por Maycon: username é editável e propaga
// pro Auth).
// Chamado por: pages/api/usuarios/atualizar.ts
// ============================================================
export async function atualizarUsuario(
  dados: UsuarioUpdate,
  client: SupabaseClient,
): Promise<Usuario> {
  const { id, ...campos } = dados

  // Busca o registro atual para comparar username e obter auth_user_id
  const { data: atual, error: erroBusca } = await client
    .from(TABELA_USUARIOS)
    .select('username, auth_user_id')
    .eq('id', id)
    .single()

  if (erroBusca || !atual) {
    console.error('[usuariosService] atualizarUsuario (busca atual) error:', erroBusca)
    throw new Error(erroBusca?.message ?? 'Usuário não encontrado.')
  }

  const camposParaAtualizar: Record<string, unknown> = { ...campos }

  // Se o username mudou, recalcula email_tecnico e valida unicidade de novo
  if (campos.username && campos.username !== atual.username) {
    const disponivel = await usernameDisponivel(campos.username, client, id)
    if (!disponivel) {
      throw new Error(`O username "${campos.username}" já está em uso por outro usuário ativo.`)
    }

    const novoEmailTecnico = derivarEmailTecnico(campos.username)
    camposParaAtualizar.email_tecnico = novoEmailTecnico

    // Propaga a mudança de e-mail para o Supabase Auth — sem isso o
    // login pelo username antigo continuaria funcionando via Auth,
    // divergindo do que a tabela usuarios mostra
    const { error: erroAuthUpdate } = await client.auth.admin.updateUserById(atual.auth_user_id, {
      email: novoEmailTecnico,
      email_confirm: true,
    })

    if (erroAuthUpdate) {
      console.error('[usuariosService] atualizarUsuario (Auth email update) error:', erroAuthUpdate)
      throw new Error(erroAuthUpdate.message)
    }
  }

  const { data, error } = await client
    .from(TABELA_USUARIOS)
    .update(camposParaAtualizar)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[usuariosService] atualizarUsuario error:', error)
    throw new Error(error.message)
  }

  return data as Usuario
}

// ============================================================
// atualizarPermissoesUsuario()
// Função 3 da Especificação (§5, aba Permissões) — aplica uma
// lista de mudanças pontuais em usuarios_permissoes.
// ATUALIZAÇÃO (26/08/2026): a Especificação original (§7, item 7)
// definia que o Admin tinha acesso irrestrito hardcoded e suas
// permissões nunca eram editáveis. Maycon reverteu explicitamente
// essa decisão em sessão de build — as permissões do Admin agora
// são editáveis como as de qualquer outro usuário, sem bloqueio
// nem no client (UsuarioFormModal.tsx) nem aqui no servidor.
// Chamado por: pages/api/usuarios/atualizar-permissoes.ts
// ============================================================
export async function atualizarPermissoesUsuario(
  usuarioId: string,
  mudancas: PermissaoTogglePayload[],
  client: SupabaseClient,
): Promise<void> {
  // Aplica cada mudança individualmente — update por (usuario_id, modulo, acao)
  for (const mudanca of mudancas) {
    const { error } = await client
      .from(TABELA_PERMISSOES)
      .update({ permitido: mudanca.permitido })
      .eq('usuario_id', usuarioId)
      .eq('modulo', mudanca.modulo)
      .eq('acao', mudanca.acao)

    if (error) {
      console.error('[usuariosService] atualizarPermissoesUsuario error:', error)
      throw new Error(error.message)
    }
  }
}

// ============================================================
// resetarSenhaUsuario()
// Função 2 da Especificação (§5) — ordem confirmada por Maycon em
// sessão de build (Opção A, Seção 8 pergunta 6): gerar senha ->
// enviar e-mail -> só então atualizar a senha no Auth. Assim, se o
// e-mail falhar, a senha ANTIGA continua válida e nada mudou de
// fato — evita o problema de "reverter" uma troca de senha que já
// aconteceu (Supabase Auth não guarda a senha anterior).
// Chamado por: pages/api/usuarios/resetar-senha.ts
// ============================================================
export async function resetarSenhaUsuario(
  usuarioId: string,
  novaSenha: string,   // Digitada pelo Admin — sistema não sorteia mais (decisão de 26/08/2026)
  client: SupabaseClient,
): Promise<{ emailEnviadoPara: string }> {
  const { data: usuario, error: erroUsuario } = await client
    .from(TABELA_USUARIOS)
    .select('auth_user_id, email_pessoal, nome_completo, username')
    .eq('id', usuarioId)
    .is('deleted_at', null)
    .single()

  if (erroUsuario || !usuario) {
    console.error('[usuariosService] resetarSenhaUsuario (busca usuario) error:', erroUsuario)
    throw new Error(erroUsuario?.message ?? 'Usuário não encontrado.')
  }

  // Passo 1 — envia o e-mail PRIMEIRO. Se isto falhar, a função lança
  // erro aqui e a senha no Auth nunca é tocada — a senha antiga
  // continua válida (Opção A confirmada por Maycon). username incluído
  // no corpo do e-mail, sem ele a pessoa não sabe qual login usar.
  await enviarEmailNovaSenha({
    destinatario: usuario.email_pessoal,
    nomeCompleto: usuario.nome_completo,
    username: usuario.username,
    novaSenha,
  })

  // Passo 2 — só chega aqui se o e-mail foi enviado com sucesso.
  // Agora sim atualiza a senha no Supabase Auth.
  const { error: erroAuthUpdate } = await client.auth.admin.updateUserById(usuario.auth_user_id, {
    password: novaSenha,
  })

  if (erroAuthUpdate) {
    console.error('[usuariosService] resetarSenhaUsuario (Auth password update) error:', erroAuthUpdate)
    // Situação rara e propositalmente sem rollback do e-mail (não é
    // possível "desenviar" um e-mail): o Admin já recebeu o aviso
    // manual do erro e deve investigar antes de tentar de novo
    throw new Error(erroAuthUpdate.message)
  }

  return { emailEnviadoPara: usuario.email_pessoal }
}

// ============================================================
// excluirUsuario()
// Função 4 da Especificação (§5) — soft-delete da linha em
// usuarios (deleted_at = now()) + desabilita o login no Supabase
// Auth via ban (banDuration muito longo, já que a Admin API não
// tem um "disable" permanente dedicado — confirmar na aplicação
// real se a versão do supabase-js em uso expõe um método mais
// direto no momento da configuração do ambiente). Sem "reativar" —
// Especificação §5, Função 4: "do NOT implement any reactivate function".
// Chamado por: pages/api/usuarios/excluir.ts
// ============================================================
export async function excluirUsuario(usuarioId: string, client: SupabaseClient): Promise<void> {
  const { data: usuario, error: erroBusca } = await client
    .from(TABELA_USUARIOS)
    .select('auth_user_id')
    .eq('id', usuarioId)
    .is('deleted_at', null)
    .single()

  if (erroBusca || !usuario) {
    console.error('[usuariosService] excluirUsuario (busca) error:', erroBusca)
    throw new Error(erroBusca?.message ?? 'Usuário não encontrado ou já excluído.')
  }

  // Passo 1 — soft-delete na tabela usuarios (padrão do projeto: nunca DELETE físico)
  const { error: erroSoftDelete } = await client
    .from(TABELA_USUARIOS)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', usuarioId)

  if (erroSoftDelete) {
    console.error('[usuariosService] excluirUsuario (soft-delete) error:', erroSoftDelete)
    throw new Error(erroSoftDelete.message)
  }

  // Passo 2 — desabilita o login no Auth. Se isto falhar DEPOIS do
  // soft-delete ter sucesso, é um estado de falha parcial relevante
  // para segurança (Especificação §5, Função 4, edge case): o
  // registro mostra "excluído" mas a pessoa ainda consegue logar.
  // Por isso o erro é relançado explicitamente, para a rota de API
  // reportar isso ao Admin em vez de mascarar como sucesso total.
  const { error: erroBanAuth } = await client.auth.admin.updateUserById(usuario.auth_user_id, {
    ban_duration: '876000h',  // ~100 anos — Supabase Admin API não tem "disable" permanente nativo; confirmar mecanismo exato disponível na versão em uso durante a configuração do ambiente
  })

  if (erroBanAuth) {
    console.error('[usuariosService] excluirUsuario (Auth ban) error:', erroBanAuth)
    throw new Error(
      `O usuário foi marcado como excluído, mas houve falha ao bloquear o login: ${erroBanAuth.message}. ` +
      'Verifique manualmente no Supabase Auth antes de considerar esta exclusão concluída.',
    )
  }
}
