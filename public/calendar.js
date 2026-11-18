// Shared, keyboard-accessible calendar; original ISO date fields still submit unchanged.
let calendarState=null;
const calendarISO=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const calendarDate=value=>{const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12);};
function closeCalendar(restore=false){if(!calendarState)return;const state=calendarState;calendarState=null;state.popup.hidePopover?.();state.popup.remove();state.trigger.setAttribute('aria-expanded','false');if(restore&&state.trigger.isConnected)state.trigger.focus({preventScroll:true});}
function initCalendars(root=document){
 root.querySelectorAll('input[type="date"]').forEach(input=>{
  if(input.dataset.calendarReady)return;input.dataset.calendarReady='true';
  const wrapper=document.createElement('span');wrapper.className='date-control';input.before(wrapper);wrapper.append(input);
  const trigger=document.createElement('button');trigger.type='button';trigger.className='date-trigger';trigger.setAttribute('aria-label','Abrir calendário');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16 M8 15h2 M14 15h2"/></svg>';wrapper.append(trigger);
  trigger.onclick=()=>calendarState?.input===input?closeCalendar(true):openCalendar(input,trigger);
  input.addEventListener('pointerdown',event=>{if(event.button===0){event.preventDefault();openCalendar(input,trigger);}});
  input.addEventListener('keydown',event=>{if(event.key==='F4'||event.key==='ArrowDown'&&event.altKey){event.preventDefault();openCalendar(input,trigger);}});
 });
}
function openCalendar(input,trigger){
 closeCalendar();if(input.disabled)return;
 let selected=input.value||calendarISO(new Date());if(input.min&&selected<input.min)selected=input.min;if(input.max&&selected>input.max)selected=input.max;const popup=document.createElement('section');popup.className='signy-calendar';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Escolher data');
 (input.closest('dialog')||document.body).append(popup);
 if(typeof popup.showPopover==='function'){popup.setAttribute('popover','manual');popup.showPopover();}
 const state={input,trigger,popup,view:calendarDate(selected),focus:selected};calendarState=state;trigger.setAttribute('aria-expanded','true');
 const allowed=value=>(!input.min||value>=input.min)&&(!input.max||value<=input.max);
 const months=Array.from({length:12},(_,i)=>new Date(2020,i,1).toLocaleDateString('pt-BR',{month:'long'}));
 const position=()=>{const rect=trigger.getBoundingClientRect(),width=Math.min(344,innerWidth-24);popup.style.width=width+'px';popup.style.left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12))+'px';popup.style.top=Math.max(12,Math.min(rect.bottom+8,innerHeight-popup.offsetHeight-12))+'px';};
 const select=value=>{input.value=value;closeCalendar();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));if(trigger.isConnected)trigger.focus({preventScroll:true});};
 function paint(){
  const y=state.view.getFullYear(),m=state.view.getMonth(),first=new Date(y,m,1,12),start=new Date(y,m,1-((first.getDay()+6)%7),12),yearNow=new Date().getFullYear();
  const minYear=input.min?Number(input.min.slice(0,4)):Math.min(yearNow-120,y),maxYear=input.max?Number(input.max.slice(0,4)):Math.max(yearNow+50,y);
  let years='';for(let year=minYear;year<=maxYear;year++)years+=`<option value="${year}" ${year===y?'selected':''}>${year}</option>`;
  const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const value=calendarISO(d),outside=d.getMonth()!==m,today=value===calendarISO(new Date());return `<button type="button" data-day="${value}" class="${outside?'outside ':''}${value===input.value?'selected ':''}${today?'today':''}" aria-label="${d.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})}" ${value===input.value?'aria-pressed="true"':''} ${allowed(value)?'':'disabled'} tabindex="${value===state.focus?0:-1}">${d.getDate()}</button>`;}).join('');
  popup.innerHTML=`<div class="calendar-kicker">ESCOLHA A DATA</div><div class="calendar-heading"><button type="button" data-month="-1" aria-label="Mês anterior">‹</button><select aria-label="Mês">${months.map((name,i)=>`<option value="${i}" ${i===m?'selected':''}>${name}</option>`).join('')}</select><select aria-label="Ano">${years}</select><button type="button" data-month="1" aria-label="Próximo mês">›</button></div><p class="sr-only" aria-live="polite">${months[m]} de ${y}</p><div class="calendar-week" aria-hidden="true">${['S','T','Q','Q','S','S','D'].map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-days" role="group" aria-label="Dias do mês">${days}</div><div class="calendar-footer"><button type="button" data-today ${allowed(calendarISO(new Date()))?'':'disabled'}>Hoje</button>${input.required?'':'<button type="button" data-clear>Limpar</button>'}<button type="button" data-close-calendar>Fechar</button></div>`;
  popup.querySelector('[data-month="-1"]').disabled=Boolean(input.min&&calendarISO(new Date(y,m,0,12))<input.min);popup.querySelector('[data-month="1"]').disabled=Boolean(input.max&&calendarISO(new Date(y,m+1,1,12))>input.max);
  popup.querySelectorAll('[data-month]').forEach(button=>button.onclick=()=>{state.view=new Date(y,m+Number(button.dataset.month),1,12);state.focus=calendarISO(state.view);paint();focusDay();});
  popup.querySelector('[aria-label="Mês"]').onchange=event=>{state.view=new Date(y,Number(event.target.value),1,12);state.focus=calendarISO(state.view);paint();focusDay();};
  popup.querySelector('[aria-label="Ano"]').onchange=event=>{state.view=new Date(Number(event.target.value),m,1,12);state.focus=calendarISO(state.view);paint();focusDay();};
  popup.querySelectorAll('[data-day]').forEach(button=>button.onclick=()=>select(button.dataset.day));
  popup.querySelector('[data-today]').onclick=()=>select(calendarISO(new Date()));popup.querySelector('[data-clear]')?.addEventListener('click',()=>select(''));popup.querySelector('[data-close-calendar]').onclick=()=>closeCalendar(true);position();
 }
 function focusDay(){const target=popup.querySelector(`[data-day="${state.focus}"]:not(:disabled)`)||popup.querySelector('[data-day]:not(:disabled)');if(target){target.tabIndex=0;target.focus({preventScroll:true});}}
 popup.onkeydown=event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeCalendar(true);return;}
  const value=event.target.dataset.day;if(!value)return;
  const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};let next=calendarDate(value);
  if(event.key in offsets)next.setDate(next.getDate()+offsets[event.key]);
  else if(event.key==='PageUp'||event.key==='PageDown')next=new Date(next.getFullYear(),next.getMonth()+(event.key==='PageUp'?-1:1),1,12);
  else if(event.key==='Home')next.setDate(next.getDate()-(next.getDay()+6)%7);
  else if(event.key==='End')next.setDate(next.getDate()+6-(next.getDay()+6)%7);
  else return;
  event.preventDefault();if(!allowed(calendarISO(next)))return;state.view=next;state.focus=calendarISO(next);paint();focusDay();
 };
 paint();focusDay();
}
document.addEventListener('pointerdown',event=>{if(calendarState&&!calendarState.popup.contains(event.target)&&!calendarState.input.parentElement.contains(event.target))closeCalendar();});
document.addEventListener('focusin',event=>{if(calendarState&&!calendarState.popup.contains(event.target)&&!calendarState.input.parentElement.contains(event.target))closeCalendar();});
window.addEventListener('resize',()=>closeCalendar());

document.addEventListener('scroll',event=>{if(calendarState&&!calendarState.popup.contains(event.target))closeCalendar();},true);
