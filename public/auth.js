function auth() {
 user=null;section='home';filter={q:'',status:'',from:'',to:''};
 $('#app').innerHTML=`<div class="login auth-page"><section class="login-intro"><div class="brand"><span class="brandmark">s</span>signy<span>®</span></div><div class="auth-story"><span class="eyebrow">Mais movimento. Menos burocracia.</span><h1>Sua equipe.<br>Seu ritmo.<br>Tudo no Signy.</h1><p>Um lugar para cuidar dos alunos, organizar os treinos e acompanhar cada conquista.</p><div class="auth-benefits"><span>${icon('users')} Pessoas conectadas</span><span>${icon('dumbbell')} Rotina organizada</span><span>${icon('check')} Mais tempo para cuidar</span></div></div><span class="auth-signature">Gestão leve. Academia em movimento.</span></section><section class="login-main"><div class="auth-card"><form class="login-form" id="login-form"><span class="eyebrow">Bem-vindo de volta</span><h2>Bom ter você por aqui.</h2><p>Entre para acompanhar o dia a dia da sua academia.</p>${field('Usuário','login','text','',true,'autocomplete="username" autocapitalize="none" placeholder="Seu usuário"')}${field('Senha','senha','password','',true,'autocomplete="current-password" placeholder="Sua senha"')}<div class="error" role="alert"></div><button type="submit" class="primary">Entrar na academia ${icon('arrow')}</button></form><div class="login-footer">${icon('lock')} Seu acesso, protegido.</div></div></section></div>`;
 const form=$('#login-form'),submit=form.querySelector('[type=submit]'),error=form.querySelector('.error');
 form.onsubmit=async e=>{
  e.preventDefault();error.textContent='';
  const values=Object.fromEntries(new FormData(form));
  const label=submit.innerHTML;submit.disabled=true;submit.textContent='Entrando…';
  try{
   user=await api('/login','POST',values);await refresh();
  }catch(err){error.textContent=err.message;}finally{submit.disabled=false;submit.innerHTML=label;}
 };
}
