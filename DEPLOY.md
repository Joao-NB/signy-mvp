# Publicação do Signy

Preparação disponível para Render Free + Neon Free ou serviços Docker com disco persistente. Nenhum deploy é representado por este arquivo.

## Opção gratuita escolhida: Render Free + Neon Free

1. Crie contas gratuitas no Render e no Neon. Mantenha os planos Free; não selecione teste de plano pago, disco pago ou domínio comprado.
2. No Neon, crie um projeto PostgreSQL e copie a conexão **direta** fornecida em Connect, com `sslmode=require`. O servidor mantém um pool pequeno próprio. Guarde a conexão nos segredos do Render, nunca no repositório.
3. Coloque esta pasta em um repositório Git da sua conta e conecte ao Render. Use `render.yaml` como Blueprint ou crie um Web Service Node com build `npm ci --omit=dev`, início `npm start` e plano **Free**. Se o repositório incluir a pasta superior, configure a raiz do serviço como `signy-mvp`.
4. Defina `DATABASE_URL` com a conexão do Neon. As demais variáveis estão no Blueprint. Não defina DATA_DIR neste modo.
5. Publique e abra imediatamente o endereço HTTPS fornecido pelo Render. Enquanto a tabela de usuários estiver vazia, a página mostrará o primeiro acesso para você criar a conta administrativa. Depois da criação, esse formulário é desativado pelo banco.
6. Execute a validação ao final deste guia.

O Render gratuito suspende o serviço após 15 minutos sem tráfego; a retomada costuma levar cerca de um minuto. O banco fica no Neon, separado do disco temporário da aplicação. Há franquias de processamento, armazenamento, tráfego e builds. Para manter custo zero, não habilite upgrade automático ou recursos pagos. Sem forma de pagamento, o Render suspende serviços/builds ao atingir as franquias correspondentes em vez de cobrar excedentes. Se o cadastro exigir cartão por verificação, interrompa essa etapa e revise as condições antes de continuar. Essa opção é voltada ao MVP acadêmico, com pausas e limites de uso, não a disponibilidade contínua garantida.

O banco gratuito do próprio Render expira em 30 dias; por isso esta configuração usa Neon Free. Não use um banco Render temporário no lugar de DATABASE_URL sem considerar essa expiração.

### Situação da validação

A suíte local cobre regras de negócio no PostgreSQL embarcado e o controle de transações do adaptador externo. A conexão real ao Neon, criação das tabelas e persistência após reinício na hospedagem ainda precisam ser verificadas após conectar as contas. Nenhuma conta paga foi contratada.

## Configuração do serviço

- Diretório de build: `signy-mvp` se o repositório contiver a pasta superior; `.` se esta pasta for a raiz.
- Dockerfile: `Dockerfile`.
- Porta: variável `PORT` do provedor, ou 3000.
- Health check: `/healthz`.
- Uma única instância, sem escalonamento horizontal, pois o banco embarcado é exclusivo do processo.
- Disco persistente montado em `/var/lib/signy`, com permissão de escrita para UID 1000 (usuário node).
- `DATA_DIR=/var/lib/signy/database`.
- `HOST=0.0.0.0` e `NODE_ENV=production` (já definidos na imagem).
- `ADMIN_PASSWORD` (opcional): permite automatizar a criação da conta `admin` em um banco vazio. O fluxo recomendado cria a conta pela página, sem essa variável.
- `TRUST_PROXY_HOPS`: configure com a quantidade real de proxies HTTPS confiáveis entre a internet e o processo. Use `1` somente se houver exatamente um proxy e o processo não puder ser acessado diretamente por outra rota. Isso permite reconhecer HTTPS e emitir cookies Secure corretamente.

Não envie `.env`, `data/` ou credenciais no código/imagem. Nome de usuário e senha do Signy ficam na tabela `usuario` do Neon. Alterar `ADMIN_PASSWORD` depois que a conta já existe não muda a senha; use **Configurar conta** dentro da aplicação.

## Operação

O serviço deve oferecer HTTPS e encaminhar Host e X-Forwarded-Proto corretamente. O banco exige volume persistente: o disco efêmero do contêiner não é suficiente. Ao receber SIGTERM, o servidor deixa de aceitar conexões, conclui as existentes e fecha o banco antes de encerrar. Configure no provedor ao menos 30 segundos para encerramento.

Para backup, pare o processo e copie o volume completo. Antes de atualizar, mantenha uma cópia recuperável do banco. Nunca execute duas versões ao mesmo tempo sobre o mesmo volume.

## Validação após publicação

1. `/healthz` deve retornar HTTP 200.
2. Acesso sem autenticação a `/api/data` deve retornar HTTP 401.
3. Login com a credencial de produção, criação de um cadastro e leitura após reinício.
4. Cookie de sessão com HttpOnly, SameSite=Strict e Secure na URL HTTPS.
5. Testar aluno → plano → matrícula → presença e ficha com exercício.

## Referências

- [Discos persistentes no Render](https://render.com/docs/disks): precisam ser associados ao serviço; o plano gratuito não oferece esse armazenamento.
- [Docker no Render](https://render.com/docs/docker).
- [Configuração de proxies no Express](https://expressjs.com/en/guide/behind-proxies/).
- [Limites do Render Free](https://render.com/docs/free).
- [Planos Neon](https://neon.com/pricing).

O empacotamento não contrata hospedagem. Qualquer plano pago deve ser escolhido antes da criação do serviço.
