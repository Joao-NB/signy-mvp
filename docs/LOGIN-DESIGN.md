# Página de entrada do Signy

> A composição visual abaixo foi substituída em 18/11/2026 pela experiência [Signy em movimento](SIGNY-FITNESS.md), baseada no vídeo da Smart Fit. As instruções de seleção de navegador permanecem válidas.

A entrada reúne acesso à conta, apresentação do produto, prévia ilustrativa do painel, recursos e uma sequência da rotina da academia. Mantém a identidade verde e lima do Signy, com tipografia ampla, painéis suaves e navegação fixa. Os números e avatares da prévia são exemplos estáticos identificados como ilustrativos; a página pública não consulta dados da academia.

Referências consultadas: [Canva](https://www.canva.com/) para hierarquia e apresentação visual, [Linear](https://linear.app/) para demonstração do produto e [Awwwards — Scrolling](https://www.awwwards.com/websites/scrolling/) para ritmo entre seções. O resultado usa os componentes e a marca do Signy.

## Movimento e compatibilidade

As seções entram com transições de opacidade e deslocamento, acionadas por `IntersectionObserver`. Sem essa API, eventos de rolagem e redimensionamento verificam os elementos visíveis usando `requestAnimationFrame`. Não há dependência de CSS scroll timelines, bibliotecas ou fontes externas. O gráfico ilustrativo usa regras do arquivo CSS para respeitar a política de segurança existente.

A preferência `prefers-reduced-motion` desativa os movimentos, inclusive quando alterada durante o uso. Conteúdo é visível por padrão; somente elementos com o mecanismo de animação inicializado são ocultados temporariamente. A navegação por teclado revela o elemento focado. Observadores e eventos são removidos ao autenticar, inclusive depois de ativar uma conta por convite.

Links das seções preservam os destinos `#financeiro`, `#convite=` e `#recuperacao=`. Há um único formulário de login, com recuperação existente, exibição opcional de senha e preenchimento automático. O novo CSS é limitado à página pública.

## Verificação local

```powershell
npm.cmd run test:login
```

No Windows, o padrão é o Edge instalado. Para Chrome:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
npm.cmd run test:login
```

Para Firefox e WebKit, instale os navegadores de teste e selecione o motor:

```powershell
npx.cmd playwright install firefox webkit
$env:LOGIN_BROWSER='firefox' # ou 'webkit'
npm.cmd run test:login
```

Para Chromium do Playwright, use `PLAYWRIGHT_CHANNEL=chromium` após instalá-lo. A suíte usa banco isolado em memória e cobre login, erro de senha, teclado, recuperação, logout, destino financeiro, cinco larguras (320, 390, 768, 1440 e 1920), animações, gráfico, política de segurança, alternativa sem IntersectionObserver e movimento reduzido. Gera capturas em `test-results/`.

WebKit no Playwright verifica o motor usado pelo Safari; não substitui uma verificação em aparelhos Apple físicos. Navegadores antigos sem suporte ao JavaScript já utilizado na aplicação permanecem fora da matriz.

## Abrir a aplicação

```powershell
npm.cmd start
```

Acesse [localhost:3000](http://localhost:3000). O comando preserva a configuração existente de `.env`; se ela aponta para o Neon, a instância local utiliza esse mesmo banco. O redesign não exige migração de banco.
