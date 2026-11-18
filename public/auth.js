// Public presentation stays independent from authenticated views and their data.
function auth() {
 auth.cleanup?.();
 resetSession();document.body.classList.remove('student-mode');user=null;section='home';filter={q:'',status:'',from:'',to:''};
 $('#app').innerHTML=fitnessLanding();
 if(accessOpen){$('#login-form p').textContent='Digite qualquer usuário e senha para entrar.';$('.login-footer').textContent='Acesso livre para esta demonstração.';}
 $('#forgot-password').onclick=recoverAccess;
 $('#toggle-password').onclick=e=>{const button=e.currentTarget,input=$('#login-form [name=senha]'),show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');};
 const form=$('#login-form'),submit=form.querySelector('[type=submit]'),error=form.querySelector('.error');
 form.onsubmit=async e=>{
  e.preventDefault();error.textContent='';
  const values=Object.fromEntries(new FormData(form));
  const label=submit.innerHTML;submit.disabled=true;submit.textContent='Entrando…';
  try{
   const {initial_overview,...account}=await api('/login','POST',{...values,...(location.hash==='#financeiro'?{}:{initial:'overview'})});auth.cleanup?.();$('#toast').classList.remove('show');clearTimeout(toast.timer);await enterSession(account,initial_overview);window.scrollTo(0,0);
  }catch(err){error.textContent=err.message;}finally{submit.disabled=false;submit.innerHTML=label;}
 };
 initAuthMotion($('.auth-landing'));
 const stopMotion=auth.cleanup,stopFitness=initFitness($('.auth-landing'));
 auth.cleanup=()=>{stopFitness();stopMotion?.();};
}

// Cross-engine transform/opacity transitions, with a scroll fallback for older engines.
function initAuthMotion(root){
 const reduce={get matches(){return root.dataset.scrollMotion==='reduced';}},elements=[...root.querySelectorAll('[data-reveal]')],progress=root.querySelector('.landing-progress span');
 let observer=null,frame=0,stopped=false,manual=false,pageDistance=1;
 const measurePage=()=>{const hero=root.querySelector('.sf-management-hero'),nav=root.querySelector('.landing-header');if(hero&&nav)hero.classList.toggle('login-needs-space',hero.offsetHeight>window.innerHeight-nav.offsetHeight+2);pageDistance=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);queue();};
 const reveal=element=>{element.classList.add('is-visible');element.classList.remove('reveal-pending');};
 const revealViewport=()=>elements.forEach(element=>{if(element.classList.contains('reveal-pending')&&element.getBoundingClientRect().top<window.innerHeight-36)reveal(element);});
 function update(){
  frame=0;if(stopped)return;
  const distance=pageDistance;
  progress.style.transform=`scaleX(${distance>0?Math.min(1,Math.max(0,window.scrollY/distance)):0})`;
  root.classList.toggle('has-scrolled',window.scrollY>12);
  if(manual)revealViewport();
 }
 const queue=()=>{if(!frame&&!stopped)frame=requestAnimationFrame(update);};
 function configure(){
  if(stopped)return;
  observer?.disconnect();observer=null;manual=false;
  if(reduce.matches){elements.forEach(reveal);queue();return;}
  elements.filter(element=>!element.classList.contains('is-visible')).forEach(element=>element.classList.add('reveal-pending'));
  if(typeof window.IntersectionObserver==='function'){
   try{observer=new IntersectionObserver((entries,source)=>{if(stopped||reduce.matches)return;entries.forEach(entry=>{if(entry.isIntersecting){reveal(entry.target);source.unobserve(entry.target);}});},{threshold:0,rootMargin:'0px 0px -36px 0px'});elements.filter(element=>!element.classList.contains('is-visible')).forEach(element=>observer.observe(element));}
   catch{observer?.disconnect();observer=null;manual=true;}
  }else manual=true;
  queue();
 }
 const onFocus=e=>{const element=e.target.closest('[data-reveal]');if(element)reveal(element);if(e.target.closest('.sf-hero')&&window.scrollY>50)window.scrollTo(0,0);};
 const onClick=e=>{
  const link=e.target.closest('[data-scroll-to]');if(!link)return;
  const target=root.querySelector(`#${link.dataset.scrollTo}`);if(!target)return;
  // Section navigation must preserve invitation/recovery tokens and #financeiro.
  e.preventDefault();const top=target.closest('.sf-hero')?0:target.getBoundingClientRect().top+window.scrollY-100;
  const focusTarget=target.id==='acesso'?target.querySelector('[name=login]'):target;
  if(target.id!=='acesso')focusTarget.tabIndex=-1;
  try{focusTarget.focus({preventScroll:true});}catch{focusTarget.focus();}
  try{window.scrollTo({top:Math.max(0,top),behavior:reduce.matches?'auto':'smooth'});}catch{window.scrollTo(0,Math.max(0,top));}
 };
 root.addEventListener('click',onClick);root.addEventListener('focusin',onFocus);
 window.addEventListener('scroll',queue,{passive:true});window.addEventListener('resize',measurePage,{passive:true});
 const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(measurePage):null;sizeObserver?.observe(root);measurePage();
 root.addEventListener('signy-motion-change',configure);
 auth.cleanup=()=>{stopped=true;observer?.disconnect();cancelAnimationFrame(frame);root.removeEventListener('click',onClick);root.removeEventListener('focusin',onFocus);window.removeEventListener('scroll',queue);window.removeEventListener('resize',measurePage);sizeObserver?.disconnect();root.removeEventListener('signy-motion-change',configure);auth.cleanup=null;};
 configure();
}
