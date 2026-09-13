// ============================================================
// pages/api/backup/replicar-drive.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Backup
// Função: Recebe apenas o NOME de um backup já arquivado no Supabase
//         Storage, busca o conteúdo dele direto do bucket (server-side,
//         service role key) e sobe essa mesma cópia para o Google Drive
//         da conta cerasbabinete@gmail.com, pasta SGFB/Backups.
// Chamado por: fazerBackup() de cada lib/<modulo>Service.ts, logo
//              após o upload para o Supabase Storage ter sucesso.
// REVISÃO (pós-incidente storageQuotaExceeded): a primeira versão usava
// uma conta de serviço (JWT + chave privada). Contas de serviço NÃO TÊM
// cota de armazenamento própria no Drive — mesmo com a pasta
// compartilhada corretamente, a criação de arquivo falha sempre com 403
// "storageQuotaExceeded", porque uma conta pessoal do Gmail (sem Google
// Workspace) não tem Drives Compartilhados. A correção, que o próprio
// erro do Google recomendava ("use OAuth delegation instead"), é
// autenticar como o USUÁRIO REAL (cerasbabinete@gmail.com) via OAuth com
// refresh token — os arquivos passam a ser criados como se fosse upload
// manual da própria conta, usando a cota real dela (15GB).
// DECISÃO (ver revisão anterior, incidente 413): busca o conteúdo direto
// do Supabase Storage em vez de receber pelo corpo da requisição —
// mantido nesta revisão, continua valendo.
// DECISÃO: o Supabase Storage continua sendo a fonte de verdade — se o
// Drive falhar, o backup em si NÃO é perdido nem re-tentado
// automaticamente aqui; esta rota retorna erro em vez de lançar uma
// exceção que derrubaria o backup inteiro (ver lib/backupDrive.ts).
// Autenticação: mesma convenção do projeto — Bearer token + getUser()
// contra o Supabase, confirma que quem chamou está logado.
// Variáveis de ambiente necessárias:
//   GOOGLE_DRIVE_OAUTH_CLIENT_ID
//   GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
//   GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
//   GOOGLE_DRIVE_BACKUPS_FOLDER_ID
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface CorpoRequisicao {
  nomeArquivo: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth — mesmo padrão Bearer token + getUser() das demais rotas ──
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const { nomeArquivo } = req.body as CorpoRequisicao
  if (!nomeArquivo) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: nomeArquivo é obrigatório.' })
  }

  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
  const folderId = process.env.GOOGLE_DRIVE_BACKUPS_FOLDER_ID

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    console.error('[backup/replicar-drive] variáveis de ambiente OAuth do Google Drive ausentes')
    return res.status(500).json({ erro: 'Integração com o Google Drive não está configurada (variáveis de ambiente ausentes).' })
  }

  // Busca o conteúdo já arquivado, direto do Supabase Storage — nunca trafega
  // pelo corpo da requisição do navegador (ver nota no cabeçalho do arquivo).
  const { data: arquivoStorage, error: erroDownload } = await supabaseAdmin.storage
    .from('backups')
    .download(nomeArquivo)

  if (erroDownload || !arquivoStorage) {
    console.error('[backup/replicar-drive] erro ao baixar do Storage:', erroDownload?.message)
    return res.status(500).json({ erro: `Falha ao ler "${nomeArquivo}" do Supabase Storage: ${erroDownload?.message ?? 'arquivo não encontrado'}` })
  }

  const bufferConteudo = Buffer.from(await arquivoStorage.arrayBuffer())

  try {
    const accessToken = await obterAccessTokenGoogle(clientId, clientSecret, refreshToken)

    const metadata = { name: nomeArquivo, parents: [folderId] }
    const boundary = '-------backup-boundary-' + crypto.randomUUID()
    const corpoMultipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n`,
      ),
      bufferConteudo,
      Buffer.from(`\r\n--${boundary}--`),
    ])

    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: corpoMultipart,
    })

    if (!resp.ok) {
      const texto = await resp.text()
      throw new Error(`Google Drive respondeu ${resp.status}: ${texto}`)
    }

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[backup/replicar-drive] erro:', mensagem)
    return res.status(500).json({ erro: `Falha ao duplicar no Google Drive: ${mensagem}` })
  }
}

/** Troca o refresh token (de longa duração) por um access token novo (válido por ~1h). */
async function obterAccessTokenGoogle(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    const texto = await resp.text()
    throw new Error(`Falha ao renovar token do Google: ${resp.status} ${texto}`)
  }

  const dados = await resp.json()
  return dados.access_token as string
}


