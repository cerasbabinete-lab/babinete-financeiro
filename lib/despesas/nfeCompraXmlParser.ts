// ============================================================
// lib/despesas/nfeCompraXmlParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Despesas
// Função: Parse direto (SEM IA) de NF-e de COMPRA em XML —
//         mesmo layout nacional já usado em Receitas (procNFe),
//         mas com o papel invertido: aqui a Ceras Babinete é a
//         DESTINATÁRIA (quem paga), nunca a emitente. Converte
//         para o modelo canônico de extração (DocumentoExtraidoDespesa),
//         mesmo contrato produzido pela extração via IA e pelo parser de NFS-e.
// Conecta com: types/despesas.ts (tipo de retorno DocumentoExtraidoDespesa),
//              chamado NO CLIENT por app/despesas/page.tsx (ou pelo
//              componente de import XML), nunca dentro de uma API route.
//
// NOTA DE ARQUITETURA — POR QUE É UM ARQUIVO NOVO, SEPARADO DE lib/xmlParser.ts:
// lib/xmlParser.ts (módulo Receitas) valida que o CNPJ EMITENTE do XML é
// sempre a Ceras Babinete e REJEITA qualquer outro — faz sentido para
// vendas, onde a empresa é sempre quem emite a nota. Para compra, a lógica
// de negócio é o oposto: a Ceras Babinete é sempre a DESTINATÁRIA, e o
// emitente é o fornecedor (o favorecido/quem recebe o pagamento). Reescrever
// essa validação dentro do arquivo de Receitas inverteria uma regra já
// validada em produção — por isso este é um arquivo isolado, que não
// importa nem altera lib/xmlParser.ts em nenhuma linha.
//
// NOTA DE ARQUITETURA — POR QUE RODA NO CLIENT, NÃO NA API:
// Usa `DOMParser`, API de navegador indisponível no runtime Node.js das
// API routes — mesmo motivo documentado em lib/xmlParser.ts e
// lib/despesas/nfseXmlParser.ts. O XML nunca trafega para a API
// route; apenas o modelo canônico de extração já parseado segue para o pipeline
// compartilhado de cross-reference/classificação/duplicidade.
// ============================================================

// Importa os tipos do modelo canônico de extração para tipar o retorno
// desta função (mesmo contrato usado pelo parser de NFS-e e pela IA)
import type { Parcela, ItemCompra, DocumentoExtraidoDespesa } from '@/types/despesas'

// ------------------------------------------------------------
// CONSTANTE: CNPJ da Ceras Babinete (sem pontuação)
// Usado para validar que a empresa é a DESTINATÁRIA do XML —
// papel invertido em relação a lib/xmlParser.ts (que valida o emitente)
// ------------------------------------------------------------
const CNPJ_CERAS_BABINETE = '10666614000160'

// ------------------------------------------------------------
// CLASSE: ErroValidacaoNfeCompra
// Erro tipado lançado quando o XML não corresponde ao layout esperado
// ou não é uma NF-e de compra válida para este fluxo (mesmo padrão de
// nomenclatura de erro usado em lib/xmlParser.ts e nfseXmlParser.ts)
// ------------------------------------------------------------
export class ErroValidacaoNfeCompra extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = 'ErroValidacaoNfeCompra'
  }
}

// ------------------------------------------------------------
// Função auxiliar: formatarCnpj
// Recebe um CNPJ em dígitos puros (14 caracteres) e retorna formatado
// no padrão "XX.XXX.XXX/XXXX-XX", igual à convenção de armazenamento já
// usada em Clientes/Fornecedores (necessário para o cross-reference
// funcionar, já que a tabela fornecedores guarda CNPJ formatado)
// Duplicada aqui (em vez de importada) para manter este parser isolado,
// mesma convenção adotada em nfseXmlParser.ts
// ------------------------------------------------------------
function formatarCnpj(cnpjDigitos: string): string {
  // Remove qualquer caractere não-numérico, por segurança
  const digitos = cnpjDigitos.replace(/\D/g, '')

  // Valida que sobraram exatamente 14 dígitos antes de formatar
  if (digitos.length !== 14) {
    // Tamanho inesperado — retorna como veio em vez de quebrar o parse inteiro
    return cnpjDigitos
  }

  // Monta a máscara XX.XXX.XXX/XXXX-XX a partir dos dígitos
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`
}

// ------------------------------------------------------------
// Função auxiliar: texto
// Busca o texto de uma tag no documento inteiro. XML parseado como
// 'text/html' (mesma técnica de lib/xmlParser.ts) — tags ficam lowercase
// ------------------------------------------------------------
function texto(doc: Document, seletor: string): string {
  return doc.querySelector(seletor)?.textContent?.trim() ?? ''
}

// ------------------------------------------------------------
// Função auxiliar: textoEl
// Busca o texto de uma tag dentro de um elemento pai específico
// (pai pode ser null/undefined — retorna string vazia nesse caso)
// ------------------------------------------------------------
function textoEl(el: Element | null | undefined, tag: string): string {
  if (!el) return ''
  return el.querySelector(tag)?.textContent?.trim() ?? ''
}

// ------------------------------------------------------------
// Função auxiliar: numEl
// Converte o texto de uma tag filha para número, arredondado a 2 casas
// (usado para valores monetários — vProd, vICMS, vIPI etc.)
// ------------------------------------------------------------
function numEl(el: Element | null | undefined, tag: string): number {
  const val = parseFloat(textoEl(el, tag) || '0')
  return Math.round(val * 100) / 100
}

// ------------------------------------------------------------
// Função: parsearNfeCompraXml
// Recebe a string bruta do XML de NF-e (procNFe) e retorna o JSON
// Universal completo — exceto pagador/origemDespesa/statusPagamento/
// anexoOriginal, preenchidos em código na API route, igual ao parser
// de NFS-e e ao pipeline de IA.
// ------------------------------------------------------------
export function parsearNfeCompraXml(
  xmlString: string,
): DocumentoExtraidoDespesa {

  // Parse como 'text/html' para contornar o problema de namespace do XML
  // (xmlns="http://www.portalfiscal.inf.br/nfe" não resolve em querySelector
  // quando parseado como 'application/xml' — mesmo truque de lib/xmlParser.ts)
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/html')

  // ── Validação 1: formato procNFe ──────────────────────────
  // Mesma checagem estrutural de lib/xmlParser.ts — confirma que é de
  // fato um XML de NF-e autorizada, antes de qualquer extração
  const nfeProc = doc.querySelector('nfeproc')
  const protNFe = doc.querySelector('protnfe')
  if (!nfeProc || !protNFe) {
    throw new ErroValidacaoNfeCompra('Arquivo corrompido ou formato inválido (não é procNFe).')
  }

  // ── Validação 2: NF autorizada (cStat = 100) ─────────────
  // Mesma regra de negócio de Receitas — só processa nota autorizada
  const cStat = texto(doc, 'infprot cstat')
  if (cStat !== '100') {
    throw new ErroValidacaoNfeCompra(`NF-e não autorizada (cStat ${cStat}).`)
  }

  // ── Validação 3 (PAPEL INVERTIDO): CNPJ DESTINATÁRIO ──────
  // Diferente de lib/xmlParser.ts (que valida o EMITENTE): aqui a Ceras
  // Babinete precisa ser a DESTINATÁRIA — senão este XML não é uma compra
  // da empresa, é uma nota de terceiros que não pertence a este fluxo
  const cnpjDestinatario = texto(doc, 'dest cnpj').replace(/\D/g, '')
  if (cnpjDestinatario !== CNPJ_CERAS_BABINETE) {
    throw new ErroValidacaoNfeCompra(
      'CNPJ destinatário não é da Ceras Babinete — este XML não é uma nota de compra da empresa.',
    )
  }

  // ── Extração: identificação da NF-e ──────────────────────
  // NOTA: a chave de acesso (infProt > chNFe) não é extraída aqui porque
  // o modelo canônico de extração de 'nota_fiscal' não tem campo dedicado para ela
  // (diferente de 'servicos_profissionais', que usa chaveAcessoNFSe) —
  // o rastreio de duplicidade desta categoria usa numeroDocumento + valor
  // + vencimento, conforme Especificacao_Modulo_Despesas.md §5
  const numeroNf = texto(doc, 'ide nnf')
  const dhEmi = texto(doc, 'ide dhemi')
  const dataEmissaoSomenteData = dhEmi ? dhEmi.slice(0, 10) : null

  // ── Extração: EMITENTE (fornecedor — o favorecido no modelo canônico de extração) ──
  // Papel invertido de lib/xmlParser.ts: lá o emitente é sempre a empresa
  // e é ignorado; aqui o emitente é o fornecedor e É o favorecido
  const emitEl = doc.querySelector('emit')
  const fornecedorCnpjDigitos = textoEl(emitEl, 'cnpj').replace(/\D/g, '')
  const fornecedorNome = textoEl(emitEl, 'xnome')

  // Validação: sem CNPJ/nome do emitente não é possível montar o favorecido
  if (!fornecedorCnpjDigitos || !fornecedorNome) {
    throw new ErroValidacaoNfeCompra('CNPJ ou nome do emitente (fornecedor) não encontrado no XML.')
  }

  // Monta o endereço do fornecedor a partir do bloco enderEmit, literal
  // (sem normalizar/expandir abreviações, mesma regra do pipeline de IA)
  const enderEmit = emitEl?.querySelector('enderemit')
  const fornecedorLgr = textoEl(enderEmit, 'xlgr')
  const fornecedorNro = textoEl(enderEmit, 'nro')
  const fornecedorBairro = textoEl(enderEmit, 'xbairro')
  const fornecedorMun = textoEl(enderEmit, 'xmun')
  const fornecedorUf = textoEl(enderEmit, 'uf')
  const enderecoFornecedorPartes = [fornecedorLgr, fornecedorNro, fornecedorBairro, fornecedorMun, fornecedorUf].filter(Boolean)
  const enderecoFornecedor = enderecoFornecedorPartes.length > 0 ? enderecoFornecedorPartes.join(', ') : null

  // ── Extração: totais financeiros ──────────────────────────
  // Mesmo bloco icmsTot de lib/xmlParser.ts — vProd, vDesc, vNF, vICMS, vIPI
  const icmsTot = doc.querySelector('icmstot')
  const valorProdutos = numEl(icmsTot, 'vprod')
  const valorDesconto = numEl(icmsTot, 'vdesc')
  const valorNf = numEl(icmsTot, 'vnf')
  const valorIcms = numEl(icmsTot, 'vicms')
  const valorIpi = numEl(icmsTot, 'vipi')

  // ── Extração: itens (det) ─────────────────────────────────
  // Mesmo padrão de lib/xmlParser.ts — cada <det> é um produto da nota
  const detNodes = doc.querySelectorAll('det')
  const itens: ItemCompra[] = []

  detNodes.forEach(det => {
    const prodEl = det.querySelector('prod')
    const descricao = textoEl(prodEl, 'xprod')
    const quantidade = parseFloat(textoEl(prodEl, 'qcom') || '0')
    const valorUnit = parseFloat(textoEl(prodEl, 'vuncom') || '0')
    const valorTotalItem = parseFloat(textoEl(prodEl, 'vprod') || '0')

    // Só adiciona itens com descrição — protege contra <det> vazio/malformado
    if (descricao) {
      itens.push({
        descricao,
        quantidade,
        valorUnitario: valorUnit,
        valorTotal: valorTotalItem,
      })
    }
  })

  // ── Extração: duplicatas (cobr > dup) → parcelas ──────────
  // Mesmo bloco de lib/xmlParser.ts — cada <dup> é uma parcela de pagamento.
  // Convertidas para o formato Parcela[] do modelo canônico de extração (sem dados de
  // boleto, já que a NF-e em si não carrega linha digitável/nosso número —
  // isso viria de um boleto separado, se o fornecedor emitir um)
  const cobrEl = doc.querySelector('cobr')
  const dupNodes = cobrEl?.querySelectorAll('dup') ?? []
  const parcelas: Parcela[] = []

  dupNodes.forEach((dup, index) => {
    const dVenc = textoEl(dup, 'dvenc')
    const vDup = parseFloat(textoEl(dup, 'vdup') || '0')

    // Só adiciona parcelas com vencimento — protege contra <dup> malformado
    if (dVenc) {
      parcelas.push({
        numeroParcela: index + 1, // posição 1-based dentro do total de duplicatas
        totalParcelas: dupNodes.length,
        valor: vDup,
        dataVencimento: dVenc, // já vem em ISO YYYY-MM-DD no XML de NF-e
        linhaDigitavel: null, // NF-e não carrega linha digitável — só o boleto, se houver
        codigoBarras: null, // idem
        nossoNumero: null, // idem
        podeGerarSegundaVia: false, // sem dados de pagamento, não há segunda via a gerar a partir da NF-e
      })
    }
  })

  // ── Fallback: NF-e sem bloco <cobr>/<dup> (pagamento à vista, por exemplo) ──
  // Mesma lógica de fallback adotada em nfseXmlParser.ts para documentos
  // sem parcelamento explícito — usa o valor total da nota como parcela única,
  // com vencimento na própria data de emissão
  if (parcelas.length === 0) {
    parcelas.push({
      numeroParcela: 1,
      totalParcelas: 1,
      valor: valorNf,
      dataVencimento: dataEmissaoSomenteData || new Date().toISOString().slice(0, 10),
      linhaDigitavel: null,
      codigoBarras: null,
      nossoNumero: null,
      podeGerarSegundaVia: false,
    })
  }

  // ── Monta e retorna o objeto final, no mesmo shape do modelo canônico de extração ──
  return {
    tipoDocumento: 'nota_fiscal', // NF-e de compra mapeia para 'nota_fiscal', mesma convenção da spec
    categoriaFinanceira: 'compra_mercadoria_insumo', // única categoria compatível com NF-e de compra estruturada
    favorecido: {
      nome: fornecedorNome, // extraído literalmente do XML, sem normalização
      cnpjCpf: formatarCnpj(fornecedorCnpjDigitos),
      endereco: enderecoFornecedor,
    },
    documentoOrigem: {
      numeroDocumento: numeroNf || null,
      dataEmissao: dataEmissaoSomenteData,
      competencia: null, // NF-e de compra não tem campo de competência (isso é próprio de utilidades/folha)
    },
    parcelas,
    valores: {
      valorOriginal: valorProdutos,
      valorDesconto: valorDesconto,
      valorJurosMulta: 0, // NF-e não é documento de cobrança vencida — juros/multa não se aplicam na emissão
      valorTotal: valorNf,
    },
    extensaoCategoria: {
      compraMercadoriaInsumo: {
        fornecedor: {
          nome: fornecedorNome,
          cnpj: formatarCnpj(fornecedorCnpjDigitos),
          endereco: enderecoFornecedor,
        },
        itens: itens.length > 0 ? itens : null, // estruturado, já que veio de NF-e — nunca descricaoLivre
        descricaoLivre: null, // mutuamente exclusivo com itens — NF-e sempre estruturada
        impostos: {
          icms: valorIcms,
          ipi: valorIpi,
        },
      },
    },
  }
}
