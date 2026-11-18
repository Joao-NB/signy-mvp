# Cadastros preservados, calendários e financeiro

## Desativar e voltar

Alunos, professores, exercícios, fichas e planos usam ações diretas de detalhes, edição, desativação e reativação. O menu que continha apenas excluir foi removido. Os filtros Todos, Em uso/atividade e Desativados organizam os catálogos.

Desativar um aluno mantém o cadastro, encerra matrículas que ainda estejam ativas e desativa suas fichas. Presenças, contratos, itens das fichas, pagamentos e mensalidades ficam no histórico. Mensalidades existentes não são canceladas nem perdoadas automaticamente. O portal continua permitindo consultar o histórico financeiro.

A área Rematrícula reúne alunos sem matrícula vigente, incluindo desativados. O gestor escolhe o plano e a data; ao salvar, o cadastro é reativado na mesma transação da nova matrícula e geração das novas parcelas. Uma falha desfaz toda a operação. O contrato anterior não é reaberto e as fichas antigas continuam inativas até reativação explícita. A ação Reativar cadastro também permite voltar ao catálogo sem criar uma matrícula.

Professores e exercícios desativados permanecem nas fichas históricas e deixam de ser oferecidos em novas seleções. Edições preservam os vínculos atuais. Fichas e planos usam os indicadores de disponibilidade já existentes. O endpoint legado DELETE também desativa e não apaga mais cadastros.

A migração 002 adiciona somente arquivado_em aos cadastros de aluno, professor e exercício. É aditiva, sem apagar ou converter registros. Foi conferida primeiro em uma cópia temporária do banco remoto, aplicada no banco remoto e registrada em schema_migration. A cópia temporária foi removida.

## Componentes

As tabelas deixam o texto quebrar em linhas e organizam as ações visíveis. Em telas menores, os registros se reorganizam como cartões com rótulos, sem esconder colunas atrás de rolagem horizontal.

Todos os campos de data compartilham um calendário com mês e ano selecionáveis, navegação por teclado, limites de data, data atual e fechamento por Escape. Os campos preservam os valores ISO, validação e preenchimento por teclado. O seletor é renderizado acima dos modais quando o navegador suporta popover, com alternativa de posicionamento fixo.

O recebimento usa resumo em verde profundo, valor em lima, nome e datas visíveis. Formulários, ações e recibos usam cores explícitas para manter contraste.

## Financeiro e BI

Os indicadores de carteira são globais e ficam separados dos filtros da lista. A vencer contém apenas pendências com vencimento a partir de hoje; Em atraso contém as anteriores. Carteira pendente é a soma dessas duas parcelas, sem duplicidade. Recebido neste mês usa pagamentos confirmados pela data da confirmação, coerente com a evolução financeira.

A faixa de atraso agrupa saldos e quantidade de mensalidades em 1–7, 8–30, 31–60 e mais de 60 dias, facilitando priorizar cobranças.

No BI, caixa recebido usa confirmações dentro do período. Carteira prevista, pendente e liquidada usam o vencimento no período. A taxa de liquidação divide o valor pago pelo previsto dessa carteira, na posição atual. Essas dimensões são apresentadas separadamente; nenhuma é chamada de lucro porque não há despesas nesta visão.

## Verificação focada

`npm run test:catalog` usa banco em memória e cobre desativação/reativação, preservação de vínculos e valores, rematrícula pela interface, calendário, recebimento, os cálculos de carteira/caixa e ausência de rolagem lateral nas sete áreas em desktop, tablet e celular. Não acessa nem grava dados de clientes no banco remoto.
