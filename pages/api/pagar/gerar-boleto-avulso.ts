// ============================================================
// pages/api/pagar/gerar-boleto-avulso.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Busca um título por id e retorna o PDF da 2ª via avulsa
//         (Recibo do Sacado + Ficha de Compensação), gerado a partir
//         de linha_digitavel + nosso_numero já salvos no título — não
//         depende do PDF original do fornecedor (não é guardado).
// Conecta com: lib/pagar/gerarBoletoAvulso.ts,
//              components/pagar/ContasAPagarModal.tsx,
//              components/pagar/ContasAPagarTabela.tsx
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { gerarBoletoAvulsoPdf } from '@/lib/pagar/gerarBoletoAvulso'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const id = typeof req.query.id === 'string' ? req.query.id : null
  if (!id) return res.status(400).json({ erro: 'Parâmetro id é obrigatório' })

  try {
    const { data: titulo, error: errBusca } = await supabase
      .from('contas_a_pagar')
      .select('id, numero_documento, data_vencimento, data_processamento, valor, nosso_numero, linha_digitavel, favorecido_nome, favorecido_cnpj_cpf, favorecido_endereco, favorecido_dados_bancarios')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (errBusca) return res.status(500).json({ erro: `Erro ao buscar título: ${errBusca.message}` })
    if (!titulo) return res.status(404).json({ erro: 'Título não encontrado' })

    if (!titulo.linha_digitavel || !titulo.nosso_numero) {
      return res.status(422).json({
        erro: 'Título não possui linha digitável e/ou Nosso Número cadastrados — não é possível gerar a 2ª via. Preencha esses campos no modal ou importe o boleto do fornecedor primeiro.',
      })
    }

    const { buffer, erros } = await gerarBoletoAvulsoPdf({
      linhaDigitavel:           titulo.linha_digitavel,
      nossoNumero:              titulo.nosso_numero,
      valor:                    titulo.valor,
      dataVencimento:           titulo.data_vencimento,
      dataProcessamento:        titulo.data_processamento,
      numeroDocumento:          titulo.numero_documento,
      favorecidoNome:           titulo.favorecido_nome,
      favorecidoCnpjCpf:        titulo.favorecido_cnpj_cpf,
      favorecidoEndereco:       titulo.favorecido_endereco,
      favorecidoDadosBancarios: titulo.favorecido_dados_bancarios,
    })

    if (!buffer) {
      const campos = erros.map((e) => `${e.campo}: ${e.detalhe}`).join(' | ')
      return res.status(422).json({ erro: `Não foi possível gerar o boleto. ${campos}` })
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="2via-boleto-${titulo.numero_documento ?? titulo.id}.pdf"`)
    return res.status(200).send(buffer)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[gerar-boleto-avulso] error:', msg)
    return res.status(500).json({ erro: msg })
  }
}
