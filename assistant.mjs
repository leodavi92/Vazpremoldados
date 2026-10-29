import {queryState,summary,localDay,conversationControl,conversationHistory,recoveryMessage,validatePlan} from './assistant-core.mjs';
import {operationalReply,pendingOperation} from './assistant-operations.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let panel,root,button,messages=[],busy=false,scope='',requestController,mode='assistant';
function user(){return typeof currentUser!=='undefined'?currentUser:null}
function key(){return 'vaz-assistente:'+user()?.uid+':'+currentEnv}
function load(){try{messages=JSON.parse(localStorage.getItem(key())||'[]');if(!Array.isArray(messages))messages=[]}catch{messages=[]}messages=messages.slice(-80)}
function persist(){try{localStorage.setItem(key(),JSON.stringify(messages.slice(-80)))}catch{notice('Não consegui guardar o histórico da conversa neste aparelho.')}}
function notice(message){if(root)root.getElementById('notice').textContent=message}
function render(){
 const list=root.getElementById('messages');list.innerHTML=messages.length?messages.map((m,i)=>`<div class="bubble ${m.role==='user'?'mine':'theirs'}"><small>${m.role==='user'?'Você':'Assistente VAZ'}</small><div>${esc(m.content)}</div>${m.plan&&!m.used&&i===messages.length-1?'<div class="actions"><button id="prepare">Conferir no aplicativo</button><button id="cancel">Cancelar</button></div>':''}${m.decision&&!m.used&&i===messages.length-1?'<div class="actions">'+m.choices.map((c,n)=>'<button data-choice="'+n+'">'+esc(c.label)+'</button>').join('')+'</div>':''}</div>`).join(''):'<div class="welcome"><h2>Como posso ajudar?</h2><p>Consulte os dados da VAZ, tire dúvidas do app ou cole a mensagem de um cliente.</p></div>';
 for(const choice of root.querySelectorAll?.('[data-choice]')||[]){choice.disabled=busy;choice.onclick=()=>{const selected=messages.at(-1)?.choices?.[Number(choice.dataset.choice)];if(selected){root.getElementById('message').value=selected.value;send()}}}
 list.scrollTop=list.scrollHeight;const send=root.getElementById('send');send.disabled=busy;send.textContent=busy?'Respondendo…':'Enviar';
 if(root.getElementById('prepare')){root.getElementById('prepare').disabled=busy;root.getElementById('prepare').onclick=prepare;root.getElementById('cancel').disabled=busy;root.getElementById('cancel').onclick=()=>{messages.at(-1).used=true;messages.push({role:'assistant',content:'Ficha cancelada. Nenhum registro foi salvo.',contextBoundary:true});persist();render()}}
}
function show(open){
 mode=open?'assistant':'manual';
 const active=Boolean(user()?.uid);
 panel.hidden=!active||!open;
 const main=document.getElementById('main-app');
 if(main){main.inert=active&&open;main.style.paddingTop=active?'64px':'';main.setAttribute('aria-hidden',active&&open?'true':'false')}
 const bar=root.getElementById('screen-switcher');if(bar)bar.hidden=!active;
 for(const [id,selected] of [['assistant-mode',open],['manual-mode',!open]]){const tab=root.getElementById(id);if(tab){tab.setAttribute('aria-pressed',String(selected));tab.classList.toggle('selected',selected)}}
 if(active&&open)render();
}
function refresh(){
 const id=user()?.uid?key():'';
 if(id!==scope){requestController?.abort();scope=id;busy=false;messages=[];if(id)load();notice('');show(Boolean(id))}
 else if(!id){show(false)}
}
async function send(){
 if(busy)return;refresh();if(!user()?.uid)return;
 const field=root.getElementById('message'),message=field.value.trim();if(!message)return;
 const control=conversationControl(message);
 if(control?.action==='answer'){messages.push({role:'user',content:message},{role:'assistant',content:control.content,contextBoundary:control.resetContext});field.value='';persist();notice('');render();return}
 const previous=messages.at(-1);let pendingItem=null;for(let i=messages.length-1;i>=0;i--){if(messages[i].contextBoundary)break;if(messages[i].decision&&!messages[i].used){pendingItem=messages[i];break}}const pending=pendingItem?.decision||pendingOperation(messages,appState);
 const local=operationalReply(message,appState,{monthlyClosing:typeof computeMonthlyClosing==='function'?computeMonthlyClosing:undefined,balance:typeof saleBalance==='function'?saleBalance:undefined,deliveryState:typeof saleDeliveryState==='function'?saleDeliveryState:undefined},pending,Boolean(previous?.overview));
 if(local){if(pendingItem&&(local.decision||local.action==='draft'))pendingItem.used=true;const reply={role:'assistant',content:local.content};if(local.action==='draft'){reply.plan=local;reply.createdAt=Date.now()}if(local.decision){reply.decision=local.decision;reply.choices=local.choices}if(local.overview)reply.overview=true;messages.push({role:'user',content:message},reply);messages=messages.slice(-80);field.value='';persist();notice('');render();return}
 const api=String(window.VAZ_ASSISTANT_API||'').replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9.-]+(?:\/[^?#]*)?$/i.test(api)){notice('A conexão online do assistente ainda não foi ativada. Seus dados continuam disponíveis nas telas do aplicativo.');return}
 const identity=scope,history=conversationHistory(messages);
 busy=true;notice('Preparando resposta…');render();requestController=new AbortController();const timeout=setTimeout(()=>requestController.abort(),65000);
 try{
  const token=await auth.currentUser.getIdToken();
  const ask=async(text,context)=>{const response=await fetch(api+'/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({message:text,history:context,today:localDay()}),signal:requestController.signal});const result=await response.json();if(!response.ok)throw Error(result.error||'Não consegui responder agora.');return result};
  const recovery=control?.action==='recover'?recoveryMessage(message,history):null;
  let recovered=Boolean(recovery);
  let result=recovery?await ask(recovery,[]):control?.action==='recover'?{action:'answer',content:'Você tem razão, eu estava repetindo a pergunta. Vamos retomar: posso consultar os dados do app ou preparar um cadastro e uma movimentação. O que você quer fazer agora?'}:await ask(message,history);
  if(result.action==='question'&&!recovery){const retry=recoveryMessage(message,history,result.content);if(retry){recovered=true;result=await ask(retry,[])}}
  if(result.action==='question'&&((recovered&&recoveryMessage(message,history,result.content))||history.some(m=>m.role==='assistant'&&m.content.trim()===result.content?.trim()))){result={action:'answer',content:'Não consegui concluir esse pedido com segurança. Nada foi salvo. Posso retomar o pedido com as informações já enviadas ou ajudar a conferir a ficha na Gestão manual.'}}
  if(result.action==='draft'){const source=history.filter(m=>m.role==='user').map(m=>m.content).concat(message).join('\n');result=validatePlan({action:result.kind==='clients'?'client':'transaction',...result.record},source,localDay())}
  if(scope!==identity||!user()?.uid)return;
  let content=result.content,plan;
  if(result.action==='query')content=queryState(result.query,appState,{paymentState:typeof saleBalance==='function'?(s=>s.paymentStatus||(saleBalance(s)>0?'unpaid':'paid')):undefined,stockSummary:typeof stockSummary==='function'?stockSummary:undefined,deliveryState:typeof saleDeliveryState==='function'?saleDeliveryState:undefined,balance:typeof saleBalance==='function'?saleBalance:undefined});
  if(result.action==='draft'){plan=result;content=summary(plan)+'\n\nPreparei uma ficha. Nada foi salvo. Use “Conferir no aplicativo” para revisar e confirmar na tela original.'}
  if(typeof content!=='string'||!content)throw Error('Não consegui entender a resposta. Nada foi salvo.');
  messages.push({role:'user',content:message},{role:'assistant',content,...(plan?{plan,createdAt:Date.now()}: {})});messages=messages.slice(-80);field.value='';persist();notice('');
 }catch(error){if(scope===identity)notice(error.name==='AbortError'?'A resposta demorou ou a sessão mudou. Nada foi salvo. Tente novamente.':error.message)}
 finally{clearTimeout(timeout);busy=false;render()}
}
function set(id,value){const field=document.getElementById(id);if(field){field.value=value??'';field.dispatchEvent(new Event('input',{bubbles:true}));return true}return false}
function select(id,value){const field=document.getElementById(id);if(!field)return;const option=[...field.options].find(o=>o.value.toLocaleLowerCase('pt-BR')===String(value).toLocaleLowerCase('pt-BR'));if(option){field.value=option.value;field.dispatchEvent(new Event('change',{bubbles:true}))}}
function prepare(){
 const item=messages.at(-1);if(!user()?.uid||!item?.plan||item.used||busy)return;
 if(Date.now()-item.createdAt>1800000){notice('A ficha expirou. Envie novamente para conferir os dados atuais.');return}
 const plan=item.plan,r=plan.record;
 try{
  if(plan.kind==='production'||plan.kind==='stock'){
   const product=appState.inventory.find(p=>String(p.id)===String(r.productId));if(!product)throw Error('Produto não encontrado no cadastro atual.');
   if(!Number.isFinite(r.quantity)||r.quantity<=0)throw Error('Quantidade inválida.');
   if(r.date!==localDay())throw Error('A data mudou. Envie a mensagem novamente para conferir.');
   if(!document.getElementById('modal-backdrop')?.classList.contains('hidden')){notice('Conclua ou feche o formulário aberto antes de conferir esta ficha.');return}
   if(plan.kind==='production'){if(product.type!=='final')throw Error('Esse item não é um produto acabado.');openProductionModal(product.id,r.quantity)}
   else{if(r.type==='saida'&&r.quantity>Math.max(0,Number(product.stock)))throw Error('O saldo disponível mudou e não cobre essa saída.');openStockMovementModal();select('sm-prod',String(product.id));select('sm-type',r.type);set('sm-qty',r.quantity);const expense=document.getElementById('sm-gen-expense');if(expense)expense.checked=false}
  }else if(plan.kind==='clients'){
   if(appState.clients.some(c=>String(c.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===String(r.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))throw Error('Já existe um cliente com esse nome. Confira em Clientes antes de criar outro.');
   if(!document.getElementById('modal-backdrop')?.classList.contains('hidden')){notice('Conclua ou feche o formulário aberto antes de conferir esta ficha.');return}
   openClientModal();set('c-name',r.name);set('c-phone',r.phone);set('c-responsible',r.responsible);set('c-street',r.address);set('c-ref',r.reference);set('c-location',r.location);if(/\b(ltda|construcoes|construções|s\/a)\b/i.test(r.name))select('c-type','PJ');
  }else if(plan.kind==='transactions'){
   if(r.date!==localDay())throw Error('A data mudou desde que a ficha foi criada. Envie a mensagem novamente.');
   if(!document.getElementById('modal-backdrop')?.classList.contains('hidden')){notice('Conclua ou feche o formulário aberto antes de conferir esta ficha.');return}
   openTransactionModal(r.type);set('t-desc',r.description);set('t-amount',r.amount);set('t-date',r.date);select('t-cat',r.category);select('t-method',r.paymentMethod);
   const method=document.getElementById('t-method');if(method&&method.value.toLowerCase()!==r.paymentMethod.toLowerCase()){const option=document.createElement('option');option.value=r.paymentMethod;option.textContent=r.paymentMethod;method.appendChild(option);method.value=r.paymentMethod}
  }else throw Error('Tipo de registro não reconhecido.');
  item.used=true;messages.push({role:'assistant',content:'Abri a ficha preenchida no aplicativo. Confira os campos e use o botão de confirmação da própria tela. Abrir a ficha ainda não salva o registro.',contextBoundary:true});persist();show(false);
 }catch(error){notice(error.message)}
}
function mount(){
 const host=document.createElement('div');document.body.appendChild(host);root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>
 :host{font:15px system-ui;color:#203b30}*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:0;border-radius:12px;padding:11px 16px;background:#f0f4f0;color:#234837;transition:background .15s}button:hover{background:#e3ebe2}button:focus-visible,textarea:focus-visible{outline:3px solid #7ab394;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}[hidden]{display:none!important}
 #screen-switcher{position:fixed;inset:0 0 auto;height:64px;padding:0 24px;z-index:55;background:#fff;border-bottom:1px solid #e5ebe4;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-weight:850;font-size:21px;letter-spacing:2px;color:#1d5c42}.brand small{font-size:10px;letter-spacing:1px;display:block;color:#7d8e81}.tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:#f1f4ef}.tabs button{background:transparent;font-size:13px;font-weight:650;min-height:40px}.tabs .selected{background:#fff;color:#155d3b;box-shadow:0 1px 6px #12382016}
 #panel{position:fixed;inset:64px 0 0;z-index:50;background:#fafbf8;display:flex;flex-direction:column;height:calc(100dvh - 64px);isolation:isolate}header{width:100%;max-width:1000px;margin:auto;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0}header strong{font-size:15px}header small{display:block;color:#839080;font-size:11px;margin-top:4px}.header-actions{display:flex;align-items:center;gap:8px}header button{background:transparent;font-size:12px;border:1px solid #e3e9df}
 #messages{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:22px;width:100%;padding:20px max(24px,calc((100% - 780px)/2));scroll-behavior:smooth}.bubble{max-width:92%;padding:16px 20px;border-radius:20px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.bubble small{display:block;font-size:10px;letter-spacing:.3px;color:#7c8b7b;margin-bottom:5px}.mine{background:#e9efe5;align-self:flex-end;max-width:85%}.theirs{align-self:flex-start;background:transparent;padding-left:0;width:100%}.welcome{margin:auto;text-align:center;max-width:520px;color:#788875;padding:32px 0}.welcome h2{font-size:clamp(26px,4vw,38px);font-weight:650;letter-spacing:-1px;color:#244b36;margin:16px 0 12px}.welcome p{line-height:1.7;font-size:15px;margin:0}.welcome:before{content:'V';display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:#e3eddf;border-radius:18px;font-size:28px;font-weight:850;color:#286541}
 .composer{width:100%;max-width:820px;margin:0 auto;padding:12px 24px max(16px,env(safe-area-inset-bottom));flex-shrink:0}#hints{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:0 0 16px}#hints button{font-size:12px;background:white;border:1px solid #e2e8dd;color:#5d745f;text-align:left}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#prepare,#send{background:#226546;color:white}form{background:white;border:1px solid #dbe4d5;border-radius:24px;padding:14px 14px 10px;box-shadow:0 5px 22px #26472a07}textarea{font:inherit;font-size:16px;line-height:1.5;width:100%;border:0;outline:none!important;padding:4px 8px;min-height:52px;max-height:150px;resize:vertical;background:transparent;color:#203b30}form .actions{justify-content:flex-end;margin-top:3px}#send{min-width:82px;border-radius:13px}#notice{font-size:12px;line-height:1.5;color:#8a642b;padding:0 4px 10px;white-space:pre-wrap}#notice:empty{display:none}footer{font-size:10px;text-align:center;color:#8a9685;padding-top:12px}
 @media(max-width:600px){#screen-switcher{padding:0 12px}.brand{font-size:17px}.brand small{font-size:8px}.tabs button{font-size:12px;padding:9px 11px}header{padding:14px 16px}#messages{padding:12px 18px;gap:16px}.bubble{max-width:100%;padding:12px 15px}.theirs{padding-left:0}.composer{padding:8px 12px max(12px,env(safe-area-inset-bottom))}#hints{gap:6px;padding-bottom:12px}#hints button{font-size:11px;padding:9px 10px}.welcome h2{font-size:28px}.welcome p{font-size:14px}.welcome{padding:10px 8px}header small{font-size:10px}.header-actions button{padding:9px 10px}}
 @media print{:host{display:none}}
 </style>
 <nav id="screen-switcher" hidden aria-label="Modo do aplicativo"><div class="brand">VAZ<small>PRÉ-MOLDADOS</small></div><div class="tabs"><button id="assistant-mode" aria-pressed="true">Assistente</button><button id="manual-mode" aria-pressed="false">Gestão manual</button></div></nav>
 <section id="panel" hidden aria-label="Conversa com o assistente VAZ"><header><div><strong>Seu assistente da VAZ</strong><small>${currentEnv==='prod'?'Como posso ajudar hoje?':'Ambiente de teste'}</small></div><div class="header-actions"><button id="new">Nova conversa</button><button id="profile" aria-label="Abrir minha conta">Conta</button></div></header>
 <div id="messages" role="log" aria-live="polite"></div><div class="composer"><div id="hints"><button>O que você pode fazer?</button><button>Quanto entrou hoje?</button><button>Como está o estoque?</button></div><div id="notice" role="status"></div><form><textarea id="message" data-autocapitalize="off" placeholder="Pergunte algo ou conte o que aconteceu…" required aria-label="Mensagem para o assistente"></textarea><div class="actions"><button id="send">Enviar</button></div></form><footer>Confira as informações antes de confirmar um registro.</footer></div></section>`;
 panel=root.getElementById('panel');button=root.getElementById('assistant-mode');button.onclick=()=>{refresh();if(user()?.uid)show(true)};root.getElementById('manual-mode').onclick=()=>show(false);root.getElementById('profile').onclick=()=>{if(user()?.uid)openProfileModal()};root.querySelector('form').onsubmit=e=>{e.preventDefault();send()};root.getElementById('new').onclick=()=>{if(busy)return;messages=[];persist();notice('');render()};root.getElementById('hints').querySelectorAll('button').forEach(b=>b.onclick=()=>{root.getElementById('message').value=b.textContent;send()});
 root.getElementById('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
 refresh();const main=document.getElementById('main-app');if(main)new MutationObserver(refresh).observe(main,{attributes:true,attributeFilter:['class']});if(typeof auth!=='undefined'&&auth)auth.onAuthStateChanged(()=>setTimeout(refresh,100));setInterval(refresh,1200);
}
if(document.readyState==='complete')mount();else window.addEventListener('load',mount,{once:true});
