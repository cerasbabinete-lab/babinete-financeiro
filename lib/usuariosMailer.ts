// ============================================================
// lib/usuariosMailer.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Usuários
// Função: Envio de e-mail via SMTP (Gmail direto, não um serviço
//         transacional como Resend) para o fluxo de reset de senha
//         (Função 2). Único ponto do projeto que envia e-mail —
//         nenhum outro módulo faz isso hoje, então este arquivo não
//         segue um padrão pré-existente, apenas as convenções gerais
//         do projeto (cabeçalho, catch (err: unknown), nomes em
//         português).
// Conecta com: lib/usuariosService.ts (resetarSenhaUsuario chama
//              enviarEmailNovaSenha antes de tocar no Auth — ordem
//              confirmada por Maycon, ver comentário em
//              usuariosService.ts)
// Variáveis de ambiente necessárias (Especificação §2.5):
//   SMTP_HOST      -> smtp.gmail.com
//   SMTP_PORT      -> 465
//   SMTP_USER      -> contato@cerasbabinete.com.br
//   SMTP_PASSWORD  -> Google App Password (senha normal da conta
//                     não funciona para SMTP de terceiros — Maycon
//                     precisa gerar um App Password nas configurações
//                     de segurança da conta Google, confirmar antes
//                     de testar em produção)
// ============================================================

import nodemailer from 'nodemailer'

// ============================================================
// getTransporter()
// Cria o transporte SMTP a cada chamada (sem cache/singleton — o
// volume de envio deste módulo é baixíssimo, poucos resets por mês
// no cenário de 5 usuários internos, não justifica a complexidade
// de reaproveitar conexão)
// Chamado por: enviarEmailNovaSenha()
// ============================================================
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,               // smtp.gmail.com
    port: Number(process.env.SMTP_PORT ?? 465), // 465
    secure: true,                                // SSL — porta 465 exige secure:true (diferente de 587/STARTTLS)
    auth: {
      user: process.env.SMTP_USER,               // contato@cerasbabinete.com.br
      pass: process.env.SMTP_PASSWORD,           // Google App Password — ver nota no cabeçalho deste arquivo
    },
  })
}

// ============================================================
// enviarEmailNovaSenha()
// Envia o e-mail de senha nova (usado tanto pela criação de usuário
// quanto pelo reset — Especificação §2.4, propósitos 1 e 2 são o
// mesmo tipo de e-mail, só disparado em momentos diferentes).
// Lança erro se o envio falhar — o chamador (resetarSenhaUsuario em
// usuariosService.ts) depende disso: se este envio falhar, a troca
// de senha no Auth NUNCA é feita (ordem confirmada por Maycon).
// Chamado por: lib/usuariosService.ts (resetarSenhaUsuario)
// ============================================================
export async function enviarEmailNovaSenha(params: {
  destinatario: string    // email_pessoal do usuário
  nomeCompleto: string
  username: string        // Necessário no corpo do e-mail — sem isso a pessoa não sabe com qual login usar a senha nova
  novaSenha: string
}): Promise<void> {
  const { destinatario, nomeCompleto, username, novaSenha } = params

  const transporter = getTransporter()

  try {
    await transporter.sendMail({
      from: `"Ceras Babinete — Gestão Financeira" <${process.env.SMTP_USER}>`,
      to: destinatario,
      subject: 'Sua senha de acesso foi redefinida',
      text:
        `Olá, ${nomeCompleto}.\n\n` +
        `Sua senha de acesso ao sistema Ceras Babinete — Gestão Financeira foi redefinida.\n\n` +
        `Usuário: ${username}\n` +
        `Nova senha: ${novaSenha}\n\n` +
        `Use esses dados para entrar no sistema. Se você não pediu essa alteração, avise o Administrador imediatamente.`,
      html:
        `<div style="font-family: Tahoma, Geneva, sans-serif; color: #3a6080;">` +
        `<p>Olá, ${nomeCompleto}.</p>` +
        `<p>Sua senha de acesso ao sistema <strong>Ceras Babinete — Gestão Financeira</strong> foi redefinida.</p>` +
        `<p><strong>Usuário:</strong> ${username}<br/>` +
        `<strong>Nova senha:</strong> ${novaSenha}</p>` +
        `<p>Use esses dados para entrar no sistema. Se você não pediu essa alteração, avise o Administrador imediatamente.</p>` +
        `</div>`,
    })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[usuariosMailer] enviarEmailNovaSenha error:', mensagemErro)
    throw new Error(`Falha ao enviar e-mail de senha: ${mensagemErro}`)
  }
}
