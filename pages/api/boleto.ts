// ============================================================
// pages/api/boleto.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Endpoint para geração de boleto 2ª via em PDF
//         Recebe dados do título via POST JSON,
//         gera PDF usando gerar-boletos com PDFKit e faz stream
//         direto para a resposta HTTP (Pages Router — Node.js)
// Conecta com: ContasReceberModal.tsx (botão "2ª Via Boleto")
//              gerar-boletos (lib npm)
//              types/contasReceber.ts (CEDENTE_BB)
// CRÍTICO: pipe() deve ser conectado ANTES de pdfStream() escrever
// CRÍTICO: Nosso Número deve ter exatamente 17 dígitos para BB
// CRÍTICO: Verificar auth Supabase antes de qualquer processamento
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { PassThrough } from 'stream'
import { createClient } from '@supabase/supabase-js'

// Importação CJS — gerar-boletos é CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Boletos, Bancos } = require('gerar-boletos')

// ============================================================
// getSupabaseAdmin()
// Cliente admin server-side — usa service role key para
// verificar auth via getUser() sem depender de cookies
// Mesmo padrão de pages/api/danfe.ts (único outro Pages Router API)
// ============================================================
function getSupabaseAdmin() {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, svcKey)
}

// ============================================================
// Dados fixos do cedente Ceras Babinete Ltda. ME
// Espelhados de CEDENTE_BB em types/contasReceber.ts
// Hardcoded aqui pois pages/api não importa de types client-side
// ============================================================
const CEDENTE = {
  nome:         'CERAS BABINETE LTDA. ME',
  cnpj:         '10666614000160',    // 14 dígitos sem pontuação
  agencia:      '3512',              // Agência sem dígito
  agenciaDigito: '2',                // Dígito verificador da agência
  conta:        '0000025605',        // Conta sem dígito (10 chars)
  contaDigito:  '6',                 // Dígito verificador da conta
  carteira:     '17',                // Carteira de cobrança BB
  logradouro:   'AV DOS PALMARES, 831',
  bairro:       'JARDIM AMERICA',
  cidade:       'MARINGA',
  uf:           'PR',
  cep:          '87045-290',
}

// ============================================================
// handler
// Aceita POST com JSON contendo os dados do título
// ============================================================
export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // Aceita apenas POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Verificação de autenticação Supabase ─────────────────
  // H-3 FIX: valida JWT antes de qualquer processamento
  // Usa o Authorization header Bearer token enviado pelo cliente
  // O cliente deve incluir o access_token da sessão atual
  const authHeader = req.headers.authorization ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    // Sem token na requisição — rejeita imediatamente
    return res.status(401).json({ erro: 'Não autorizado' })
  }

  // Valida o token contra o Supabase usando getUser()
  // getUser() faz network call ao Supabase — mais seguro que getSession()
  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    // Token inválido ou expirado — rejeita com 401
    return res.status(401).json({ erro: 'Não autorizado' })
  }
  // ── Fim da verificação de autenticação ───────────────────

  // ── Extrai e valida os dados do corpo da requisição ──────
  const {
    nossoNumero,
    valor,
    dataVencimento,  // YYYY-MM-DD
    clienteNome,
    clienteCpfCnpj,
    clienteEndereco,
    clienteMunicipio,
    clienteUf,
    clienteCep,
    numeroDocumento,
  } = req.body as {
    nossoNumero:      string
    valor:            number
    dataVencimento:   string  // ISO YYYY-MM-DD
    clienteNome:      string
    clienteCpfCnpj?:  string
    clienteEndereco?: string
    clienteMunicipio?: string
    clienteUf?:       string
    clienteCep?:      string
    numeroDocumento?: string
  }

  // Valida campos obrigatórios
  if (!nossoNumero || nossoNumero.length !== 17) {
    return res.status(400).json({ erro: 'nossoNumero inválido — deve ter 17 dígitos' })
  }
  if (!valor || valor <= 0) {
    return res.status(400).json({ erro: 'valor inválido' })
  }
  if (!dataVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento)) {
    return res.status(400).json({ erro: 'dataVencimento inválida — use YYYY-MM-DD' })
  }
  if (!clienteNome) {
    return res.status(400).json({ erro: 'clienteNome obrigatório' })
  }

  try {
    // ── Converte data de YYYY-MM-DD para DD-MM-YYYY (formato da lib) ──
    const [ano, mes, dia] = dataVencimento.split('-')
    const dataVencLib     = `${dia}-${mes}-${ano}` // 'DD-MM-YYYY'
    const hoje            = new Date()
    const dataHojeLib     = `${String(hoje.getDate()).padStart(2, '0')}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${hoje.getFullYear()}`

    // ── Monta o objeto do boleto para gerar-boletos ──────────
    const boletoData = {
      banco: new Bancos.BancoDoBrasil(), // Instância do banco BB

      // Beneficiário (cedente) — dados fixos da Ceras Babinete
      beneficiario: {
        nome:   CEDENTE.nome,
        cnpj:   CEDENTE.cnpj,
        dadosBancarios: {
          carteira:     CEDENTE.carteira,             // '17'
          agencia:      CEDENTE.agencia,              // '3512'
          agenciaDigito: CEDENTE.agenciaDigito,       // '2'
          conta:        CEDENTE.conta,                // '0000025605'
          contaDigito:  CEDENTE.contaDigito,          // '6'
          nossoNumero:  nossoNumero,                  // 17 dígitos — path especial BB
          nossoNumeroDigito: '',                      // Vazio para nosso_numero 17 dígitos
        },
        endereco: {
          logradouro: CEDENTE.logradouro,
          bairro:     CEDENTE.bairro,
          cidade:     CEDENTE.cidade,
          estadoUF:   CEDENTE.uf,
          cep:        CEDENTE.cep,
        },
      },

      // Pagador (sacado) — dados do cliente do título
      pagador: {
        nome:             clienteNome,
        // M-2 FIX: fallback '' em vez de '00000000000' — 11 zeros podem ser rejeitados
        // pela lib gerar-boletos; string vazia é tratada como campo omitido
        registroNacional: (clienteCpfCnpj ?? '').replace(/[^0-9]/g, '') || '',
        endereco: {
          logradouro: clienteEndereco ?? '',
          bairro:     '',
          cidade:     clienteMunicipio ?? '',
          estadoUF:   clienteUf ?? '',
          cep:        (clienteCep ?? '').replace(/\D/g, '').padStart(8, '0').replace(/(\d{5})(\d{3})/, '$1-$2'),
        },
      },

      // Dados do boleto
      boleto: {
        numeroDocumento: numeroDocumento ?? nossoNumero, // Fallback para nosso_numero
        especieDocumento: 'DM',                          // Duplicata Mercantil
        valor:            valor,
        datas: {
          vencimento:  dataVencLib,  // DD-MM-YYYY
          processamento: dataHojeLib, // Hoje
          documentos:  dataHojeLib,  // Hoje
        },
      },

      // Instruções ao banco/pagador (padrão Ceras Babinete)
      instrucoes: [
        'Não receber após o vencimento.',
        'Em caso de dúvidas: (44) 3028-0174',
      ],
    }

    // ── Gera o boleto e obtém o gerador ──────────────────────
    const novoBoleto = new Boletos(boletoData)
    novoBoleto.gerarBoleto() // Inicializa os cálculos internos (barcode, linha dig., etc.)

    // ── Usa PassThrough como buffer em memória para streaming ─
    // A lib escreve no PassThrough, depois pipamos para res
    const passThrough = new PassThrough()

    // ── Headers HTTP ─────────────────────────────────────────
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="boleto_${nossoNumero}.pdf"`,
    )

    // ── Stream: pipe conectado ANTES de pdfStream escrever ───
    // M-1 FIX: conectar pipe() primeiro garante que nenhum dado
    // é perdido caso pdfStream() encerre o PassThrough antes de
    // pipe() ser chamado (evita pipe-after-end)
    passThrough.pipe(res)

    // Trata erros no stream após pipe conectado
    passThrough.on('error', (err: Error) => {
      console.error('[boleto] stream error:', err)
      if (!res.headersSent) {
        res.status(500).json({ erro: 'Erro ao gerar PDF do boleto' })
      }
    })

    // Inicia a geração e escrita do PDF no PassThrough
    // pdfStream() escreve os bytes e encerra o stream quando termina
    await novoBoleto.pdfStream(passThrough)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[boleto] handler error:', msg)
    if (!res.headersSent) {
      res.status(500).json({ erro: msg })
    }
  }
}
