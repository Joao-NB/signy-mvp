# Signy em movimento

> Esta primeira composição foi evoluída para o público de gerência. Consulte [Identidade da gestão](MANAGEMENT-DESIGN.md). A vitrine pública de planos foi retirada; os dados permanecem no acesso autenticado.

Reformulação da entrada inspirada na sequência visual do vídeo enviado em 18/11/2026 e na [página da Smart Fit](https://www.smartfit.com.br/): cabeçalho fixo, destaque fotográfico, carrossel horizontal, planos, seção escura com conteúdo acompanhado pela rolagem e encerramento com marca ampliada. Marca, cores, fotografias e textos são próprios do Signy.

## Interação

O carrossel usa rolagem horizontal nativa com snap, setas e teclado. Não avança sozinho. A seção digital fixa seu conteúdo no desktop enquanto a rolagem alterna treino, frequência e conta. Também pode ser controlada por abas com teclado; no celular a interação é manual e o conteúdo segue a rolagem normal. Movimento reduzido remove as transições e a fixação prolongada. O mecanismo de entrada das seções preserva a alternativa sem IntersectionObserver.

O formulário existente está na seção de acesso. Todos os links internos preservam convites, recuperação e o destino financeiro. A autenticação e as permissões internas continuam existentes.

## Planos

`GET /api/public/plans` publica somente identificador, nome, descrição, valor mensal e duração dos planos ativos, limitado a 30 opções. Não retorna alunos, matrículas, pagamentos ou contas. Usa os valores cadastrados, sem preços ou benefícios inventados. Não cria matrícula: a contratação continua com a recepção. Há estados de carregamento, ausência de planos e erro com nova tentativa. Não exige migração de banco.

## Imagens originais

Geradas com a ferramenta integrada de imagens; originais preservados na pasta de imagens geradas do Codex. Cópias JPEG otimizadas utilizadas no projeto:

- `public/images/signy-campaign.jpg`: campanha com dois atletas, espaço escuro à esquerda para o título.
- `public/images/signy-community.jpg`: treinamento em grupo com professor.
- `public/signy-motion.svg`: logo vetorial criada no código para a nova entrada.

Prompt da campanha: “Create one premium photorealistic fitness brand campaign photograph for an original Brazilian brand SIGNY, landscape wide 16:9. Real athletic Brazilian woman age 28 wearing deep forest green sports bra and black leggings, and athletic Brazilian man age 30 in charcoal training tshirt, candid confident relaxed between sets in a sophisticated real gym with dark equipment, huge windows, natural late afternoon sunlight, subtle vivid lime green reflected accents. Subjects positioned in the RIGHT HALF, LEFT HALF dark clean negative space for headline overlay. Editorial sports photography, cinematic authentic skin texture, premium lifestyle campaign, energetic welcoming atmosphere, full torso, no cropped heads, no text, no logos, no watermark. Output intended as full width website hero photograph.”

Prompt da comunidade: “Premium editorial sports photograph for Brazilian gym brand SIGNY, landscape 3:2 composition. Four diverse Brazilian adults aged 25 to 45 training together in a spacious contemporary fitness studio, one woman doing dumbbell squat in foreground, friendly male trainer in forest green shirt assisting, other two adults doing functional exercises behind. Natural candid energetic atmosphere, high end equipment, daylight mixed with warm indoor light, forest green and subtle lime accents, realistic skin textures and anatomy, strong photographic composition, sophisticated and authentic, no lettering no logos no watermarks.”

As imagens são conceituais e não documentam uma unidade física. A prévia do celular é identificada como ilustrativa e não consulta dados pessoais.

## Executar e verificar

`npm.cmd start` inicia em http://localhost:3000 com a configuração existente. `npm.cmd run test:login` verifica a entrada, catálogo público, carrossel, abas, login, recuperação, cinco larguras, fallback de animação e movimento reduzido. As opções de seleção de navegador estão em [LOGIN-DESIGN.md](LOGIN-DESIGN.md). WebKit testa o motor do Safari; aparelhos Apple físicos não foram utilizados.
