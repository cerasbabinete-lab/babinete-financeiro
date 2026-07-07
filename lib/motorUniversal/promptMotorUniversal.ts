// ============================================================
// lib/motorUniversal/promptMotorUniversal.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Definir o prompt de instrução e o response_schema (saída
//         estruturada) enviados à API do Gemini para extrair documentos
//         financeiros (PDF/imagem) em formato JSON Universal.
// Conecta com: lib/motorUniversal/geminiClient.ts (consome PROMPT_MOTOR_UNIVERSAL
//              e GEMINI_RESPONSE_SCHEMA nas chamadas à API), e types/motorUniversal.ts
//              (o schema abaixo espelha o shape de JsonUniversal, exceto os
//              campos computados fora da IA — ver nota de escopo abaixo)
// Referência: spec seção 2.4 ("APIs & Integrations" — Gemini) e seção 5
//              ("Function: Document Classification & Extraction")
//
// NOTA DE ESCOPO IMPORTANTE (revisada a pedido do usuário):
// A IA extrai os dados PRESENTES no documento e AGORA também SUGERE uma
// classificação de origemDespesa (campo "origemDespesaSugeridaIA"), mas
// essa sugestão é só um SINAL A MAIS — nunca a decisão final. A decisão
// oficial de origemDespesa continua sendo calculada por
// origemDespesaClassifier.ts (código determinístico, spec seção 5),
// que aplica a regra de negócio obrigatória: só auto-classifica quando
// pelo menos 3 de 4 sinais concretos concordam (nome/alias, endereço,
// unidade consumidora/matrícula, CPF parcial como desempate). A sugestão
// da IA pode contar como parte do sinal "nome/alias", mas NUNCA substitui
// a regra de 3-de-4 sinais (non-negotiable da spec, seção 7: "must never
// guess when fewer than 3 fallback signals agree").
// Os seguintes campos do JSON Universal continuam fora da resposta da IA,
// pois são sempre fixos/computados em código, nunca extraídos do documento:
//   - "pagador"        → sempre fixo (Ceras Babinete), preenchido em código
//   - "statusPagamento"→ sempre inicia como "em_aberto", preenchido em código
//   - "anexoOriginal"  → não utilizado nesta fase de teste (arquivo original
//                         não é persistido, ver decisão do usuário)
// ============================================================

// ------------------------------------------------------------
// CONSTANTE: lista fixa dos tipos de documento suportados
// Espelha o tipo TipoDocumento em types/motorUniversal.ts
// ------------------------------------------------------------
export const TIPOS_DOCUMENTO_GEMINI = [
  'boleto',
  'guia_tributo',
  'nota_fiscal',
  'recibo',
  'fatura_concessionaria',
  'holerite',
] as const

// ------------------------------------------------------------
// CONSTANTE: lista fixa das 8 categorias financeiras
// Espelha o tipo CategoriaFinanceira em types/motorUniversal.ts
// ------------------------------------------------------------
export const CATEGORIAS_FINANCEIRAS_GEMINI = [
  'aluguel',
  'tributos_estadual_municipal',
  'concessionarias_utilidades',
  'transporte_frete',
  'compra_mercadoria_insumo',
  'servicos_profissionais',
  'contabilidade',
  'plano_saude',
] as const

// ------------------------------------------------------------
// SCHEMA: response_schema no formato aceito pela API do Gemini
// (subconjunto de OpenAPI Schema: type, properties, items, enum, nullable)
// Usado no generationConfig.responseSchema da chamada em geminiClient.ts
// junto com responseMimeType: "application/json"
// ATENÇÃO: a casing dos "type" (OBJECT/STRING/...) segue a documentação
// oficial do Gemini structured output — validar contra a versão exata
// do pacote @google/generative-ai instalada ao integrar em geminiClient.ts
// ------------------------------------------------------------
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  // Todos os campos do bloco comum + o bloco de extensão de categoria
  properties: {
    // Classificação do tipo de documento (um dos 6 tipos fixos)
    tipoDocumento: { type: 'STRING', enum: [...TIPOS_DOCUMENTO_GEMINI] },

    // Classificação da categoria financeira (uma das 8 categorias fixas)
    categoriaFinanceira: { type: 'STRING', enum: [...CATEGORIAS_FINANCEIRAS_GEMINI] },

    // Quem recebe o pagamento — extraído literalmente do documento
    favorecido: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING' }, // nome/razão social literal, sem normalização
        cnpjCpf: { type: 'STRING', nullable: true }, // formatado se legível; null se mascarado/ausente
        endereco: { type: 'STRING', nullable: true }, // endereço literal, sem reinterpretação
      },
      required: ['nome'],
    },

    // Metadados do documento de origem
    documentoOrigem: {
      type: 'OBJECT',
      properties: {
        numeroDocumento: { type: 'STRING', nullable: true },
        dataEmissao: { type: 'STRING', nullable: true }, // formato ISO (YYYY-MM-DD)
        competencia: { type: 'STRING', nullable: true }, // ex: "2026-06", quando aplicável
      },
    },

    // Array de parcelas — mínimo 1 item, mesmo para documento de parcela única
    parcelas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          numeroParcela: { type: 'INTEGER' },
          totalParcelas: { type: 'INTEGER' },
          valor: { type: 'NUMBER' },
          dataVencimento: { type: 'STRING' }, // formato ISO (YYYY-MM-DD), obrigatório
          linhaDigitavel: { type: 'STRING', nullable: true },
          codigoBarras: { type: 'STRING', nullable: true },
          nossoNumero: { type: 'STRING', nullable: true },
          podeGerarSegundaVia: { type: 'BOOLEAN' }, // true se linhaDigitavel/codigoBarras/nossoNumero presentes
        },
        required: ['numeroParcela', 'totalParcelas', 'valor', 'dataVencimento', 'podeGerarSegundaVia'],
      },
    },

    // Valores consolidados do documento como um todo
    valores: {
      type: 'OBJECT',
      properties: {
        valorOriginal: { type: 'NUMBER' },
        valorDesconto: { type: 'NUMBER' },
        valorJurosMulta: { type: 'NUMBER' },
        valorTotal: { type: 'NUMBER' },
      },
      required: ['valorOriginal', 'valorTotal'],
    },

    // Sugestão da IA sobre a origem da despesa (empresarial vs pessoal de
    // sócio). NÃO é a decisão final — é apenas um sinal a mais, consumido
    // por origemDespesaClassifier.ts junto com os outros 3 sinais da regra
    // de negócio (nome/alias, endereço, unidade consumidora, CPF parcial).
    // A IA nunca tem acesso ao roster de beneficiários; a sugestão é
    // baseada apenas no que está literalmente escrito no documento.
    origemDespesaSugeridaIA: {
      type: 'OBJECT',
      properties: {
        tipoSugerido: { type: 'STRING', enum: ['empresarial', 'pessoal_socio', 'indefinido'] },
        nomeBeneficiarioMencionado: { type: 'STRING', nullable: true }, // nome literal do favorecido/titular, se sugerir pessoal_socio
        justificativa: { type: 'STRING' }, // explicação curta do porquê da sugestão, para exibir na UI de revisão
      },
      required: ['tipoSugerido', 'justificativa'],
    },

    // Bloco de extensão específico da categoria — apenas o bloco
    // correspondente à categoriaFinanceira detectada deve ser preenchido;
    // os demais devem ser omitidos (nullable, não obrigatórios)
    extensaoCategoria: {
      type: 'OBJECT',
      properties: {
        aluguel: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            imovel: {
              type: 'OBJECT',
              properties: {
                endereco: { type: 'STRING' },
                periodoReferencia: { type: 'STRING' },
              },
            },
          },
        },
        tributosEstadualMunicipal: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            esfera: { type: 'STRING', enum: ['estadual', 'municipal'] },
            orgaoArrecadador: { type: 'STRING' },
            tributo: {
              type: 'OBJECT',
              properties: {
                codigo: { type: 'STRING', nullable: true },
                descricao: { type: 'STRING' },
                periodoApuracao: { type: 'STRING', nullable: true },
              },
            },
            identificadorBem: { type: 'STRING', nullable: true },
          },
        },
        concessionariasUtilidades: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            servico: { type: 'STRING', enum: ['energia', 'agua', 'telefonia_internet_tv'] },
            codigoClienteUnidade: { type: 'STRING', nullable: true },
            enderecoUnidadeConsumidora: { type: 'STRING', nullable: true },
          },
        },
        transporteFrete: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            transportadora: {
              type: 'OBJECT',
              properties: {
                nome: { type: 'STRING' },
                cnpj: { type: 'STRING' },
              },
            },
            numeroFaturaConhecimento: { type: 'STRING', nullable: true },
            chaveCTe: { type: 'STRING', nullable: true },
          },
        },
        compraMercadoriaInsumo: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            fornecedor: {
              type: 'OBJECT',
              properties: {
                nome: { type: 'STRING' },
                cnpj: { type: 'STRING', nullable: true },
                endereco: { type: 'STRING', nullable: true },
              },
            },
            itens: {
              type: 'ARRAY',
              nullable: true, // preenchido só quando o documento é NF-e estruturada
              items: {
                type: 'OBJECT',
                properties: {
                  descricao: { type: 'STRING' },
                  quantidade: { type: 'NUMBER' },
                  valorUnitario: { type: 'NUMBER' },
                  valorTotal: { type: 'NUMBER' },
                },
              },
            },
            descricaoLivre: { type: 'STRING', nullable: true }, // preenchido só para recibo informal sem itens
            impostos: {
              type: 'OBJECT',
              properties: {
                icms: { type: 'NUMBER' },
                ipi: { type: 'NUMBER' },
              },
            },
          },
        },
        servicosProfissionais: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            prestador: {
              type: 'OBJECT',
              properties: {
                nome: { type: 'STRING' },
                cnpjCpf: { type: 'STRING' },
                regimeMei: { type: 'BOOLEAN' },
              },
            },
            descricaoServico: { type: 'STRING' },
            chaveAcessoNFSe: { type: 'STRING', nullable: true },
            retencoes: {
              type: 'OBJECT',
              properties: {
                issRetido: { type: 'NUMBER' },
              },
            },
          },
        },
        contabilidade: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            subtipo: {
              type: 'STRING',
              enum: ['guia_tributo_federal', 'honorarios_contabeis', 'folha_pro_labore'],
            },
            composicaoTributos: {
              type: 'ARRAY',
              nullable: true, // preenchido só quando subtipo === guia_tributo_federal
              items: {
                type: 'OBJECT',
                properties: {
                  codigo: { type: 'STRING' },
                  descricao: { type: 'STRING' },
                  principal: { type: 'NUMBER' },
                  multa: { type: 'NUMBER' },
                  juros: { type: 'NUMBER' },
                  total: { type: 'NUMBER' },
                },
              },
            },
            funcionario: {
              type: 'OBJECT',
              nullable: true, // preenchido só quando subtipo === folha_pro_labore
              properties: {
                nome: { type: 'STRING' },
                cpf: { type: 'STRING', nullable: true },
                cargo: { type: 'STRING', nullable: true },
                admissao: { type: 'STRING', nullable: true },
              },
            },
            rubricas: {
              type: 'ARRAY',
              nullable: true, // preenchido só quando subtipo === folha_pro_labore
              items: {
                type: 'OBJECT',
                properties: {
                  codigo: { type: 'STRING' },
                  descricao: { type: 'STRING' },
                  tipo: { type: 'STRING', enum: ['vencimento', 'desconto'] },
                  valor: { type: 'NUMBER' },
                },
              },
            },
            itensHonorarios: {
              type: 'ARRAY',
              nullable: true, // preenchido só quando subtipo === honorarios_contabeis
              items: {
                type: 'OBJECT',
                properties: {
                  descricao: { type: 'STRING' },
                  valorBruto: { type: 'NUMBER' },
                  valorLiquido: { type: 'NUMBER' },
                },
              },
            },
          },
        },
        planoSaude: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            operadora: {
              type: 'OBJECT',
              properties: {
                nome: { type: 'STRING' },
                cnpj: { type: 'STRING' },
              },
            },
            titular: {
              type: 'OBJECT',
              properties: {
                nome: { type: 'STRING' },
                cpf: { type: 'STRING', nullable: true },
              },
            },
            competencia: { type: 'STRING' },
          },
        },
      },
    },
  },
  // Campos obrigatórios no nível raiz da resposta
  required: [
    'tipoDocumento',
    'categoriaFinanceira',
    'favorecido',
    'parcelas',
    'valores',
    'extensaoCategoria',
    'origemDespesaSugeridaIA',
  ],
} as const

// ------------------------------------------------------------
// Função: buildPromptMotorUniversal
// Monta o texto de instrução (system/user prompt) enviado ao Gemini
// junto com o arquivo do documento e o GEMINI_RESPONSE_SCHEMA acima.
// Não recebe o roster de beneficiários como parâmetro — a resolução de
// origemDespesa é feita depois, em código, não pela IA (ver nota de escopo
// no topo do arquivo).
// ------------------------------------------------------------
export function buildPromptMotorUniversal(): string {
  // Texto único de instrução, em português, detalhando as regras de
  // extração conforme spec seção 5 ("Function: Document Classification & Extraction")
  return `
Você é um extrator de dados de documentos financeiros brasileiros (boletos, guias de tributo, notas fiscais de compra, recibos, faturas de concessionária, holerites).

REGRAS OBRIGATÓRIAS:

1. EXTRAÇÃO LITERAL: extraia os dados exatamente como aparecem no documento. NUNCA normalize, expanda abreviações, ou "corrija" nomes e endereços. Por exemplo, um endereço como "Conj Hab Karina" deve ser mantido exatamente assim, sem expandir ou reinterpretar como se fosse nome de pessoa.

2. CLASSIFICAÇÃO: classifique o documento em exatamente 1 dos tipos de documento e 1 das 8 categorias financeiras fixas listadas no schema de resposta. Preencha APENAS o bloco de extensaoCategoria correspondente à categoria escolhida; deixe os demais blocos de extensaoCategoria ausentes/nulos.

3. CAMPOS MASCARADOS OU AUSENTES: se um campo como CPF, código de beneficiário, ou linha digitável estiver mascarado, ilegível ou ausente no documento, retorne null para esse campo. Isso é esperado e não deve bloquear a extração dos demais campos.

4. DEDUPLICAÇÃO INTERNA: se o documento contiver conteúdo duplicado (por exemplo, uma impressão "1ª via / 2ª via" do mesmo relatório dentro do mesmo PDF), extraia os itens duplicados apenas UMA vez.

5. MÚLTIPLAS PARCELAS: se o documento contiver mais de uma parcela da mesma dívida (por exemplo, um carnê de IPTU com duas guias de parcelas na mesma página), extraia TODAS as parcelas dentro do array "parcelas", mantendo-as como um único documento — nunca separe em múltiplos documentos.

6. VALORES NUMÉRICOS: use ponto como separador decimal (formato JSON padrão), nunca vírgula.

7. DATAS: use sempre o formato ISO (AAAA-MM-DD).

8. SUGESTÃO DE ORIGEM DA DESPESA (campo "origemDespesaSugeridaIA"): com base APENAS no que está literalmente escrito no documento (nome do favorecido/titular, endereço, tipo de documento), sugira se a despesa parece ser "empresarial" (relacionada à Ceras Babinete Ltda. ME) ou "pessoal_socio" (relacionada a uma pessoa física, não à empresa). Se não houver informação suficiente para sugerir com confiança, use "indefinido". Esta é APENAS uma sugestão auxiliar — a decisão final não depende de você, então não hesite em usar "indefinido" quando não tiver certeza. Preencha "justificativa" com uma frase curta explicando o que no documento levou à sugestão (ex: "documento em nome de pessoa física, sem CNPJ visível").

9. IDENTIFICAÇÃO CORRETA DO FAVORECIDO (regra crítica): o campo "favorecido" é SEMPRE quem EMITE o documento e RECEBE o pagamento (o vendedor/prestador/fornecedor) — NUNCA quem compra ou recebe a mercadoria/serviço. Como todos os documentos processados por este sistema são despesas da Ceras Babinete Ltda. ME (CNPJ 10.666.614/0001-60), a empresa é SEMPRE quem paga, nunca quem recebe. PORTANTO: o campo "favorecido.cnpjCpf" NUNCA pode ser "10.666.614/0001-60" (ou variações sem formatação, como "10666614000160"), e o campo "favorecido.nome" NUNCA pode ser "Ceras Babinete" ou variações. Se o nome/CNPJ da Ceras Babinete aparecer no documento (é comum aparecer como "cliente", "destinatário", "tomador" ou "comprador"), esse é o PAGADOR, não o favorecido — ignore-o ao preencher o campo "favorecido" e procure o outro nome/CNPJ presente no documento (o emitente/vendedor/prestador real).

Retorne a resposta estritamente no formato JSON definido pelo schema fornecido, sem texto adicional antes ou depois do JSON.
`.trim()
}
