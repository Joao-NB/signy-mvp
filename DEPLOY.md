# Publicação e integrações do Signy

O código e o pipeline estão preparados. Nenhum deploy, cobrança ou envio de e-mail real foi executado durante a implementação.

## Render e PostgreSQL

Use esta pasta como raiz do serviço. O Blueprint `render.yaml` mantém Render Free com PostgreSQL externo por `DATABASE_URL` e define `OPEN_ACCESS=false`. Configure a conexão Neon/PostgreSQL nos segredos do serviço, com TLS conforme o provedor. O banco local continua disponível quando não houver `DATABASE_URL`.

O build do serviço é `npm ci --omit=dev`; início `npm start`; saúde `/healthz`. Para Docker, o Dockerfile inclui todos os novos módulos. Banco embarcado exige volume persistente e apenas uma instância; banco externo usa pool próprio. `HOST=0.0.0.0`, `NODE_ENV=production` e `TRUST_PROXY_HOPS=1` correspondem à implantação com um proxy confiável. Ajuste a quantidade de proxies ao ambiente.

O servidor configura o fuso America/Fortaleza. Crie a primeira conta na tela de configuração ou use `ADMIN_PASSWORD` apenas em banco vazio. `OPEN_ACCESS=true` é ignorado em produção.

Antes da atualização, faça backup. As migrações em `schema.sql` preservam cadastros e acrescentam perfis, vínculos, tokens, financeiro, contratos e data de cancelamento. Contas existentes são administrativas por compatibilidade; revise e reduza seus perfis em **Acessos da equipe**. Mensalidades de matrículas antigas só são geradas por ação explícita.

### Migrar contas do acesso aberto

Contas criadas por login livre não possuem uma senha conhecida. Para recuperar uma conta administrativa existente, execute o script com acesso ao banco e defina **no ambiente local protegido** `SIGNY_ADMIN_LOGIN` e `SIGNY_ADMIN_PASSWORD` (10 a 72 bytes). Execute:

```powershell
node --env-file-if-exists=.env scripts/recuperar-admin.mjs
```

O script altera somente a conta administrativa indicada e invalida suas sessões. Não exibe a senha. Remova as duas variáveis do ambiente após o uso. Não salve valores reais em scripts, histórico compartilhado ou no repositório. O script não foi executado nos dados da academia durante esta implementação.

Depois de entrar, configure os perfis da equipe. Professores precisam do vínculo com um professor cadastrado; alunos recebem convites próprios.

## E-mail e recuperação

Configure no serviço:

- `APP_URL`: origem pública HTTPS da aplicação.
- `RESEND_API_KEY`: chave do serviço Resend.
- `MAIL_FROM`: remetente em domínio verificado, como Signy <acesso@seu-dominio.com>.

Cadastre e-mail nas contas da equipe ao criar/editar perfil. O aluno recebe o convite no endereço de seu cadastro. Links de convite duram 24 horas; links de recuperação, 30 minutos. São de uso único. Sem e-mail configurado, o administrador pode gerar um link de recuperação, e a recepção pode gerar um convite no detalhe do aluno. Falhas no envio não revelam contas pelo endpoint público.

A configuração e o envio seguem a [API oficial de e-mails do Resend](https://resend.com/docs/api-reference/emails/send-email). Valide domínio/remetente e envio em sua conta antes de disponibilizar recuperação por e-mail.

## Mercado Pago: PIX e cartão

Configure:

- `APP_URL`: origem pública HTTPS.
- `MP_ACCESS_TOKEN`: credencial privada da conta vendedora.
- `MP_WEBHOOK_SECRET`: segredo de assinatura das notificações.
- `MP_SANDBOX=true`: habilita o endereço sandbox retornado na criação da preferência; use as credenciais/contas de teste adequadas do provedor.

No painel do Mercado Pago, habilite notificações **payment** para `https://SUA-ORIGEM/api/payments/webhook`. A API cria uma preferência com valor obtido do banco e referência `signy-ID`. O aluno segue para o checkout do provedor, que oferece os meios habilitados na conta, incluindo PIX e cartão. O QR dinâmico é apresentado pelo provedor; dados brutos de cartão não passam pelo Signy.

O webhook valida assinatura HMAC-SHA256, horário e identificador, consulta o pagamento autenticado e confere moeda/valor. Notificações repetidas não duplicam recibos ou pagamentos. O retorno do navegador nunca confirma cobrança. A equipe pode consultar e conciliar um pagamento pelo identificador do Mercado Pago. O cancelamento local é bloqueado se houver checkout criado, exigindo conciliação do provedor antes de modificar a cobrança.

Referências: [criação de preferências](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/create-payment-preference) e [notificações assinadas](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).

A suíte local verifica o contrato do adaptador com respostas controladas e a conciliação idempotente. Ainda é necessária homologação em sandbox com sua conta: pagamento aprovado, pendente, recusado, cancelado e estornado, webhook repetido e divergências. Nenhuma transação real foi feita.

## GitHub Actions e deploy

O workflow `.github/workflows/ci.yml` roda em push para main/master e em pull requests:

1. Instala dependências com `npm ci`.
2. Valida a sintaxe JavaScript e manifesto.
3. Testa API e integrações em banco isolado.
4. Instala Chromium e testa os fluxos no navegador.
5. Gera e publica como artefato o pacote `dist/`.
6. Em push, solicita deploy somente depois das etapas anteriores passarem.

Configure o secret de repositório `RENDER_DEPLOY_HOOK` com o hook privado do serviço. O hook é enviado por variável de ambiente e não aparece no log. Sem ele, a validação continua funcionando e o job informa que a publicação precisa ser configurada.

O Blueprint usa `autoDeployTrigger: off` para evitar publicação direta que ignore os testes. Configure também essa opção em um serviço Render já existente. O hook inclui o SHA do commit validado no parâmetro ref e solicita a implantação dessa versão; acompanhe a conclusão e a versão publicada no painel. Se o repositório tiver uma pasta superior, configure a raiz do serviço e o diretório de trabalho do workflow para `signy-mvp`.

Referências: [especificação oficial de Blueprints do Render](https://render.com/docs/blueprint-spec) e [deploy de um commit pelo hook](https://render.com/docs/deploy-hooks).

## Validar depois da publicação

- `/healthz` responde 200 e endpoints protegidos sem sessão respondem 401.
- Login aceita credenciais cadastradas, respeita perfis e emite cookie HttpOnly/SameSite=Strict/Secure em HTTPS.
- Logout invalida a sessão; o navegador não mantém APIs/dados pessoais em cache.
- Cadastros e financeiro persistem após reinício; aluno só consulta seus próprios dados.
- Convite/recuperação chega por e-mail e não pode ser reutilizado.
- PIX/cartão em sandbox confirma apenas por conciliação verificada; recibo reflete o valor contratado.
- Métricas `Server-Timing` e logs opcionais distinguem aplicação, SQL e infraestrutura. Compare acessos com serviço/banco aquecidos e após inatividade, sem atribuir lentidão ao Render sem medição.
