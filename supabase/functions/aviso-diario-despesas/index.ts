// ============================================================
// Edge Function: aviso-diario-despesas
// Projeto: Ceras Babinete - Gestao Financeira
// Funcao: Roda no servidor do Supabase (nao depende do computador do
//         Maycon, nem do Next.js estar publicado em lugar nenhum).
//         Verifica se existe algum titulo de contas_a_pagar vencendo
//         HOJE; se sim, envia por e-mail para a propria caixa da
//         empresa (contato@cerasbabinete.com.br) a lista de titulos
//         vencendo hoje + todos os titulos vencidos ainda nao pagos,
//         sem limite de quantos dias atras. Se NAO houver nenhum
//         titulo vencendo hoje, a funcao nao envia nada nesse dia,
//         mesmo que existam vencidos acumulados - regra de gatilho
//         confirmada por Maycon em sessao de especificacao
//         (brain-engineer-interview, 14/09/2026).
// Disparado por: pg_cron, segunda a sexta, 8h horario de Brasilia
//                (11h UTC) - ver migracao sql/cron_aviso_diario_despesas.sql
// Autenticacao: verify_jwt=true (padrao seguro) - o pg_cron chama
//               esta funcao autenticado com a service_role_key,
//               guardada no Supabase Vault - mesmo padrao ja usado
//               por supabase/functions/backup-semanal-automatico.
// Envio de e-mail: via Resend (serviço de e-mail transacional), NAO mais
// via Gmail. Duas tentativas anteriores falharam por motivos fora do
// nosso controle: (1) SMTP com a senha normal - o Google recusou com
// "535 Bad Credentials"; (2) Gmail API via OAuth - autenticação
// funcionava dentro do Google OAuth Playground, mas toda chamada feita
// de FORA do Google (do computador do Maycon, ou do servidor do
// Supabase) era recusada com "invalid_grant" - padrão típico de uma
// política de segurança do Google Workspace bloqueando acesso de apps
// de terceiros de fora de um contexto confiável, que exigiria acesso de
// administrador do Workspace pra liberar (não identificado). Resend
// resolve isso porque não depende da infraestrutura do Gmail - é só uma
// chave de API, sem OAuth, sem Workspace, sem consentimento por tela.
// Secrets necessarios (Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY -> gerada em resend.com, conta própria da empresa
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao injetados automatica-
// mente pelo Supabase em toda Edge Function - nao precisam ser
// configurados como secret.
// Forma de pagamento exibida (Boleto/Pix/-): usa exatamente o mesmo
// criterio ja estabelecido em Especificacao_Modulo_Dashboard.md,
// Secao 5.3 (linha_digitavel+nosso_numero -> Boleto; senao, chave Pix
// preferencial do fornecedor -> Pix; senao, sem informacao) - nao
// inventa um criterio novo.
// Status "Vencido" exclui titulos com status = 'cancelado' de
// proposito (verificado no schema real, sql/despesas_contas_pagar.sql:
// contas_a_pagar_status_check aceita 'em_aberto' | 'pago' | 'cancelado').
// Um titulo cancelado nao precisa ser pago, entao nao deveria
// continuar aparecendo neste aviso - assumindo isso porque Maycon
// pediu para nao aprofundar no assunto "cancelado" na conversa; se a
// intencao era outra, e so ajustar o filtro .eq("status", "em_aberto")
// abaixo.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORES = {
  primaria: "#1a6094",
  fundoSuave: "#f0f4f7",
  texto: "#2b2b2b",
  textoSuave: "#6b7480",
  borda: "#d8e1e8",
  vencidoBg: "#fbe4e4",
  vencidoTexto: "#a13b3b",
  abertoBg: "#e4eef5",
};

interface TituloPagar {
  id: string;
  numero_documento: string | null;
  data_vencimento: string; // YYYY-MM-DD
  valor: number;
  favorecido_nome: string;
  favorecido_cnpj_cpf: string | null;
  fornecedor_id: number | null;
  linha_digitavel: string | null;
  nosso_numero: string | null;
}

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const hoje = hojeSaoPauloIso();

    // 1) Gatilho: so segue adiante se existir titulo vencendo HOJE.
    const { count: contagemHoje, error: erroContagem } = await supabase
      .from("contas_a_pagar")
      .select("id", { count: "exact", head: true })
      .eq("status", "em_aberto")
      .is("deleted_at", null)
      .eq("data_vencimento", hoje);

    if (erroContagem) {
      throw new Error(`Falha ao verificar gatilho: ${erroContagem.message}`);
    }

    if (!contagemHoje || contagemHoje === 0) {
      console.log(`[aviso-diario-despesas] nenhum titulo vencendo em ${hoje} - e-mail nao enviado.`);
      return new Response(
        JSON.stringify({ ok: true, enviado: false, motivo: "nenhum titulo vencendo hoje" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 2) Conteudo: hoje + todos os vencidos ainda em aberto, sem
    //    limite de dias para tras.
    const { data: titulos, error: erroTitulos } = await supabase
      .from("contas_a_pagar")
      .select(
        "id, numero_documento, data_vencimento, valor, favorecido_nome, favorecido_cnpj_cpf, fornecedor_id, linha_digitavel, nosso_numero",
      )
      .eq("status", "em_aberto")
      .is("deleted_at", null)
      .lte("data_vencimento", hoje)
      .order("data_vencimento", { ascending: true });

    if (erroTitulos) {
      throw new Error(`Falha ao buscar titulos: ${erroTitulos.message}`);
    }
    const listaTitulos = (titulos ?? []) as TituloPagar[];

    // 3) Forma de pagamento exibida (ver nota no cabecalho).
    const fornecedorIds = [
      ...new Set(listaTitulos.map((t) => t.fornecedor_id).filter((id): id is number => id != null)),
    ];
    const fornecedoresComPixPreferencial = new Set<number>();
    if (fornecedorIds.length > 0) {
      const { data: chaves, error: erroChaves } = await supabase
        .from("fornecedor_chaves_pix")
        .select("fornecedor_id")
        .in("fornecedor_id", fornecedorIds)
        .eq("preferencial", true)
        .is("deleted_at", null);
      if (erroChaves) {
        console.error("[aviso-diario-despesas] falha ao buscar chaves pix (nao bloqueia envio):", erroChaves.message);
      } else {
        for (const c of chaves ?? []) fornecedoresComPixPreferencial.add(c.fornecedor_id as number);
      }
    }

    const formaPagamento = (t: TituloPagar): string => {
      if (t.linha_digitavel && t.nosso_numero) return "Boleto";
      if (t.fornecedor_id != null && fornecedoresComPixPreferencial.has(t.fornecedor_id)) return "Pix";
      return "—";
    };

    const total = listaTitulos.reduce((soma, t) => soma + Number(t.valor), 0);

    // Destinatários: lidos da tabela notificacoes_configuracao (editável
    // pela tela de Usuários, aba Notificações), não mais fixos no código.
    const destinatarios = await buscarDestinatarios(supabase);

    await enviarEmail({
      destinatarios,
      assunto: `Despesas a pagar hoje — ${formatarDataBr(hoje)} — Ceras Babinete`,
      html: montarHtmlEmail(listaTitulos, hoje, total, formaPagamento),
      texto: montarTextoEmail(listaTitulos, hoje, total, formaPagamento),
    });

    console.log(`[aviso-diario-despesas] enviado: ${listaTitulos.length} titulo(s), total R$ ${total.toFixed(2)}`);

    return new Response(
      JSON.stringify({ ok: true, enviado: true, quantidade: listaTitulos.length, total }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[aviso-diario-despesas] erro:", err);
    return new Response(
      JSON.stringify({ ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

/** Data de hoje em America/Sao_Paulo, formato YYYY-MM-DD - mesmo padrao ja usado no Dashboard (nunca UTC puro). */
function hojeSaoPauloIso(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const ano = partes.find((p) => p.type === "year")!.value;
  const mes = partes.find((p) => p.type === "month")!.value;
  const dia = partes.find((p) => p.type === "day")!.value;
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBr(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarValorBr(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function montarHtmlEmail(
  titulos: TituloPagar[],
  hoje: string,
  total: number,
  formaPagamento: (t: TituloPagar) => string,
): string {
  const linhas = titulos
    .map((t) => {
      const vencido = t.data_vencimento < hoje;
      const selo = vencido
        ? `<span style="display:inline-block;font-size:10.5px;padding:2px 6px;border-radius:3px;background:${CORES.vencidoBg};color:${CORES.vencidoTexto};white-space:nowrap;">Vencido</span>`
        : `<span style="display:inline-block;font-size:10.5px;padding:2px 6px;border-radius:3px;background:${CORES.abertoBg};color:${CORES.primaria};white-space:nowrap;">Em aberto</span>`;
      const corValor = vencido ? CORES.vencidoTexto : CORES.texto;
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};">${escapeHtml(t.favorecido_nome)}</td>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};">${escapeHtml(t.favorecido_cnpj_cpf ?? "—")}</td>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};color:${CORES.textoSuave};">${escapeHtml(t.numero_documento ?? "—")}</td>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};">${formatarDataBr(t.data_vencimento)}</td>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};">${selo}</td>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};">${formaPagamento(t)}</td>
          <td style="padding:8px;border-bottom:1px solid ${CORES.borda};text-align:right;white-space:nowrap;color:${corValor};">R$ ${formatarValorBr(Number(t.valor))}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#e9edf1;font-family:Tahoma,Verdana,Arial,sans-serif;color:${CORES.texto};">
<table role="presentation" width="100%" style="background:#e9edf1;padding:24px 0;"><tr><td>
<table role="presentation" align="center" width="100%" style="max-width:860px;margin:0 auto;background:#ffffff;border:1px solid ${CORES.borda};border-radius:8px;overflow:hidden;">
  <tr><td style="background:${CORES.primaria};padding:22px 28px;">
    <table role="presentation"><tr>
      <td style="width:96px;"><div style="width:96px;height:40px;border:1.5px dashed rgba(255,255,255,0.55);border-radius:4px;color:rgba(255,255,255,0.75);font-size:11px;text-align:center;line-height:40px;">logomarca</div></td>
      <td style="color:#ffffff;font-size:16px;padding-left:16px;">Ceras Babinete<br><span style="font-size:12px;color:rgba(255,255,255,0.75);">Gestão Financeira — Notificações</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;">
    <p style="font-size:17px;margin:0 0 6px;">Despesas a pagar hoje</p>
    <p style="font-size:14px;color:${CORES.textoSuave};line-height:1.6;margin:0 0 22px;">Segue a lista de despesas com vencimento hoje, ${formatarDataBr(hoje)}, incluindo títulos vencidos em dias anteriores que ainda não foram baixados.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;font-size:12px;table-layout:fixed;">
      <thead><tr>
        <th style="background:${CORES.primaria};color:#fff;text-align:left;padding:8px;font-weight:normal;">Favorecido</th>
        <th style="background:${CORES.primaria};color:#fff;text-align:left;padding:8px;font-weight:normal;">CNPJ/CPF</th>
        <th style="background:${CORES.primaria};color:#fff;text-align:left;padding:8px;font-weight:normal;">Nº Documento</th>
        <th style="background:${CORES.primaria};color:#fff;text-align:left;padding:8px;font-weight:normal;">Vencimento</th>
        <th style="background:${CORES.primaria};color:#fff;text-align:left;padding:8px;font-weight:normal;">Status</th>
        <th style="background:${CORES.primaria};color:#fff;text-align:left;padding:8px;font-weight:normal;">Pagamento</th>
        <th style="background:${CORES.primaria};color:#fff;text-align:right;padding:8px;font-weight:normal;">Valor</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr>
        <td colspan="6" style="padding:12px 8px;background:${CORES.fundoSuave};border-top:2px solid ${CORES.primaria};color:${CORES.textoSuave};">Total (${titulos.length} título${titulos.length === 1 ? "" : "s"})</td>
        <td style="padding:12px 8px;background:${CORES.fundoSuave};border-top:2px solid ${CORES.primaria};text-align:right;color:${CORES.primaria};font-size:16px;">R$ ${formatarValorBr(total)}</td>
      </tr></tfoot>
    </table>
  </td></tr>
  <tr><td style="padding:18px 28px 22px;border-top:1px solid ${CORES.borda};font-size:11px;color:${CORES.textoSuave};line-height:1.6;">
    E-mail automático gerado pelo módulo de Notificações — Gestão Financeira Ceras Babinete.<br>
    Gerado em ${formatarDataBr(hoje)} às 08:00. Não é necessário responder este e-mail. Enviado apenas em dias com título vencendo hoje — sem vencimento no dia, sem e-mail.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function montarTextoEmail(
  titulos: TituloPagar[],
  hoje: string,
  total: number,
  formaPagamento: (t: TituloPagar) => string,
): string {
  const linhas = titulos
    .map((t) => {
      const marcaVencido = t.data_vencimento < hoje ? " [VENCIDO]" : "";
      return `- ${t.favorecido_nome} | ${t.favorecido_cnpj_cpf ?? "—"} | Doc: ${t.numero_documento ?? "—"} | Venc: ${formatarDataBr(t.data_vencimento)}${marcaVencido} | ${formaPagamento(t)} | R$ ${formatarValorBr(Number(t.valor))}`;
    })
    .join("\n");
  return `Despesas a pagar hoje - ${formatarDataBr(hoje)}\n\n${linhas}\n\nTotal (${titulos.length} titulo(s)): R$ ${formatarValorBr(total)}\n\nE-mail automatico gerado pelo modulo de Notificacoes - Gestao Financeira Ceras Babinete.`;
}

const REMETENTE = "contato@cerasbabinete.com.br"; // destinatário - mesma caixa que recebe o aviso
// "From" temporário: sem domínio verificado no Resend, só é permitido
// enviar usando o endereço de teste deles (onboarding@resend.dev) - não
// dá pra usar contato@cerasbabinete.com.br como remetente ainda. Isso
// não impede o funcionamento, só faz o e-mail chegar com esse remetente
// genérico em vez da marca da empresa. Para trocar por um remetente
// com a cara da empresa (ex: avisos@cerasbabinete.com.br), Maycon
// precisa verificar o domínio em resend.com/domains (adicionar 3-4
// registros de DNS no provedor onde o domínio foi registrado) - não é
// bloqueante, é uma melhoria a fazer quando quiser.
const REMETENTE_TESTE = "onboarding@resend.dev";

/**
 * Busca os destinatarios do aviso na tabela notificacoes_configuracao
 * (editavel pela tela de Usuarios, aba Notificacoes). Se a linha nao
 * existir por algum motivo (banco recem-migrado, etc.), cai no padrao
 * de sempre (contato@cerasbabinete.com.br), pra nunca ficar sem enviar
 * por causa de uma configuracao ausente.
 */
async function buscarDestinatarios(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await supabase
    .from("notificacoes_configuracao")
    .select("destinatarios_aviso_diario_despesas")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[aviso-diario-despesas] falha ao buscar destinatarios configurados, usando padrao:", error.message);
    return [REMETENTE];
  }

  const lista = data?.destinatarios_aviso_diario_despesas as string[] | undefined;
  return lista && lista.length > 0 ? lista : [REMETENTE];
}

/** Envia o e-mail via Resend - uma chave de API só, sem OAuth. Ver nota no cabeçalho sobre por que trocamos do Gmail para cá. */
async function enviarEmail(params: { destinatarios: string[]; assunto: string; html: string; texto: string }): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Variavel RESEND_API_KEY ausente nos secrets da Edge Function.");
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Ceras Babinete — Gestão Financeira <${REMETENTE_TESTE}>`,
      to: params.destinatarios,
      subject: params.assunto,
      html: params.html,
      text: params.texto,
    }),
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Falha ao enviar e-mail via Resend: ${resp.status} ${texto}`);
  }
}
