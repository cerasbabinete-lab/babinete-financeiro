// ============================================================
// lib/despesas/nfseXmlParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Parse direto (SEM IA) de NFS-e XML no padrão nacional
//         (Ambiente Nacional / Sped, xmlns="http://www.sped.fazenda.gov.br/nfse"),
//         convertendo para o mesmo modelo canônico de extração
//         (DocumentoExtraidoDespesa) produzido pelo pipeline de IA.
// Conecta com: types/despesas.ts (tipo de retorno DocumentoExtraidoDespesa),
//              chamado NO CLIENT (app/despesas/page.tsx ou componente de
//              import XML), nunca pela API route — ver nota abaixo.
//
// NOTA DE ARQUITETURA — POR QUE RODA NO CLIENT, NÃO NA API:
// Este parser usa `DOMParser`, uma API de navegador, indisponível no
// runtime Node.js das API routes. Mesmo padrão já validado no projeto em
// lib/xmlParser.ts (parser de NF-e do módulo Receitas) e em
// lib/despesas/nfeCompraXmlParser.ts — parsear como 'text/html' contorna
// o problema de namespace do XML (querySelector não resolve namespace em
// 'application/xml', mas resolve normalmente quando o documento é
// interpretado como HTML). O XML nunca trafega para a API route; apenas
// o modelo canônico já parseado segue para o passo de cross-reference/
// classificação/duplicidade/persistência.
//
// LIMITAÇÃO CONHECIDA: este parser foi construído e validado apenas contra
// o layout NACIONAL de NFS-e (schema Sped, usado a partir da migração
// nacional). NFS-e emitidas em layouts municipais antigos (ABRASF, Ginfes,
// WebISS etc., anteriores à padronização nacional) têm estrutura de tags
// diferente e NÃO são suportadas por este parser.
// ============================================================

// Importa os tipos do modelo canônico de extração para tipar o retorno
import type { DocumentoExtraidoDespesa, Parcela } from '@/types/despesas'

// ------------------------------------------------------------
// CLASSE: ErroValidacaoNfse
// Erro tipado lançado quando o XML não corresponde ao layout esperado
// ------------------------------------------------------------
export class ErroValidacaoNfse extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = 'ErroValidacaoNfse'
  }
}

// ------------------------------------------------------------
// Função auxiliar: formatarCnpj
// Recebe um CNPJ em dígitos puros (14 caracteres) e retorna formatado
// no padrão "XX.XXX.XXX/XXXX-XX", igual à convenção de armazenamento já
// usada em Clientes/Fornecedores (necessário para o cross-reference
// funcionar, já que a tabela fornecedores guarda CNPJ formatado)
// ------------------------------------------------------------
function formatarCnpj(cnpjDigitos: string): string {
  // Remove qualquer caractere não-numérico, por segurança
  const digitos = cnpjDigitos.replace(/\D/g, '')

  // Valida que sobraram exatamente 14 dígitos antes de formatar
  if (digitos.length !== 14) {
    // Se não tiver o tamanho esperado, retorna como veio (sem formatar)
    // em vez de quebrar o parse inteiro por causa de um campo auxiliar
    return cnpjDigitos
  }

  // Monta a máscara XX.XXX.XXX/XXXX-XX a partir dos dígitos
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`
}

// ------------------------------------------------------------
// Função auxiliar: textoDe
// Busca o texto de uma tag via querySelector, considerando que o XML foi
// parseado como 'text/html' — retorna null se a tag não existir, em vez
// de lançar erro, já que muitos campos de NFS-e são opcionais dependendo
// do prestador/regime tributário
// ------------------------------------------------------------
function textoDe(doc: Document, seletor: string): string | null {
  const elemento = doc.querySelector(seletor)
  return elemento?.textContent?.trim() || null
}

// ------------------------------------------------------------
// Função: parsearNfseXml
// Recebe a string bruta do XML de NFS-e e retorna o modelo canônico de
// extração completo — exceto pelos campos computados em código na API
// route (fornecedor_id, origemDespesa, statusPagamento), igual ao
// caminho de IA.
// ------------------------------------------------------------
export function parsearNfseXml(xmlString: string): DocumentoExtraidoDespesa {
  // Parse como 'text/html' para contornar o problema de namespace do XML,
  // exatamente como já validado em lib/xmlParser.ts e nfeCompraXmlParser.ts
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/html')

  // ── Validação mínima: confirma que é de fato um XML de NFS-e nacional ──
  // Procura pela tag infNFSe, presente em todo NFS-e no layout nacional
  const infNFSe = doc.querySelector('infnfse')
  if (!infNFSe) {
    throw new ErroValidacaoNfse(
      'XML não reconhecido como NFS-e no layout nacional (tag infNFSe não encontrada). Verifique se o arquivo corresponde ao padrão Sped/Ambiente Nacional.',
    )
  }

  // ── Bloco: prestador (emit) — quem presta o serviço e recebe o pagamento ──
  // Este é o "favorecido" no modelo canônico, pois é para quem o dinheiro vai
  const prestadorCnpjDigitos = textoDe(doc, 'emit cnpj')
  const prestadorNome = textoDe(doc, 'emit xnome')
  const prestadorLogradouro = textoDe(doc, 'emit endernac xlgr')
  const prestadorNumero = textoDe(doc, 'emit endernac nro')
  const prestadorBairro = textoDe(doc, 'emit endernac xbairro')
  const prestadorUf = textoDe(doc, 'emit endernac uf')

  // Validação: sem CNPJ do prestador não é possível montar o favorecido
  if (!prestadorCnpjDigitos || !prestadorNome) {
    throw new ErroValidacaoNfse('CNPJ ou nome do prestador (emit) não encontrado no XML — não é possível identificar o favorecido.')
  }

  // Monta o endereço completo do prestador em uma única string literal,
  // sem normalizar/reinterpretar — apenas concatena o que está no XML
  const enderecoPrestadorPartes = [prestadorLogradouro, prestadorNumero, prestadorBairro, prestadorUf].filter(Boolean)
  const enderecoPrestador = enderecoPrestadorPartes.length > 0 ? enderecoPrestadorPartes.join(', ') : null

  // ── Bloco: serviço (serv) — descrição do serviço prestado ──
  const descricaoServico = textoDe(doc, 'xdescserv') || ''

  // ── Bloco: valores ──
  // vServPrest > vServ = valor do serviço prestado (valor bruto)
  const valorServicoTexto = textoDe(doc, 'vservprest vserv')
  // vLiq (no bloco infNFSe > valores) = valor líquido final da nota
  const valorLiquidoTexto = textoDe(doc, 'infnfse > valores > vliq')

  // Converte os textos numéricos para number; usa 0 como fallback seguro
  const valorServico = valorServicoTexto ? parseFloat(valorServicoTexto) : 0
  const valorLiquido = valorLiquidoTexto ? parseFloat(valorLiquidoTexto) : valorServico

  // ── Bloco: identificação do documento ──
  const numeroNfse = textoDe(doc, 'nnfse') // número da NFS-e
  const dataEmissao = textoDe(doc, 'dhemi') // data/hora de emissão completa (ISO com timezone)
  const competencia = textoDe(doc, 'dcompet') // competência (ex: "2026-07-01")

  // Extrai só a parte de data (YYYY-MM-DD) do dhEmi
  const dataEmissaoSomenteData = dataEmissao ? dataEmissao.slice(0, 10) : null

  // Chave de acesso da NFS-e — vem no atributo Id da tag infNFSe
  const chaveAcessoNFSe = infNFSe.getAttribute('id') || infNFSe.getAttribute('Id')

  // ── Monta a parcela única ──
  // NFS-e de serviço não carrega data de vencimento/pagamento (isso é uma
  // fatura à parte, gerada separadamente) — usa a competência (ou, na
  // ausência dela, a data de emissão) como dataVencimento provisória.
  const dataVencimentoFallback = competencia || dataEmissaoSomenteData || new Date().toISOString().slice(0, 10)

  const parcelaUnica: Parcela = {
    numeroParcela: 1, // NFS-e de serviço não tem parcelamento — sempre parcela única
    totalParcelas: 1,
    valor: valorLiquido, // valor líquido final da nota
    dataVencimento: dataVencimentoFallback,
    linhaDigitavel: null, // NFS-e não é boleto, não tem linha digitável
    codigoBarras: null,
    nossoNumero: null,
    podeGerarSegundaVia: false, // sem dados de pagamento, não há segunda via a gerar
  }

  // ── Monta e retorna o objeto final, no modelo canônico de extração ──
  return {
    tipoDocumento: 'nota_fiscal', // NFS-e mapeia para "nota_fiscal", mesma convenção da spec
    categoriaFinanceira: 'servicos_profissionais', // única categoria compatível com NFS-e de serviço
    favorecido: {
      nome: prestadorNome, // extraído literalmente do XML, sem normalização
      cnpjCpf: formatarCnpj(prestadorCnpjDigitos),
      endereco: enderecoPrestador,
    },
    documentoOrigem: {
      numeroDocumento: numeroNfse,
      dataEmissao: dataEmissaoSomenteData,
      competencia: competencia,
    },
    parcelas: [parcelaUnica],
    valores: {
      valorOriginal: valorServico,
      valorDesconto: 0, // NFS-e nacional não expõe desconto separado neste layout
      valorJurosMulta: 0, // não aplicável a NFS-e (não é documento de cobrança vencida)
      valorTotal: valorLiquido,
    },
    extensaoCategoria: {
      servicosProfissionais: {
        prestador: {
          nome: prestadorNome,
          cnpjCpf: formatarCnpj(prestadorCnpjDigitos),
          // Não há campo explícito de regime MEI neste layout de NFS-e
          // nacional — a classificação correta de "prestador MEI" (Maycon)
          // vem do roster de beneficiários, não deste parser
          regimeMei: false,
        },
        descricaoServico: descricaoServico,
        chaveAcessoNFSe: chaveAcessoNFSe,
        retencoes: {
          // Valor do ISS retido não vem explícito neste XML de exemplo
          // (só o indicador tpRetISSQN="1"/"2"); sem o valor destacado,
          // fica 0 quando não houver o valor explícito no XML
          issRetido: 0,
        },
      },
    },
  }
}
