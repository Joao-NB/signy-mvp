# Signy · Gestão de academias

Plataforma em português com gestão da academia, financeiro, Área do aluno e indicadores. As melhorias de `Melhorias - signy (1).pdf` foram incorporadas ao projeto. A aplicação utiliza Node.js 22, Express e PostgreSQL (Neon/externo ou PGlite local).

## Executar

```powershell
npm.cmd install
npm.cmd start
```

Abra http://localhost:3000 ou use **Iniciar Signy.cmd**. Em banco vazio, crie a conta administrativa na tela inicial. Login exige uma senha cadastrada por padrão. `ADMIN_PASSWORD` inicializa a conta `admin` somente em banco vazio. O banco local continua persistido em `data/`; nenhum dado real é criado pelos testes.

`OPEN_ACCESS=true` permite demonstração local com qualquer senha. Esse modo é desabilitado em produção. Contas antigas criadas no acesso aberto precisam receber senhas reais antes da migração: veja [DEPLOY.md](DEPLOY.md).

## Perfis e permissões

| Perfil | Gestão | Treinamento | Presença | Financeiro | Equipe / BI |
| --- | --- | --- | --- | --- | --- |
| Administrador | Completa | Completo | Registra | Completo | Sim |
| Recepcionista | Alunos e matrículas; consulta os demais | Consulta | Registra | Opera | Não |
| Professor | Consulta sem CPF/contatos dos alunos | Exercícios e suas próprias fichas | Registra | Não | Não |
| Aluno | Próprio perfil | Próprias fichas ativas e vídeos | Consulta a própria | Próprias mensalidades e recibos | Não |

A conta de professor deve ser vinculada a um professor cadastrado. Somente administradores criam/aprovam contas da equipe e alteram perfis. Novas contas da equipe começam como recepcionista, salvo escolha explícita. O servidor verifica cada operação; o aluno não acessa `/api/data`, indicadores ou cadastros da equipe.

**Primeiro acesso do aluno:** cadastrar um aluno com e-mail cria sua conta pendente (`aluno.ID`) e um convite. Com Resend configurado, o convite é enviado por e-mail. Sem serviço configurado, abra o detalhe do aluno e clique **Enviar convite de acesso** para obter um link compartilhável. O aluno define a senha e ativa a conta. Convites expiram em 24 horas; recuperações, em 30 minutos. Ambos têm uso único e invalidam sessões anteriores.

**Recuperação:** o login tem **Esqueci minha senha**. Requer e-mail cadastrado e Resend configurado. Um administrador também pode gerar um link pela lista de usuários. Tokens são armazenados apenas como hash; o fluxo público não revela se a conta existe.

## Financeiro

A matrícula nova gera uma mensalidade por mês contratado, com valor e duração preservados na contratação. Vencimentos usam a data inicial, ajustando automaticamente meses curtos. Alterações no plano não reescrevem cobranças. A listagem tem busca, situação e paginação no servidor (30 registros).

Situações: **Pendente**, **Em atraso**, **Pago** e **Cancelado**. A equipe registra pagamentos recebidos com meio e comprovante; concorrência não permite confirmar duas vezes a mesma mensalidade. Pagamentos confirmados têm recibo imprimível, e cada operação mantém histórico. Cancelamentos exigem motivo e preservam os registros. Cancelar uma matrícula não perdoa automaticamente mensalidades; a equipe decide cada cobrança.

Matrículas anteriores não geram cobranças retroativas durante a migração. A ação **Gerar mensalidades de matrículas anteriores** é explícita e usa o valor atual do plano quando não há contrato histórico. O número da matrícula aparece no detalhe. Confira esse valor antes de gerar.

### PIX e cartão

O adaptador do Mercado Pago cria um checkout hospedado para PIX/cartão, com retorno ao Signy, webhook assinado e conciliação por identificador. O QR PIX dinâmico e os campos de cartão ficam no checkout do provedor. O Signy nunca recebe números de cartão. Abrir o checkout ou voltar ao site não confirma o pagamento: somente a consulta autenticada ao provedor permite atualizar a situação.

Configure `APP_URL` (HTTPS), `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`. Use `MP_SANDBOX=true` para o checkout de testes. Configure notificações **payment** em `/api/payments/webhook`. Duplicatas de notificações não duplicam pagamentos; divergências de valor/moeda e pagamentos duplicados exigem conciliação. Estornos comunicados pelo provedor ficam no histórico e reabrem a mensalidade. A integração foi verificada localmente com dados controlados; transações reais exigem homologação na conta do provedor.

## Área do aluno e indicadores

O aluno tem interface própria para celular com **Meu treino**, **Frequência** e **Perfil**, exercícios ordenados, séries/repetições/carga e detalhes expansíveis. Vídeos HTTPS abrem somente após toque. Frequência mostra as últimas 90 entradas; mensalidades, as últimas 36. O manifesto e service worker permitem instalação como PWA em navegadores compatíveis; dados pessoais e APIs não entram no cache. Sem conexão há uma tela de orientação; presença e pagamento exigem conexão.

O administrador acompanha alunos ativos, matrículas e pessoas distintas, cancelamentos, frequência diária, horários de entrada, inadimplência, retenção e valores recebidos por mês. O período é explícito; detalhes ficam recolhidos. Retenção considera os alunos matriculados no início que continuam matriculados na data final. Cancelamentos novos têm data própria; os antigos usam a última alteração e não permitem reconstrução histórica exata. A tela Presenças permite registrar saída nas últimas 24 horas com horário do servidor; o tempo médio de permanência considera apenas registros com entrada e saída confirmadas. Sem saídas no período, o indicador informa ausência de dados.

## Performance e experiência

O painel inicial usa apenas `/api/overview`. Cadastros completos são carregados sob demanda. `/api/data` reúne os catálogos em uma consulta SQL, além da autorização e atualização de vencimentos. As listagens renderizam até 30 itens por página; os catálogos de seleção permanecem carregados em memória. Financeiro pagina no banco. Para volumes maiores, a próxima evolução é substituir o catálogo integral por endpoints de busca específicos.

`Server-Timing` mostra tempo total, tempo de banco e contagem de consultas em cada resposta da API. `PERFORMANCE_LOG=true` registra essas medidas, sem credenciais ou corpos. `npm.cmd run performance` mede os fluxos com banco isolado. A [medição antes/depois](docs/PERFORMANCE.md) distingue resultados locais das condições de Render/Neon.

A identidade usa o lettering angular SIGNY do documento, em SVG, variantes clara/escura, favicon e ícones PWA. Controles de conta e saída permanecem na barra superior direita. Tabelas viram cards no celular; modais, teclado, labels, foco e mensagens seguem componentes compartilhados. A saída limpa a interface imediatamente e só libera novo login após invalidar a sessão no servidor.

## Verificar e publicar

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run test:browser
npm.cmd run build
```

Os testes usam bancos isolados. A suíte cobre gestão original, perfis, convites, recuperação, isolamento do aluno, financeiro, conciliação, recibos, BI e interface em 320, 390, 768, 1024 e 1440 px. No Windows usa Edge; defina `PLAYWRIGHT_CHANNEL=chromium` para Chromium instalado pelo Playwright.

O build gera `dist/` com os arquivos necessários à produção. GitHub Actions instala, valida sintaxe, testa API/navegador e gera o pacote. Publicação via Render depende do secret `RENDER_DEPLOY_HOOK`; o Blueprint desabilita a publicação direta por push para respeitar a validação. Veja [DEPLOY.md](DEPLOY.md).

As migrações são aditivas/idempotentes em `schema.sql`. Mantenha backup antes de atualizar produção. Não envie `.env`, `data/` ou chaves ao repositório. Para banco local, pare o servidor e copie `data/`; para PostgreSQL externo, use o backup do provedor.
