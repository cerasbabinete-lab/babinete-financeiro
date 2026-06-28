// ============================================================
// lib/transportadorasService.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Operações de dados da tabela transportadoras
//         Populada automaticamente via import XML — sem tela própria
//         Deduplicação por CNPJ via upsert
// Conecta com: supabase.ts, types/receitas.ts (Transportadora),
//              xmlParser.ts (chamado durante import XML)
// ============================================================

import { supabase } from '@/lib/supabase'
import type { Transportadora } from '@/types/receitas'

// ============================================================
// upsertTransportadora()
// Insere ou atualiza uma transportadora pelo CNPJ (chave única)
// Retorna o registro com id — necessário para gravar em receitas.transportadora_id
// Chamado por: xmlParser.ts durante o processamento de cada XML importado
// ============================================================
export async function upsertTransportadora(
  dados: Omit<Transportadora, 'id' | 'created_at' | 'updated_at'>
): Promise<Transportadora> {
  const { data, error } = await supabase
    .from('transportadoras')
    .upsert(dados, { onConflict: 'cnpj' })
    .select()
    .single()

  if (error) {
    console.error('[transportadorasService] upsertTransportadora error:', error)
    throw new Error(error.message)
  }

  return data as Transportadora
}

// ============================================================
// buscarTransportadoraPorCnpj()
// Busca transportadora pelo CNPJ sem pontuação
// Retorna null se não encontrada
// Chamado por: xmlParser.ts para verificar se já existe antes do upsert
// ============================================================
export async function buscarTransportadoraPorCnpj(cnpj: string): Promise<Transportadora | null> {
  const digits = cnpj.replace(/[^0-9]/g, '')
  if (!digits) return null

  const { data, error } = await supabase
    .from('transportadoras')
    .select('*')
    .eq('cnpj', digits)
    .maybeSingle()

  if (error) {
    console.error('[transportadorasService] buscarTransportadoraPorCnpj error:', error)
    return null
  }

  return data as Transportadora | null
}
