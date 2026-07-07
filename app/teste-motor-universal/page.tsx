// ============================================================
// app/teste-motor-universal/page.tsx
// Página avulsa: Motor Universal de Documentos Financeiros (teste)
// Função: Tela única para testar o pipeline completo de extração —
//         upload de arquivo (PDF/imagem via Gemini, ou XML via parser
//         direto no client), exibição do JSON Universal resultante
//         (editável), indicadores de verificação, formulário condicional
//         de novo fornecedor, e gravação final.
// Conecta com: /api/teste-motor-universal/processar (extração +
//              classificação + cross-reference + dedup),
//              /api/teste-motor-universal/confirmar (persistência),
//              lib/motorUniversal/nfseXmlParser.ts (parse de XML no client)
// Referência: spec seção 4 ("Screens & Components") e seção 6
//              ("Navigation & Flow")
//
// VISUAL: EXPLICITAMENTE FORA DE ESCOPO nesta página, conforme decisão
// do usuário na spec (seção 3) — HTML puro, sem Tahoma/cores/skill de
// frontend-design. Isso será redesenhado quando a lógica for portada
// para os módulos oficiais Despesas/Contas a Pagar.
//
// ISOLAMENTO: esta rota não é linkada em nenhum menu/Home Screen, e não
// tem autenticação (spec seção 2.3) — acesso só por URL direta, uso
// exclusivo do Maycon em ambiente local.
// ============================================================

'use client' // Client Component — necessário para useState, DOMParser, crypto.subtle, fetch interativo

// Importa hooks do React usados nesta tela
import { useEffect, useState } from 'react'

// Importa o parser de NFS-e XML, que roda inteiramente no client
// (DOMParser não existe no runtime Node.js das API routes)
import { parsearNfseXml, ErroValidacaoNfse } from '@/lib/motorUniversal/nfseXmlParser'

// Importa os tipos usados nesta tela
import type { ResultadoProcessamento } from '@/types/motorUniversal'
import type { FornecedorInsert } from '@/types/fornecedores'

// Importa o componente de apresentação dos títulos já gravados, no
// mesmo modelo estético de Contas a Receber (ver ContasReceberTabela.tsx)
import TitulosImportadosTabela, { type TituloImportado } from '@/components/teste-motor-universal/TitulosImportadosTabela'

// ------------------------------------------------------------
// Função auxiliar: calcularHashSha256
// Calcula o hash SHA-256 de um arquivo usando a Web Crypto API,
// reaproveitando exatamente o mesmo padrão já usado para deduplicação
// de arquivos bancários no módulo Contas a Receber.
// ------------------------------------------------------------
async function calcularHashSha256(arquivo: File): Promise<string> {
  // Lê o conteúdo bruto do arquivo como ArrayBuffer
  const bufferArquivo = await arquivo.arrayBuffer()

  // Calcula o digest SHA-256 usando a Web Crypto API nativa do navegador
  const bufferHash = await crypto.subtle.digest('SHA-256', bufferArquivo)

  // Converte o ArrayBuffer do hash para uma string hexadecimal legível
  const bytesHash = Array.from(new Uint8Array(bufferHash))
  return bytesHash.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------
// Função auxiliar: converterArquivoParaBase64
// Converte um arquivo (PDF/imagem) para base64, formato exigido pela
// chamada ao Gemini (inlineData.data) na API route de processamento.
//
// IMPLEMENTAÇÃO CORRIGIDA: a versão original fazia um loop manual
// byte-a-byte (String.fromCharCode + btoa), que é rápido o suficiente
// para PDFs pequenos, mas trava o navegador por muito tempo (ou parece
// travar indefinidamente) em fotos de câmera de celular, que costumam
// ter vários MB — foi exatamente o sintoma relatado ("fica processando
// pra sempre" ao testar com foto de fatura pelo celular). FileReader é
// a API nativa do navegador para isso, implementada de forma otimizada
// (não em JS puro), e resolve o problema de performance.
// ------------------------------------------------------------
async function converterArquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()

    leitor.onload = () => {
      // O resultado de readAsDataURL vem no formato
      // "data:image/jpeg;base64,/9j/4AAQSkZJRg..." — precisamos apenas
      // da parte depois da vírgula (o base64 puro, sem o prefixo de mimeType)
      const resultadoCompleto = leitor.result as string
      const base64Puro = resultadoCompleto.split(',')[1]
      resolve(base64Puro)
    }

    leitor.onerror = () => {
      reject(new Error('Falha ao ler o arquivo selecionado.'))
    }

    // Lê o arquivo diretamente como base64 (Data URL) — operação nativa
    // do navegador, muito mais rápida que conversão manual em JS
    leitor.readAsDataURL(arquivo)
  })
}

// ------------------------------------------------------------
// Componente principal da página
// ------------------------------------------------------------
export default function TesteMotorUniversalPage() {
  // Estado: arquivo atualmente selecionado pelo usuário no input
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)

  // Estado: indica se uma chamada de processamento está em andamento
  const [carregando, setCarregando] = useState(false)

  // Estado: mensagem de erro, se alguma etapa falhar
  const [erro, setErro] = useState<string | null>(null)

  // Estado: resultado completo retornado por /api/teste-motor-universal/processar
  const [resultado, setResultado] = useState<ResultadoProcessamento | null>(null)

  // Estado: texto do JSON exibido no painel — inicia igual ao resultado,
  // mas pode ser editado manualmente pelo usuário antes de confirmar
  // (conforme spec: "Confirmar e Gravar" persiste o JSON "possivelmente editado")
  const [jsonEditadoTexto, setJsonEditadoTexto] = useState<string>('')

  // Estado: dados do formulário de novo fornecedor (só relevante quando
  // fornecedorMatch.status === 'nao_encontrado')
  const [novoFornecedor, setNovoFornecedor] = useState<Partial<FornecedorInsert>>({})

  // Estado: se o usuário confirmou explicitamente que quer prosseguir
  // mesmo com um alerta de duplicidade (exigido pela spec antes de gravar)
  const [confirmarApesarDeDuplicado, setConfirmarApesarDeDuplicado] = useState(false)

  // Estado: mensagem de sucesso após a gravação final
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)

  // Estado: lista de títulos já gravados (teste_titulos_gerados), exibida
  // na tabela de apresentação no mesmo modelo estético de Contas a Receber
  const [titulosGravados, setTitulosGravados] = useState<TituloImportado[]>([])

  // ------------------------------------------------------------
  // Função: buscarTitulosGravados
  // Busca a lista atual de títulos via a API de leitura, para exibir na
  // tabela de apresentação abaixo do formulário
  // ------------------------------------------------------------
  async function buscarTitulosGravados() {
    try {
      const resposta = await fetch('/api/teste-motor-universal/titulos')
      const dados = await resposta.json()
      if (resposta.ok) {
        setTitulosGravados(dados.titulos)
      }
    } catch {
      // Falha silenciosa aqui é aceitável — a tabela de apresentação é
      // um extra visual, não deve travar o restante da tela se a busca falhar
    }
  }

  // Busca a lista de títulos assim que a página carrega
  useEffect(() => {
    buscarTitulosGravados()
  }, [])

  // ------------------------------------------------------------
  // Handler: chamado quando o usuário seleciona um arquivo no input
  // ------------------------------------------------------------
  function handleSelecionarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0] || null
    setArquivoSelecionado(arquivo)

    // Reseta todo o estado da tela ao trocar de arquivo, evitando misturar
    // resultado antigo com um novo arquivo selecionado
    setResultado(null)
    setErro(null)
    setJsonEditadoTexto('')
    setNovoFornecedor({})
    setConfirmarApesarDeDuplicado(false)
    setMensagemSucesso(null)
  }

  // ------------------------------------------------------------
  // Handler: botão "Processar" — decide entre caminho XML (client) ou
  // caminho IA (via API route), e chama /api/teste-motor-universal/processar
  // ------------------------------------------------------------
  async function handleProcessar() {
    if (!arquivoSelecionado) return

    setCarregando(true)
    setErro(null)
    setResultado(null)
    setMensagemSucesso(null)

    try {
      // Calcula o hash SHA-256 do arquivo — usado em ambos os caminhos,
      // para a checagem de duplicidade na API route
      const hashArquivo = await calcularHashSha256(arquivoSelecionado)

      // Detecta se o arquivo é XML (por extensão, mais confiável que
      // arquivo.type, que pode vir vazio dependendo do navegador/SO)
      const ehArquivoXml = arquivoSelecionado.name.toLowerCase().endsWith('.xml')

      let corpoRequisicao: Record<string, unknown>

      if (ehArquivoXml) {
        // ── Caminho XML: parse acontece aqui mesmo, no client ──
        const textoXml = await arquivoSelecionado.text()

        // parsearNfseXml pode lançar ErroValidacaoNfse se o layout não
        // for reconhecido — o catch abaixo trata isso
        const jsonUniversalParcial = parsearNfseXml(textoXml)

        corpoRequisicao = {
          origem: 'xml',
          jsonUniversalParcial,
          hashArquivo,
        }
      } else {
        // ── Caminho PDF/imagem: envia para a API processar via Gemini ──
        const arquivoBase64 = await converterArquivoParaBase64(arquivoSelecionado)

        corpoRequisicao = {
          origem: 'ia',
          arquivoBase64,
          mimeType: arquivoSelecionado.type || 'application/pdf', // fallback razoável se o navegador não informar o mimeType
          hashArquivo,
        }
      }

      // Chama a API route de processamento, que roda os passos comuns
      // (classificação, cross-reference, dedup) independente da origem
      const resposta = await fetch('/api/teste-motor-universal/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoRequisicao),
      })

      const dadosResposta = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dadosResposta.error || 'Falha desconhecida ao processar documento.')
      }

      const resultadoProcessamento = dadosResposta as ResultadoProcessamento
      setResultado(resultadoProcessamento)

      // Inicializa o painel de JSON editável com o resultado formatado
      setJsonEditadoTexto(JSON.stringify(resultadoProcessamento.jsonUniversal, null, 2))

      // Pré-preenche o formulário de novo fornecedor, caso não tenha sido encontrado
      if (resultadoProcessamento.fornecedorMatch.status === 'nao_encontrado') {
        setNovoFornecedor({
          razao: resultadoProcessamento.jsonUniversal.favorecido.nome,
          cnpj: resultadoProcessamento.jsonUniversal.favorecido.cnpjCpf || undefined,
          end: resultadoProcessamento.jsonUniversal.favorecido.endereco || undefined,
        })
      }
    } catch (err: unknown) {
      // Convenção do projeto: catch (err: unknown), nunca "any"
      if (err instanceof ErroValidacaoNfse) {
        setErro(`Erro ao interpretar o XML: ${err.reason}`)
      } else {
        const mensagemErro = err instanceof Error ? err.message : String(err)
        setErro(mensagemErro)
      }
    } finally {
      setCarregando(false)
    }
  }

  // ------------------------------------------------------------
  // Handler: botão "Confirmar e Gravar" — envia o JSON (possivelmente
  // editado manualmente) + dados do novo fornecedor (se houver) para
  // /api/teste-motor-universal/confirmar
  // ------------------------------------------------------------
  async function handleConfirmarEGravar() {
    if (!resultado) return

    setCarregando(true)
    setErro(null)
    setMensagemSucesso(null)

    try {
      // Faz o parse do texto editável de volta para objeto — se o usuário
      // quebrou o JSON manualmente, o erro aparece aqui de forma clara
      let jsonUniversalFinal
      try {
        jsonUniversalFinal = JSON.parse(jsonEditadoTexto)
      } catch {
        throw new Error('O JSON no painel está inválido — corrija a sintaxe antes de gravar.')
      }

      // Determina se o formulário de novo fornecedor deve ser enviado —
      // só quando não havia match E o usuário preencheu ao menos a razão social
      const enviarNovoFornecedor =
        resultado.fornecedorMatch.status === 'nao_encontrado' && novoFornecedor.razao
          ? (novoFornecedor as FornecedorInsert)
          : null

      const resposta = await fetch('/api/teste-motor-universal/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonUniversal: jsonUniversalFinal,
          hashArquivo: resultado.hashArquivo,
          fornecedorId: resultado.fornecedorMatch.fornecedorId,
          novoFornecedor: enviarNovoFornecedor,
          confirmarApesarDeDuplicado,
          duplicateCheckStatus: resultado.duplicateCheck.status,
        }),
      })

      const dadosResposta = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dadosResposta.error || 'Falha desconhecida ao gravar documento.')
      }

      setMensagemSucesso(
        `Gravado com sucesso — documento id ${dadosResposta.documentoImportadoId}, ${dadosResposta.totalParcelasGravadas} parcela(s) gerada(s).`,
      )

      // Atualiza a tabela de apresentação com o título recém-gravado
      await buscarTitulosGravados()
    } catch (err: unknown) {
      const mensagemErro = err instanceof Error ? err.message : String(err)
      setErro(mensagemErro)
    } finally {
      setCarregando(false)
    }
  }

  // ------------------------------------------------------------
  // Renderização — HTML puro, sem estilização (fora de escopo, spec seção 3)
  // ------------------------------------------------------------
  return (
    <div>
      <h1>Motor Universal de Documentos Financeiros — Página de Teste</h1>
      <p>Página avulsa, sem autenticação, uso local exclusivo. Não faz parte do sistema oficial.</p>

      {/* ── Componente 1: input de arquivo ── */}
      <div>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xml" onChange={handleSelecionarArquivo} />
      </div>

      {/* ── Componente 2: botão Processar ── */}
      <div>
        <button onClick={handleProcessar} disabled={!arquivoSelecionado || carregando}>
          {carregando ? 'Processando...' : 'Processar'}
        </button>
      </div>

      {/* ── Estado: erro ── */}
      {erro && (
        <div>
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {/* ── Estado: sucesso após gravação ── */}
      {mensagemSucesso && (
        <div>
          <strong>Sucesso:</strong> {mensagemSucesso}
        </div>
      )}

      {/* ── Componentes 3 e 4: painel de JSON + indicadores, só aparecem após processar ── */}
      {resultado && (
        <div>
          <hr />

          <h2>Indicadores de Verificação</h2>
          <ul>
            <li>
              Fornecedor: {resultado.fornecedorMatch.status}
              {resultado.fornecedorMatch.criterioMatch && ` (critério: ${resultado.fornecedorMatch.criterioMatch})`}
            </li>
            <li>
              Duplicidade: {resultado.duplicateCheck.status}
              {resultado.duplicateCheck.criterioDuplicidade && ` (critério: ${resultado.duplicateCheck.criterioDuplicidade})`}
            </li>
            <li>
              Origem da Despesa: {resultado.origemDespesaClassificacao.status}
              {resultado.origemDespesaClassificacao.criteriosBatidos.length > 0 &&
                ` (sinais: ${resultado.origemDespesaClassificacao.criteriosBatidos.join(', ')})`}
            </li>
          </ul>

          {/* ── Alerta de duplicidade, exige confirmação explícita antes de gravar ── */}
          {resultado.duplicateCheck.status !== 'novo' && (
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={confirmarApesarDeDuplicado}
                  onChange={(evento) => setConfirmarApesarDeDuplicado(evento.target.checked)}
                />
                Este documento parece duplicado — confirmo que quero gravar mesmo assim
              </label>
            </div>
          )}

          <h2>JSON Universal (editável antes de gravar)</h2>
          <textarea
            value={jsonEditadoTexto}
            onChange={(evento) => setJsonEditadoTexto(evento.target.value)}
            rows={30}
            cols={100}
          />

          {/* ── Componente 5: formulário condicional de novo fornecedor ── */}
          {resultado.fornecedorMatch.status === 'nao_encontrado' && (
            <div>
              <h2>Novo Fornecedor (não encontrado em produção)</h2>
              <div>
                <label>
                  Razão Social:
                  <input
                    type="text"
                    value={novoFornecedor.razao || ''}
                    onChange={(evento) => setNovoFornecedor({ ...novoFornecedor, razao: evento.target.value })}
                  />
                </label>
              </div>
              <div>
                <label>
                  CNPJ:
                  <input
                    type="text"
                    value={novoFornecedor.cnpj || ''}
                    onChange={(evento) => setNovoFornecedor({ ...novoFornecedor, cnpj: evento.target.value })}
                  />
                </label>
              </div>
              <div>
                <label>
                  Endereço:
                  <input
                    type="text"
                    value={novoFornecedor.end || ''}
                    onChange={(evento) => setNovoFornecedor({ ...novoFornecedor, end: evento.target.value })}
                  />
                </label>
              </div>
              <p>Este formulário será gravado na tabela de PRODUÇÃO "fornecedores" ao confirmar.</p>
            </div>
          )}

          {/* ── Componente 6: botão Confirmar e Gravar ── */}
          <div>
            <button
              onClick={handleConfirmarEGravar}
              disabled={carregando || (resultado.duplicateCheck.status !== 'novo' && !confirmarApesarDeDuplicado)}
            >
              {carregando ? 'Gravando...' : 'Confirmar e Gravar'}
            </button>
          </div>
        </div>
      )}

      {/* ── Seção de apresentação: títulos já gravados (preview de Contas a
      Pagar), no mesmo modelo estético de Contas a Receber. Somente
      apresentação — sem ações de editar/baixar/2ª via nesta fase de teste ── */}
      <hr />
      <h2 style={{ fontFamily: 'Tahoma, Geneva, sans-serif', color: '#1a6094' }}>
        Títulos Gerados (prévia de Contas a Pagar)
      </h2>
      <TitulosImportadosTabela titulos={titulosGravados} />
    </div>
  )
}
