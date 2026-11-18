# Signy: identidade da gestão

A entrada e a interface interna compartilham a marca Signy, verde profundo, lima, painéis claros e controles arredondados. O conteúdo público fala com gestores, recepcionistas e responsáveis pela operação da academia. Não é uma oferta de matrícula para alunos.

## Acesso e informações

Há um único formulário de login na abertura da página, com campos, recuperação e exibição de senha existentes. O botão de acesso do cabeçalho volta diretamente a ele, inclusive após a rolagem da seção fixa. A navegação preserva os hashes de convite, recuperação e financeiro. Os perfis e as permissões existentes, inclusive a área do aluno, continuam funcionando.

A vitrine pública de mensalidades foi substituída por uma apresentação das ferramentas de recepção, treinamento e gestão. O endpoint público do catálogo de planos foi retirado: alunos, matrículas, planos e financeiro continuam nas rotas autenticadas. Nenhum registro foi excluído e nenhuma migração é necessária.

## Rolagem e movimento

Em computadores com espaço suficiente (mais de 760px de largura e pelo menos 500px de altura), a abertura fica fixa abaixo do cabeçalho. O bloco seguinte, opaco e com cantos superiores arredondados, passa por cima dela durante a rolagem nativa. Não há interceptação da roda do mouse ou simulação de rolagem.

Em telas de até 760px de largura ou menos de 500px de altura, a abertura volta ao fluxo normal para preservar acesso a todos os campos. Nas janelas de computador entre 500 e 800px de altura, o formulário fica compacto e mantém a seção fixa. A opção de movimento reduzido também desativa a fixação. O formulário é apresentado antes do conteúdo de divulgação.

Fotografias têm entrada própria por opacidade, deslocamento e recorte. Cartões, listas e transições entre telas recebem movimentos curtos. O mecanismo usa IntersectionObserver com alternativa por rolagem e requestAnimationFrame. Sem animação inicializada, o conteúdo permanece visível. Eventos e observadores da entrada são removidos ao autenticar ou reapresentar o login. Nenhuma informação pessoal é incluída nas prévias ilustrativas.

## Identidade interna

O arquivo public/management.css atualiza painel, alunos, matrículas, presenças, professores, fichas, exercícios, planos, financeiro, relatórios, modais e formulários. A estrutura de controles, identificadores, eventos e chamadas de API desses módulos é preservada. Tabelas continuam se adaptando a cartões no celular; menus Mais, paginação, filtros e atalhos mantêm suas funções. A variante clara da logo está em public/signy-motion-light.svg.

## Nova fotografia

Imagem original gerada com a ferramenta integrada de imagens e salva em public/images/signy-management.jpg (cópia JPEG otimizada). A foto aparece no carrossel e na abertura. O original permanece na pasta generated_images do Codex. É uma imagem conceitual, não um registro de uma unidade física.

Prompt: “Original premium editorial photograph for Brazilian gym management software brand Signy. Landscape 3:2. Two Brazilian gym managers, professional woman age 35 and man age 40, both in elegant deep forest green polo shirts, confidently reviewing the daily operations together at a modern reception desk in a real upscale gym. Woman on the RIGHT using a slim laptop, man standing beside looking at screen, authentic warm interaction, gym equipment visible in soft background, natural window light, dark green architectural details with restrained lime accents, clean spacious composition with some negative space left. Sophisticated authentic business photography, healthy approachable people, realistic anatomy and skin, no fitness posing, no words, no logos, no watermark. Suitable both for portrait crops in a website carousel and full landscape use. Laptop screen angled away, no readable data.”

## Verificar e executar

- npm.cmd run test:login: login na abertura, fixação e sobreposição, carrossel, imagens, abas, movimento reduzido, alternativa sem IntersectionObserver, cinco larguras e navegação nas dez áreas internas.
- npm.cmd run test:browser: suíte existente de cadastros, alterações, filtros, matrículas, presenças, perfis, financeiro, recibos, convites, recuperação e interface móvel.
- npm.cmd run lint e npm.cmd run build: validação de sintaxe e pacote.
- npm.cmd start: aplicação local em http://localhost:3000 com a configuração existente.

A suíte de entrada aceita LOGIN_BROWSER=firefox ou webkit, e PLAYWRIGHT_CHANNEL=chrome para Chrome. O padrão Windows é Edge. WebKit verifica o motor do Safari; não substitui testes em aparelhos Apple físicos. Os testes usam bancos isolados.


## Correção da rolagem no Edge e cena mobile

A regra anterior desativava a fixação abaixo de 760px de altura. Isso impedia o efeito em muitas janelas de notebook e na dimensão da referência enviada. A correção foi verificada em 1365px de largura com alturas de 628, 700 e 900px: o topo da abertura continua no mesmo lugar e a superfície seguinte sobe por cima dela.

A nova seção “Sua academia inteira. Na palma da sua mão.” tem fundo lima, mensagem sobreposta ao aparelho e uma prévia HTML do painel de gestão. O dispositivo é revelado de cima para baixo por uma máscara cujo avanço depende diretamente da posição da página. Ao rolar para cima, a máscara reverte. O efeito usa requestAnimationFrame e propriedades CSS comuns, sem depender de CSS scroll timelines e sem interceptar a roda do mouse. A mensagem convida o gestor a consultar alunos, acompanhar o financeiro e organizar a equipe no navegador do celular; o botão volta ao login existente.

Com movimento reduzido, a seção fica estática e o aparelho aparece inteiro dentro da composição. O teste verifica avanço e reversão da máscara, fixação em janelas baixas, sobreposição, CTA com foco no login e comportamento reduzido. Os números do aparelho são demonstrativos e a seção é identificada como prévia ilustrativa.


## Diagnóstico no computador do usuário: animações do Windows desativadas

Foi confirmado por Windows.UI.ViewManagement.UISettings (PowerShell do Windows) que AnimationsEnabled é False. Assim, o Edge sinalizava prefers-reduced-motion: reduce. A implementação anterior desativava a fixação e a cena mobile nesse caso; os testes anteriores verificavam principalmente no-preference. O novo teste reproduz explicitamente reduce, com as dimensões de janela do usuário.

Como o usuário solicitou expressamente esses efeitos, o Signy oferece uma preferência própria para os movimentos da página: “Efeitos de rolagem: ligados/reduzidos”, no rodapé. A escolha inicial da página é ligada e pode ser reduzida pelo botão, com persistência local. Essa preferência controla apenas a apresentação pública; não altera nenhuma configuração do Windows e as animações internas continuam seguindo as regras existentes. Não há rolagem automática ou interceptação da roda do mouse.

Os arquivos públicos de movimento foram versionados para substituir as referências antigas no recarregamento da página. A regressão verifica que o sistema pode sinalizar reduce e a opção explícita da página continuar ligada, que o modo reduzido da página pode ser selecionado e que a escolha persiste após recarregar.

## Mockup realista e tipografia

O novo mockup em public/images/signy-phone-real.webp foi gerado pela ferramenta integrada de imagens a partir de uma captura real da interface mobile. A captura foi feita em banco descartável em memória, com 24 alunos e 12 presenças fictícios; nenhum dado de produção foi usado. O PNG original foi preservado na pasta generated_images do Codex. A cópia WebP preserva transparência. A tela é identificada na seção como demonstrativa.

Prompt usado: “Create a premium photorealistic 3D product photograph of ONE complete modern smartphone on a fully transparent background, using the attached screenshot as the EXACT content of its screen. Reference role: the attached image is the real Signy gym management web app screen to insert, not an image to redraw as a flat poster. Preserve the Signy logo and its Portuguese dashboard interface, cream background, forest-green sidebar/header, lime highlights, actual card layout and numbers 12 and 24. The phone must look like a real premium dark titanium smartphone with rounded polished metal edges, realistic glass, restrained studio reflections, slim bezels, side buttons, small centered camera island. Device in portrait orientation, three-quarter perspective with visible LEFT metal edge, tilted about 12 degrees counterclockwise as an elegant fitness software campaign mockup. Keep the complete phone inside the canvas including all corners, generous transparent margins, phone occupies 80 percent of image height. Strong dimensional quality, crisp screen surface readable at large size, neutral studio light, premium advertising product render. NO background, NO hands, NO extra objects, NO text outside the phone, NO Smart Fit logo, NO Apple logo, NO Android logo, NO watermark. Do not invent other screen content. Output high resolution portrait transparent PNG suitable for layering behind a large HTML headline.”

A fonte da mensagem é Plus Jakarta Sans, armazenada localmente em public/fonts/plus-jakarta-sans.ttf. A licença SIL Open Font License está no arquivo plus-jakarta-sans-OFL.txt do mesmo diretório. Origem: https://github.com/google/fonts/tree/main/ofl/plusjakartasans . A fonte e o mockup não dependem de serviços externos durante o uso.


## Celular subindo inteiro e diferenciais por interação

A cena mobile passou a deslocar a imagem inteira de baixo para cima. A máscara de recorte foi removida: não há simulação de carregamento. O percurso dedicado caiu para cerca de 270px na janela de 1365×628, com uma curva de chegada curta e reversível. A posição acompanha o scroll com interpolação breve, limitada a cerca de poucos quadros, e o ciclo de animação para quando o aparelho alcança o destino.

Medidas de geometria ficam em cache e são recalculadas no redimensionamento, carregamento relevante ou mudança de tamanho. Os quadros de movimento usam transformações de composição, sem consultar repetidamente a geometria da cena. A barra de progresso da página também usa uma medida armazenada. O segundo bloco digital segue o fluxo normal e mantém suas abas manuais, evitando outro intervalo longo de fixação.

O carrossel foi substituído por uma composição editorial com fotografia de fundo, títulos em Plus Jakarta Sans e quatro diferenciais reais do Signy. Hover, foco de teclado e toque trocam o conteúdo e a fotografia com transições de opacidade e deslocamento leve. Os botões permanecem com dimensões estáveis para evitar saltos no layout; a composição se reorganiza verticalmente no celular. Nenhuma função autenticada foi modificada.

A regressão confere que o deslocamento vertical do celular diminui ao descer a página, que o recorte permanece desativado, que o percurso é curto, que o retorno do scroll também funciona e que diferenciais respondem a mouse, teclado e toque.


## Fundo exclusivo dos diferenciais e ajuste fino da rolagem

O fundo inicial da segunda seção usa agora public/images/signy-management-hub.jpg, uma nova fotografia original gerada pela ferramenta integrada de imagens. A composição tem espaço escuro e limpo à esquerda para os títulos, equipe de gestão à direita e detalhes em verde profundo e lima. A imagem anterior da abertura foi mantida. As trocas por hover continuam funcionando com as imagens já existentes.

Prompt: “Create an original premium photorealistic WEBSITE BACKGROUND photograph for SIGNY, a Brazilian gym management software platform. Very wide landscape 16:9. Contemporary sophisticated gym reception and management workspace. The RIGHT HALF shows a confident Brazilian woman gym manager around age 35 in a deep forest-green polo and a friendly Brazilian male operations colleague age 40 reviewing a laptop and tablet together at a beautiful charcoal reception counter. Real gym equipment and refined lime-green architectural light accents softly visible behind them, warm natural window light balanced with dark forest-green shadows, authentic professional interaction and realistic human anatomy. The LEFT HALF must be calm, dark, uncluttered NEGATIVE SPACE with atmospheric forest-green wall and subtle architectural texture, suitable for large white and lime headline overlay. Overall palette: deep green #102c21 and #173f2d, charcoal, restrained warm neutrals and subtle lime #d5fa62 details. Rich premium editorial business photography, cinematic but natural, realistic skin and materials, tasteful soft depth of field, sophisticated SaaS fitness brand mood. No athletes posing, no yellow branding, no logos, no lettering, no readable screen text, no watermarks. Camera at eye level, environment spacious, both people clearly situated on the right with faces intact. This is a background for a section about managing students, enrollment, staff and finances.”

O percurso do celular aumentou somente 32px: cerca de 300px na janela desktop usada na verificação, em vez de 268px. A direção, a curva de chegada e as otimizações permanecem iguais.


## Área autenticada, entrada e navegação persistente

Todas as abas usam a tipografia local Plus Jakarta Sans, cabeçalhos em verde profundo, ações principais em lima, cartões e tabelas coerentes com a apresentação. A identidade também alcança modais, finanças, relatórios e o portal de aluno, preservando as funções e os controles de permissão.

O formulário público não cria mais uma área de rolagem interna. O cartão cresce com seu conteúdo; em janelas pequenas ou com texto ampliado a abertura segue a rolagem normal para manter os campos acessíveis. Nas alturas em que o formulário cabe, a sobreposição aprovada continua funcionando.

Login e retomada de sessão podem trazer o resumo inicial junto da identidade validada. A tela inicial usa uma requisição em vez de duas e não busca o catálogo completo. O resumo só é calculado após validar a conta e sua permissão; alunos e visitantes não recebem dados de gestão. As APIs legadas e o fluxo de recuperação de falha continuam disponíveis, sem cache de dados autenticados no service worker.

A estrutura da área de trabalho permanece montada ao trocar abas e atualizar os dados. Só o conteúdo, o título e a seleção do menu são atualizados. Isso evita reconstruir a navegação e mantém a posição de rolagem do menu lateral, inclusive após os carregamentos assíncronos de Financeiro e Relatórios. A seleção mantém aria-current e os controles mobile continuam disponíveis.

Regressões cobrem o menu realmente rolado em uma janela baixa, abertura das abas inferiores, entrada e retomada sem uma segunda consulta ao resumo, catálogo sob demanda, isolamento de alunos e formulário sem rolagem interna.
