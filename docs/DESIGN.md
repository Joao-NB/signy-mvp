# Signy · Componentes e experiência

A marca usa lettering angular SIGNY e o subtítulo Gestão de Academias, com grafite oliva, papel quente e lima. As variantes em `public/logo.svg` e `logo-light.svg`, o favicon e os Ícones derivam do mesmo desenho vetorial. O login não contém a composição anterior S+ ou SIGNY / CENTRAL DA ACADEMIA.

`identity.css` define estrutura e tokens; `platform.css` acrescenta escala de espaçamento, scrollbar, sessão persistente, financeiro, relatórios e área do aluno. Superfícies têm bordas discretas e cantos de 6 px. Lima indica ação/contexto; alertas também usam rótulos, nunca apenas cor. Foco de teclado é visível, alvos têm ao menos 42–44 px e animações respeitam redução de movimento.

O shell administrativo agrupa Recepção, Treinamento, Gestão, Financeiro e Relatórios e BI. O menu mostra os destinos autorizados. Conta, equipe e saída ficam na barra superior direita, que permanece visível durante a rolagem. No celular, o menu abre os mesmos grupos. O shell do aluno tem três destinos na navegação inferior: Meu treino, Frequência e Perfil.

Cada tela tem uma ação principal. Exclusões/cancelamentos ficam nas ações secundárias, com nome e consequência na confirmação. Contato opcional, históricos, instruções dos exercícios e detalhamento de BI são expansíveis. Tabelas viram cards com rótulos no celular; listas administrativas renderizam 30 registros por página. Financeiro usa paginação no servidor.

Toda operação apresenta carregamento, resultado ou erro. Falhas de carregamento têm nova tentativa; falhas de formulário permanecem junto aos campos. O logout limpa dados e fecha modais imediatamente, bloqueando um novo login até a invalidação da sessão. Respostas antigas não devem reabrir dados de uma sessão encerrada.

Mensalidades guardam o valor contratado e possuem histórico próprio. Abrir checkout não comprova pagamento. PIX e cartão são processados na página segura do provedor. Recibos são exibidos após confirmação; estorno e cancelamento preservam o histórico.

O PWA guarda apenas arquivos públicos. Treinos, frequência, dados pessoais e APIs não são armazenados pelo service worker. A tela sem conexão orienta a retomar quando a rede voltar. Vídeos carregam no endereço externo somente depois de uma ação do aluno.
