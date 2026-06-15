// ============================================================
// app/encerrado/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Função: Página de encerramento do sistema
//         Exibida quando o usuário clica em "Sair"
//         e o browser não permite fechar a aba via window.close()
// ============================================================

export default function EncerradoPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0f4f7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Tahoma, Geneva, sans-serif',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #dde8f0',
          padding: '40px 48px',
          textAlign: 'center',
          maxWidth: '360px',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>👋</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a6094', marginBottom: '8px' }}>
          Sistema encerrado
        </div>
        <div style={{ fontSize: '12px', color: '#5a84a6', marginBottom: '24px' }}>
          Você saiu do sistema com segurança.<br />Pode fechar esta aba.
        </div>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            padding: '8px 24px',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'Tahoma, Geneva, sans-serif',
            background: '#1a6094',
            color: '#ffffff',
            border: 'none',
            borderRadius: '5px',
            textDecoration: 'none',
          }}
        >
          Entrar novamente
        </a>
      </div>
    </div>
  )
}
