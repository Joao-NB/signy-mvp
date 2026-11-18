import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const engineName = process.env.LOGIN_BROWSER || 'chromium';
const engines = { chromium, firefox, webkit };
assert.ok(engines[engineName], 'LOGIN_BROWSER deve ser chromium, firefox ou webkit.');
const channel = process.env.PLAYWRIGHT_CHANNEL || 'msedge';
const launchOptions = { headless: true };
if (engineName === 'chromium' && channel !== 'chromium') launchOptions.channel = channel;

process.env.NODE_ENV = 'test';
process.env.OPEN_ACCESS = 'false';
process.env.DATA_DIR = 'memory://';
process.env.ADMIN_PASSWORD = 'LoginDesignTeste123!';
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.MP_ACCESS_TOKEN;

const { app, db } = await import('../server.mjs');
await db.query("INSERT INTO plano(nome,descricao,valor_mensal,duracao_meses,ativo) VALUES ('Signy Essencial','Plano para começar',99.90,1,TRUE),('Signy Movimento','Rotina em movimento',129.90,3,TRUE),('Signy Evolução','Uma nova fase',159.90,12,TRUE),('Plano oculto','Não publicar',1,1,FALSE)");
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
const cspErrors = [];
let browser;

async function newContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  context.on('page', page => {
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/content[- ]security[- ]policy|violates.*style-src/i.test(message.text())) {
        cspErrors.push(message.text());
      }
    });
  });
  return context;
}

async function openLogin(page, hash = '') {
  await page.goto(origin + '/' + hash);
  await page.locator('.auth-landing #login-form').waitFor();
  assert.equal(await page.locator('#login-form').count(), 1, 'O acesso deve ter um único formulário.');
}

async function revealOnScroll(page) {
  const elements = page.locator('[data-reveal]');
  const count = await elements.count();
  assert.ok(count > 0, 'A entrada deve possuir seções animadas.');
  for (let i = 0; i < count; i++) {
    const element = elements.nth(i);
    await element.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await page.waitForFunction(el => el.classList.contains('is-visible'), await element.elementHandle());
    await page.waitForFunction(el => Number(getComputedStyle(el).opacity) >= 0.99, await element.elementHandle());
    assert.equal(await element.isVisible(), true, `Conteúdo ${i + 1} deve aparecer ao rolar.`);
  }
}

async function assertReducedMotion(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every(el => {
    const style = getComputedStyle(el);
    return Number(style.opacity) >= 0.99 && style.transform === 'none';
  }));
  const moving = await page.locator('[data-reveal]').evaluateAll(elements => elements.filter(el => {
    const style = getComputedStyle(el);
    const seconds = value => value.split(',').some(duration => parseFloat(duration) > 0.01);
    return seconds(style.transitionDuration) || (style.animationName !== 'none' && seconds(style.animationDuration));
  }).length);
  assert.equal(moving, 0, 'A preferência de movimento reduzido deve desativar animações.');
}

try {
  browser = await engines[engineName].launch(launchOptions);
  await mkdir('test-results', { recursive: true });
  const context = await newContext();
  const page = await context.newPage();
  await openLogin(page, '#financeiro');

  assert.equal(await page.locator('#register-form').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Criar conta', exact: true }).count(), 0);
  for (const target of ['recursos', 'rotina', 'acesso']) {
    const link = page.locator(`[data-scroll-to="${target}"]`).first();
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(id => {
      const box = document.getElementById(id).getBoundingClientRect();
      return box.top < innerHeight && box.bottom > 0;
    }, target);
    assert.equal(new URL(page.url()).hash, '#financeiro', 'Navegar na apresentação deve preservar o destino após login.');
    assert.equal(await page.evaluate(id => document.activeElement === (id === 'acesso' ? document.querySelector('#login-form [name=login]') : document.getElementById(id)), target), true, 'A navegação deve transferir o foco ao destino.');
  }

  assert.equal(await page.locator('.sf-management-tool').count(),3);
  assert.equal(await page.locator('.sf-plan').count(),0,'A entrada de gestão não deve oferecer matrículas a alunos.');
  assert.equal((await page.request.get(origin+'/api/public/plans')).status(),401,'Dados da academia exigem autenticação.');
  assert.equal(await page.locator('.sf-difference-image[src="/images/signy-management-hub.jpg"]').count(),1);
  assert.equal(await page.locator('.sf-carousel').count(),0);
  assert.equal(await page.locator('[data-difference]').count(),4);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>window.scrollY===0);
  const firstInput=await page.locator('#login-form [name=login]').boundingBox();
  assert.ok(firstInput.y>=0 && firstInput.y+firstInput.height<900,'Login deve estar visível na abertura desktop.');
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,300);});
  await page.waitForFunction(()=>window.scrollY===300);
  assert.equal(await page.locator('.sf-hero').evaluate(el=>getComputedStyle(el).position),'sticky');
  assert.ok(Math.abs((await page.locator('.sf-hero').boundingBox()).y-88)<3,'Abertura fica fixa durante a rolagem.');
  const storyTop=await page.locator('.sf-story').evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(storyTop<900,'A próxima seção deve vir sobre a abertura.');
  // Regression: laptop/Edge viewport heights previously disabled the sticky hero.
  for(const height of [628,700,900]){
    await page.setViewportSize({width:1365,height});
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
    await page.waitForFunction(()=>window.scrollY===0);
    const card=await page.locator('.landing-access').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight,overflow:getComputedStyle(el).overflowY}));
    assert.ok(!['auto','scroll'].includes(card.overflow),'O login não deve ter rolagem interna.');
    assert.ok(card.scroll<=card.client+1,'O formulário inteiro deve caber no cartão.');
    const submitBox=await page.locator('#login-form [type=submit]').boundingBox();
    assert.ok(submitBox.y>=0&&submitBox.y+submitBox.height<=height,'Login completo na altura '+height);
    await page.evaluate(()=>window.scrollTo(0,180));
    await page.waitForFunction(()=>window.scrollY===180);
    assert.equal(await page.locator('.sf-hero').evaluate(el=>getComputedStyle(el).position),'sticky','Fixação em janelas baixas');
    assert.ok(Math.abs((await page.locator('.sf-hero').boundingBox()).y-88)<3);
    const overlay=await page.evaluate(()=>{const top=document.querySelector('.sf-story').getBoundingClientRect().top;return !!document.elementFromPoint(100,top+30)?.closest('.sf-story');});
    assert.equal(overlay,true,'A próxima superfície sobrepõe a abertura em '+height);
  }
  async function sceneProgress(fraction){
    await page.evaluate(fraction=>{document.activeElement?.blur();const scene=document.querySelector('[data-mobile-scene]'),stage=scene.querySelector('.sf-mobile-stage'),nav=document.querySelector('.landing-header').getBoundingClientRect().height;window.scrollTo(0,scene.getBoundingClientRect().top+scrollY-nav+(scene.offsetHeight-stage.offsetHeight)*fraction);},fraction);
    await page.waitForFunction(fraction=>Math.abs(Number(document.querySelector('[data-mobile-scene]').dataset.progress)-fraction)<.02,fraction);
  }
  await page.setViewportSize({width:1365,height:628});
  const travelSpan=await page.locator('[data-mobile-scene]').evaluate(el=>el.offsetHeight-el.querySelector('.sf-mobile-stage').offsetHeight);
  assert.ok(travelSpan<360,'O celular deve chegar sem um trecho longo de scroll');
  let previous=Infinity;
  for(const fraction of [.15,.55,1]){
    await sceneProgress(fraction);
    await page.locator('.sf-real-phone').evaluate(image=>image.decode());
    await page.evaluate(()=>document.fonts.ready);
    const offset=await page.locator('.sf-real-phone').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);
    assert.ok(offset<previous,'O celular inteiro deve subir de baixo para cima');previous=offset;
    assert.equal(await page.locator('.sf-mobile-device-reveal').evaluate(el=>getComputedStyle(el).clipPath),'none','Sem máscara simulando carregamento');
    assert.ok(Math.abs((await page.locator('.sf-mobile-stage').boundingBox()).y-88)<3);
    if(engineName==='chromium')await page.screenshot({path:'test-results/mobile-scene-'+String(fraction)+'.png'});
  }
  assert.ok(previous<3,'O celular se encaixa ao concluir a subida');
  await sceneProgress(.25);
  assert.ok(await page.locator('.sf-real-phone').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)>10,'A subida acompanha também a volta do scroll');
  await sceneProgress(.8);
  await page.locator('.sf-mobile-benefit .sf-button').click();
  await page.waitForFunction(()=>window.scrollY===0);
  assert.equal(await page.locator('#login-form [name=login]').evaluate(el=>el===document.activeElement),true,'CTA mobile volta ao login com foco');
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#sf-difference-tab-2').hover();
  assert.equal(await page.locator('#sf-difference-tab-2').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-difference-image="signy-community"]').evaluate(el=>el.classList.contains('is-active')),true);
  await page.locator('#sf-difference-tab-3').focus();await page.keyboard.press('Home');
  assert.equal(await page.locator('#sf-difference-tab-0').getAttribute('aria-selected'),'true');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#sf-difference-tab-1').click();
  assert.equal(await page.locator('#sf-difference-tab-1').getAttribute('aria-selected'),'true','Diferenciais também funcionam por toque');
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#sf-tab-frequencia').click();
  assert.match(await page.locator('#sf-phone-title').innerText(),/equipe/);
  await page.locator('#sf-tab-conta').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#sf-tab-treino').getAttribute('aria-selected'),'true');
  const username = page.locator('#login-form [name=login]');
  const password = page.locator('#login-form [name=senha]');
  await username.focus();
  await page.keyboard.press('Tab');
  assert.equal(await password.evaluate(el => el === document.activeElement), true, 'Tab deve levar do usuário à senha.');
  await password.fill('Senha de conferência');
  const toggle = page.locator('#toggle-password');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  await toggle.focus();
  await page.keyboard.press('Space');
  assert.equal(await password.getAttribute('type'), 'text');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Space');
  assert.equal(await password.getAttribute('type'), 'password');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');

  await page.locator('#forgot-password').click();
  await page.locator('#recovery-form [name=identificacao]').waitFor();
  assert.equal(await page.locator('#modal').evaluate(el => el.open), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#modal').open);

  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await revealOnScroll(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Entrada: overflow na largura ${width}.`);
    const undersizedInputs = await page.locator('#login-form input').evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().width > innerWidth).length);
    assert.equal(undersizedInputs, 0, `Formulário deve caber na largura ${width}.`);
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await page.waitForFunction(() => window.scrollY === 0);
  }

  await username.fill('admin');
  await password.fill('SenhaIncorreta123!');
  await password.press('Enter');
  await page.locator('#login-form [role=alert]').getByText('Usuário ou senha incorretos.').waitFor();
  await page.waitForFunction(() => !document.querySelector('#login-form [type=submit]').disabled);
  await password.fill('LoginDesignTeste123!');
  await password.press('Enter');
  await page.getByRole('heading', { name: 'Financeiro', exact: true }).waitFor();
  for(const [key,label] of [['home','Visão geral'],['aluno','Alunos'],['matricula','Matrículas'],['presenca','Presenças'],['professor','Professores'],['ficha_treino','Fichas de treino'],['exercicio','Exercícios'],['plano','Planos'],['finance','Financeiro'],['reports','Relatórios e BI']]){
    await page.locator('.nav [data-nav="'+key+'"]').click();
    await page.waitForFunction(label=>document.querySelector('.topbar strong')?.textContent===label,label);
    await page.locator('.content .load-state[role=status]').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Gestão sem overflow: '+key);
    if(engineName==='chromium'){await page.locator('.content').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'test-results/management-'+key+'.png',fullPage:true});}
  }
  await page.locator('[data-action=logout]').click();
  await page.locator('#login-form').waitFor();
  await page.waitForFunction(() => !document.querySelector('#login-form [type=submit]').disabled);
  await revealOnScroll(page);
  await context.close();

  // Match the user's Windows/Edge setup: OS animations disabled, requested page effects enabled.
  const reduced = await newContext({ reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await openLogin(reducedPage);
  assert.equal(await reducedPage.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  assert.equal(await reducedPage.locator('.fitness-page').getAttribute('data-scroll-motion'),'full');
  await reducedPage.setViewportSize({width:1365,height:628});
  await reducedPage.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,180);});
  await reducedPage.waitForFunction(()=>window.scrollY===180);
  assert.equal(await reducedPage.locator('.sf-hero').evaluate(el=>getComputedStyle(el).position),'sticky','Efeito pedido funciona com animações do Windows desligadas');
  assert.ok(Math.abs((await reducedPage.locator('.sf-hero').boundingBox()).y-88)<3);
  await reducedPage.evaluate(()=>{const s=document.querySelector('[data-mobile-scene]'),stage=s.querySelector('.sf-mobile-stage');window.scrollTo(0,s.getBoundingClientRect().top+scrollY-89+(s.offsetHeight-stage.offsetHeight)*.6);});
  await reducedPage.waitForFunction(()=>Number(document.querySelector('[data-mobile-scene]').dataset.progress)>.5&&Number(document.querySelector('[data-mobile-scene]').dataset.progress)<.7);
  assert.equal(await reducedPage.locator('.sf-mobile-device-reveal').evaluate(el=>getComputedStyle(el).clipPath),'none');
  assert.ok(await reducedPage.locator('.sf-real-phone').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)>0,'Celular se desloca mesmo com a preferência do Windows reduzida');
  await reducedPage.locator('#sf-motion-toggle').click();
  await assertReducedMotion(reducedPage);
  await reducedPage.waitForFunction(()=>document.querySelector('[data-mobile-scene]').dataset.progress==='1.000');
  assert.equal(await reducedPage.locator('.sf-mobile-device-reveal').evaluate(el=>getComputedStyle(el).clipPath),'none');
  assert.equal(await reducedPage.locator('.sf-mobile-stage').evaluate(el=>getComputedStyle(el).position),'relative');
  await reducedPage.reload();await reducedPage.locator('#login-form').waitFor();
  assert.equal(await reducedPage.locator('.fitness-page').getAttribute('data-scroll-motion'),'reduced','Escolha da página permanece após recarregar');
  await reducedPage.locator('#sf-motion-toggle').click();
  assert.equal(await reducedPage.locator('.fitness-page').getAttribute('data-scroll-motion'),'full');
  await reduced.close();

  const dynamic = await newContext({ reducedMotion: 'no-preference' });
  const dynamicPage = await dynamic.newPage();
  await openLogin(dynamicPage);
  await dynamicPage.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await dynamicPage.locator('.fitness-page').getAttribute('data-scroll-motion'),'full','Preferência explícita da página não muda com o Windows');
  assert.ok(await dynamicPage.locator('[data-reveal]').first().evaluate(el=>getComputedStyle(el).transitionDuration.split(',').some(value=>parseFloat(value)>0)),'Entradas animadas continuam ativas na preferência explícita da página');
  await revealOnScroll(dynamicPage);
  await dynamic.close();

  const fallback = await newContext();
  await fallback.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { value: undefined, writable: true, configurable: true });
  });
  const fallbackPage = await fallback.newPage();
  await openLogin(fallbackPage);
  assert.equal(await fallbackPage.evaluate(() => typeof IntersectionObserver), 'undefined');
  await revealOnScroll(fallbackPage);
  await fallback.close();

  assert.deepEqual(errors, [], 'A entrada não deve produzir erros JavaScript.');
  assert.deepEqual(cspErrors, [], 'A apresentação deve respeitar a Content Security Policy.');

  // Keep screenshot instrumentation separate from the functional CSP checks.
  // Playwright's WebKit capture helper inserts <style>body {}</style> to sync
  // animations, which the application's strict policy correctly rejects.
  const capture = await browser.newContext();
  const capturePage = await capture.newPage();
  capturePage.on('pageerror', error => errors.push(error.message));
  await openLogin(capturePage);
  await capturePage.locator('.sf-hero-photo').evaluate(image => image.decode());
  for (const width of [1440, 390]) {
    await capturePage.setViewportSize({ width, height: 900 });
    await revealOnScroll(capturePage);
    await capturePage.evaluate(() => window.scrollTo(0, 0));
    await capturePage.waitForFunction(() => window.scrollY === 0);
    await capturePage.screenshot({ path: `test-results/login-design-${engineName}-${width}.png`, fullPage: true });
    if (width === 1440) await capturePage.screenshot({ path: `test-results/login-design-${engineName}-hero.png` });
  }
  await capture.close();
  assert.deepEqual(errors, [], 'As capturas não devem introduzir erros JavaScript.');
  console.log(`Entrada moderna (${engineName}${launchOptions.channel ? `/${launchOptions.channel}` : ''}): login, teclado, recuperação, logout, cinco larguras, scroll, fallback e movimento reduzido OK.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
