// ============================================================
// lib/xmlParser.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Receitas
// Função: Parse e validação de XML procNFe da Ceras Babinete
//         Extrai campos e monta objetos prontos para inserção
//         Não faz operações no banco — só lê e transforma
// Conecta com: ImportarXmlButton.tsx (quem chama),
//              types/receitas.ts (tipos de retorno),
//              receitasService.ts e transportadorasService.ts
//              (quem persiste o resultado)
//
// NOTA CRÍTICA — NAMESPACE:
//   O XML NF-e tem xmlns="http://www.portalfiscal.inf.br/nfe"
//   Parsear como 'application/xml' faz querySelector retornar null
//   para todos os elementos (namespace não resolvido pelo CSS selector).
//   Solução: parsear como 'text/html' — o HTML parser ignora namespaces
//   e os seletores funcionam normalmente. Validado contra NF 5414.
// ============================================================

import type { ReceitaInsert, ReceitaItem, Duplicata, Transportadora } from '@/types/receitas'

// ============================================================
// CNPJ emitente válido — Ceras Babinete LTDA. ME
// XMLs com CNPJ diferente são rejeitados
// ============================================================
const CNPJ_EMITENTE = '10666614000160'

// ============================================================
// ResultadoParse
// ============================================================
export interface ResultadoParse {
  receita: ReceitaInsert
  itens: Omit<ReceitaItem, 'id' | 'receita_id' | 'created_at'>[]
  duplicatas: Omit<Duplicata, 'id' | 'receita_id' | 'created_at'>[]
  transportadora: Omit<Transportadora, 'id' | 'created_at' | 'updated_at'> | null
  chaveAcesso: string
}

// ============================================================
// ErroValidacao
// ============================================================
export class ErroValidacao extends Error {
  constructor(public reason: string) {
    super(reason)
    this.name = 'ErroValidacao'
  }
}

// ============================================================
// parsearXml()
// ============================================================
export function parsearXml(xmlString: string): ResultadoParse {

  // ── Parse como HTML para contornar problema de namespace ──
  // 'text/html' ignora xmlns e permite querySelector normal
  const parser = new DOMParser()
  const doc    = parser.parseFromString(xmlString, 'text/html')

  // Verifica se o XML tem conteúdo mínimo esperado
  // (não há parsererror em modo HTML — verificamos pela presença de tags)
  const temNfe = doc.querySelector('nfeproc')
  if (!temNfe) {
    throw new ErroValidacao('Arquivo corrompido')
  }

  // ── Validação 1: formato procNFe ──────────────────────────
  // Em modo HTML, tags ficam em lowercase
  const nfeProc = doc.querySelector('nfeproc')
  const protNFe = doc.querySelector('protnfe')
  if (!nfeProc || !protNFe) {
    throw new ErroValidacao('Formato inválido (não é procNFe)')
  }

  // ── Validação 2: CNPJ emitente ────────────────────────────
  // emit > cnpj (lowercase em modo HTML)
  const cnpjEmitente = texto(doc, 'emit cnpj')
  if (cnpjEmitente !== CNPJ_EMITENTE) {
    throw new ErroValidacao('CNPJ emitente inválido')
  }

  // ── Validação 3: NF autorizada (cStat = 100) ─────────────
  const cStat = texto(doc, 'infprot cstat')
  if (cStat !== '100') {
    throw new ErroValidacao(`NF não autorizada (cStat ${cStat})`)
  }

  // ── Extração: identificação da NF-e ──────────────────────
  const chaveAcesso = texto(doc, 'infprot chnfe')
  const numeroNf    = parseInt(texto(doc, 'ide nnf'), 10)
  const serie       = parseInt(texto(doc, 'ide serie'), 10)
  const protocolo   = texto(doc, 'infprot nprot')
  const dhEmi       = texto(doc, 'ide dhemi')
  const dhRecbto    = texto(doc, 'infprot dhrecbto')
  const natOp       = texto(doc, 'ide natop')
  const idDest      = parseInt(texto(doc, 'ide iddest') || '0', 10)
  const statusNf    = parseInt(cStat, 10)

  // ── Extração: destinatário ────────────────────────────────
  const destEl      = doc.querySelector('dest')
  const destCnpj    = textoEl(destEl, 'cnpj')
  const destCpf     = textoEl(destEl, 'cpf')
  const clienteCpfCnpj = (destCnpj || destCpf).replace(/[^0-9]/g, '')
  const clienteNome = textoEl(destEl, 'xnome')
  const clienteIe   = textoEl(destEl, 'ie')
  const clienteFone = textoEl(destEl, 'fone')
  const clienteEmail = textoEl(destEl, 'email')

  const enderDest   = destEl?.querySelector('enderdest')
  const clienteLgr  = textoEl(enderDest, 'xlgr')
  const clienteNro  = textoEl(enderDest, 'nro')
  const clienteCpl  = textoEl(enderDest, 'xcpl')
  const clienteBairro = textoEl(enderDest, 'xbairro')
  const clienteMun  = textoEl(enderDest, 'xmun')
  const clienteUf   = textoEl(enderDest, 'uf')
  const clienteCep  = textoEl(enderDest, 'cep').replace(/[^0-9]/g, '')

  // ── Extração: totais financeiros ──────────────────────────
  const icmsTot     = doc.querySelector('icmstot')
  const valorProdutos = numEl(icmsTot, 'vprod')
  const valorFrete    = numEl(icmsTot, 'vfrete')
  const valorSeguro   = numEl(icmsTot, 'vseg')
  const valorDesconto = numEl(icmsTot, 'vdesc')
  const valorOutras   = numEl(icmsTot, 'voutro')
  const valorIpi      = numEl(icmsTot, 'vipi')
  const valorNf       = numEl(icmsTot, 'vnf')

  // ── Extração: transporte ──────────────────────────────────
  const transpEl    = doc.querySelector('transp')
  const modFrete    = parseInt(textoEl(transpEl, 'modfrete') || '9', 10)
  const volEl       = transpEl?.querySelector('vol')
  const volQtd      = parseInt(textoEl(volEl, 'qvol') || '0', 10)
  const volMarca    = textoEl(volEl, 'marca')
  const volNumero   = textoEl(volEl, 'nvol')
  const pesoL       = numFloatEl(volEl, 'pesol')
  const pesoB       = numFloatEl(volEl, 'pesob')

  // ── Extração: fatura ─────────────────────────────────────
  const cobrEl      = doc.querySelector('cobr')
  const fatEl       = cobrEl?.querySelector('fat')
  const fatNumero   = textoEl(fatEl, 'nfat')
  const fatVOrig    = numEl(fatEl, 'vorig')
  const fatVDesc    = numEl(fatEl, 'vdesc')

  // ── Extração: observações (infCpl) ────────────────────────
  // infAdic pode não existir — retorna '' se ausente
  const infAdicEl   = doc.querySelector('infadic')
  const observacoes = textoEl(infAdicEl, 'infcpl')

  // ── Extração: transportadora ──────────────────────────────
  let transportadora: Omit<Transportadora, 'id' | 'created_at' | 'updated_at'> | null = null
  const transportaEl = transpEl?.querySelector('transporta')
  const transpCnpj   = textoEl(transportaEl, 'cnpj').replace(/[^0-9]/g, '')

  if (transpCnpj && modFrete !== 9) {
    transportadora = {
      cnpj:      transpCnpj,
      nome:      textoEl(transportaEl, 'xnome'),
      endereco:  textoEl(transportaEl, 'xender') || undefined,
      municipio: textoEl(transportaEl, 'xmun')   || undefined,
      uf:        textoEl(transportaEl, 'uf')      || undefined,
    }
  }

  // ── Extração: itens (det) ─────────────────────────────────
  const detNodes = doc.querySelectorAll('det')
  const itens: Omit<ReceitaItem, 'id' | 'receita_id' | 'created_at'>[] = []

  detNodes.forEach(det => {
    const prodEl    = det.querySelector('prod')
    const codigo    = textoEl(prodEl, 'cean') || textoEl(prodEl, 'cprod')
    const descricao = textoEl(prodEl, 'xprod')
    const unidade   = textoEl(prodEl, 'ucom')
    const quantidade  = parseFloat(textoEl(prodEl, 'qcom') || '0')
    const valorUnit   = parseFloat(textoEl(prodEl, 'vuncom') || '0')
    const valorTotal  = parseFloat(textoEl(prodEl, 'vprod') || '0')
    const vDesc       = parseFloat(textoEl(prodEl, 'vdesc') || '0')
    const vFrete      = parseFloat(textoEl(prodEl, 'vfrete') || '0')
    const cfop        = textoEl(prodEl, 'cfop')

    if (descricao) {
      itens.push({
        codigo_produto: codigo    || undefined,
        descricao,
        unidade:        unidade   || undefined,
        quantidade,
        valor_unitario: valorUnit,
        valor_total:    valorTotal,
        valor_desconto: vDesc,
        valor_frete:    vFrete,
        cfop:           cfop      || undefined,
      })
    }
  })

  // ── Extração: duplicatas ──────────────────────────────────
  const dupNodes = cobrEl?.querySelectorAll('dup') ?? []
  const duplicatas: Omit<Duplicata, 'id' | 'receita_id' | 'created_at'>[] = []

  dupNodes.forEach(dup => {
    const nDup  = textoEl(dup, 'ndup')
    const dVenc = textoEl(dup, 'dvenc')
    const vDup  = parseFloat(textoEl(dup, 'vdup') || '0')

    if (nDup && dVenc) {
      duplicatas.push({
        numero_duplicata: nDup,
        data_vencimento:  dVenc,
        valor:            vDup,
      })
    }
  })

  // ── Monta ReceitaInsert ───────────────────────────────────
  const receita: ReceitaInsert = {
    numero_nf:             numeroNf,
    serie,
    chave_acesso:          chaveAcesso,
    protocolo:             protocolo    || undefined,
    data_emissao:          dhEmi,
    data_autorizacao:      dhRecbto     || undefined,
    natureza_operacao:     natOp        || undefined,
    id_dest:               idDest       || undefined,
    status_nf:             statusNf,

    cliente_id:            null,
    cliente_cpf_cnpj:      clienteCpfCnpj  || undefined,
    cliente_nome:          clienteNome     || undefined,
    cliente_ie:            clienteIe       || undefined,
    cliente_fone:          clienteFone     || undefined,
    cliente_email:         clienteEmail    || undefined,
    cliente_logradouro:    clienteLgr      || undefined,
    cliente_numero:        clienteNro      || undefined,
    cliente_complemento:   clienteCpl      || undefined,
    cliente_bairro:        clienteBairro   || undefined,
    cliente_municipio:     clienteMun      || undefined,
    cliente_uf:            clienteUf       || undefined,
    cliente_cep:           clienteCep      || undefined,

    valor_produtos:        valorProdutos,
    valor_frete:           valorFrete,
    valor_seguro:          valorSeguro,
    valor_desconto:        valorDesconto,
    valor_outras:          valorOutras,
    valor_ipi:             valorIpi,
    valor_nf:              valorNf,

    transportadora_id:     null,
    modalidade_frete:      modFrete,
    volume_qtd:            volQtd    || undefined,
    volume_marca:          volMarca  || undefined,
    volume_numero:         volNumero || undefined,
    peso_liquido:          pesoL     || undefined,
    peso_bruto:            pesoB     || undefined,

    fatura_numero:         fatNumero || undefined,
    fatura_valor_original: fatVOrig  || undefined,
    fatura_valor_desconto: fatVDesc  || undefined,

    xml_storage_path:      undefined,
    observacoes:           observacoes || undefined,
  }

  return { receita, itens, duplicatas, transportadora, chaveAcesso }
}

// ============================================================
// Helpers internos
// ============================================================

// texto() — busca tag no documento inteiro (lowercase em modo HTML)
function texto(doc: Document, seletor: string): string {
  return doc.querySelector(seletor)?.textContent?.trim() ?? ''
}

// textoEl() — busca tag dentro de um elemento pai (pode ser null)
function textoEl(el: Element | null | undefined, tag: string): string {
  if (!el) return ''
  return el.querySelector(tag)?.textContent?.trim() ?? ''
}

// numEl() — número com 2 casas decimais a partir de elemento pai
function numEl(el: Element | null | undefined, tag: string): number {
  const val = parseFloat(textoEl(el, tag) || '0')
  return Math.round(val * 100) / 100
}

// numFloatEl() — número com 3 casas (para pesos)
function numFloatEl(el: Element | null | undefined, tag: string): number {
  const val = parseFloat(textoEl(el, tag) || '0')
  return Math.round(val * 1000) / 1000
}
