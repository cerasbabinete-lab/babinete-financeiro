// ============================================================
// lib/pagar/gerarBoletoAvulso.ts
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Contas a Pagar
// Função: Gera um "boleto avulso" (2ª via) em PDF a partir dos dados
//         já armazenados no título (linha_digitavel, nosso_numero,
//         valor, data_vencimento, dados do favorecido) — NÃO depende
//         do PDF original do fornecedor (que nunca é guardado, por
//         desenho do Motor Universal).
//
//         Diferente de Contas a Receber (pages/api/boleto.ts, lib
//         gerar-boletos + CEDENTE_BB): lá a Ceras Babinete é a
//         CEDENTE (tem convênio próprio no BB). Aqui o cedente é o
//         FORNECEDOR — não temos o convênio dele, então não dá pra
//         usar a mesma lib. A abordagem aqui é reconstruir o código
//         de barras (44 dígitos) DIRETO da linha digitável (47
//         dígitos) já validada e salva no título — o campo livre (25
//         dígitos, onde cada banco esconde agência/carteira/nosso
//         número do cedente) é tratado como bloco opaco, só
//         reproduzido, nunca interpretado. Isso é suficiente pra
//         payabilidade real: quem processa o pagamento lê o código
//         de barras, não o layout visual.
//
//         Validado em simulação offline antes desta implementação:
//         round-trip do algoritmo FEBRABAN (mod10/mod11) 100%
//         correto, e leitura óptica real (zbar) do barcode gerado
//         bateu dígito a dígito com o código de barras original.
//
// Campo "Agência / Código do Beneficiário": só preenchido quando
// contas_a_pagar.favorecido_dados_bancarios estiver presente (texto
// livre, alimentado pelo Motor Universal — fora do escopo deste
// arquivo). Ausente → campo fica em branco ('—'), nunca inventado.
//
// Conecta com: pages/api/pagar/gerar-boleto-avulso.ts,
//              types/contasAPagar.ts (ContaAPagar),
//              lib/contasAPagarService.ts (formatarMoeda,
//              formatarDataBR, formatarCnpjCpf — mesmas funções já
//              usadas no resto do módulo, reaproveitadas aqui pra
//              não duplicar formatação)
// ============================================================

import PDFDocument from 'pdfkit'
import bwipjs from 'bwip-js'
import { formatarMoeda, formatarDataBR, formatarCnpjCpf } from '@/lib/contasAPagarService'

// ── Dados fixos do Sacado (pagador) — sempre a Ceras Babinete,
//    mesmo espírito do CEDENTE_BB hardcoded em Contas a Receber,
//    só que aqui do lado do pagador, não do cedente ──
const SACADO_NOME = 'CERAS BABINETE LTDA. ME'
const SACADO_CNPJ = '10.666.614/0001-60'

export interface DadosBoletoAvulso {
  linhaDigitavel:          string        // 47 dígitos limpos, já validada e salva no título
  nossoNumero:             string
  valor:                   number
  dataVencimento:          string        // ISO YYYY-MM-DD
  dataProcessamento:       string | null // ISO YYYY-MM-DD
  numeroDocumento:         string | null
  favorecidoNome:          string
  favorecidoCnpjCpf:       string | null
  favorecidoEndereco:      string | null
  favorecidoDadosBancarios: string | null // NULL até o Motor Universal passar a extrair
}

export interface ErroGerarBoletoAvulso {
  campo:   string
  detalhe: string
}

// ------------------------------------------------------------
// Reconstrói o código de barras (44 dígitos) a partir da linha
// digitável (47 dígitos) já validada. Extração mecânica pura —
// não decodifica nem interpreta o campo livre, só reagrupa os
// dígitos na ordem em que aparecem no código de barras.
// ------------------------------------------------------------
function linhaDigitavelParaCodigoBarras(linha47: string): string {
  const campo1base = linha47.slice(0, 9)   // banco(3) + moeda(1) + 5 primeiros do campo livre
  const campo2base = linha47.slice(10, 20) // 10 dígitos do campo livre
  const campo3base = linha47.slice(21, 31) // 10 dígitos do campo livre
  const dvGeral     = linha47.slice(32, 33)
  const campo5      = linha47.slice(33, 47) // fator vencimento(4) + valor(10)

  const banco = campo1base.slice(0, 3)
  const moeda = campo1base.slice(3, 4)
  const campoLivre = campo1base.slice(4) + campo2base + campo3base // 5+10+10 = 25

  return banco + moeda + dvGeral + campo5 + campoLivre // 3+1+1+14+25 = 44
}

function formatarLinhaDigitavelExibicao(linha47: string): string {
  const c1 = linha47.slice(0, 10)
  const c2 = linha47.slice(10, 21)
  const c3 = linha47.slice(21, 32)
  const c4 = linha47.slice(32, 33)
  const c5 = linha47.slice(33, 47)
  return `${c1.slice(0, 5)}.${c1.slice(5)} ${c2.slice(0, 5)}.${c2.slice(5)} ${c3.slice(0, 5)}.${c3.slice(5)} ${c4} ${c5}`
}

// ------------------------------------------------------------
// Gera o PNG do código de barras (ITF / 2-de-5 intercalado — padrão
// FEBRABAN de boleto). Zona de silêncio (padding) obrigatória —
// sem ela, leitores ópticos reais não reconhecem o barcode (achado
// da simulação de validação desta função).
// ------------------------------------------------------------
async function gerarBarcodePng(codigoBarras: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'interleaved2of5',
    text: codigoBarras,
    scale: 3,
    height: 15,
    includetext: false,
    paddingwidth: 20,
    paddingheight: 10,
    backgroundcolor: 'FFFFFF',
  })
}

// ------------------------------------------------------------
// Monta o PDF completo (Recibo do Sacado + Ficha de Compensação)
// e retorna como Buffer, pronto pra resposta HTTP da API route.
// ------------------------------------------------------------
export async function gerarBoletoAvulsoPdf(
  dados: DadosBoletoAvulso,
): Promise<{ buffer: Buffer | null; erros: ErroGerarBoletoAvulso[] }> {
  const erros: ErroGerarBoletoAvulso[] = []

  const linha47 = dados.linhaDigitavel.replace(/\D/g, '')
  if (linha47.length !== 47) {
    erros.push({ campo: 'linhaDigitavel', detalhe: `Linha digitável inválida (${linha47.length} dígitos, esperado 47)` })
    return { buffer: null, erros }
  }

  const codigoBarras = linhaDigitavelParaCodigoBarras(linha47)
  const barcodePng = await gerarBarcodePng(codigoBarras)

  const banco = linha47.slice(0, 3)
  const bancoDV = linha47.slice(32, 33)
  const linhaFormatada = formatarLinhaDigitavelExibicao(linha47)

  const chunks: Buffer[] = []
  const doc = new PDFDocument({ size: 'A4', margin: 20 })
  doc.on('data', (c: Buffer) => chunks.push(c))
  const fim = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const M = 20
  const W = doc.page.width - M * 2

  // ── Marca d'água ──
  doc.save()
  doc.rotate(-35, { origin: [300, 420] })
  doc.fillColor('#f0f0f0').fontSize(34).font('Helvetica-Bold')
    .text('2ª VIA EMITIDA PELO\nSISTEMA DE GESTÃO FINANCEIRA', -40, 370, { width: 780, align: 'center', lineGap: 6 })
  doc.restore()
  doc.fillColor('#000')

  function cell(x: number, y: number, w: number, h: number, label: string, value: string, opts: { align?: 'left' | 'right' | 'center'; bold?: boolean; valueSize?: number; valueY?: number } = {}) {
    doc.lineWidth(0.7).rect(x, y, w, h).stroke()
    doc.fontSize(5.5).font('Helvetica').fillColor('#444').text(label, x + 3, y + 2, { width: w - 6 })
    doc.fontSize(opts.valueSize ?? 8).font(opts.bold === false ? 'Helvetica' : 'Helvetica-Bold').fillColor('#000')
      .text(value ?? '', x + 3, y + (opts.valueY ?? 10), { width: w - 6, align: opts.align ?? 'left' })
  }

  const favorecidoLinha = `${dados.favorecidoNome}${dados.favorecidoCnpjCpf ? ` — ${formatarCnpjCpf(dados.favorecidoCnpjCpf)}` : ''}`
  const favorecidoComEndereco = dados.favorecidoEndereco
    ? `${favorecidoLinha}\n${dados.favorecidoEndereco}`
    : favorecidoLinha
  const sacadoLinha = `${SACADO_NOME} — ${SACADO_CNPJ}`
  const dadosBancarios = dados.favorecidoDadosBancarios?.trim() || '—'
  const numDoc = dados.numeroDocumento ?? '—'
  const venc = formatarDataBR(dados.dataVencimento)
  const dtDoc = dados.dataProcessamento ? formatarDataBR(dados.dataProcessamento) : '—'
  const valorFmt = formatarMoeda(dados.valor)

  let y = M

  // ============================================================
  // RECIBO DO SACADO
  // ============================================================
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('RECIBO DO SACADO', M, y)
  y += 10

  cell(M, y, 90, 22, 'Banco', `${banco}-${bancoDV}`)
  cell(M + 90, y, W - 90, 22, 'Linha Digitável', linhaFormatada, { valueSize: 9 })
  y += 22

  cell(M, y, W, 24, 'Beneficiário', favorecidoLinha)
  y += 24

  cell(M, y, W * 0.5, 22, 'Sacado', sacadoLinha)
  cell(M + W * 0.5, y, W * 0.25, 22, 'Nº Documento', numDoc)
  cell(M + W * 0.75, y, W * 0.25, 22, 'Vencimento', venc, { align: 'right' })
  y += 22

  cell(M, y, W * 0.75, 22, 'Nosso Número', dados.nossoNumero)
  cell(M + W * 0.75, y, W * 0.25, 22, 'Valor do Documento', valorFmt, { align: 'right' })
  y += 26

  doc.fontSize(6).font('Helvetica').fillColor('#666').text('Autenticação mecânica / Recibo do Sacado', M, y)
  y += 14
  doc.moveTo(M, y).lineTo(doc.page.width - M, y).dash(3, { space: 2 }).stroke()
  doc.undash()
  y += 6
  doc.fontSize(6).fillColor('#666').text('✂ Recorte na linha pontilhada', M, y)
  y += 14

  // ============================================================
  // FICHA DE COMPENSAÇÃO
  // ============================================================
  cell(M, y, 90, 24, '', `${banco}-${bancoDV}`, { valueSize: 13, valueY: 6, align: 'center' })
  cell(M + 90, y, W - 90, 24, 'Linha Digitável', linhaFormatada, { valueSize: 10, valueY: 12 })
  y += 24

  cell(M, y, W * 0.65, 18, 'Local de Pagamento', 'Pagável em qualquer banco até o vencimento')
  cell(M + W * 0.65, y, W * 0.35, 18, 'Vencimento', venc, { align: 'right' })
  y += 18

  cell(M, y, W * 0.65, 26, 'Cedente', favorecidoComEndereco, { valueSize: 7 })
  cell(M + W * 0.65, y, W * 0.35, 26, 'Agência / Código do Beneficiário', dadosBancarios, { align: 'right', bold: dadosBancarios !== '—' })
  y += 26

  const c1 = W * 0.15, c2 = W * 0.15, c3 = W * 0.15, c4 = W * 0.10, c5 = W * 0.15, c6 = W - (c1 + c2 + c3 + c4 + c5)
  let x = M
  cell(x, y, c1, 20, 'Data Documento', dtDoc); x += c1
  cell(x, y, c2, 20, 'Nº Documento', numDoc); x += c2
  cell(x, y, c3, 20, 'Espécie Doc.', 'DM'); x += c3
  cell(x, y, c4, 20, 'Aceite', 'N'); x += c4
  cell(x, y, c5, 20, 'Data Process.', dtDoc); x += c5
  cell(x, y, c6, 20, 'Nosso Número', dados.nossoNumero)
  y += 20

  const d1 = W * 0.15, d2 = W * 0.15, d3 = W * 0.15, d4 = W * 0.15, d5 = W - (d1 + d2 + d3 + d4)
  x = M
  cell(x, y, d1, 20, 'Uso do Banco', ''); x += d1
  cell(x, y, d2, 20, 'Carteira', '—'); x += d2
  cell(x, y, d3, 20, 'Espécie', 'R$'); x += d3
  cell(x, y, d4, 20, 'Quantidade', ''); x += d4
  cell(x, y, d5, 20, '(=) Valor Documento', valorFmt, { align: 'right' })
  y += 20

  cell(M, y, W * 0.7, 60, 'Instruções (texto de responsabilidade do cedente)',
    '2ª via gerada pelo Sistema de Gestão Financeira a partir dos dados do título original.\nPagamento após o vencimento sujeito a encargos conforme condição do título original.',
    { valueSize: 7, bold: false })
  const iw = W * 0.3, ix = M + W * 0.7
  cell(ix, y, iw, 15, '(-) Desconto / Abatimento', '')
  cell(ix, y + 15, iw, 15, '(-) Outras Deduções', '')
  cell(ix, y + 30, iw, 15, '(+) Mora / Multa', '')
  cell(ix, y + 45, iw, 15, '(=) Valor Cobrado', valorFmt, { align: 'right', valueSize: 8, valueY: 7 })
  y += 60

  cell(M, y, W, 20, 'Sacado', sacadoLinha, { valueSize: 8 })
  y += 20

  cell(M, y, W, 14, 'Sacador / Avalista', '—', { bold: false })
  y += 18

  doc.fontSize(6).font('Helvetica').fillColor('#666').text('Autenticação mecânica / Ficha de Compensação', M, y)
  y += 12

  doc.image(barcodePng, M, y, { width: 300 })
  y += 45

  doc.fontSize(6.5).fillColor('#666').text(
    dadosBancarios === '—'
      ? '* Agência/Código do Beneficiário não disponível para este título.'
      : '* Agência/Código do Beneficiário conforme informado no documento original.',
    M, y, { width: W },
  )

  doc.end()
  const buffer = await fim
  return { buffer, erros: [] }
}
