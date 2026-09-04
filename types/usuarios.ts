// ============================================================
// types/usuarios.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Tipagem TypeScript completa das tabelas usuarios e
//         usuarios_permissoes, mais tipos auxiliares usados pela
//         camada de serviço, rotas de API e componentes de UI.
// Conecta com: lib/usuariosService.ts, lib/usuariosMailer.ts,
//              pages/api/usuarios/*.ts, components/usuarios/*.tsx,
//              app/usuarios/page.tsx
// Referência: Especificacao_Modulo_Usuarios.md, Seção 2.1
//             (Data Model) — fonte de verdade de todos os tipos abaixo
// ============================================================

// ============================================================
// ModuloPermissao
// Os 10 valores fixos de "modulo" na tabela usuarios_permissoes —
// Especificação §2.1. Espelha exatamente o CHECK constraint
// usuarios_permissoes_modulo_check em sql/usuarios.sql. NÃO
// adicionar/remover valores aqui sem atualizar o CHECK no banco.
// ============================================================
export type ModuloPermissao =
  | 'clientes'         // Módulo Clientes (existente)
  | 'fornecedores'      // Módulo Fornecedores (existente)
  | 'receitas'          // Módulo Receitas (existente)
  | 'contas_receber'    // Módulo Contas a Receber (existente)
  | 'despesas'          // Módulo Despesas (existente)
  | 'contas_a_pagar'    // Módulo Contas a Pagar (existente)
  | 'relatorios'        // Módulo Relatórios (existente)
  | 'usuarios'          // Este próprio módulo
  | 'dashboard'         // Módulo futuro — ainda não existe no código, mas já entra na matriz (Seção 2.1, nota explícita)
  | 'backup'            // Módulo futuro — mesma observação acima

// ============================================================
// AcaoPermissao
// As 5 ações padrão de "acao" na tabela usuarios_permissoes —
// Especificação §2.1. Espelha exatamente o CHECK constraint
// usuarios_permissoes_acao_check em sql/usuarios.sql.
// ============================================================
export type AcaoPermissao =
  | 'criar'
  | 'editar'
  | 'excluir'
  | 'exportar'
  | 'visualizar'

// ============================================================
// TipoUsuario
// 'normal' = pessoa real, cadastro completo. 'visitante' = acesso
// demo temporário, criado por VisitanteFormModal.tsx, somente
// leitura em todo o sistema (proxy.ts), sem CPF/data/celular/e-mail
// pessoal, com expira_em obrigatório.
// ============================================================
export type TipoUsuario = 'normal' | 'visitante'

// ============================================================
// StatusUsuario
// Valores válidos para o campo status de usuarios — flag manual
// só organizacional/visual, NÃO relacionada a deleted_at (soft-
// delete real) nem ao bloqueio de login (decisão confirmada por
// Maycon em sessão de build: status = 'inativo' não bloqueia login)
// ============================================================
export type StatusUsuario = 'ativo' | 'inativo'

// ============================================================
// MODULO_PERMISSAO_LABELS
// Rótulos em português para exibição na matriz de permissões —
// mesma ordem fixa de MODULOS_FIXOS em lib/usuariosService.ts.
// Mesmo padrão de types/fornecedores.ts (TIPO_FORNECEDOR_LABELS)
// ============================================================
export const MODULO_PERMISSAO_LABELS: Record<ModuloPermissao, string> = {
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  receitas: 'Receitas',
  contas_receber: 'Contas a Receber',
  despesas: 'Despesas',
  contas_a_pagar: 'Contas a Pagar',
  relatorios: 'Relatórios',
  usuarios: 'Usuários',
  dashboard: 'Dashboard',
  backup: 'Backup',
}

// ============================================================
// ACAO_PERMISSAO_LABELS
// Rótulos em português para os 5 checkboxes de cada bloco de módulo
// ============================================================
export const ACAO_PERMISSAO_LABELS: Record<AcaoPermissao, string> = {
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
  exportar: 'Exportar',
  visualizar: 'Visualizar',
}

// ============================================================
// Usuario
// Formato de uma linha da tabela usuarios, como retornada pelo
// Supabase (leitura completa, usada nas rotas de API e na UI)
// ============================================================
export interface Usuario {
  id: string                        // UUID, chave primária
  nome_completo: string              // Nome completo da pessoa
  username: string                   // Login digitado manualmente pelo Admin — único entre usuários ativos
  email_tecnico: string              // Derivado de username: {username}@login.cerasbabinete.com.br — somente leitura na UI
  cpf_cnpj: string                   // Texto livre formatado (sem validação de checksum — não existe validador desse tipo no projeto)
  data_nascimento: string            // Data no formato ISO (YYYY-MM-DD), como o Supabase retorna colunas DATE
  celular_whatsapp: string           // Só contato — sem envio automatizado neste v1
  email_pessoal: string              // E-mail real da pessoa — destino dos e-mails de recuperação/reset de senha
  status: StatusUsuario              // 'ativo' | 'inativo' — flag manual, não bloqueia login
  tipo_usuario: TipoUsuario          // 'normal' | 'visitante' — ver TipoUsuario acima
  expira_em: string | null           // Timestamp ISO — só preenchido para tipo_usuario='visitante'; NULL para 'normal' (nunca expira)
  auth_user_id: string               // UUID do registro correspondente em auth.users (Supabase Auth)
  deleted_at: string | null          // Soft-delete — NULL quando ativo
  created_at: string                 // Timestamp de criação
  updated_at: string                 // Timestamp da última atualização (mantido por trigger no banco)
}

// ============================================================
// UsuarioInsert
// Campos exigidos para criar um novo usuário (Função 1, aba
// Dados) — omite campos gerados pelo banco/aplicação (id,
// email_tecnico, auth_user_id, deleted_at, created_at, updated_at)
// ============================================================
export interface UsuarioInsert {
  nome_completo: string
  username: string                   // Usado para derivar email_tecnico em usuariosService.ts, não enviado como está pro banco
  senha: string                      // Digitada pelo Admin — sistema não sorteia mais senha (decisão revertida em 26/08/2026, ver lib/usuariosService.ts)
  cpf_cnpj?: string                  // Obrigatório para tipo_usuario='normal' (validado em UsuarioFormModal.tsx/criar.ts); omitido para 'visitante'
  data_nascimento?: string           // Mesma regra acima
  celular_whatsapp?: string          // Mesma regra acima
  email_pessoal?: string             // Mesma regra acima
  status: StatusUsuario
  tipo_usuario?: TipoUsuario         // Omitido = 'normal' (default do banco). 'visitante' exige expiraEmMinutos.
  expiraEmMinutos?: number           // Só para tipo_usuario='visitante' — minutos a partir de AGORA (calculado no servidor, não confia em timestamp vindo do cliente)
}

// ============================================================
// UsuarioUpdate
// Campos editáveis na aba Dados de um usuário existente (Função
// 3). username é editável (decisão confirmada por Maycon) — se
// vier preenchido e diferente do atual, usuariosService.ts
// recalcula email_tecnico e atualiza o Auth junto.
// ============================================================
export interface UsuarioUpdate {
  id: string                         // Obrigatório — identifica qual usuário está sendo atualizado
  nome_completo?: string
  username?: string
  cpf_cnpj?: string
  data_nascimento?: string
  celular_whatsapp?: string
  email_pessoal?: string
  status?: StatusUsuario
}

// ============================================================
// UsuarioPermissao
// Formato de uma linha da tabela usuarios_permissoes
// ============================================================
export interface UsuarioPermissao {
  id: string                         // UUID, chave primária
  usuario_id: string                 // FK -> usuarios.id
  modulo: ModuloPermissao
  acao: AcaoPermissao
  permitido: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// PermissaoTogglePayload
// Formato enviado pela UI (aba Permissões) para a rota
// atualizar-permissoes.ts — uma lista enxuta de mudanças, não a
// tabela inteira, para minimizar o payload
// ============================================================
export interface PermissaoTogglePayload {
  modulo: ModuloPermissao
  acao: AcaoPermissao
  permitido: boolean
}

// ============================================================
// UsuarioComPermissoes
// Formato combinado retornado pela rota de leitura de um usuário
// específico (usado para popular a tela de edição, abas Dados +
// Permissões, de uma vez)
// ============================================================
export interface UsuarioComPermissoes {
  usuario: Usuario
  permissoes: UsuarioPermissao[]     // Sempre 50 linhas (10 módulos x 5 ações), na ordem fixa da Seção 2.1
}

// ============================================================
// StatusVisitanteResultado
// Retorno de pages/api/usuarios/status-visitante.ts — usado tanto
// no gate de login (app/login/page.tsx) quanto no contador
// regressivo do Topbar (components/layout/Topbar.tsx)
// ============================================================
export interface StatusVisitanteResultado {
  tipoUsuario: TipoUsuario
  expiraEm: string | null            // ISO — só presente se tipoUsuario='visitante'
  expirado: boolean                  // Calculado no servidor (now() > expira_em) — nunca confiar em cálculo feito no cliente
}

// ============================================================
// ResultadoCriarUsuario
// Retorno da rota criar.ts em caso de sucesso. Não retorna senha
// — o Admin é quem digitou, já sabe qual é (decisão revertida em
// 26/08/2026: sistema não sorteia mais senha, ver lib/usuariosService.ts)
// ============================================================
export interface ResultadoCriarUsuario {
  usuario: Usuario
}

// ============================================================
// ResultadoResetarSenha
// Retorno da rota resetar-senha.ts em caso de sucesso. Não retorna
// senha pelo mesmo motivo de ResultadoCriarUsuario acima.
// ============================================================
export interface ResultadoResetarSenha {
  emailEnviadoPara: string            // email_pessoal do usuário, para confirmação visual na UI
}
