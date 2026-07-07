// ============================================================
// pages/api/teste-motor-universal/titulos.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Endpoint de LEITURA que lista os títulos já gravados em
//         teste_titulos_gerados, combinados com dados do documento de
//         origem (teste_documentos_importados) — categoria financeira,
//         tipo de documento, origem da despesa — para exibição na
//         tabela de apresentação, no mesmo modelo visual de Contas a
//         Receber (ver ContasReceberTabela.tsx no sistema oficial).
// Conecta com: lib/motorUniversal/supabaseAdminMotorUniversal.ts,
//              app/teste-motor-universal/page.tsx (consumidor),
//              components/teste-motor-universal/TitulosImportadosTabela.tsx
//
// APENAS APRESENTAÇÃO: esta rota só lista dados já gravados. Nenhuma
// função de 2ª via (DANFE/boleto) foi implementada aqui — conforme
// decisão do usuário, isso fica para quando a lógica for portada ao
// sistema oficial de Contas a Pagar.
// ============================================================

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdminMotorUniversal } from '@/lib/motorUniversal/supabaseAdminMotorUniversal'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido. Use GET.' })
    return
  }

  try {
    const supabaseAdmin = getSupabaseAdminMotorUniversal()

    // Busca todos os títulos, com embed do documento de origem via a FK
    // interna (documento_importado_id → teste_documentos_importados.id),
    // já reconhecida pelo PostgREST por ser uma FK declarada no schema.
    // Ordena por data_vencimento (mais recente/futuro primeiro), igual à
    // convenção visual já usada em Contas a Receber.
    const { data, error } = await supabaseAdmin
      .from('teste_titulos_gerados')
      .select(
        `
        id,
        documento_importado_id,
        numero_parcela,
        total_parcelas,
        favorecido_nome,
        favorecido_cnpj_cpf,
        valor,
        data_vencimento,
        linha_digitavel,
        codigo_barras,
        nosso_numero,
        pode_gerar_segunda_via,
        status,
        criado_em,
        teste_documentos_importados (
          tipo_arquivo,
          json_universal,
          origem_despesa_status
        )
        `,
      )
      .order('data_vencimento', { ascending: false })

    if (error) {
      throw new Error(`Falha ao buscar títulos: ${error.message}`)
    }

    res.status(200).json({ titulos: data ?? [] })
  } catch (err: unknown) {
    const mensagemErro = err instanceof Error ? err.message : String(err)
    console.error('[teste-motor-universal/titulos] Erro:', mensagemErro)
    res.status(500).json({ error: mensagemErro })
  }
}
