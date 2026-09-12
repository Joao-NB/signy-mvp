# Signy — MVP de gestão de academia

Aplicação web interna baseada no documento `projeto_Signy_relatorio_atual.pdf` (40 páginas). O banco inicial fica vazio, pronto para os cadastros da academia. Os dados usados nos testes são fictícios e isolados em memória.

## Executar

**Hospedagem gratuita:** o projeto agora aceita PostgreSQL externo por `DATABASE_URL`. A configuração `render.yaml` seleciona explicitamente Render Free, usando Neon Free para persistência. Veja [DEPLOY.md](DEPLOY.md). Sem `DATABASE_URL`, a execução local continua usando PGlite. Os cadastros locais não são transferidos automaticamente ao banco remoto.

Requisito: Node.js 22 ou superior, com npm.

1. Abra um terminal nesta pasta e execute `npm install` (as dependências já estão instaladas nesta entrega).
2. Execute `npm start` ou abra **Iniciar Signy.cmd**.
3. Acesse http://localhost:3000.
4. Se o banco estiver vazio, a página exibe **Primeiro acesso** para criar o nome, o usuário e a senha administrativos. A senha não fica armazenada em texto puro.

Depois de entrar, use o ícone de configurações ao lado do administrador para alterar nome, usuário ou senha. As credenciais ficam na tabela `usuario` do banco e sobrevivem aos reinícios. `ADMIN_PASSWORD` permanece disponível apenas como opção de automação para inicializar um banco vazio; não é necessária no uso normal e não altera uma conta que já existe.

### Usar o mesmo Neon localmente e na produção

1. Execute **Conectar ao Neon.cmd**.
2. Cole a mesma `DATABASE_URL` configurada no Render. A digitação fica oculta no terminal.
3. O assistente valida o endereço e salva `signy-mvp/.env`, que está excluído do GitHub.
4. Execute **Iniciar Signy.cmd** e acesse http://localhost:3000.

A versão local passa a mostrar e alterar exatamente os mesmos registros e a mesma conta da produção. Criar, editar ou excluir localmente produz efeito no Neon e aparece na aplicação do Render. Para voltar ao banco local, mova ou renomeie o arquivo `.env` antes de iniciar.

Não inicie duas instâncias usando a mesma pasta de dados. Para encerrar, pressione Ctrl+C no terminal do servidor.

## Fluxo recomendado

O painel mostra um guia visual e destaca o próximo cadastro necessário. Ao clicar em uma etapa pendente, o formulário correspondente já é aberto. Etapas concluídas levam à lista para consulta e edição.

1. **Professor:** identifica quem será responsável pelas fichas. Nome, CPF e data de admissão são obrigatórios.
2. **Plano:** define nome, mensalidade e duração. Um plano novo começa ativo automaticamente; disponibilidade só aparece ao editar.
3. **Aluno:** reúne os dados pessoais. O aluno pode existir sem matrícula para preservar cadastros ainda não convertidos.
4. **Matrícula:** liga aluno e plano. Mostra apenas alunos sem matrícula vigente e planos ativos; calcula a data final automaticamente.
5. **Exercício:** cria movimentos reutilizáveis por várias fichas, evitando repetir nome e instruções a cada aluno.
6. **Ficha de treino:** liga aluno, professor e exercícios, com ordem, séries, repetições, carga e observações. Uma ficha nova começa ativa e precisa ter pelo menos um exercício.
7. **Presença:** registra data e hora do servidor. Só aceita aluno com matrícula vigente e bloqueia uma segunda entrada no mesmo dia.

O **detalhe do aluno** concentra matrícula, fichas e presença. As telas de listagem permitem buscar, filtrar, editar e consultar. Exclusões que apagariam um histórico relacionado são bloqueadas; matrículas são canceladas e planos são desativados em vez de apagados.

### Simplificações adotadas

- O status “ativo” deixou de ser perguntado ao criar plano e ficha, pois o uso normal sempre começa ativo. Ele continua disponível na edição.
- A ficha vazia foi eliminada: ela só pode ser salva depois que ao menos um exercício for incluído.
- O painel indica a ordem dos pré-requisitos e abre diretamente o próximo formulário, reduzindo idas e voltas entre menus.
- O registro rápido de presença permanece no painel; a tela **Presenças** funciona como histórico e oferece filtros por período.

## Funcionalidades entregues

O refinamento de interface impede formulários sem pré-requisitos, mostra somente alunos elegíveis para novas matrículas e presenças, evita presença duplicada já na seleção e orienta o próximo cadastro necessário. Todas as ações visíveis possuem tratamento e foram percorridas no navegador.

| Requisitos | Implementação |
| --- | --- |
| RF01–RF04 | Cadastro, edição, busca por nome/CPF/situação e exclusão protegida de alunos |
| RF05–RF07 | Cadastro, edição e consulta de professores; exclusão apenas sem fichas vinculadas |
| RF08–RF10 | Planos com valor mensal e duração, edição e ativação/desativação sem exclusão |
| RF11–RF13 | Matrícula, cálculo automático de fim, cancelamento, vencimento e filtros por aluno/situação/período |
| RF14–RF16 | Catálogo de exercícios com edição e filtros por nome/grupo; exclusão protegida |
| RF17–RF20 | Fichas por aluno e professor, exercícios parametrizados, edição, consulta e ativação/inativação |
| RF21–RF22 | Presença diária com data/hora do servidor e histórico por aluno/período |
| RNF01–RNF03 | Primeiro acesso, login e gestão da conta; bcrypt custo 12; sessões expirando em 8 horas; datas de criação/alteração por trigger |
| RNF04–RNF10 | Interface em português, mensagens de erro, layout adaptável, índices, constraints, código separado entre servidor/interface/banco/testes |
| RNF11 | Operação local enquanto o processo do servidor estiver em execução |

## Regras de negócio

- RN01: índice parcial único impede duas matrículas ativas. A aplicação atualiza matrículas expiradas antes das consultas e alterações.
- RN02/RN04: vínculos obrigatórios por chaves estrangeiras.
- RN03: presença exige matrícula ativa cujo período inclui a data atual.
- RN05/RN06: tabela associativa de exercícios; unicidade por ficha e exercício.
- RN07: somente uma presença por aluno/data, inclusive em requisições repetidas.
- RN08–RN10: fim posterior ao início; valor e duração positivos.
- RN11: CPF de 11 dígitos, normalizado sem máscara e único em cada cadastro. Valida formato, não dígitos verificadores.
- RN12: novas matrículas exigem plano ativo.
- RN13: exclusões respeitam vínculos e preservam histórico.

**Decisões do MVP:** não aceita início de matrícula futuro, evitando confundir uma matrícula ativa com uma ainda não iniciada. Datas de entrada e presença não são escolhidas pelo operador. Filtros de período das matrículas consideram a data de início, com limites inclusivos. Uma ficha exige ao menos um exercício. Exclusão de ficha remove suas associações em cascata, conforme o modelo. Valores dos planos são informativos, sem cobrança.

## Tecnologia e persistência

- Node.js + Express: servidor e API REST.
- HTML, CSS e JavaScript: interface sem dependência de serviços externos.
- **PGlite**: distribuição embarcada do motor PostgreSQL em WebAssembly, executada no servidor com persistência na pasta `data/`. Não é SQLite nem armazenamento do navegador. Evita instalar um serviço PostgreSQL separado para executar o MVP.
- `schema.sql`: DDL PostgreSQL com as oito entidades do PDF, tabelas de infraestrutura `usuario`/`sessao`, índices e auditoria. Utiliza triggers `CREATE OR REPLACE`, exigindo PostgreSQL 14+ para uso em servidor externo.
- Sessões em cookie HttpOnly e SameSite=Strict; tokens aleatórios armazenados como hash no banco; limitação de tentativas de login e validação de origem. Cookie Secure quando a conexão é HTTPS.

O servidor escuta apenas no próprio computador (`127.0.0.1`). A aplicação é um MVP local, com um administrador e um processo de banco embarcado. Para disponibilizar em rede, será necessário configurar hospedagem, HTTPS e, conforme a carga, adaptar o acesso ao banco para PostgreSQL externo. A entrega não presume implantação pública ou alta disponibilidade. A lista operacional é carregada em memória no navegador; paginação no servidor fica para crescimento além do volume acadêmico.

Os dados sobrevivem à recarga e ao reinício. Para backup, **pare o servidor** e copie toda a pasta `data/` para outro local. Para restauração, use uma cópia íntegra com o servidor parado. Não edite os arquivos internos do banco manualmente. O PDF original permanece intacto na pasta superior.

## Estrutura

```text
signy-mvp/
  public/             Interface em português
  server.mjs          Autenticação, API e regras de negócio
  schema.sql          Estrutura PostgreSQL e auditoria
  tests/              Testes de integração e navegador
  data/               Banco persistente local (gerado na execução)
  .env.example        Configuração opcional
  Conectar ao Neon.cmd Configurador seguro da conexão compartilhada
  Iniciar Signy.cmd   Inicializador para Windows
```

## Validação

Execute `npm test`. Os testes usam banco em memória e não alteram os dados da academia. Cobrem autenticação, CPF duplicado, valores inválidos, matrícula única, plano inativo, presença vigente/duplicada, transação de fichas, proteção de vínculos, cancelamento, fim de mês, vencimento, auditoria e troca de senha.

`tests/browser.mjs` realiza o percurso com Playwright e Edge: login, sete módulos, treino, edição, consulta, recarga e tela de 390 px. `tests/real-flow.browser.mjs` abre um servidor completo com banco persistente em disco, cria professor, plano, aluno, matrícula, exercício, ficha e presença, reinicia o servidor e confere novamente todos os vínculos. Execute `node tests/real-flow.browser.mjs`; o banco temporário é apagado somente depois da verificação. Para repetir em outra máquina, disponibilize o pacote Playwright (ou indique seu caminho em `PLAYWRIGHT_MODULE`) e instale Edge. As capturas ficam em `test-results/`.

**Fora do escopo, conforme o PDF:** pagamentos, cobrança, integração com catracas/biometria, aplicativo para aluno, notificações, avaliação física e relatórios avançados.
