// ============================================================
// lib/relatorios/paginacao.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Helper único de paginação para as consultas Supabase
//         deste módulo. PostgREST limita respostas não paginadas a
//         1000 linhas por padrão — sem isso, qualquer relatório
//         rodado sobre um intervalo largo, ou sobre uma consulta
//         sem filtro de data no próprio banco, pode truncar
//         silenciosamente o dado (nenhum erro aparece, só um total
//         menor que o real).
// Conecta com: todos os lib/relatorios/*.ts que fazem
//              .from(...).select(...) — cada consulta passa a ser
//              envolvida por paginarConsulta() em vez de ser
//              awaited diretamente.
// Referência: Handoff_Modulo_Relatorios_Audit_para_QA.md, Finding
//             Critical #2 — "Silent truncation is not acceptable
//             in a financial reporting module under any
//             circumstance." Corrigido com paginação de fato (loop
//             de .range()), não com um limite fixo maior — a
//             própria auditoria rejeitou explicitamente essa saída
//             fácil ("must not accept a fix that merely raises the
//             limit to a larger fixed number").
// ============================================================

// Tamanho de página usado no loop — mesmo valor do teto padrão do
// PostgREST (1000). Reexplicitado aqui só para ficar visível no
// código deste módulo; não é uma configuração do projeto Supabase
// em si, é só o tamanho de fatia que este helper pede por vez.
const TAMANHO_PAGINA = 1000

// Formato mínimo que qualquer resultado de query do supabase-js
// tem (PostgrestSingleResponse) — tipado aqui de forma reduzida
// (só data/error) para este helper não depender de nenhum tipo
// interno do pacote @supabase/supabase-js além do que realmente usa
interface ResultadoPaginaSupabase<T> {
  data: T[] | null
  error: { message: string } | null
}

// ============================================================
// paginarConsulta()
// Recebe uma FUNÇÃO que monta a consulta dado um intervalo
// [inicio, fim] — não a consulta já pronta — porque o supabase-js
// exige que .range() seja encadeado ANTES do await; não é possível
// reaplicar .range() numa Promise já resolvida. Cada chamador
// deste helper reconstrói a cadeia de filtros a cada iteração, só
// variando o .range(inicio, fim) no final.
//
// Loop: busca páginas de TAMANHO_PAGINA em TAMANHO_PAGINA até uma
// página voltar com MENOS linhas que o tamanho pedido — esse é o
// sinal de "acabou os dados", sem precisar de um count() separado
// nem de confiar em nenhum total vindo do PostgREST.
//
// Uso típico, em qualquer lib/relatorios/*.ts:
//   const linhas = await paginarConsulta<LinhaX>((inicio, fim) =>
//     client.from('tabela').select('colunas').eq('campo', valor).range(inicio, fim)
//   )
// ============================================================
export async function paginarConsulta<T>(
  montarConsulta: (inicio: number, fim: number) => PromiseLike<ResultadoPaginaSupabase<T>>,
): Promise<T[]> {
  const resultadoCompleto: T[] = []
  let inicio = 0

  // Sem limite superior de iterações de propósito — o próprio
  // volume de dados real do sistema é quem decide quantas páginas
  // existem; o corte é sempre "página veio incompleta", nunca um
  // número fixo de tentativas
  while (true) {
    const fim = inicio + TAMANHO_PAGINA - 1
    const { data, error } = await montarConsulta(inicio, fim)

    if (error) {
      // Repassa o erro pro chamador decidir o log com o contexto
      // certo (qual tabela/relatório) — este helper é genérico e
      // não sabe disso
      throw new Error(error.message)
    }

    const pagina = data ?? []
    resultadoCompleto.push(...pagina)

    // Página veio com menos linhas que TAMANHO_PAGINA => não há
    // próxima página, para o loop aqui
    if (pagina.length < TAMANHO_PAGINA) break

    inicio += TAMANHO_PAGINA
  }

  return resultadoCompleto
}

// ============================================================
// dividirEmLotes()
// Utilitário simples de batching — usado quando uma consulta
// precisa de `.in('coluna', listaDeIds)` sobre uma lista de IDs que
// pode crescer sem limite junto com o histórico do sistema (ex:
// títulos únicos que tiveram evento de baixa no intervalo). Uma
// cláusula IN gigante também tem risco de estourar limite de
// tamanho de query da API — dividir em lotes menores evita os dois
// problemas ao mesmo tempo, não só a paginação de linhas de volta.
// TAMANHO_LOTE bem abaixo de TAMANHO_PAGINA de propósito — o limite
// aqui é sobre o tamanho da cláusula IN, não sobre linhas de retorno
// ============================================================
const TAMANHO_LOTE = 300

export function dividirEmLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    lotes.push(itens.slice(i, i + TAMANHO_LOTE))
  }
  return lotes
}
