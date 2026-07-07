// ============================================================
// lib/motorUniversal/supabaseAdminMotorUniversal.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Client Supabase server-side com privilégio admin (service role),
//         reutilizado por todos os arquivos de lógica desta página avulsa
//         (beneficiariosRoster, fornecedorMatch, duplicateCheck,
//         origemDespesaClassifier, e pelas API routes de processar/confirmar)
// Conecta com: tabelas teste_documentos_importados, teste_titulos_gerados,
//              teste_beneficiarios_pessoais, e leitura/escrita pontual em
//              fornecedores (tabela de produção, ver spec seção 2.2)
// ISOLAMENTO: este arquivo pertence inteiramente à página avulsa de teste.
//             NÃO é importado por nenhum arquivo do sistema oficial e
//             NÃO deve ser referenciado fora da pasta lib/motorUniversal/.
// DELETABILIDADE: quando a lógica for validada e portada para os módulos
//             oficiais Despesas/Contas a Pagar, esta pasta inteira
//             (lib/motorUniversal/) pode ser apagada sem quebrar nada do
//             sistema em produção — nenhum arquivo fora desta pasta depende dela.
// PADRÃO SEGUIDO: mesma lógica de getSupabaseAdmin() já usada em
//             pages/api/danfe.ts e pages/api/boleto.ts, apenas centralizada
//             aqui para não duplicar em cada arquivo desta página avulsa.
// ============================================================

// Importa o construtor de client do SDK oficial do Supabase
// (mesma biblioteca já usada em todo o projeto: @supabase/supabase-js)
import { createClient } from '@supabase/supabase-js'

// ------------------------------------------------------------
// Função: getSupabaseAdminMotorUniversal
// Retorna um client Supabase autenticado com a service role key,
// que ignora RLS (Row Level Security) — necessário porque esta
// página avulsa não tem autenticação de usuário (ver spec seção 2.3)
// e precisa gravar/ler diretamente nas tabelas teste_* e em fornecedores.
// ------------------------------------------------------------
export function getSupabaseAdminMotorUniversal() {
  // URL do projeto Supabase — mesma variável já usada em todo o projeto,
  // definida em .env.local (NEXT_PUBLIC_ pois também é usada no client-side)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // Chave de service role — dá acesso admin, ignora RLS
  // NUNCA deve ser exposta no browser; este arquivo só pode ser importado
  // por código server-side (API routes em pages/api/teste-motor-universal/*)
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Cria e retorna uma nova instância do client a cada chamada,
  // seguindo exatamente o mesmo padrão já usado em danfe.ts e boleto.ts
  return createClient(url, svcKey)
}
