// ============================================================
// pages/api/pagar/importar-relatorio.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Recebe o PDF do Relatório de Pagamentos Realizados BB (já
//         em base64, convertido no client), calcula o hash SHA-256,
//         checa duplicidade de arquivo inteiro, faz o parsing
//         (lib/pagar/parserRelatorioBB.ts), roda o Motor de
//         Conciliação (lib/pagar/motorConciliacao.ts) para CADA
//         registro, e registra o arquivo como importado ao final.
// Conecta com: lib/pagar/parserRelatorioBB.ts,
//              lib/pagar/motorConciliacao.ts,
//              lib/pagar/duplicateCheckPagar.ts, types/contasAPagar.ts
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Parsing do Relatório de Pagamentos BB" +
//             "Function: Motor de Conciliação"
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

import { parseRelatorioBB } from '@/lib/pagar/parserRelatorioBB'
import { conciliarRegistro } from '@/lib/pagar/motorConciliacao'
import { verificarHashRelatorioJaImportado, registrarArquivoImportado } from '@/lib/pagar/duplicateCheckPagar'
import type { ResumoImportacaoPagar, ResultadoConciliacaoItem } from '@/types/contasAPagar'

// ------------------------------------------------------------
// CONFIG: eleva o limite do corpo da requisição — o PDF em base64
// infla ~33% sobre o tamanho original (mesmo bug #5 já documentado
// e corrigido no módulo Despesas, importar-documento.ts)
// ------------------------------------------------------------
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
}

// ------------------------------------------------------------
// FUNÇÃO: getSupabaseAdmin — mesmo padrão local-por-rota do projeto
// ------------------------------------------------------------
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// TIPO: corpo esperado da requisição
// ------------------------------------------------------------
interface CorpoRequisicaoImportarRelatorio {
  arquivoBase64: string // conteúdo do PDF em base64, sem o prefixo "data:...;base64,"
  nomeArquivo: string
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST apenas
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  // ── Auth — Bearer token + getUser(), nunca getSession() ──
  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  // ── Body ──
  const { arquivoBase64, nomeArquivo } = req.body as CorpoRequisicaoImportarRelatorio
  if (!arquivoBase64 || !nomeArquivo) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: arquivoBase64 e nomeArquivo são obrigatórios.' })
  }

  try {
    // Decodifica o base64 para Buffer binário — necessário tanto para
    // o hash quanto para o pdf-parse
    const bufferArquivo = Buffer.from(arquivoBase64, 'base64')

    // ── Passo 1: hash SHA-256 + checagem de dedupe (arquivo inteiro) ──
    // Node crypto (server-side), diferente do Web Crypto (crypto.subtle)
    // usado no client para hash de arquivos — mesmo algoritmo, contexto diferente
    const hashArquivo = crypto.createHash('sha256').update(bufferArquivo).digest('hex')

    const checagem = await verificarHashRelatorioJaImportado(supabaseAdmin, hashArquivo)
    if (checagem.jaImportado) {
      return res.status(409).json({
        erro: 'Este Relatório BB já foi importado antes.',
        importacaoAnterior: checagem.importacaoAnterior,
      })
    }

    // ── Passo 2: parsing determinístico (com fallback Gemini por linha) ──
    const resultadoParsing = await parseRelatorioBB(bufferArquivo)

    // ── Passo 3: roda o Motor de Conciliação para CADA registro ──
    const resumo: ResumoImportacaoPagar = {
      origem: 'relatorio_bb',
      totalRegistros: resultadoParsing.registros.length,
      baixasAutomaticas: 0,
      despesasCriadasAutomaticamente: 0,
      pendentesConfirmacao: 0,
      naoEncontrados: 0,
      duplicadosIgnorados: 0, // não se aplica aqui — dedupe é por arquivo inteiro, já barrado acima
      detalhes: [],
    }

    for (const registro of resultadoParsing.registros) {
      const resultado: ResultadoConciliacaoItem = await conciliarRegistro(supabaseAdmin, {
        nomeFavorecido: registro.nomeFavorecido,
        cnpjCpf: registro.cnpjCpfFavorecido,
        valor: registro.valor,
        data: registro.dataPagamento,
        nossoNumero: registro.nossoNumero,
        origem: 'relatorio_bb',
      }, registro)

      resumo.detalhes.push(resultado)

      switch (resultado.tipo) {
        case 'baixa_automatica':
          resumo.baixasAutomaticas++
          break
        case 'despesa_criada_automaticamente':
          resumo.despesasCriadasAutomaticamente++
          break
        case 'pendente_confirmacao':
          resumo.pendentesConfirmacao++
          break
        case 'nao_encontrado':
          resumo.naoEncontrados++
          break
      }
    }

    // ── Passo 4: registra o arquivo como importado (SEMPRE por último) ──
    await registrarArquivoImportado(supabaseAdmin, {
      nome_arquivo: nomeArquivo,
      hash_arquivo: hashArquivo,
      periodo_de: resultadoParsing.periodoDe,
      periodo_ate: resultadoParsing.periodoAte,
      total_registros: resultadoParsing.registros.length,
      processados: resumo.baixasAutomaticas + resumo.despesasCriadasAutomaticamente,
      nao_encontrados: resumo.naoEncontrados + resultadoParsing.linhasComErro,
    })

    return res.status(200).json({
      resumo,
      linhasComErro: resultadoParsing.linhasComErro,
      consistenteComRodape: resultadoParsing.consistenteComRodape,
      totalDeclaradoRelatorio: resultadoParsing.totalDeclaradoRelatorio,
    })

  } catch (err: unknown) {
    // Convenção do projeto: catch (err: unknown), nunca "any"
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[importar-relatorio] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao importar Relatório BB: ${mensagemErro}` })
  }
}
