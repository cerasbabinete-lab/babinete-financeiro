// ============================================================
// lib/localidades.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Clientes
// Função: Fornece lista de UFs e cidades para dropdowns do modal
// Fonte: /public/localidades_br.json (27 UFs, 5569 municípios)
// Conecta com: ClientesModal.tsx (dropdowns UF e Cidade)
// ============================================================

// Importa o JSON de lib/data/ — arquitetura correta para Next.js
// public/ é para assets servidos pelo browser; imports JS devem usar lib/ ou src/
// Caminho anterior (@/public/localidades_br.json) funcionava mas era anti-pattern
import localidades from '@/lib/data/localidades_br.json'

// Tipagem do JSON: objeto com chave UF e array de cidades
const dados = localidades as Record<string, string[]>

// ============================================================
// getUFs()
// Retorna array de siglas de UF ordenadas alfabeticamente
// Usado para popular o dropdown de UF no modal
// Exemplo de retorno: ['AC', 'AL', 'AM', 'AP', 'BA', ...]
// ============================================================
export function getUFs(): string[] {
  return Object.keys(dados).sort()
}

// ============================================================
// getCidades(uf)
// Recebe uma sigla de UF e retorna array de cidades ordenadas
// Usado para popular o dropdown de Cidade após seleção de UF
// Exemplo: getCidades('PR') → ['Abatiá', 'Adrianópolis', ...]
// Retorna array vazio se UF não encontrada (segurança)
// ============================================================
export function getCidades(uf: string): string[] {
  if (!uf || !dados[uf]) return []
  return dados[uf]
}

// ============================================================
// getNomeUF(uf)
// Retorna o nome completo do estado a partir da sigla
// Útil para exibição em telas de visualização (modo read-only)
// Exemplo: getNomeUF('PR') → 'Paraná'
// ============================================================
const nomesUF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá',
  BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco',
  PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
}

export function getNomeUF(uf: string): string {
  return nomesUF[uf] ?? uf
}
