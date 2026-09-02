// ============================================================
// components/dashboard/GraficoFluxoDiario.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Dashboard (NOVO)
// Função: Wrapper fino sobre components/relatorios/GraficoSvg.tsx
//         (Seção 10). REESCRITO nesta sessão pra seguir o container
//         visual do mockup aprovado (mockup_dashboard.html) — borda
//         completa + raio 8px (era só borderLeft + raio 6px antes),
//         título no estilo do mockup (13px, bold, #233240, não o
//         12px/#1a6094 que GraficoSvg desenha internamente), altura
//         de 210px (era 260px), cores atualizadas pras do mockup
//         (#2c9d5b/#c0392b).
//
//         NOTA IMPORTANTE — divergência consciente do mockup: o
//         mockup desenha a legenda (quadradinho verde "A receber" /
//         vermelho "A pagar") no CABEÇALHO, à direita do título. Mas
//         GraficoSvg.tsx já desenha sua PRÓPRIA legenda internamente,
//         dentro do SVG (canto superior esquerdo da área de
//         plotagem) — isso não é opcional/condicional, é
//         comportamento existente do componente, e a Seção 0/regra 4
//         desta spec só autoriza editar GraficoSvg.tsx pra rótulo de
//         valor + corA/corB, não pra mover/remover a legenda interna.
//         Duplicar uma segunda legenda aqui no cabeçalho, além da
//         que já vem de dentro do SVG, criaria uma legenda dupla
//         confusa. Por isso este arquivo NÃO desenha uma legenda
//         própria no cabeçalho — só o título — e deixa a legenda
//         interna do GraficoSvg como a única. Se Maycon preferir a
//         legenda no cabeçalho como no mockup, isso exige autorização
//         extra pra tocar na função de legenda dentro de GraficoSvg.tsx.
// Conecta com: components/relatorios/GraficoSvg.tsx,
//              types/relatorios.ts (DadosGrafico),
//              app/dashboard/page.tsx (renderiza este componente)
// Referência: Especificacao_Modulo_Dashboard.md, Seção 4, Seção 10;
//             mockup_dashboard.html (fonte visual desta revisão,
//             exceto pela divergência de legenda documentada acima)
// ============================================================

import GraficoSvg from '@/components/relatorios/GraficoSvg'
import type { DadosGrafico } from '@/types/relatorios'

// Cores exatas do mockup aprovado — mesmas de CardReceitas.tsx/
// CardDespesas.tsx (repetidas aqui, não extraídas pra token
// compartilhado, mesmo padrão de todo o Dashboard nesta sessão)
const COR_VERDE = '#2c9d5b'
const COR_VERMELHO = '#c0392b'
const COR_BORDA_CARD = '#d7e0e6'
const COR_TITULO = '#233240'

interface GraficoFluxoDiarioProps {
  // null enquanto pages/api/dashboard/resumo.ts ainda não respondeu
  dados: DadosGrafico | null
}

export default function GraficoFluxoDiario({ dados }: GraficoFluxoDiarioProps) {
  return (
    <div
      style={{
        fontFamily: 'Tahoma, Geneva, Verdana, sans-serif',
        background: '#ffffff',
        border: `1px solid ${COR_BORDA_CARD}`,
        borderRadius: '8px',
        padding: '16px 18px 8px',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: COR_TITULO, marginBottom: '8px' }}>
        Fluxo do mês — a receber x a pagar por dia
      </div>

      {dados ? (
        // titulo NÃO repassado aqui de propósito — o cabeçalho acima
        // já cobre esse papel no estilo do mockup; passar titulo
        // também pro GraficoSvg duplicaria o texto (GraficoSvg
        // desenha o seu próprio, com estilo diferente)
        <GraficoSvg dados={dados} corA={COR_VERDE} corB={COR_VERMELHO} altura={210} />
      ) : (
        <div style={{ fontSize: '13px', color: '#5c7484', padding: '20px 0' }}>Carregando gráfico...</div>
      )}
    </div>
  )
}
