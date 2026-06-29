// ============================================================
// pages/api/boleto.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Receber
// Função: Endpoint para geração de boleto 2ª via em PDF
// CRÍTICO: API exporta { Boleto, Banks } — não Boletos/Bancos
// CRÍTICO: data no formato YYYY-MM-DD (ISO) — lib usa parseISO
// CRÍTICO: passar res diretamente para pdfStream — sem PassThrough
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Boleto, Banks } = require('gerar-boletos')

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Dados fixos do cedente Ceras Babinete Ltda. ME
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
// buscarEnderecoCliente()
// Busca endereço completo na tabela clientes pelo id ou CNPJ/CPF
// Retorna logradouro formatado e CEP — usados no boleto do sacado
// ============================================================
async function buscarEnderecoCliente(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteId: number | null,
  clienteCpfCnpj: string,
): Promise<{ logradouro: string; cep: string }> {
  const vazio = { logradouro: '', cep: '' }

  try {
    let query = supabase
      .from('clientes')
      .select('end, num, bairro, cep, cnpj, cpf')
      .limit(1)

    if (clienteId) {
      // Busca preferencial por id — mais preciso
      query = query.eq('id', clienteId)
    } else if (clienteCpfCnpj) {
      // Fallback: busca por CNPJ/CPF sem pontuação
      const digits = clienteCpfCnpj.replace(/[^0-9]/g, '')
      const cnpjFmt = digits.length === 14
        ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
        : null
      const cpfFmt = digits.length === 11
        ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
        : null

      const filtros: string[] = []
      if (cnpjFmt) filtros.push(`cnpj.ilike.%${cnpjFmt}%`, `cnpj.ilike.%${digits}%`)
      if (cpfFmt)  filtros.push(`cpf.ilike.%${cpfFmt}%`,   `cpf.ilike.%${digits}%`)
      if (filtros.length === 0) return vazio

      query = query.or(filtros.join(','))
    } else {
      return vazio
    }

    const { data, error } = await query.single()
    if (error || !data) return vazio

    // Monta logradouro: "Rua X, 123 — Bairro Y"
    const partes: string[] = []
    if (data.end) partes.push(data.end)
    if (data.num) partes.push(data.num)
    if (data.bairro) partes.push(data.bairro)
    const logradouro = partes.join(', ')

    // CEP: garante formato 00000-000
    const cepDigitos = (data.cep ?? '').replace(/\D/g, '')
    const cep = cepDigitos.length === 8
      ? `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`
      : data.cep ?? ''

    return { logradouro, cep }
  } catch {
    return vazio
  }
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
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──────────────────────────────────────────────────
  const {
    nossoNumero,
    valor,
    dataVencimento,
    clienteNome,
    clienteCpfCnpj,
    clienteId,
    clienteMunicipio,
    clienteUf,
    numeroDocumento,
  } = req.body as {
    nossoNumero:       string
    valor:             number
    dataVencimento:    string
    clienteNome:       string
    clienteCpfCnpj?:   string
    clienteId?:        number | null
    clienteMunicipio?: string
    clienteUf?:        string
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
    const dataHojeIso = new Date().toISOString().slice(0, 10)

    // ── Busca endereço completo do cliente ────────────────
    const { logradouro, cep } = await buscarEnderecoCliente(
      supabase,
      clienteId ?? null,
      clienteCpfCnpj ?? '',
    )

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
          logradouro: logradouro,              // Buscado do cadastro de clientes
          bairro:     '',
          cidade:     clienteMunicipio ?? '',
          estadoUF:   clienteUf ?? '',
          cep:        cep,                     // Buscado do cadastro de clientes
        },
      },

      boleto: {
        numeroDocumento:  numeroDocumento ?? nossoNumero,
        especieDocumento: 'DM',
        valor:            valor,
        datas: {
          vencimento:    dataVencimento,        // ISO YYYY-MM-DD — parseISO interno
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
    // gerarPDF do PDFKit já faz pdf.pipe(res) internamente
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="boleto_${nossoNumero}.pdf"`)

    await novoBoleto.pdfStream(res)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[boleto] handler error:', msg)
    if (!res.headersSent) res.status(500).json({ erro: msg })
  }
}
