// ============================================================
// validacoesUsuarios.ts
// Funções puras de validação do Módulo Usuários, sem nenhuma
// dependência de Supabase ou de qualquer client server-only —
// seguro para importar tanto em código de servidor (rotas de API,
// lib/usuariosService.ts) quanto em componentes de cliente
// (UsuarioFormModal.tsx, UsuariosTabela.tsx).
// Extraído (FIX-12, Handoff_Modulo_Usuarios_Audit_para_QA.md) porque
// as mesmas duas regras existiam reimplementadas de forma
// independente em três lugares diferentes, sem nada garantindo que
// permanecessem sincronizadas.
// ============================================================

// ============================================================
// senhaValida()
// Piso mínimo de sanidade para a senha digitada pelo Admin (6
// caracteres) — não é exigência de complexidade, só evita campo
// vazio ou senha de 1-2 caracteres por engano. Sistema não sorteia
// senha; Admin digita diretamente na criação e no reset.
// Chamado por: pages/api/usuarios/criar.ts, pages/api/usuarios/resetar-senha.ts
// (via re-export em lib/usuariosService.ts), components/usuarios/UsuarioFormModal.tsx,
// components/usuarios/UsuariosTabela.tsx
// ============================================================
export function senhaValida(senha: string): boolean {
  return senha.trim().length >= 6
}

// ============================================================
// emailValido()
// Validação simples de formato de e-mail bem-formado — usada para
// email_pessoal (Especificação §5, Função 1, passo 4 e Função 3,
// edge cases). Regex propositalmente simples (não cobre todos os
// casos exóticos da RFC 5322) — suficiente para pegar erros de
// digitação óbvios, consistente com o nível de rigor usado no resto
// do projeto.
// Chamado por: pages/api/usuarios/criar.ts, pages/api/usuarios/atualizar.ts
// (via re-export em lib/usuariosService.ts), components/usuarios/UsuarioFormModal.tsx
// ============================================================
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ============================================================
// validarCpfCnpj()
// FIX-15 (Handoff_Modulo_Usuarios_Audit_para_QA.md): Especificação
// §5, Função 1, passo 3 exigia reaproveitar um validador já
// existente no projeto (Clientes/Fornecedores) — busca confirmou
// que nenhum validador de formato/dígito verificador existe em
// lugar nenhum do projeto (só funções de formatação com pontuação
// e uma checagem de duplicidade em Fornecedores). Autorizado por
// Maycon a escrever um novo, de uso exclusivo do Módulo Usuários.
// Aceita string com ou sem pontuação; valida por dígito verificador
// (algoritmo padrão CPF de 11 dígitos / CNPJ de 14 dígitos),
// rejeitando também sequências de dígito único repetido (ex.:
// "00000000000"), que passariam no cálculo do dígito mas nunca são
// documentos reais.
// Chamado por: pages/api/usuarios/criar.ts, pages/api/usuarios/atualizar.ts,
// components/usuarios/UsuarioFormModal.tsx
// ============================================================
export function validarCpfCnpj(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '')

  if (digitos.length === 11) return validarCpf(digitos)
  if (digitos.length === 14) return validarCnpj(digitos)
  return false
}

function todosDigitosIguais(digitos: string): boolean {
  return digitos.split('').every((d) => d === digitos[0])
}

function validarCpf(cpf: string): boolean {
  if (todosDigitosIguais(cpf)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i)
  let resto = soma % 11
  const dig1 = resto < 2 ? 0 : 11 - resto
  if (dig1 !== Number(cpf[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i)
  resto = soma % 11
  const dig2 = resto < 2 ? 0 : 11 - resto
  if (dig2 !== Number(cpf[10])) return false

  return true
}

function validarCnpj(cnpj: string): boolean {
  if (todosDigitosIguais(cnpj)) return false

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  let soma = 0
  for (let i = 0; i < 12; i++) soma += Number(cnpj[i]) * pesos1[i]
  let resto = soma % 11
  const dig1 = resto < 2 ? 0 : 11 - resto
  if (dig1 !== Number(cnpj[12])) return false

  soma = 0
  for (let i = 0; i < 13; i++) soma += Number(cnpj[i]) * pesos2[i]
  resto = soma % 11
  const dig2 = resto < 2 ? 0 : 11 - resto
  if (dig2 !== Number(cnpj[13])) return false

  return true
}

// ============================================================
// gerarSenhaAleatoria()
// Gera uma senha aleatória de 6 caracteres alfanuméricos (letras
// maiúsculas, minúsculas e números) — usada pelo botão "Gerar
// senha" na criação de usuário e no reset de senha. Uso interno do
// sistema (não é senha de acesso público-crítico), Math.random() é
// suficiente para o nível de exigência deste requisito.
// Chamado por: components/usuarios/UsuarioFormModal.tsx,
//              components/usuarios/UsuariosTabela.tsx
// ============================================================
const CARACTERES_SENHA_ALEATORIA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function gerarSenhaAleatoria(tamanho = 6): string {
  let senha = ''
  for (let i = 0; i < tamanho; i++) {
    senha += CARACTERES_SENHA_ALEATORIA[Math.floor(Math.random() * CARACTERES_SENHA_ALEATORIA.length)]
  }
  return senha
}
