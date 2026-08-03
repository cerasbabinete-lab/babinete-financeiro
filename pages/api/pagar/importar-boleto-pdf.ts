// ============================================================
// pages/api/pagar/importar-boleto-pdf.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Recebe um boleto PDF de um FORNECEDOR (a pagar) como corpo
//         binário, extrai texto com pdf-parse (server-side), decodifica
//         a linha digitável (lib/pagar/boletoPdfParserPagar.ts) e
//         vincula nosso_numero + linha_digitavel ao título existente
//         em contas_a_pagar. Réplica funcional exata de
//         pages/api/importar-boleto-pdf.ts (Contas a Receber) — mesmo
//         padrão de bodyParser desabilitado + leitura manual do stream
//         + PDFParse (classe, API v2) — só o critério de matching do
//         título muda (ver nota abaixo).
// DIFERENÇA CONFIRMADA COM O USUÁRIO: em Receber, o título é
// encontrado por numero_documento + data_vencimento, porque todo
// boleto de lá tem o mesmo layout MIGRATE previsível. Aqui os boletos
// vêm de fornecedores/bancos diferentes — não dá pra confiar em texto
// de "número do documento" extraído por regex. O matching usa
// fornecedor (CNPJ/CPF, quando o parser consegue achar no texto) +
// valor + data de vencimento, ambos decodificados DIRETO da linha
// digitável (determinístico, não depende de layout de texto).
// CRÍTICO: pdf-parse é CJS Node.js — não pode rodar no browser.
// Conecta com: lib/pagar/boletoPdfParserPagar.ts,
//              components/pagar/ContasAPagarHeader.tsx,
//              components/pagar/BasebarContasPagar.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { PDFParse } from 'pdf-parse'
import { parsearBoletoPagarPdf } from '@/lib/pagar/boletoPdfParserPagar'

// Desabilita o bodyParser do Next.js — lemos o stream manualmente,
// mesmo padrão exato da rota equivalente de Contas a Receber
export const config = { api: { bodyParser: false } }

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// Função: formatarComoCnpjOuCpf
// QA fix (bug real confirmado — boleto ISOGAMA, vencimento 28/08/2026,
// valor 731,50): o CNPJ extraído do PDF vem só em dígitos, mas
// favorecido_cnpj_cpf é guardado FORMATADO com pontuação
// ("80.228.893/0001-66") — buscar só pelos dígitos puros via ILIKE
// nunca bate contra um valor formatado (a pontuação quebra a
// contiguidade da substring). Mesmo padrão de raw-digit + formatado
// já usado em rosterConciliacaoPagar.ts e motorConciliacao.ts —
// faltava aqui, causava a query inteira retornar vazia mesmo com
// valor e vencimento corretos.
// ------------------------------------------------------------
function formatarComoCnpjOuCpf(digitos: string): string | null {
  if (digitos.length === 14) return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (digitos.length === 11) return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return null
}

// ── Lê o body da request como Buffer ────────────────────────
function lerBodyBuffer(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

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

  try {
    // ── Lê o PDF como Buffer ──────────────────────────────
    const buffer = await lerBodyBuffer(req)
    if (!buffer.length) {
      return res.status(400).json({ erro: 'Nenhum arquivo PDF recebido' })
    }

    // ── Extrai texto do PDF (server-side Node.js) ─────────
    const parser = new PDFParse({ data: buffer })
    let textoPdf: string
    try {
      const resultado = await parser.getText()
      textoPdf = resultado.text
    } finally {
      await parser.destroy()
    }

    // ── Decodifica a linha digitável (valor, vencimento, Nosso Número)
    const { resultado, erros } = parsearBoletoPagarPdf(textoPdf)

    if (!resultado) {
      const campos = erros.map((e) => `${e.campo}: ${e.detalhe}`).join(' | ')
      return res.status(422).json({ erro: `Não foi possível extrair dados do boleto. ${campos}` })
    }

    const { nossoNumero, linhaDigitavel, dataVencimento, valor, cnpjCpfFornecedor } = resultado

    // ── Busca o título por valor + vencimento (+ CNPJ/CPF, se achado)
    // em contas_a_pagar, entre os que ainda estão em aberto
    let query = supabase
      .from('contas_a_pagar')
      .select('id, nosso_numero, linha_digitavel, favorecido_nome, favorecido_cnpj_cpf, valor, data_vencimento')
      .eq('data_vencimento', dataVencimento)
      .eq('valor', valor)
      .eq('status', 'em_aberto')
      .is('deleted_at', null)

    if (cnpjCpfFornecedor) {
      // Filtro extra quando o parser conseguiu achar o CNPJ/CPF no
      // texto — reduz risco de ambiguidade se dois fornecedores
      // diferentes tiverem, por coincidência, o mesmo valor+vencimento.
      // Busca as DUAS variantes (dígitos puros + formatada), já que o
      // banco guarda formatado (ver nota do QA fix acima)
      const formatado = formatarComoCnpjOuCpf(cnpjCpfFornecedor)
      const partesOr = [`favorecido_cnpj_cpf.ilike.%${cnpjCpfFornecedor}%`]
      if (formatado) partesOr.push(`favorecido_cnpj_cpf.ilike.%${formatado}%`)
      query = query.or(partesOr.join(','))
    }

    const { data: candidatos, error: errBusca } = await query

    if (errBusca) {
      return res.status(500).json({ erro: `Erro ao buscar título: ${errBusca.message}` })
    }

    if (!candidatos || candidatos.length === 0) {
      return res.status(200).json({
        vinculado: false,
        nossoNumero,
        valor,
        dataVencimento,
        descricao: `Nenhum título em aberto encontrado com valor ${valor} e vencimento ${dataVencimento}. Confirme se a Despesa/parcela já foi lançada.`,
      })
    }

    if (candidatos.length > 1) {
      // Mais de um título bate com valor+vencimento — mesmo espírito
      // do Motor de Conciliação (nunca decide sozinho na ambiguidade)
      return res.status(200).json({
        vinculado: false,
        nossoNumero,
        valor,
        dataVencimento,
        ambiguo: true,
        candidatos: candidatos.map((c) => ({ id: c.id, favorecido: c.favorecido_nome })),
        descricao: `Mais de um título em aberto bate com valor ${valor} e vencimento ${dataVencimento} — vincule manualmente pelo modal de edição do título correto.`,
      })
    }

    const encontrado = candidatos[0]

    // ── Já tem Nosso Número — só atualiza linha_digitavel se vazia
    if (encontrado.nosso_numero) {
      if (!encontrado.linha_digitavel) {
        await supabase
          .from('contas_a_pagar')
          .update({ linha_digitavel: linhaDigitavel })
          .eq('id', encontrado.id)
      }
      return res.status(200).json({
        vinculado: true,
        nossoNumero,
        valor,
        dataVencimento,
        descricao: `Título de ${encontrado.favorecido_nome} já possuía Nosso Número${!encontrado.linha_digitavel ? ' — linha digitável atualizada' : ''}.`,
      })
    }

    // ── Vincula nosso_numero + linha_digitavel ────────────
    const { error: errUpd } = await supabase
      .from('contas_a_pagar')
      .update({ nosso_numero: nossoNumero, linha_digitavel: linhaDigitavel })
      .eq('id', encontrado.id)

    if (errUpd) {
      return res.status(500).json({ erro: `Erro ao vincular: ${errUpd.message}` })
    }

    // Registra evento no histórico — mesmo tipo já usado pelo Motor
    // de Conciliação quando confirma Nosso Número via Relatório BB
    await supabase
      .from('contas_a_pagar_eventos')
      .insert({
        titulo_id: encontrado.id,
        tipo: 'nosso_numero_vinculado',
        descricao: `Nosso Número ${nossoNumero} e linha digitável vinculados via import de boleto PDF do fornecedor.`,
      })

    return res.status(200).json({
      vinculado: true,
      nossoNumero,
      valor,
      dataVencimento,
      descricao: `Nosso Número ${nossoNumero} vinculado ao título de ${encontrado.favorecido_nome}.`,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[importar-boleto-pdf pagar] error:', msg)
    return res.status(500).json({ erro: msg })
  }
}
