// ============================================================
// pages/api/boleto.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Endpoint para geração de boleto 2ª via em PDF
//         Recebe dados do título via POST JSON,
//         gera PDF usando gerar-boletos e faz stream para HTTP
// Conecta com: ContasReceberModal.tsx (botão "2ª Via Boleto")
// CRÍTICO: API exporta { Boleto, Banks } — não Boletos/Bancos
// CRÍTICO: data no formato YYYY-MM-DD (ISO) — lib usa parseISO internamente
// CRÍTICO: gerarPDF já faz pdf.pipe(stream) internamente via PDFKit —
//          passar res diretamente, sem PassThrough intermediário
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Importação CJS — gerar-boletos é CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Boleto, Banks } = require('gerar-boletos')

// ============================================================
// getSupabaseAdmin()
// ============================================================
function getSupabaseAdmin() {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, svcKey)
}

// ============================================================
// Dados fixos do cedente Ceras Babinete Ltda. ME
// ============================================================
const CEDENTE = {
  nome:          'CERAS BABINETE LTDA. ME',
  cnpj:          '10666614000160',
  agencia:       '3512',
  agenciaDigito: '2',
  conta:         '0000025605',
  contaDigito:   '6',
  carteira:      '17',
  logradouro:    'AV DOS PALMARES 831',
  bairro:        'JARDIM AMERICA',
  cidade:        'MARINGA',
  uf:            'PR',
  cep:           '87045-290',
}

// ============================================================
// handler
// ============================================================
export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const {
    nossoNumero,
    valor,
    dataVencimento,
    clienteNome,
    clienteCpfCnpj,
    clienteEndereco,
    clienteMunicipio,
    clienteUf,
    clienteCep,
    numeroDocumento,
  } = req.body as {
    nossoNumero:       string
    valor:             number
    dataVencimento:    string   // YYYY-MM-DD
    clienteNome:       string
    clienteCpfCnpj?:   string
    clienteEndereco?:  string
    clienteMunicipio?: string
    clienteUf?:        string
    clienteCep?:       string
    numeroDocumento?:  string
  }

  // ── Validações ────────────────────────────────────────────
  if (!nossoNumero || nossoNumero.length !== 17)
    return res.status(400).json({ erro: 'nossoNumero inválido — deve ter 17 dígitos' })
  if (!valor || valor <= 0)
    return res.status(400).json({ erro: 'valor inválido' })
  if (!dataVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento))
    return res.status(400).json({ erro: 'dataVencimento inválida — use YYYY-MM-DD' })
  if (!clienteNome)
    return res.status(400).json({ erro: 'clienteNome obrigatório' })

  try {
    const dataHojeIso = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const cepDigitos = (clienteCep ?? '').replace(/\D/g, '').padStart(8, '0')
    const cepFmt     = cepDigitos.length === 8
      ? `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`
      : ''

    // ── Monta e gera o boleto ─────────────────────────────
    const novoBoleto = new Boleto({
      banco: new Banks.BancoDoBrasil(),

      beneficiario: {
        nome:   CEDENTE.nome,
        cnpj:   CEDENTE.cnpj,
        dadosBancarios: {
          carteira:          CEDENTE.carteira,
          agencia:           CEDENTE.agencia,
          agenciaDigito:     CEDENTE.agenciaDigito,
          conta:             CEDENTE.conta,
          contaDigito:       CEDENTE.contaDigito,
          nossoNumero:       nossoNumero,
          nossoNumeroDigito: '',
        },
        endereco: {
          logradouro: CEDENTE.logradouro,
          bairro:     CEDENTE.bairro,
          cidade:     CEDENTE.cidade,
          estadoUF:   CEDENTE.uf,
          cep:        CEDENTE.cep,
        },
      },

      pagador: {
        nome:             clienteNome,
        registroNacional: (clienteCpfCnpj ?? '').replace(/[^0-9]/g, '') || '',
        endereco: {
          logradouro: clienteEndereco ?? '',
          bairro:     '',
          cidade:     clienteMunicipio ?? '',
          estadoUF:   clienteUf ?? '',
          cep:        cepFmt,
        },
      },

      boleto: {
        numeroDocumento:  numeroDocumento ?? nossoNumero,
        especieDocumento: 'DM',
        valor:            valor,
        datas: {
          // ISO YYYY-MM-DD — aceito pela lib via parseISO do date-fns
          vencimento:    dataVencimento,
          processamento: dataHojeIso,
          documentos:    dataHojeIso,
        },
      },

      instrucoes: [
        'Não receber após o vencimento.',
        'Em caso de dúvidas: (44) 3028-0174',
      ],
    })

    novoBoleto.gerarBoleto()

    // ── Stream PDF direto para res ────────────────────────
    // gerarPDF do PDFKit já faz pdf.pipe(stream) internamente.
    // Passar res diretamente evita o PassThrough duplo que travava o stream.
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="boleto_${nossoNumero}.pdf"`)

    // pdfStream passa res como stream — PDFKit escreve e emite 'finish'
    // a lib aguarda 'finish' via streamUtils antes de resolver a Promise
    await novoBoleto.pdfStream(res)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[boleto] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
