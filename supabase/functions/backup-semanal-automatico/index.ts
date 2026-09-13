// ============================================================
// Edge Function: backup-semanal-automatico
// Projeto: Ceras Babinete - Gestao Financeira
// Funcao: Roda no servidor do Supabase (nao depende do computador do
//         Maycon estar ligado). Gera o mesmo "backup completo" das 18
//         tabelas que o botao do modulo Backup gera, arquiva no bucket
//         'backups' do Supabase Storage e duplica no Google Drive
//         (cerasbabinete@gmail.com, pasta SGFB/Backups). Silencioso:
//         nenhuma interacao de usuario, nenhuma tela.
// Disparado por: pg_cron, toda sexta-feira as 15h (horario de Brasilia)
//                - ver a migracao SQL que agenda isso via cron.schedule.
// Autenticacao: verify_jwt=true (padrao seguro) - o pg_cron chama esta
//               funcao autenticado com a service_role_key, guardada no
//               Supabase Vault (nunca em texto puro na definicao do job).
// Secrets necessarios (Dashboard -> Edge Functions -> Secrets):
//   GOOGLE_DRIVE_OAUTH_CLIENT_ID
//   GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
//   GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
//   GOOGLE_DRIVE_BACKUPS_FOLDER_ID
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao injetados automaticamente
// pelo Supabase em toda Edge Function - nao precisam ser configurados.
// REVISAO (pos-incidente storageQuotaExceeded): a primeira versao usava
// uma conta de servico (JWT + chave privada). Contas de servico NAO TEM
// cota de armazenamento propria no Drive - mesmo com a pasta
// compartilhada corretamente, a criacao de arquivo falha sempre com 403
// "storageQuotaExceeded", porque uma conta pessoal do Gmail (sem Google
// Workspace) nao tem Drives Compartilhados. A solucao correta, que o
// proprio erro do Google recomendava ("use OAuth delegation instead"), e
// autenticar como o USUARIO REAL (cerasbabinete@gmail.com) via OAuth com
// refresh token - os arquivos passam a ser criados como se fosse upload
// manual da propria conta, usando a cota real dela (15GB). Isso tambem
// elimina a necessidade de assinar JWT com Web Crypto - so troca o
// refresh token por um access token novo a cada execucao.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Mesma ordem topologica de FKs usada em lib/backupService.ts - nao alterar
// sem reconferir as foreign keys reais do schema.
const TABELAS_BACKUP_ORDEM = [
  "fornecedor_categorias",
  "transportadoras",
  "clientes",
  "fornecedores",
  "fornecedor_chaves_pix",
  "beneficiarios_pessoais",
  "receitas",
  "receitas_itens",
  "receitas_duplicatas",
  "contas_receber",
  "contas_receber_eventos",
  "despesas",
  "despesas_parcelas",
  "contas_a_pagar",
  "contas_a_pagar_eventos",
  "pagar_comprovantes_processados",
  "remessas_importadas",
  "pagar_arquivos_importados",
] as const;

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const tabelas: Record<string, unknown[]> = {};
    for (const tabela of TABELAS_BACKUP_ORDEM) {
      const { data, error } = await supabase.from(tabela).select("*");
      if (error) throw new Error(`Falha ao ler "${tabela}": ${error.message}`);
      tabelas[tabela] = data ?? [];
    }

    const payload = {
      gerado_em: new Date().toISOString(),
      gerado_por: "sistema (automatico semanal)",
      versao_formato: 1,
      tabelas,
    };

    const conteudo = JSON.stringify(payload, null, 2);
    const agora = new Date();
    const dataArquivo = agora.toISOString().slice(0, 10);
    const horaArquivo = agora.toISOString().slice(11, 19).replace(/:/g, "-");
    const nomeArquivo = `backup_completo_${dataArquivo}_${horaArquivo}_automatico.json`;

    const { error: erroUpload } = await supabase.storage
      .from("backups")
      .upload(nomeArquivo, new Blob([conteudo], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });
    if (erroUpload) {
      throw new Error(`Falha ao arquivar no Supabase Storage: ${erroUpload.message}`);
    }

    let avisoDrive: string | null = null;
    try {
      await enviarParaDrive(nomeArquivo, conteudo);
    } catch (err) {
      avisoDrive = err instanceof Error ? err.message : "erro desconhecido";
      console.error("[backup-semanal-automatico] falha ao duplicar no Drive:", avisoDrive);
    }

    console.log(`[backup-semanal-automatico] concluido: ${nomeArquivo}${avisoDrive ? " (Drive falhou: " + avisoDrive + ")" : " (Supabase + Drive OK)"}`);

    return new Response(
      JSON.stringify({ ok: true, arquivo: nomeArquivo, avisoDrive }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[backup-semanal-automatico] erro:", err);
    return new Response(
      JSON.stringify({ ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

async function enviarParaDrive(nomeArquivo: string, conteudo: string): Promise<void> {
  const clientId = Deno.env.get("GOOGLE_DRIVE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN");
  const folderId = Deno.env.get("GOOGLE_DRIVE_BACKUPS_FOLDER_ID");
  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error("Variaveis de ambiente OAuth do Google Drive ausentes nos secrets da Edge Function.");
  }

  const accessToken = await obterAccessTokenGoogle(clientId, clientSecret, refreshToken);

  const metadata = { name: nomeArquivo, parents: [folderId] };
  const boundary = "-------backup-boundary-" + crypto.randomUUID();
  const corpoMultipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${conteudo}\r\n` +
    `--${boundary}--`;

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: corpoMultipart,
    },
  );

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Google Drive respondeu ${resp.status}: ${texto}`);
  }
}

/** Troca o refresh token (de longa duração) por um access token novo (válido por ~1h). */
async function obterAccessTokenGoogle(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Falha ao renovar token do Google: ${resp.status} ${texto}`);
  }

  const dados = await resp.json();
  return dados.access_token as string;
}

