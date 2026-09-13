# Manifesto — Backup duplo: Supabase Storage + Google Drive

27 arquivos. `npx tsc --noEmit`: 0 erros. `npx eslint .`: 30 erros (baseline exata do
projeto, nenhum novo), 18 warnings (15 baseline + 3 do mesmo padrão inofensivo que
`app/dashboard/page.tsx` já tinha). Extraia na raiz do projeto, sobrescrevendo.

## ⚠️ Passo obrigatório antes de tudo: configurar o Google Drive

Nada disso funciona sem isso. Resumo (os passos completos eu já te dei antes nesta
conversa):

1. Rode `npm install googleapis` na raiz do projeto (nova dependência — já está no
   `package.json` deste pacote, mas o `node_modules` da sua máquina precisa da instalação
   de verdade).
2. Crie a conta de serviço no Google Cloud, compartilhe a pasta `SGFB/Backups` (dentro do
   Drive de cerasbabinete@gmail.com) com o e-mail dessa conta de serviço, com permissão de
   Editor.
3. Adicione 3 variáveis de ambiente (`.env.local` local **e** no seu provedor de
   hospedagem, ex. Vercel):

```
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=backup-uploader@SEU-PROJETO.iam.gserviceaccount.com
GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_BACKUPS_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

A `PRIVATE_KEY` vem do JSON baixado do Google Cloud — copie o valor do campo
`private_key` exatamente como está (com os `\n` literais mesmo, entre aspas). O código já
trata essa conversão (`replace(/\\n/g, '\n')` em `pages/api/backup/replicar-drive.ts`).

Sem essas 3 variáveis, o backup no Supabase continua funcionando normalmente — só a
duplicação no Drive falha, e o usuário vê um aviso em vez do "sucesso" (ver comportamento
abaixo). Nada quebra por falta de configuração, mas nada duplica pro Drive até isso estar
pronto.

## Arquivos NOVOS (7)
- `app/backup/page.tsx`
- `components/backup/BackupPainel.tsx`
- `lib/backupService.ts`
- `lib/backupDrive.ts` — helper compartilhado entre TODOS os módulos (única exceção
  deliberada à regra de "nunca cross-importar entre serviços" — é infraestrutura, não
  lógica de negócio)
- `pages/api/backup/restaurar.ts`
- `pages/api/backup/replicar-drive.ts` — a rota nova que fala com o Google Drive
- `types/backup.ts`

## Arquivo com uma linha alterada (1)
- `app/page.tsx` — `ativo: false` → `ativo: true` no card do Backup na Home.

## Serviços existentes — `fazerBackup()` agora sobe pro Supabase E duplica no Drive (6)
- `lib/clientesService.ts`, `lib/fornecedoresService.ts`, `lib/receitasService.ts`,
  `lib/contasReceberService.ts`, `lib/despesasService.ts`, `lib/contasAPagarService.ts`

**Mudança de assinatura:** `fazerBackup()` passou de `Promise<void>` para
`Promise<string | undefined>`. Se retornar uma string, é um aviso ("arquivou no Supabase,
mas falhou no Drive") — não é mais um erro genérico, é sucesso parcial. Todos os 13
componentes que chamam essa função já foram atualizados pra tratar isso (ver abaixo). Se
você tiver algum outro lugar no código que chama `fazerBackup()` e eu não vi nesta sessão,
ele precisa do mesmo ajuste — sem isso o TypeScript vai acusar erro de tipo na hora de
compilar (então `npx tsc --noEmit` pega isso automaticamente, não passa despercebido).

## Telas — 13 arquivos, mensagem de sucesso agora reflete os dois destinos
- 8 com `onSucesso()`: `DespesasHeader`/`BasebarDespesas`, `ContasAPagarHeader`/
  `BasebarContasPagar`, `ReceitasHeader`/`BasebarReceitas`, `ContasReceberHeader`/
  `BasebarContasReceber`
- 5 com `alert()` (padrão mais antigo desses módulos, não introduzido por mim):
  `ClientesHeader`, `BasebarClientes`, `FornecedoresHeader`, `BasebarFornecedores`,
  `components/layout/Basebar.tsx` (basebar mobile de Clientes)

## Comportamento em caso de falha
- Falha ao ler os dados ou ao subir no Supabase → erro de verdade, como sempre foi. O
  backup não é considerado feito.
- Supabase funcionou, Drive falhou (credencial errada, pasta não compartilhada, etc.) →
  o backup **está garantido** (fonte de verdade continua sendo o Supabase, igual sempre
  foi), e a mensagem avisa especificamente que o Drive falhou, com o motivo. Nunca falha
  silenciosamente.

## O que não mudou
- `restaurarBackup()` de nenhum módulo — continua igual, recebendo arquivo via upload.
- Nenhuma tabela/coluna/policy nova no banco.
- O bucket `backups` do Supabase continua sendo a cópia primária e a única usada pela seção
  "Backups na nuvem" do módulo Backup central — essa seção não lista o que está no Drive,
  só o que está no Supabase (são cópias idênticas, então não perde nada, mas se quiser que
  ela também liste o Drive, é um passo à parte).

## Depois de extrair
1. `npm install googleapis`
2. Configure as 3 variáveis de ambiente.
3. `npx tsc --noEmit` — 0 erros esperado.
4. `npx eslint .` — mesmos 30 erros de sempre.
5. Clique em "Backup" em qualquer módulo, confirme que o arquivo aparece tanto na seção
   "Backups na nuvem" (Supabase) quanto na pasta SGFB/Backups do Drive.
