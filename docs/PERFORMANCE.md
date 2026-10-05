# Medição local de performance

Medição entre 4 e 5 de outubro de 2026 (America/Fortaleza). Node.js 24.16.0 no Windows, PGlite em memória, localhost, banco vazio. Cinco amostras por operação após uma rodada de aquecimento. Login protegido com bcrypt custo 12 antes e depois. API medida até consumir o JSON, sem tempo de renderização. Scripts não usam DATABASE_URL nem os dados reais da academia.

| Operação | Mediana antes (ms) | Mediana depois (ms) | Máximo antes (ms) | Máximo depois (ms) |
| --- | ---: | ---: | ---: | ---: |
| bootstrap | 5.43 | 3.68 | 12.61 | 5.01 |
| login | 480.28 | 326.99 | 564.82 | 384.46 |
| overview | 9.54 | 5.87 | 12.21 | 7.79 |
| data | 17.38 | 5.50 | 17.99 | 5.75 |
| logout | 5.19 | 2.74 | 7.30 | 5.11 |

A coluna máximo corresponde à maior das cinco amostras, registrada como p95 pelo script. Amostra pequena: resultados são descritivos, não um teste estatístico de capacidade. Diferenças de CPU/aquecimento podem alterar especialmente o login; a segurança da senha não foi reduzida. Não é uma medição de Render, Neon, banco com muitos registros ou início após suspensão.

Mudanças verificáveis: a leitura de `/api/data` passou de uma consulta para cada catálogo/histórico para uma consulta agregada. Incluindo sessão e atualização dos vencimentos, o endpoint agora executa três consultas em vez de dez. O login reúne limpeza de sessões expiradas e criação da sessão numa consulta; logout remove a sessão pelo token em uma consulta. O painel continua sem carregar `/api/data`, e a área do aluno usa uma consulta limitada aos seus vínculos. Financeiro pagina no banco; listagens administrativas renderizam no máximo 30 linhas por página.

O cabeçalho `Server-Timing` retorna `app`, `db` e `queries` por resposta da API. Para diagnosticar produção, habilite `PERFORMANCE_LOG=true`, compare esses dados com a duração observada na aba Network e meça separadamente primeira requisição após inatividade e requisições aquecidas. Tempo alto antes da aplicação responder pode vir de retomada da infraestrutura; SQL alto exige análise de consultas/índices. Não atribua uma causa sem coletar evidência.

Reproduzir: `npm.cmd run performance`. O resultado fica em `test-results/performance-atual.json`. Os testes de navegador também verificam que a primeira visualização não baixa os catálogos completos e que o logout limpa o conteúdo antes de concluir a requisição. Nenhum benchmark foi executado na produção.
