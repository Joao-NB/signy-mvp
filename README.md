# Signy — MVP de gestão de academia

Aplicação web interna baseada no documento `projeto_Signy_relatorio_atual.pdf` (40 páginas). O banco inicial fica vazio, pronto para os cadastros da academia. Os dados usados nos testes são fictícios e isolados em memória.

## Executar

**Hospedagem gratuita:** o projeto agora aceita PostgreSQL externo por `DATABASE_URL`. A configuração `render.yaml` seleciona explicitamente Render Free, usando Neon Free para persistência. Veja [DEPLOY.md](DEPLOY.md). Sem `DATABASE_URL`, a execução local continua usando PGlite. Os cadastros locais não são transferidos automaticamente ao banco remoto.

Requisito: Node.js 22 ou superior, com npm.

1. Abra um terminal nesta pasta e execute `npm install` (as dependências já estão instaladas nesta entrega).
2. Execute `npm start` ou abra **Iniciar Signy.cmd**.
3. Acesse http://localhost:3000.
4. Usuário inicial: **admin**. Na primeira execução, uma senha aleatória é exibida no terminal. Ela não fica armazenada em texto puro no banco.

Para definir a senha antes da primeira execução, copie `.env.example` para `.env`, altere `ADMIN_PASSWORD` e inicie a aplicação. Alterar essa variável depois que o usuário já existe não troca sua senha. Depois de entrar, use o ícone de configurações ao lado do administrador para trocar a senha.

Não inicie duas instâncias usando a mesma pasta de dados. Para encerrar, pressione Ctrl+C no terminal do servidor.

## Primeiro uso

1. Cadastre os alunos, professores e planos.
2. Crie uma matrícula para um aluno, selecionando um plano ativo. A data de fim é calculada em meses de calendário, preservada mesmo se o plano mudar.
3. Cadastre exercícios e monte uma ficha, selecionando aluno e professor. Adicione exercícios com ordem, séries, repetições, carga opcional e observações.
4. Registre a presença pelo painel ou pela página Presenças.
5. Consulte cadastros com a busca, situação e filtros por período. O detalhe do aluno reúne matrículas, fichas e presenças.

## Funcionalidades entregues

| Requisitos | Implementação |
| --- | --- |
| RF01–RF04 | Cadastro, edição, busca por nome/CPF/situação e exclusão protegida de alunos |
| RF05–RF07 | Cadastro, edição e consulta de professores; exclusão apenas sem fichas vinculadas |
| RF08–RF10 | Planos com valor mensal e duração, edição e ativação/desativação sem exclusão |
| RF11–RF13 | Matrícula, cálculo automático de fim, cancelamento, vencimento e filtros por aluno/situação/período |
| RF14–RF16 | Catálogo de exercícios com edição e filtros por nome/grupo; exclusão protegida |
| RF17–RF20 | Fichas por aluno e professor, exercícios parametrizados, edição, consulta e ativação/inativação |
| RF21–RF22 | Presença diária com data/hora do servidor e histórico por aluno/período |
| RNF01–RNF03 | Login, bcrypt custo 12, sessões expirando em 8 horas, datas de criação/alteração por trigger |
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

**Decisões do MVP:** não aceita início de matrícula futuro, evitando confundir uma matrícula ativa com uma ainda não iniciada. Datas de entrada e presença não são escolhidas pelo operador. Filtros de período das matrículas consideram a data de início, com limites inclusivos. Uma ficha pode ser salva sem exercícios e completada depois. Exclusão de ficha remove suas associações em cascata, conforme o modelo. Valores dos planos são informativos, sem cobrança.

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
  Iniciar Signy.cmd   Inicializador para Windows
```

## Validação

Execute `npm test`. Os testes usam banco em memória e não alteram os dados da academia. Cobrem autenticação, CPF duplicado, valores inválidos, matrícula única, plano inativo, presença vigente/duplicada, transação de fichas, proteção de vínculos, cancelamento, fim de mês, vencimento, auditoria e troca de senha.

`tests/browser.mjs` realiza o percurso real com Playwright e Edge: login, sete módulos, treino, edição, consulta, recarga e tela de 390 px. Para repetir em outra máquina, disponibilize o pacote Playwright (ou indique seu caminho em `PLAYWRIGHT_MODULE`) e instale Edge. Execute `node tests/browser.mjs`. As capturas ficam em `test-results/`.

**Fora do escopo, conforme o PDF:** pagamentos, cobrança, integração com catracas/biometria, aplicativo para aluno, notificações, avaliação física e relatórios avançados.
