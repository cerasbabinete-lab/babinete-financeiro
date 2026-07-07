// ========================================================================
// ARQUIVO: types/motorUniversal.ts
// CAMADA: Tipos (types) — contratos de dados compartilhados entre
//         API routes (pages/api/teste-motor-universal/*), a camada de
//         lógica (lib/motorUniversal/*) e a UI (app/teste-motor-universal/page.tsx)
// PROPÓSITO: Definir o "JSON Universal" — modelo canônico único para o
//            qual todo documento financeiro heterogêneo (boleto, guia,
//            recibo, fatura de concessionária, holerite etc.) é convertido,
//            conforme Motor_Universal_Documentos_Financeiros_Pagina_Teste_Spec.md, seção 2.1.1
// OBS: Este módulo é 100% de teste/prototipagem — se a extração via IA
//      validar bem, estes tipos serão portados para os futuros módulos
//      oficiais Despesas / Contas a Pagar.
// ========================================================================

// ------------------------------------------------------------------------
// BLOCO: Enumeração dos tipos de documento suportados pelo motor
// Usado para rotear entre parser direto (XML) e pipeline de IA (Gemini)
// Referência: spec seção 2.1.1, campo "tipoDocumento"
// ------------------------------------------------------------------------
export type TipoDocumento =
  | 'boleto' // boleto bancário avulso (sem NF-e associada no fluxo deste motor)
  | 'guia_tributo' // DARF, DAS, guias estaduais/municipais, IPVA etc.
  | 'nota_fiscal' // NF-e de compra de mercadoria/insumo (não a de vendas, já coberta pelo módulo Receitas)
  | 'recibo' // recibo informal, sem estrutura fiscal (ex: fornecedor sem NF)
  | 'fatura_concessionaria' // energia, água, telefonia/internet/TV
  | 'holerite'; // folha de pagamento / pró-labore

// ------------------------------------------------------------------------
// BLOCO: Enumeração das 8 categorias financeiras fixas
// Determina qual extensão de categoria (ver mais abaixo) é aplicada ao JSON
// Referência: spec seção 2.1.1, campo "categoriaFinanceira"
// ------------------------------------------------------------------------
export type CategoriaFinanceira =
  | 'aluguel'
  | 'tributos_estadual_municipal' // categoria unificada estadual+municipal
  | 'concessionarias_utilidades' // categoria unificada energia+agua+telefonia/internet/tv
  | 'transporte_frete'
  | 'compra_mercadoria_insumo'
  | 'servicos_profissionais'
  | 'contabilidade' // categoria mais ampla: honorarios contabeis, guias federais, folha/pro-labore
  | 'plano_saude';

// ------------------------------------------------------------------------
// BLOCO: Favorecido — quem recebe o pagamento (fornecedor/prestador/orgão)
// Usado na função de Cross-Reference com a tabela de produção "fornecedores"
// Referência: spec seção 2.1.1, campo "favorecido"
// ------------------------------------------------------------------------
export interface Favorecido {
  nome: string; // razão social ou nome extraído literalmente do documento (sem normalização, exceto aliases documentados)
  cnpjCpf: string | null; // formatado (ex: "10.666.614/0001-60"), null se mascarado/ilegível no documento
  endereco: string | null; // endereço completo extraído literalmente (ex: preservar "Conj Hab Karina" como está)
}

// ------------------------------------------------------------------------
// BLOCO: Pagador — sempre fixo à Ceras Babinete, mesmo em despesas pessoais
// dos sócios (a empresa paga direto, sem fluxo de reembolso)
// Referência: spec seção 2.1.1, campo "pagador"
// ------------------------------------------------------------------------
export interface Pagador {
  nome: 'CERAS BABINETE LTDA. ME'; // valor sempre fixo, nunca extraído do documento
  cnpj: '10.666.614/0001-60'; // CNPJ da empresa, sempre fixo
}

// ------------------------------------------------------------------------
// BLOCO: Beneficiário pessoal — sócio ou prestador MEI vinculado a uma
// despesa classificada como "pessoal_socio"
// Referência: spec seção 2.1.1, roster final (Darci, Fabio, Sheli, Maycon)
// ------------------------------------------------------------------------
export interface BeneficiarioPessoal {
  nome: string; // nome do sócio ou prestador conforme roster (tabela teste_beneficiarios_pessoais)
  cpf: string | null; // CPF do beneficiário, se disponível no roster
  vinculo: string; // ex: "socio" ou "prestador_mei" (Maycon é prestador MEI, não sócio)
}

// ------------------------------------------------------------------------
// BLOCO: Origem da despesa — classifica se o gasto é da empresa ou de um sócio
// Sempre populado, nunca deixado implícito (requisito de negócio explícito)
// Referência: spec seção 2.1.1, campo "origemDespesa" + lógica de classificação
// ------------------------------------------------------------------------
export interface OrigemDespesa {
  tipo: 'empresarial' | 'pessoal_socio'; // classificação final da despesa
  beneficiarioPessoal: BeneficiarioPessoal | null; // populado apenas quando tipo === 'pessoal_socio'; null quando 'empresarial'
}

// ------------------------------------------------------------------------
// BLOCO: Dados de origem do documento (número, emissão, competência)
// Referência: spec seção 2.1.1, campo "documentoOrigem"
// ------------------------------------------------------------------------
export interface DocumentoOrigem {
  numeroDocumento: string | null; // número da nota/guia/fatura, extraído literalmente
  dataEmissao: string | null; // data de emissão do documento, formato ISO (YYYY-MM-DD)
  competencia: string | null; // mês/ano de referência (ex: "2026-06"), quando aplicável (utilidades, folha)
}

// ------------------------------------------------------------------------
// BLOCO: Parcela — uma linha de vencimento/pagamento dentro do documento
// Um único PDF pode conter múltiplas parcelas (ex: carnê de IPTU com 2 vias)
// e todas compartilham o mesmo "documentoOrigem" (nunca split físico do arquivo)
// Referência: spec seção 2.1.1, campo "parcelas[]"
// ------------------------------------------------------------------------
export interface Parcela {
  numeroParcela: number; // posição desta parcela dentro do total (ex: 1 de 2)
  totalParcelas: number; // quantidade total de parcelas no documento
  valor: number; // valor desta parcela específica
  dataVencimento: string; // data de vencimento, formato ISO (YYYY-MM-DD) — obrigatório, usado na deduplicação
  linhaDigitavel: string | null; // linha digitável do boleto, se houver (null se documento não for boleto)
  codigoBarras: string | null; // código de barras numérico, se houver
  nossoNumero: string | null; // identificador do banco/beneficiário, se houver (pode estar mascarado)
  podeGerarSegundaVia: boolean; // derivado da presença de dados de pagamento (linhaDigitavel/codigoBarras/nossoNumero)
}

// ------------------------------------------------------------------------
// BLOCO: Valores consolidados do documento (não por parcela, mas do todo)
// Referência: spec seção 2.1.1, campo "valores"
// ------------------------------------------------------------------------
export interface Valores {
  valorOriginal: number; // valor bruto do documento, antes de descontos/juros
  valorDesconto: number; // valor de desconto aplicado, se houver
  valorJurosMulta: number; // valor de juros/multa, se houver (documentos vencidos)
  valorTotal: number; // valor final a pagar (soma líquida)
}

// ------------------------------------------------------------------------
// BLOCO: Status de pagamento do documento como um todo
// Referência: spec seção 2.1.1, campo "statusPagamento"
// ------------------------------------------------------------------------
export type StatusPagamento = 'em_aberto' | 'pago' | 'cancelado';

// ========================================================================
// EXTENSÕES POR CATEGORIA
// Cada categoria financeira adiciona campos específicos ao JSON Universal.
// Apenas o bloco correspondente à "categoriaFinanceira" do documento é
// preenchido; os demais permanecem ausentes/undefined.
// Referência: spec seção 2.1.1, "Category-specific extensions"
// ========================================================================

// ------------------------------------------------------------------------
// EXTENSÃO: Aluguel — sem linha separada de "despesas bancárias"
// (o valor do aluguel é tratado como único, por decisão explícita do owner)
// ------------------------------------------------------------------------
export interface ExtensaoAluguel {
  imovel: {
    endereco: string; // endereço do imóvel alugado
    periodoReferencia: string; // mês/ano de referência do aluguel (ex: "2026-06")
  };
}

// ------------------------------------------------------------------------
// EXTENSÃO: Tributos Estadual e Municipal (categoria unificada)
// ------------------------------------------------------------------------
export interface ExtensaoTributosEstadualMunicipal {
  esfera: 'estadual' | 'municipal'; // esfera do tributo
  orgaoArrecadador: string; // ex: "SEFAZ-PR", "Prefeitura de Maringá"
  tributo: {
    codigo: string | null; // código do tributo/guia, se houver
    descricao: string; // descrição literal do tributo (ex: "IPVA", "ISS")
    periodoApuracao: string | null; // período de apuração, se aplicável
  };
  identificadorBem: string | null; // placa (IPVA), matrícula (IPTU) ou identificador equivalente
}

// ------------------------------------------------------------------------
// EXTENSÃO: Concessionárias e Utilidades (energia, água, telefonia/internet/tv)
// ------------------------------------------------------------------------
export interface ExtensaoConcessionariasUtilidades {
  servico: 'energia' | 'agua' | 'telefonia_internet_tv'; // tipo de serviço da concessionária
  codigoClienteUnidade: string | null; // código do cliente ou da unidade consumidora
  enderecoUnidadeConsumidora: string | null; // endereço da unidade consumidora (pode diferir do endereço do favorecido)
}

// ------------------------------------------------------------------------
// EXTENSÃO: Transporte/Frete
// Nota: quando o documento lista 2 CNPJs diferentes (ex: transportadora +
// processadora de pagamento), CNPJ é sempre o desambiguador, nunca o nome impresso
// ------------------------------------------------------------------------
export interface ExtensaoTransporteFrete {
  transportadora: {
    nome: string; // nome da transportadora extraído literalmente
    cnpj: string; // CNPJ formatado da transportadora (desambiguador principal)
  };
  numeroFaturaConhecimento: string | null; // número da fatura ou do conhecimento de transporte
  chaveCTe: string | null; // chave de acesso do CT-e, se disponível
}

// ------------------------------------------------------------------------
// EXTENSÃO: Compra de Mercadoria/Insumo
// "itens[]" é usado quando o documento é uma NF-e estruturada;
// "descricaoLivre" é usado para recibos informais sem estrutura de itens
// (os dois campos são mutuamente exclusivos por documento)
// ------------------------------------------------------------------------
export interface ItemCompra {
  descricao: string; // descrição do produto/serviço adquirido
  quantidade: number; // quantidade comprada
  valorUnitario: number; // valor unitário do item
  valorTotal: number; // valor total do item (quantidade x valorUnitario)
}

export interface ExtensaoCompraMercadoriaInsumo {
  fornecedor: {
    nome: string; // nome do fornecedor extraído literalmente
    cnpj: string | null; // CNPJ formatado do fornecedor, se disponível
    endereco: string | null; // endereço do fornecedor
  };
  itens: ItemCompra[] | null; // preenchido apenas quando o documento é uma NF-e estruturada; null caso contrário
  descricaoLivre: string | null; // preenchido apenas quando o documento é um recibo informal sem itens; null caso contrário
  impostos: {
    icms: number; // valor de ICMS destacado no documento, 0 se não houver
    ipi: number; // valor de IPI destacado no documento, 0 se não houver
  };
}

// ------------------------------------------------------------------------
// EXTENSÃO: Serviços Profissionais
// Dois caminhos de entrada possíveis (NFS-e XML direto ou PDF/imagem via IA),
// mas ambos devem produzir exatamente este mesmo formato de saída
// ------------------------------------------------------------------------
export interface ExtensaoServicosProfissionais {
  prestador: {
    nome: string; // nome do prestador de serviço
    cnpjCpf: string; // CNPJ (PJ) ou CPF (MEI/autônomo) formatado
    regimeMei: boolean; // true se o prestador é MEI
  };
  descricaoServico: string; // descrição literal do serviço prestado
  chaveAcessoNFSe: string | null; // chave de acesso da NFS-e, null quando o documento veio via IA (PDF/recibo sem NFS-e formal)
  retencoes: {
    issRetido: number; // valor de ISS retido na fonte, 0 se não houver retenção
  };
}

// ------------------------------------------------------------------------
// EXTENSÃO: Contabilidade (categoria mais ampla — guias federais,
// honorários contábeis e folha/pró-labore, todos da mesma relação contábil
// com a Organização Contábil Armelin)
// ------------------------------------------------------------------------
export interface ComposicaoTributo {
  codigo: string; // código do tributo (ex: código do DARF/DAS)
  descricao: string; // descrição do tributo
  principal: number; // valor principal do tributo
  multa: number; // valor de multa, 0 se não houver
  juros: number; // valor de juros, 0 se não houver
  total: number; // soma de principal + multa + juros
}

export interface RubricaFolha {
  codigo: string; // código da rubrica na folha de pagamento
  descricao: string; // descrição da rubrica (ex: "Salário Base", "INSS")
  tipo: 'vencimento' | 'desconto'; // se a rubrica soma ou subtrai do valor líquido
  valor: number; // valor da rubrica
}

export interface ItemHonorario {
  descricao: string; // descrição do item de honorário (pode incluir múltiplos itens não relacionados no mesmo documento)
  valorBruto: number; // valor bruto do item
  valorLiquido: number; // valor líquido do item, após eventuais retenções
}

export interface ExtensaoContabilidade {
  subtipo: 'guia_tributo_federal' | 'honorarios_contabeis' | 'folha_pro_labore'; // qual dos 3 sub-documentos este é
  composicaoTributos: ComposicaoTributo[] | null; // preenchido quando subtipo === 'guia_tributo_federal' (DARF/DAS)
  funcionario: {
    nome: string; // nome do funcionário/beneficiário da folha
    cpf: string | null; // CPF do funcionário
    cargo: string | null; // cargo/função
    admissao: string | null; // data de admissão, formato ISO
  } | null; // preenchido quando subtipo === 'folha_pro_labore'
  rubricas: RubricaFolha[] | null; // preenchido quando subtipo === 'folha_pro_labore'
  itensHonorarios: ItemHonorario[] | null; // preenchido quando subtipo === 'honorarios_contabeis' (pode ter múltiplos itens no mesmo documento)
}

// ------------------------------------------------------------------------
// EXTENSÃO: Plano de Saúde
// ------------------------------------------------------------------------
export interface ExtensaoPlanoSaude {
  operadora: {
    nome: string; // nome da operadora do plano de saúde
    cnpj: string; // CNPJ formatado da operadora
  };
  titular: {
    nome: string; // nome do titular do plano
    cpf: string | null; // CPF do titular, se disponível
  };
  competencia: string; // mês/ano de referência da mensalidade (ex: "2026-06")
}

// ------------------------------------------------------------------------
// UNIÃO: agrupa todas as extensões de categoria em um único tipo opcional,
// anexado ao JSON Universal conforme a "categoriaFinanceira" do documento.
// Cada campo é opcional pois só um deles é preenchido por documento.
// ------------------------------------------------------------------------
export interface ExtensaoCategoria {
  aluguel?: ExtensaoAluguel;
  tributosEstadualMunicipal?: ExtensaoTributosEstadualMunicipal;
  concessionariasUtilidades?: ExtensaoConcessionariasUtilidades;
  transporteFrete?: ExtensaoTransporteFrete;
  compraMercadoriaInsumo?: ExtensaoCompraMercadoriaInsumo;
  servicosProfissionais?: ExtensaoServicosProfissionais;
  contabilidade?: ExtensaoContabilidade;
  planoSaude?: ExtensaoPlanoSaude;
}

// ========================================================================
// TIPO PRINCIPAL: JSON Universal completo
// Este é o objeto retornado tanto pelo pipeline de IA (Gemini) quanto pelo
// parser direto de NFS-e XML — ambos devem produzir exatamente este shape.
// Referência: spec seção 2.1.1, bloco "Common block"
// ========================================================================
export interface JsonUniversal {
  tipoDocumento: TipoDocumento; // classificação do tipo de documento
  categoriaFinanceira: CategoriaFinanceira; // uma das 8 categorias fixas
  favorecido: Favorecido; // quem recebe o pagamento
  pagador: Pagador; // sempre fixo à Ceras Babinete
  origemDespesa: OrigemDespesa; // classificação empresarial vs pessoal_socio
  documentoOrigem: DocumentoOrigem; // metadados do documento de origem
  parcelas: Parcela[]; // uma ou mais parcelas extraídas (mínimo 1)
  valores: Valores; // valores consolidados do documento
  statusPagamento: StatusPagamento; // status inicial, sempre 'em_aberto' na extração
  anexoOriginal: string | null; // reservado para uso futuro (não utilizado nesta fase de teste — arquivo original não é persistido)
  extensaoCategoria: ExtensaoCategoria; // bloco específico da categoria financeira do documento
}

// ========================================================================
// TIPOS DE APOIO — usados pelas funções de verificação (fora do JSON Universal
// em si, mas retornados junto pela API route de processamento)
// ========================================================================

// ------------------------------------------------------------------------
// Resultado da função de Cross-Reference com a tabela "fornecedores"
// Referência: spec seção 5, "Function: Fornecedor Cross-Reference"
// ------------------------------------------------------------------------
export interface ResultadoFornecedorMatch {
  status: 'encontrado' | 'nao_encontrado' | 'possivel_duplicado'; // resultado do cruzamento
  fornecedorId: number | null; // id do fornecedor encontrado na tabela de produção, null se não encontrado
  criterioMatch: string | null; // qual critério bateu (ex: "cnpj_exato", "nome_endereco_fallback")
}

// ------------------------------------------------------------------------
// Resultado da função de Duplicate Check (hash + chave composta)
// Referência: spec seção 5, "Function: Duplicate Title/Expense Check"
// ------------------------------------------------------------------------
export interface ResultadoDuplicateCheck {
  status: 'novo' | 'duplicado_hash' | 'duplicado_composto'; // resultado da checagem
  criterioDuplicidade: string | null; // descrição do critério que causou a marcação de duplicado, se houver
}

// ------------------------------------------------------------------------
// Resultado da função de Classificação de origemDespesa
// Referência: spec seção 5, "Function: origemDespesa Auto-Classification"
// ------------------------------------------------------------------------
export interface ResultadoOrigemDespesaClassificacao {
  status: 'auto_classificado' | 'revisao_manual'; // se a classificação automática teve sucesso
  criteriosBatidos: string[]; // lista dos sinais que bateram (ex: ["cnpj_exato"] ou ["nome_alias","endereco","unidade_consumidora"])
}

// ------------------------------------------------------------------------
// Envelope completo retornado pela API route de processamento
// (pages/api/teste-motor-universal/processar.ts) para a UI consumir
// ------------------------------------------------------------------------
export interface ResultadoProcessamento {
  jsonUniversal: JsonUniversal; // objeto extraído (IA ou parser XML)
  fornecedorMatch: ResultadoFornecedorMatch; // resultado do cruzamento com fornecedores
  duplicateCheck: ResultadoDuplicateCheck; // resultado da checagem de duplicidade
  origemDespesaClassificacao: ResultadoOrigemDespesaClassificacao; // resultado da classificação automática
  hashArquivo: string; // hash SHA-256 do arquivo enviado, calculado no cliente ou na API route
}

// ------------------------------------------------------------------------
// Registro do roster de beneficiários pessoais (espelha a tabela
// teste_beneficiarios_pessoais no Supabase)
// Referência: spec seção 2.1.1, "Tech note: maintain this roster as a simple lookup table"
// ------------------------------------------------------------------------
export interface BeneficiarioPessoalRoster {
  id: string; // UUID da linha na tabela teste_beneficiarios_pessoais
  nome: string; // nome completo do beneficiário
  cpf: string | null; // CPF do beneficiário, se cadastrado
  vinculo: string; // "socio" ou "prestador_mei"
  aliases: string[]; // lista de apelidos/nomes alternativos documentados (ex: "Eldo Aquotte", "Aquotti")
}
