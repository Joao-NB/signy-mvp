function auth(mode='login') {
 const registering=mode==='register';
 user=null;section='home';filter={q:'',status:'',from:'',to:''};
 $('#app').innerHTML=`<div class="login auth-page"><section class="login-intro"><div class="brand"><span class="brandmark">s</span>signy<span>®</span></div><div class="auth-story"><span class="eyebrow">Mais movimento. Menos burocracia.</span><h1>Sua equipe.<br>Seu ritmo.<br>Tudo no Signy.</h1><p>Um lugar para cuidar dos alunos, organizar os treinos e acompanhar cada conquista.</p><div class="auth-benefits"><span>${icon('users')} Pessoas conectadas</span><span>${icon('dumbbell')} Rotina organizada</span><span>${icon('check')} Mais tempo para cuidar</span></div></div><span class="auth-signature">Gestão leve. Academia em movimento.</span></section><section class="login-main"><div class="auth-card"><nav class="auth-tabs" aria-label="Acesso à academia"><button type="button" data-auth="login" ${!registering?'aria-current="page"':''}>Entrar</button><button type="button" data-auth="register" ${registering?'aria-current="page"':''}>Criar conta</button></nav><form class="login-form" id="${registering?'register':'login'}-form"><span class="eyebrow">${registering?'Comece por aqui':'Bem-vindo de volta'}</span><h2>${registering?'Faça parte da equipe.':'Bom ter você por aqui.'}</h2><p>${registering?'Crie seu acesso ao Signy em poucos passos.':'Entre para acompanhar o dia a dia da sua academia.'}</p>${registering?`<ol class="auth-steps" aria-label="Etapas do cadastro"><li class="current">1 <span>Seus dados</span></li><li>2 <span>Sua senha</span></li></ol><div id="register-details">${field('Seu nome','nome','text','',true,'minlength="2" maxlength="150" autocomplete="name" placeholder="Como podemos chamar você?"')}${field('Nome de usuário','login','text','',true,'minlength="3" maxlength="100" pattern="[a-zA-Z0-9._\\-]+" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Ex.: ana.silva" aria-describedby="register-login-hint"')}<small id="register-login-hint" class="auth-hint">Use letras sem acento, números, ponto, hífen ou sublinhado.</small></div><div id="register-security" hidden>${field('Senha','senha','password','',false,'minlength="10" maxlength="72" autocomplete="new-password" placeholder="Crie uma senha" aria-describedby="register-password-hint" disabled')}${field('Confirmar senha','confirmacao','password','',false,'minlength="10" maxlength="72" autocomplete="new-password" placeholder="Repita sua senha" disabled')}<button type="button" class="auth-show" aria-pressed="false">Mostrar senhas</button><small id="register-password-hint" class="auth-hint">Use pelo menos 10 caracteres. A senha diferencia maiúsculas e minúsculas.</small><div class="notice">${icon('lock')}<span id="registration-access-note">Seu acesso será vinculado à equipe da academia.</span></div></div>`:`${field('Usuário','login','text','',true,'autocomplete="username" autocapitalize="none" placeholder="Seu usuário"')}${field('Senha','senha','password','',true,'autocomplete="current-password" placeholder="Sua senha"')}`}<div class="error" role="alert"></div><button type="submit" class="primary">${registering?'Continuar':'Entrar na academia'} ${icon('arrow')}</button>${registering?'<button type="button" id="register-back" class="auth-back" hidden>Voltar para meus dados</button>':''}<div class="auth-switch">${registering?'Já tem uma conta?':'Primeira vez no Signy?'} <button type="button" data-auth="${registering?'login':'register'}">${registering?'Entrar':'Criar conta'}</button></div></form><div class="login-footer">${icon('lock')} Seu acesso, protegido.</div></div></section></div>`;
 document.querySelectorAll('[data-auth]').forEach(button=>button.onclick=()=>auth(button.dataset.auth));
 const form=$('#'+(registering?'register':'login')+'-form'),submit=form.querySelector('[type=submit]'),error=form.querySelector('.error');
 let step=1;
 const changeStep=value=>{
  step=value;$('#register-details').hidden=step===2;$('#register-security').hidden=step===1;$('#register-back').hidden=step===1;
  form.querySelectorAll('#register-security input').forEach(input=>{input.disabled=step===1;input.required=step===2;});
  form.querySelectorAll('#register-details input').forEach(input=>{input.required=step===1;});
  form.querySelectorAll('.auth-steps li').forEach((item,i)=>item.classList.toggle('current',i===step-1));
  submit.innerHTML=(step===1?'Continuar':'Criar minha conta')+' '+icon('arrow');error.textContent='';
  form.querySelector(step===1?'[name=nome]':'[name=senha]').focus();
 };
 if(registering){
  $('#registration-access-note').textContent='Após o cadastro, um administrador da academia aprovará seu acesso.';
  $('#register-back').onclick=()=>changeStep(1);
  $('.auth-show').onclick=e=>{const visible=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(visible));e.currentTarget.textContent=visible?'Ocultar senhas':'Mostrar senhas';form.querySelectorAll('#register-security input').forEach(input=>input.type=visible?'text':'password');};
 }
 form.onsubmit=async e=>{
  e.preventDefault();error.textContent='';
  if(registering&&step===1){changeStep(2);return;}
  const values=Object.fromEntries(new FormData(form));
  if(registering&&values.senha!==values.confirmacao){error.textContent='A confirmação não corresponde à senha.';return;}
  const label=submit.innerHTML;submit.disabled=true;submit.textContent=registering?'Criando sua conta…':'Entrando…';
  try{
   const result=await api(registering?'/register':'/login','POST',values);
   if(registering&&result.pending){registrationComplete(values.login);return;}
   user=result;await refresh();
  }catch(err){error.textContent=err.message;}finally{submit.disabled=false;submit.innerHTML=label;}
 };
}
function registrationComplete(loginName){
 const card=$('.auth-card');
 card.innerHTML=`<div class="auth-success"><span class="auth-success-icon">${icon('check')}</span><span class="eyebrow">Primeiro passo concluído</span><h2>Conta criada!</h2><p>Seu usuário é <strong>${esc(loginName)}</strong>.</p><div class="notice">${icon('lock')}<span>Um administrador da academia precisa aprovar seu acesso. Depois disso, você poderá entrar com a senha que criou.</span></div><button type="button" class="primary" id="return-login">Voltar para o login ${icon('arrow')}</button></div>`;
 $('#return-login').onclick=()=>{auth('login');$('#login-form [name=login]').value=loginName;$('#login-form [name=senha]').focus();};
 card.querySelector('h2').tabIndex=-1;card.querySelector('h2').focus();
}
