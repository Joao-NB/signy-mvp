# Signy — identidade e evolução da experiência

## Direção visual

A marca parte de uma assinatura angular: um S em movimento e uma marca de progressão. Grafite oliva (`#232920`), papel quente (`#f4f4ec`) e lima (`#d7ee8c`) formam a base. Lima identifica a seção atual e o principal número da recepção. Não é uma cor de alerta.

Texto corrido usa fontes do sistema, sem dependências externas. Títulos têm peso e espaçamento compacto; números usam alinhamento tabular. Bordas discretas, cantos de 6 px e ausência de sombras nos painéis preservam a leitura de uma ferramenta de trabalho. As variantes clara, escura, favicon e imagem de compartilhamento usam o mesmo símbolo.

`public/style.css` mantém a estrutura dos componentes existentes. `public/identity.css` centraliza a nova identidade, os tokens e as adaptações responsivas. Novos módulos devem reutilizar essas variáveis e componentes, sem criar paletas independentes.

## Navegação e ações

- **Recepção:** visão geral, alunos, matrículas e presenças.
- **Treinamento:** fichas, exercícios e professores.
- **Gestão:** planos; acessos da equipe junto à conta.
- **Conta:** identidade, configurações e saída no rodapé do menu. No celular, o botão Menu abre essas mesmas opções.

`navigationGroups` em `public/app.js` define os grupos. Adicionar módulos exige registrar uma seção e seu grupo, mantendo o mesmo shell. Módulos ainda não disponíveis não aparecem como botões inativos no produto.

Uma ação principal por contexto: registrar presença no painel; criar um registro nas listagens; salvar no formulário. Editar e consultar são ações secundárias. Exclusões ficam em **Mais** e exigem confirmação com nome, consequência e possibilidade de reversão. Cancelamento de matrícula preserva o histórico, mas é irreversível; desativação de plano preserva as matrículas e pode ser revertida. O sistema não possui desativação de aluno: sua situação deriva da matrícula vigente.

Campos obrigatórios ficam visíveis. Contato e informações opcionais ficam em uma seção expansível; na edição ela abre preenchida. A orientação de primeiros passos é recolhível e desaparece quando os cadastros essenciais estão completos. Históricos de alunos são consultados sob demanda dentro de detalhes.

## Entrada e estados

`GET /api/bootstrap` resolve configuração inicial, demonstração e sessão em uma requisição. Depois do login, o shell aparece imediatamente e `GET /api/overview` traz apenas os indicadores, sete dias de frequência, cinco alunos recentes e alunos disponíveis para entrada. Catálogo, fichas e históricos completos são carregados por `/api/data` somente ao abrir uma área ou ação que os utiliza. Requisições simultâneas desses dados compartilham uma promessa.

O painel não depende do download de todos os exercícios ou históricos. Após alterações, os dados usados são atualizados. Falhas de conexão têm mensagem e nova tentativa; timeout de 20 segundos evita espera indefinida. Encerrar a sessão invalida respostas pendentes e limpa os dados locais.

Componentes devem contemplar carregamento, vazio, sucesso, erro e indisponibilidade. Valores desconhecidos não devem aparecer como zero. Mensagens de erro de formulário permanecem junto aos campos; confirmações de sucesso usam a região de status. Não usar notificações transitórias como única indicação de falha de carregamento.

## Financeiro — arquitetura prevista, integração futura

Adicionar um grupo **Financeiro**, inicialmente com Mensalidades. Na lista, apresentar nesta ordem: aluno, competência, valor devido, vencimento, situação e ação contextual. Filtros de período e situação ficam junto à busca; comprovantes e histórico ficam nos detalhes.

| Situação | Rótulo e ação | Comportamento previsto |
| --- | --- | --- |
| Pendente | Pendente · Ver cobrança | Mostrar valor, vencimento e formas disponíveis |
| Em atraso | Em atraso · Ver cobrança | Informar dias de atraso com texto, além da cor |
| Pago | Pago · Ver recibo | Exibir pagamento confirmado, data e comprovante |
| Cancelado | Cancelado · Ver histórico | Preservar motivo e trilha de auditoria |

Fluxo: mensalidade → detalhes → escolher PIX ou cartão → aguardar confirmação → pagamento confirmado → recibo. PIX precisa exibir código copiável, QR, prazo e atualização de situação. Cartão deve usar a página ou componentes seguros do provedor. Nunca salvar dados brutos de cartão no Signy. Cancelamento, estorno e falhas precisam de estados distintos; abrir uma página de pagamento não significa que a cobrança foi paga.

Modelo previsto: `mensalidade` vinculada à matrícula (competência, valor contratado, vencimento e situação), `pagamento` vinculado à mensalidade (provedor, identificador externo, meio, valor, situação e confirmação) e `evento_financeiro` para histórico e processamento idempotente dos webhooks. Contratar um plano não comprova pagamento. Alterações no valor do plano não devem reescrever cobranças históricas.

No painel, introduzir apenas um resumo de valores recebidos e em atraso, com período e link para detalhes, quando houver dados financeiros reais. **Gateway, cobranças, recibos e essas tabelas ainda não estão implementados.** A escolha do provedor, credenciais, política de cobrança e conciliação fazem parte dessa etapa futura.

## Área do aluno — arquitetura prevista

Shell próprio para celular com a mesma marca, tokens e componentes. Navegação inferior de três destinos: **Meu treino**, **Frequência** e **Perfil**. Não exibir o menu administrativo. O primeiro acesso abre a ficha ativa, com professor, nome do treino e exercícios ordenados.

Cada exercício apresenta nome, séries × repetições e carga. Execução, descanso, observações e vídeo ficam em uma expansão. Vídeos devem ser carregados após toque, com legenda/descrição, sem autoplay. A frequência mostra registros e período; ausência de registros não equivale a ausência de matrícula.

Antes de disponibilizar o portal: criar identidade e autorização de aluno no servidor, vinculadas a `id_aluno`; endpoints limitados à própria ficha e frequência; campo de vídeo validado no catálogo. Não expor `/api/data` ao aluno nem confiar em filtros no navegador. Uma PWA futura pode guardar o shell e o treino autorizado para consulta, com indicação de atualização; não registrar presença offline como se tivesse sido confirmada.

## Relatórios e BI — arquitetura prevista

Adicionar **Relatórios**, separado das ações diárias. O padrão é resumo → indicador → registros relacionados. Mostrar um período explícito e poucos indicadores por vez.

| Indicador | Definição e fonte necessária |
| --- | --- |
| Alunos ativos | Alunos distintos com matrícula ativa e data atual dentro da vigência; disponível hoje |
| Evolução de matrículas | Novas matrículas por período, distinguindo pessoas únicas e renovações |
| Frequência | Entradas por dia/período, com consulta aos registros; últimos sete dias disponíveis hoje |
| Horário de maior entrada | Agrupamento de `hora_entrada`, sem chamar isso de ocupação simultânea |
| Retenção | Coortes e regra de renovação definidas, com denominador e janela explícitos |
| Tempo de permanência | Exige saída registrada; não inferir duração pela hora de entrada |
| Inadimplência e evolução financeira | Dependem das mensalidades e pagamentos confirmados, ainda futuros |

Não misturar receita contratada, cobrada e recebida. Cada gráfico deve informar período, unidade, fonte e alternativa textual. Comparações percentuais sem base anterior devem dizer “sem comparação”. Aplicar os mesmos estados vazios e de erro do painel.

## Critérios de continuidade

- Toque de pelo menos 44 px nas ações mobile; foco visível e navegação por teclado.
- Uma confirmação destrutiva sempre identifica o objeto e explica a consequência.
- Formulários mantêm dados e exibem erro quando a requisição falha.
- Estados financeiros usam rótulo além de cor; nenhum gráfico inventa dados.
- Novos módulos carregam seu próprio resumo antes dos detalhes e históricos.
- Validar tanto banco vazio quanto operação preenchida, telas de 390 px e desktop.
- Testar autorização no servidor antes de abrir qualquer experiência do aluno.
