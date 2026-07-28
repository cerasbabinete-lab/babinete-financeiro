// ============================================================
// components/relatorios/DisclaimerRodape.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Relatórios
// Função: Disclaimer fixo obrigatório (Seção 1.1) — texto idêntico
//         ao usado no PDF (lib/relatorios/pdfBuilder.ts) e no Excel
//         (lib/relatorios/excelBuilder.ts), puxado da mesma fonte
//         única de verdade (types/relatorios.ts). Não é editável
//         pelo usuário — nenhuma prop de texto customizado de propósito.
// Conecta com: types/relatorios.ts (DISCLAIMER_RELATORIOS), usado
//              no rodapé de todas as telas de relatório gerado
//              (Fases 2–7)
// Referência: Especificacao_Modulo_Relatorios.md, Seção 1.1 —
//             "Posição recomendada: rodapé de cada página, em fonte
//             reduzida"
// ============================================================

'use client'

import { DISCLAIMER_RELATORIOS } from '@/types/relatorios'

export default function DisclaimerRodape() {
  return (
    <div
      style={{
        marginTop: '20px',
        paddingTop: '10px',
        borderTop: `1px solid #dde8f0`,
        fontFamily: 'Tahoma, Geneva, sans-serif',
        fontSize: '9px',
        color: '#5a84a6',
        lineHeight: 1.5,
      }}
    >
      {DISCLAIMER_RELATORIOS}
    </div>
  )
}
