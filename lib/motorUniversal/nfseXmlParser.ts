// ============================================================
// lib/motorUniversal/nfseXmlParser.ts
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Parse direto (SEM IA) de NFS-e XML no padrão nacional
//         (Ambiente Nacional / Sped, xmlns="http://www.sped.fazenda.gov.br/nfse"),
//         convertendo para o mesmo formato JSON Universal produzido pelo
//         pipeline de IA (Gemini), conforme spec seção 2.1.1 e seção 5.
// Conecta com: types/motorUniversal.ts (tipo de retorno JsonUniversal),
//              e é chamado DIRETAMENTE NO CLIENT (app/teste-motor-universal/page.tsx),
//              nunca pela API route — ver nota de arquitetura abaixo.
//
// NOTA DE ARQUITETURA — POR QUE RODA NO CLIENT, NÃO NA API:
// Este parser usa `DOMParser`, uma API de navegador, indisponível no
// runtime Node.js das API routes. Isso replica exatamente o padrão já
// validado no projeto em lib/xmlParser.ts (parser de NF-e do módulo
// Receitas), que também roda no client pelo mesmo motivo — parsear como
// 'text/html' contorna o problema de namespace do XML (querySelector não
// resolve namespace em 'application/xml', mas resolve normalmente quando
// o documento é interpretado como HTML). Decisão confirmada com o usuário:
// "xml, não vai pra API" — o XML nunca trafega para a API route; apenas o
// JSON Universal já parseado é enviado para o passo de cross-reference/
// duplicate-check/persistência.
//
// LIMITAÇÃO CONHECIDA: este parser foi construído e validado apenas contra
// o layout NACIONAL de NFS-e (schema Sped, usado a partir da migração
// nacional). NFS-e emitidas em layouts municipais antigos (ABRASF, Ginfes,
// WebISS etc., anteriores à padronização nacional) têm estrutura de tags
// diferente e NÃO são suportadas por este parser — precisariam de um
// parser separado se aparecerem nos testes.
// ============================================================

// Importa os tipos do JSON Universal para tipar o retorno desta função
import type { JsonUniversal, Parcela } from '@/types/motorUniversal'

// ------------------------------------------------------------
// CLASSE: ErroValidacaoNfse
// Erro tipado lançado quando o XML não corresponde ao layout esperado
// (mesmo padrão de nomenclatura de erro usado em lib/xmlParser.ts)
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
// parseado como 'text/html' (mesma técnica de lib/xmlParser.ts) — retorna
// null se a tag não existir, em vez de lançar erro, já que muitos campos
// de NFS-e são opcionais dependendo do prestador/regime tributário
// ------------------------------------------------------------
function textoDe(doc: Document, seletor: string): string | null {
  const elemento = doc.querySelector(seletor)
  return elemento?.textContent?.trim() || null
}

// ------------------------------------------------------------
// Função: parsearNfseXml
// Recebe a string bruta do XML de NFS-e e retorna o JSON Universal
// completo, já no mesmo formato produzido pelo pipeline de IA — exceto
// pelos campos que também são computados em código lá (pagador,
// statusPagamento), que ficam de fora daqui pelo mesmo motivo.
// ------------------------------------------------------------
export function parsearNfseXml(xmlString: string): Omit<JsonUniversal, 'pagador' | 'origemDespesa' | 'statusPagamento' | 'anexoOriginal'> {
  // Parse como 'text/html' para contornar o problema de namespace do XML,
  // exatamente como já validado em lib/xmlParser.ts para NF-e
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
  // Este é o "favorecido" no JSON Universal, pois é para quem o dinheiro vai
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
  // seguindo a mesma lógica de "extração literal, sem reinterpretação"
  // usada no pipeline de IA — apenas concatena o que está no XML
  const enderecoPrestadorPartes = [prestadorLogradouro, prestadorNumero, prestadorBairro, prestadorUf].filter(Boolean)
  const enderecoPrestador = enderecoPartes(enderecoPrestadorPartes)

  // ── Bloco: tomador (toma) — quem contrata o serviço (deve ser a própria
  // Ceras Babinete neste fluxo, já que é ela quem está pagando) ──
  // NOTA: este parser não valida se o tomador bate com a Ceras Babinete —
  // essa validação de negócio fica para a camada de UI/cross-reference,
  // que já vai comparar favorecido/pagador de qualquer forma. Manter este
  // parser focado apenas em extração, sem lógica de alerta embutida.

  // ── Bloco: serviço (serv) — descrição do serviço prestado ──
  const descricaoServico = textoDe(doc, 'xdescserv') || ''

  // ── Bloco: valores ──
  // vServPrest > vServ = valor do serviço prestado (valor bruto)
  const valorServicoTexto = textoDe(doc, 'vservprest vserv')
  // vLiq (no bloco infNFSe > valores) = valor líquido final da nota
  const valorLiquidoTexto = textoDe(doc, 'infnfse > valores > vliq')

  // Converte os textos numéricos para number; usa 0 como fallback seguro
  // se o campo não existir (nunca deve travar o parse por causa disso)
  const valorServico = valorServicoTexto ? parseFloat(valorServicoTexto) : 0
  const valorLiquido = valorLiquidoTexto ? parseFloat(valorLiquidoTexto) : valorServico

  // ── Bloco: retenção de ISS ──
  // tpRetISSQN: "1" = ISS retido na fonte pelo tomador; "2" = não retido.
  // Este XML de exemplo não expõe o VALOR do ISS retido, só o indicador —
  // por isso "retencoes.issRetido" abaixo fica 0 (ver nota no objeto de retorno).

  // ── Bloco: identificação do documento ──
  const numeroNfse = textoDe(doc, 'nnfse') // número da NFS-e (ex: "34")
  const dataEmissao = textoDe(doc, 'dhemi') // data/hora de emissão completa (ISO com timezone)
  const competencia = textoDe(doc, 'dcompet') // competência (ex: "2026-07-01")

  // Extrai só a parte de data (YYYY-MM-DD) do dhEmi, que vem como
  // "2026-07-01T13:41:21-03:00" — mantemos só a data para dataEmissao
  const dataEmissaoSomenteData = dataEmissao ? dataEmissao.slice(0, 10) : null

  // Chave de acesso da NFS-e — vem no atributo Id da tag infNFSe
  // (ex: "NFS41152002244739377000132000000000003426075633824835")
  const chaveAcessoNFSe = infNFSe.getAttribute('id') || infNFSe.getAttribute('Id')

  // ── Monta a parcela única ──
  // NFS-e de serviço não carrega data de vencimento/pagamento (isso é uma
  // fatura à parte, gerada separadamente) — ASSUNÇÃO ADOTADA: como não há
  // campo de vencimento no XML de NFS-e, usamos a data de competência (ou,
  // na ausência dela, a data de emissão) como dataVencimento provisória.
  // Esta é uma decisão técnica de fallback, não uma regra de negócio da
  // spec — sinalizar ao usuário para confirmar se faz sentido manter assim
  // quando este teste for validado.
  const dataVencimentoFallback = competencia || dataEmissaoSomenteData || new Date().toISOString().slice(0, 10)

  const parcelaUnica: Parcela = {
    numeroParcela: 1, // NFS-e de serviço não tem parcelamento — sempre parcela única
    totalParcelas: 1,
    valor: valorLiquido, // valor líquido final da nota
    dataVencimento: dataVencimentoFallback, // ver nota de assunção acima
    linhaDigitavel: null, // NFS-e não é boleto, não tem linha digitável
    codigoBarras: null, // idem
    nossoNumero: null, // idem
    podeGerarSegundaVia: false, // sem dados de pagamento, não há segunda via a gerar
  }

  // ── Monta e retorna o objeto final, no mesmo shape do JSON Universal ──
  // (exceto pagador/origemDespesa/statusPagamento/anexoOriginal, que são
  // preenchidos em código na API route, igual ao fluxo de IA)
  return {
    tipoDocumento: 'nota_fiscal', // decisão confirmada com o usuário: NFS-e mapeia para "nota_fiscal"
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
          // ASSUNÇÃO: não há campo explícito de regime MEI neste layout de
          // NFS-e nacional — regEspTrib/opSimpNac não são sinais confiáveis
          // de MEI isoladamente, então deixamos false por padrão aqui.
          // A classificação correta de "prestador MEI" (Maycon) deve vir
          // do roster de beneficiários, não deste parser.
          regimeMei: false,
        },
        descricaoServico: descricaoServico,
        chaveAcessoNFSe: chaveAcessoNFSe,
        retencoes: {
          // Valor do ISS retido não vem explícito neste XML de exemplo
          // (só o indicador tpRetISSQN="1"/"2"); sem o valor destacado,
          // não é possível calcular o montante retido com segurança —
          // fica 0 quando não houver o valor explícito no XML.
          issRetido: 0,
        },
      },
    },
  }

  // Função auxiliar interna: junta as partes do endereço com vírgula,
  // ignorando partes vazias — evita "undefined" ou vírgulas duplicadas
  function enderecoPartes(partes: string[]): string | null {
    return partes.length > 0 ? partes.join(', ') : null
  }
}
