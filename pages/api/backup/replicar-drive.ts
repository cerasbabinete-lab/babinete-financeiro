// ============================================================
// pages/api/backup/replicar-drive.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Backup
// Função: Recebe o conteúdo de um backup já arquivado no Supabase
//         Storage e sobe a MESMA cópia para o Google Drive da conta
//         cerasbabinete@gmail.com, pasta SGFB/Backups — via conta de
//         serviço (nunca credenciais de usuário, nunca no browser).
// Chamado por: fazerBackup() de cada lib/<modulo>Service.ts, logo
//              após o upload para o Supabase Storage ter sucesso.
// DECISÃO: o Supabase Storage continua sendo a fonte de verdade —
// se o Drive falhar, o backup em si NÃO é perdido nem re-tentado
// automaticamente aqui; esta rota retorna erro em vez de lançar uma
// exceção que derrubaria o backup inteiro (ver lib/backupDrive.ts,
// o service compartilhado, para como o erro chega ao usuário).
// Autenticação: mesma convenção do projeto — Bearer token +
// getUser() contra o Supabase, confirma que quem chamou está logado.
// Variáveis de ambiente necessárias:
//   GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY (com \n literais — ver nota abaixo)
//   GOOGLE_DRIVE_BACKUPS_FOLDER_ID
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { Readable } from 'stream'

interface CorpoRequisicao {
  nomeArquivo: string
  conteudo: string // texto do JSON já pronto (mesmo conteúdo enviado ao Supabase Storage)
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

  const { nomeArquivo, conteudo } = req.body as CorpoRequisicao
  if (!nomeArquivo || typeof conteudo !== 'string') {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: nomeArquivo e conteudo são obrigatórios.' })
  }

  const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL
  const privateKeyBruta = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY
  const folderId = process.env.GOOGLE_DRIVE_BACKUPS_FOLDER_ID

  if (!clientEmail || !privateKeyBruta || !folderId) {
    console.error('[backup/replicar-drive] variáveis de ambiente do Google Drive ausentes')
    return res.status(500).json({ erro: 'Integração com o Google Drive não está configurada (variáveis de ambiente ausentes).' })
  }

  // No .env, quebras de linha da chave privada viram "\n" literais — precisa
  // devolvê-las a quebras de linha reais antes de usar, senão a assinatura JWT falha.
  const privateKey = privateKeyBruta.replace(/\\n/g, '\n')

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })

    const drive = google.drive({ version: 'v3', auth })

    await drive.files.create({
      requestBody: {
        name: nomeArquivo,
        parents: [folderId],
      },
      media: {
        mimeType: 'application/json',
        body: Readable.from(Buffer.from(conteudo, 'utf-8')),
      },
      fields: 'id',
    })

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[backup/replicar-drive] erro:', mensagem)
    return res.status(500).json({ erro: `Falha ao duplicar no Google Drive: ${mensagem}` })
  }
}
