// ============================================================
// pages/api/pagar/importar-comprovante.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Recebe um comprovante individual — PDF de boleto (base64)
//         OU o arquivo Comprovantes_BB.txt (texto puro, pode conter
//         múltiplos comprovantes) — detecta o tipo pelo mimeType
//         informado pelo client, roteia para o parser correto, checa
//         dedupe por identificador natural (NUNCA por hash de
//         arquivo — o TXT é sempre sobrescrito com o mesmo nome),
//         roda o Motor de Conciliação em cada registro extraído, e
//         registra cada comprovante como processado.
// Conecta com: lib/pagar/parserComprovantePdf.ts,
//              lib/pagar/parserComprovanteTxt.ts,
//              lib/pagar/motorConciliacao.ts,
//              lib/pagar/duplicateCheckPagar.ts, types/contasAPagar.ts
// Referência: Especificacao_Modulo_Contas_a_Pagar.md, Seção 5,
//             "Function: Parsing de Comprovante — PDF" e "— TXT"
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

import { parseComprovantePdf, decodificarCampoLivreDaLinhaDigitavel } from '@/lib/pagar/parserComprovantePdf'
import { parseComprovanteTxt } from '@/lib/pagar/parserComprovanteTxt'
import { conciliarRegistro } from '@/lib/pagar/motorConciliacao'
import { verificarComprovanteJaProcessado, registrarComprovanteProcessado } from '@/lib/pagar/duplicateCheckPagar'
import type { ResumoImportacaoPagar, ResultadoConciliacaoItem } from '@/types/contasAPagar'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb', // mesmo motivo do Relatório BB — base64 infla ~33%
    },
  },
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ------------------------------------------------------------
// TIPO: corpo esperado da requisição — union conforme o tipo de arquivo
// ------------------------------------------------------------
interface CorpoRequisicaoImportarComprovante {
  mimeType: string // 'application/pdf' ou 'text/plain'
  arquivoBase64?: string // presente quando mimeType = 'application/pdf'
  conteudoTxt?: string // presente quando mimeType = 'text/plain'
}

// ------------------------------------------------------------
// HANDLER: default export da rota — POST apenas
// ------------------------------------------------------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' })
  }

  const token = (req.headers.authorization ?? '').replace('Bearer ', '').trim() || null
  if (!token) return res.status(401).json({ erro: 'Não autorizado' })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ erro: 'Não autorizado' })

  const { mimeType, arquivoBase64, conteudoTxt } = req.body as CorpoRequisicaoImportarComprovante

  if (!mimeType) {
    return res.status(400).json({ erro: 'Corpo da requisição incompleto: mimeType é obrigatório.' })
  }

  const resumo: ResumoImportacaoPagar = {
    origem: mimeType === 'application/pdf' ? 'comprovante_pdf' : 'comprovante_txt',
    totalRegistros: 0,
    baixasAutomaticas: 0,
    despesasCriadasAutomaticamente: 0,
    pendentesConfirmacao: 0,
    naoEncontrados: 0,
    duplicadosIgnorados: 0,
    detalhes: [],
  }

  try {
    // ── Caminho A: comprovante PDF de boleto — 1 único registro ──
    if (mimeType === 'application/pdf') {
      if (!arquivoBase64) {
        return res.status(400).json({ erro: 'arquivoBase64 é obrigatório para mimeType application/pdf.' })
      }

      const bufferArquivo = Buffer.from(arquivoBase64, 'base64')
      const registro = await parseComprovantePdf(bufferArquivo)
      resumo.totalRegistros = 1

      // Dedupe por NR.AUTENTICACAO — nunca por hash de arquivo
      const jaProcessado = await verificarComprovanteJaProcessado(supabaseAdmin, registro.nrAutenticacao)
      if (jaProcessado) {
        resumo.duplicadosIgnorados = 1
        return res.status(200).json({ resumo })
      }

      const resultado: ResultadoConciliacaoItem = await conciliarRegistro(supabaseAdmin, {
        nomeFavorecido: registro.nomeFavorecido,
        cnpjCpf: registro.cnpjCpfFavorecido ?? null,
        valor: registro.valor,
        data: registro.dataPagamento,
        // QA fix (sessão 12/07/2026 — bug real confirmado com o
        // comprovante da SKY): antes gravado como `null` fixo, com um
        // comentário incorreto ("comprovante individual não traz
        // Nosso Número separado"). O parser JÁ extrai essa string
        // (linhaDigitavelOuCodigoBarras — o valor bruto de 47 dígitos
        // que aparece antes de "BENEFICIARIO:"), só nunca era repassada
        // pro motor de conciliação. Decodifica pro campo livre (25
        // dígitos, mesmo formato do Relatório BB) antes de repassar —
        // ver decodificarCampoLivreDaLinhaDigitavel em
        // parserComprovantePdf.ts. Retorna null se o valor não tiver o
        // formato esperado (47 dígitos), caindo para os passos 3/4 do
        // motor normalmente, sem quebrar nada.
        nossoNumero: decodificarCampoLivreDaLinhaDigitavel(registro.linhaDigitavelOuCodigoBarras ?? null),
        origem: 'comprovante_pdf',
      }, registro)

      resumo.detalhes.push(resultado)
      contabilizarResultado(resumo, resultado)

      // Registra o comprovante como processado — contas_a_pagar_id só
      // é preenchido quando o resultado referencia um título existente
      await registrarComprovanteProcessado(supabaseAdmin, {
        origem: 'comprovante_pdf',
        identificador_natural: registro.nrAutenticacao,
        contas_a_pagar_id: extrairContaAPagarId(resultado),
      })

      return res.status(200).json({ resumo })
    }

    // ── Caminho B: arquivo TXT — pode ter múltiplos comprovantes ──
    if (mimeType === 'text/plain') {
      if (!conteudoTxt) {
        return res.status(400).json({ erro: 'conteudoTxt é obrigatório para mimeType text/plain.' })
      }

      const resultadoParsing = await parseComprovanteTxt(conteudoTxt)
      resumo.totalRegistros = resultadoParsing.registros.length

      for (const registro of resultadoParsing.registros) {
        // Chave de dedupe: ID: com fallback para AUTENTICACAO SISBB:
        // (Especificação §5 — mesma prioridade usada no parser)
        const identificadorNatural = registro.id ?? registro.autenticacaoSisbb
        if (!identificadorNatural) {
          // Sem nenhum identificador — não há como deduplicar nem
          // registrar este comprovante com segurança, conta como erro
          resumo.naoEncontrados++
          continue
        }

        const jaProcessado = await verificarComprovanteJaProcessado(supabaseAdmin, identificadorNatural)
        if (jaProcessado) {
          resumo.duplicadosIgnorados++
          continue
        }

        const resultado: ResultadoConciliacaoItem = await conciliarRegistro(supabaseAdmin, {
          nomeFavorecido: registro.nomeFavorecido,
          // Prioridade da Chave Pix numérica sem máscara já resolvida
          // pelo parser em documentoIdentificado — usa isso como cnpjCpf
          // QA fix (tsc TS2322): documentoIdentificado é opcional
          // (string | null | undefined) no shape do parser; o motor
          // exige string | null — normaliza undefined para null aqui
          cnpjCpf: registro.documentoIdentificado ?? null,
          valor: registro.valor,
          data: registro.dataPagamento,
          nossoNumero: null, // Pix nunca tem Nosso Número
          origem: 'comprovante_txt',
        }, registro)

        resumo.detalhes.push(resultado)
        contabilizarResultado(resumo, resultado)

        await registrarComprovanteProcessado(supabaseAdmin, {
          origem: 'comprovante_txt',
          identificador_natural: identificadorNatural,
          contas_a_pagar_id: extrairContaAPagarId(resultado),
        })
      }

      return res.status(200).json({ resumo, blocosComErro: resultadoParsing.blocosComErro })
    }

    // ── mimeType não reconhecido ──
    return res.status(400).json({ erro: `mimeType não suportado: ${mimeType}. Use application/pdf ou text/plain.` })

  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[importar-comprovante] erro:', mensagemErro)
    return res.status(500).json({ erro: `Falha ao importar comprovante: ${mensagemErro}` })
  }
}

// ------------------------------------------------------------
// Função: contabilizarResultado
// Helper local — incrementa o contador correto do resumo conforme o
// tipo do resultado de conciliação, evitando duplicar o switch nos
// dois caminhos (PDF e TXT) deste handler
// ------------------------------------------------------------
function contabilizarResultado(resumo: ResumoImportacaoPagar, resultado: ResultadoConciliacaoItem): void {
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

// ------------------------------------------------------------
// Função: extrairContaAPagarId
// Helper local — extrai o id de contas_a_pagar do resultado de
// conciliação, quando existir, para gravar em
// pagar_comprovantes_processados.contas_a_pagar_id (fica null nos
// casos despesa_criada_automaticamente, pendente_confirmacao e
// nao_encontrado, conforme o shape de ComprovanteProcessado)
// ------------------------------------------------------------
function extrairContaAPagarId(resultado: ResultadoConciliacaoItem): string | null {
  if (resultado.tipo === 'baixa_automatica') return resultado.contaAPagarId
  if (resultado.tipo === 'despesa_criada_automaticamente') return resultado.contaAPagarId
  return null
}
