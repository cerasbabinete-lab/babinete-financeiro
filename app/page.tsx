// ============================================================
// app/page.tsx
// Projeto: Ceras Babinete — Gestão Financeira
// Módulo: Home Screen (Tela Inicial)
// Função: Página raiz — exibe grid de atalhos para todos os módulos
//         do sistema após autenticação. Módulos ativos são clicáveis;
//         módulos futuros são exibidos desabilitados (opacity 0.35).
//         Substitui o Server Component redirect anterior.
// Rota: /
// Conecta com: components/layout/Topbar, TopbarMobile, NavBar, Drawer
//              lib/supabase (auth check)
// Spec: module_home_handoff.md
// ============================================================

'use client'

// React hooks necessários para estado e efeitos colaterais
import { useEffect, useState } from 'react'

// Roteamento client-side para redirect em caso de sessão inválida
import { useRouter } from 'next/navigation'

// Cliente Supabase — usado exclusivamente para verificar sessão ativa
import { supabase } from '@/lib/supabase'

// Link do Next.js — usado nos cards de módulos ATIVOS para navegação SPA
import Link from 'next/link'

// Componentes de layout congelados — NÃO modificar
import Topbar from '@/components/layout/Topbar'
import TopbarMobile from '@/components/layout/TopbarMobile'
import NavBar from '@/components/layout/NavBar'
import Drawer from '@/components/layout/Drawer'

// ============================================================
// Constante MODULOS
// Lista completa dos 10 módulos do sistema, na ordem exata
// definida no spec (seção 4). Cada entrada define:
//   label  → texto exibido abaixo do ícone
//   href   → rota de destino (usada como key e no Link)
//   icon   → caminho do SVG em /public/img/
//   ativo  → true = clicável; false = desabilitado (opacity 0.35)
// Para ativar um módulo futuro: alterar ativo para true aqui.
// ============================================================
const MODULOS: { label: string; href: string; icon: string; ativo: boolean }[] = [
  { label: 'Dashboard',       href: '/dashboard',   icon: '/img/dashboard.svg',     ativo: false },
  { label: 'Relatórios',      href: '/relatorios',  icon: '/img/relatorios.svg',    ativo: false },
  { label: 'Receitas',        href: '/receitas',    icon: '/img/receitas.svg',      ativo: true  },
  { label: 'Despesas',        href: '/despesas',    icon: '/img/despesas.svg',      ativo: true  },
  { label: 'Contas a Receber',href: '/receber',     icon: '/img/contas_receber.svg',ativo: true  },
  { label: 'Contas a Pagar',  href: '/pagar',       icon: '/img/contas_pagar.svg',  ativo: false },
  { label: 'Clientes',        href: '/clientes',    icon: '/img/clientes.svg',      ativo: true  },
  { label: 'Fornecedores',    href: '/fornecedores',icon: '/img/fornecedores.svg',  ativo: true  },
  { label: 'Usuários',        href: '/usuarios',    icon: '/img/usuarios.svg',      ativo: false },
  { label: 'Backup',          href: '/backup',      icon: '/img/backup.svg',        ativo: false },
]

// ============================================================
// HomePage
// Componente principal da rota /
// ============================================================
export default function HomePage() {

  // Router para redirect em caso de sessão inválida
  const router = useRouter()

  // Nome do usuário extraído do email (parte antes do @)
  // Passado para Topbar / TopbarMobile como prop
  const [usuario, setUsuario] = useState<string>('')

  // Controla se a verificação de autenticação ainda está em andamento
  // Enquanto true, o componente retorna null para evitar flash de conteúdo
  const [authCarregando, setAuthCarregando] = useState(true)

  // Resultado da detecção de viewport — null enquanto não resolvido, evita flash de layout errado
  // Inicia como null (não false) para que o guard abaixo segure o render até matchMedia resolver
  // false imediatamente renderizaria o layout desktop em dispositivos móveis antes do useEffect
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  // Controla a abertura do Drawer lateral no layout mobile
  // Aberto via botão hamburger no TopbarMobile, fechado via overlay ou botão interno
  const [drawerAberto, setDrawerAberto] = useState(false)

  // ============================================================
  // useEffect — Detecção de viewport (mobile / desktop)
  // Padrão idêntico ao de app/clientes/page.tsx e app/fornecedores/page.tsx
  // Breakpoint: 768px (max-width → mobile)
  // ============================================================
  useEffect(() => {
    // Cria o MediaQueryList para o breakpoint definido no projeto
    const mq = window.matchMedia('(max-width: 768px)')

    // Aplica o valor inicial imediatamente ao montar
    setIsMobile(mq.matches) // eslint-disable-line react-hooks/set-state-in-effect

    // Handler reativo — atualiza isMobile quando o viewport é redimensionado
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)

    // Registra o listener para mudanças de viewport
    mq.addEventListener('change', handler)

    // Cleanup — remove o listener ao desmontar o componente
    return () => mq.removeEventListener('change', handler)
  }, []) // Executa apenas na montagem — sem dependências

  // ============================================================
  // useEffect — Verificação de autenticação
  // Padrão aprovado (FIX-05): getUser() valida JWT server-side
  // SIGNED_OUT listener garante redirect imediato ao expirar sessão
  // ============================================================
  useEffect(() => {
    // getUser() valida o JWT contra o servidor Supabase (mais seguro que getSession)
    // getSession() lê apenas o localStorage sem verificação server-side — não usar
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      // Usuário inválido, ausente ou erro de validação → redireciona para login
      if (!user || error) {
        router.push('/login')
        return
      }

      // Extrai o identificador do usuário: parte antes do @ no email
      // Ex: "maycon@cerasbabinete.com.br" → "maycon"
      const email = user.email ?? ''
      setUsuario(email.split('@')[0]) // eslint-disable-line react-hooks/set-state-in-effect

      // Libera o render do conteúdo — auth confirmada com sucesso
      setAuthCarregando(false) // eslint-disable-line react-hooks/set-state-in-effect
    }).catch(() => {
      // Falha de rede, timeout ou outage do Supabase → redireciona para login como fallback seguro
      // Sem catch: authCarregando ficaria true para sempre e o usuário veria tela em branco
      router.push('/login')
    })

    // Listener reativo — captura SIGNED_OUT (sessão expirada, logout remoto, logout em outra aba)
    // Sem este listener, o usuário com sessão expirada permanece na tela indefinidamente
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Redireciona imediatamente ao detectar encerramento de sessão
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    // Cleanup — cancela o listener ao desmontar o componente para evitar memory leak
    return () => subscription.unsubscribe()
  }, [router]) // Depende de router para uso estável da referência

  // ============================================================
  // Guard de autenticação
  // Retorna null enquanto a sessão ainda está sendo verificada
  // Evita flash de conteúdo não autorizado antes do redirect
  // ============================================================
  if (authCarregando) return null

  // Guard de viewport — retorna null enquanto matchMedia ainda não resolveu
  // Evita flash do layout desktop em dispositivos móveis durante a hidratação
  // isMobile parte de null e só assume true/false após o useEffect de detecção executar
  if (isMobile === null) return null

  // ============================================================
  // Render — único return com condicionais inline (desktop e mobile)
  // Estrutura unificada: sem duplicação do grid, sem dois return blocks
  // Drawer protegido pelo guard {isMobile && ...} explícito
  // Sem Basebar — Home não possui ações CRUD
  // ============================================================
  return (
    // Container raiz — coluna, altura mínima da viewport (minHeight em ambos os layouts)
    // minHeight (não height) permite expansão caso o grid ultrapasse a viewport
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',              // Robusto para qualquer quantidade de cards futuros
        fontFamily: 'Tahoma, Geneva, sans-serif',
        background: '#f0f4f7',           // Cor de fundo padrão do sistema
      }}
    >
      {/* Topbar condicional — desktop: Topbar + NavBar / mobile: TopbarMobile */}
      {isMobile ? (
        // TopbarMobile congelado — hamburger + logo + saudação + datetime strip
        <TopbarMobile
          usuario={usuario}
          onOpenDrawer={() => setDrawerAberto(true)} // Abre o Drawer ao clicar no hamburger
        />
      ) : (
        <>
          {/* Topbar congelado — exibe logo + título + saudação ao usuário */}
          <Topbar usuario={usuario} />
          {/* NavBar congelado — exibe links de módulos; "Início" ativo via usePathname() */}
          <NavBar />
        </>
      )}

      {/* Área de conteúdo — centralizada no desktop, alinhada ao topo no mobile */}
      <div
        style={{
          flex: 1,                                             // Ocupa todo o espaço restante abaixo do header
          background: '#f0f4f7',                              // Cor de fundo padrão do sistema
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',    // Mobile: topo / Desktop: centro vertical
          justifyContent: 'center',                           // Centraliza horizontalmente em ambos
          padding: isMobile ? '32px 24px' : '48px 40px',     // Padding conforme spec por layout
        }}
      >
        {/* Grid de módulos — 2 colunas (mobile) ou 5 colunas fixas (desktop) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(2, 1fr)'       // Mobile: 5 linhas × 2 colunas = 10 cards
              : 'repeat(5, 120px)',    // Desktop: 2 linhas × 5 colunas = 10 cards
            gap: isMobile ? '24px' : '32px 40px', // gap uniforme (mobile) / v×h (desktop)
          }}
        >
          {/* Itera sobre os 10 módulos — lógica única para ambos os layouts */}
          {MODULOS.map(modulo =>
            modulo.ativo
              ? (
                // Card ATIVO — envolto em Link para navegação SPA sem reload
                <Link
                  key={modulo.href}
                  href={modulo.href}
                  style={{
                    textDecoration: 'none', // Remove sublinhado padrão do link
                  }}
                >
                  {/* Conteúdo interno do card ativo — ícone + label */}
                  <CardConteudo modulo={modulo} />
                </Link>
              )
              : (
                // Card DESABILITADO — div simples, sem Link, opacidade reduzida
                <div
                  key={modulo.href}
                  style={{
                    opacity: 0.35,          // Indica visualmente que não está disponível
                    pointerEvents: 'none',  // Impede qualquer interação do usuário
                  }}
                >
                  {/* Conteúdo interno do card desabilitado — ícone + label */}
                  <CardConteudo modulo={modulo} />
                </div>
              )
          )}
        </div>
      </div>

      {/* Drawer lateral — mobile only, guard explícito evita render desnecessário no desktop */}
      {isMobile && (
        <Drawer
          isOpen={drawerAberto}
          onClose={() => setDrawerAberto(false)} // Fecha ao clicar no overlay ou no X interno
          usuario={usuario}                       // Nome do usuário exibido no footer do Drawer
        />
      )}
    </div>
  )
}

// ============================================================
// CardConteudo
// Sub-componente interno (não exportado) que renderiza o
// conteúdo visual de cada card: ícone SVG + label de texto.
// Usado tanto por cards ativos (dentro de Link) quanto
// desabilitados (dentro de div) — sem lógica própria.
// A distinção ativo/desabilitado é controlada pelo wrapper no
// componente pai (Link vs div com opacity) — não por este componente.
// Props:
//   modulo — { label, href, icon } — ativo excluído (não utilizado aqui)
// ============================================================
function CardConteudo({
  modulo,
}: {
  modulo: { label: string; href: string; icon: string } // ativo omitido — não usado neste componente
}) {
  return (
    // Flex coluna — centraliza ícone e label verticalmente
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center', // Centraliza horizontalmente dentro do card
        gap: '10px',          // Espaço entre o ícone e o texto do label
      }}
    >
      {/* Ícone do módulo — SVG em /public/img/, dimensões fixas 72×72 conforme spec */}
      <img
        src={modulo.icon}   // Caminho do SVG vindo da constante MODULOS
        alt={modulo.label}  // Texto alternativo para acessibilidade
        style={{
          width: '72px',
          height: '72px',
          objectFit: 'contain', // Preserva proporção sem cortar o SVG
        }}
      />

      {/* Label textual do módulo — uppercase, bold, cor primária */}
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#1a6094',           // Cor primária do sistema
          textAlign: 'center',
          textTransform: 'uppercase', // Maiúsculas conforme spec
          letterSpacing: '0.04em',    // Espaçamento de letras conforme spec
          fontFamily: 'Tahoma, Geneva, sans-serif',
        }}
      >
        {modulo.label}
      </span>
    </div>
  )
}
