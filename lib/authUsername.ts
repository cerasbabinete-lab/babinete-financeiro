// ============================================================
// lib/authUsername.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Traduz o e-mail de login da sessão Supabase Auth de
//         volta para o username que deve ser EXIBIDO na UI
//         (saudação "Olá! ..." no Topbar/TopbarMobile em toda
//         página do sistema). É o caminho INVERSO de
//         resolverEmailLogin() em app/login/page.tsx.
//         Sem este helper, toda página que fazia
//         email.split('@')[0] direto mostrava "cerasbabinete" em
//         vez de "ceras" para a conta temporária do Admin (e, no
//         caso de app/usuarios/page.tsx, quebrava a checagem de
//         acesso Admin-only por completo).
// Conecta com: app/page.tsx, app/usuarios/page.tsx,
//              app/clientes/page.tsx, app/despesas/page.tsx,
//              app/fornecedores/page.tsx, app/pagar/page.tsx,
//              app/receber/page.tsx, app/receitas/page.tsx,
//              app/relatorios/page.tsx
// Origem: decisão de sessão de build do Módulo Usuários — Admin
//         temporário reaproveita a conta real cerasbabinete@gmail.com
//         (ver lib/usuariosService.ts, ehAdmin())
// ============================================================

// ============================================================
// resolverUsernameExibicao()
// Caso especial do Admin temporário: se o e-mail da sessão for
// exatamente o e-mail fixo do Admin, devolve o username curto
// digitado no login ("ceras"), não o local-part literal do e-mail
// real ("cerasbabinete"). Para todos os outros usuários (fórmula
// {username}@login.cerasbabinete.com.br), o local-part já É o
// username, então o corte simples continua correto.
// ============================================================
export function resolverUsernameExibicao(email: string | null | undefined): string {
  if (!email) return ''
  if (email === process.env.NEXT_PUBLIC_ADMIN_LOGIN_EMAIL) {
    return process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? email.split('@')[0]
  }
  return email.split('@')[0]
}
