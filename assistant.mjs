import {queryState,summary,localDay} from './assistant-core.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let panel,root,button,messages=[],busy=false,scope='',requestController;
function user(){return typeof currentUser!=='undefined'?currentUser:null}
function key(){return 'vaz-assistente:'+user()?.uid+':'+currentEnv}
function load(){try{messages=JSON.parse(localStorage.getItem(key())||'[]');if(!Array.isArray(messages))messages=[]}catch{messages=[]}messages=messages.slice(-80)}
function persist(){try{localStorage.setItem(key(),JSON.stringify(messages.slice(-80)))}catch{notice('Não consegui guardar o histórico da conversa neste aparelho.')}}
function notice(message){if(root)root.getElementById('notice').textContent=message}
function render(){
 const list=root.getElementById('messages');list.innerHTML=messages.length?messages.map((m,i)=>`<div class="bubble ${m.role==='user'?'mine':'theirs'}"><small>${m.role==='user'?'Você':'Assistente VAZ'}</small><div>${esc(m.content)}</div>${m.plan&&!m.used&&i===messages.length-1?'<div class="actions"><button id="prepare">Conferir no aplicativo</button><button id="cancel">Cancelar</button></div>':''}</div>`).join(''):'<div class="welcome"><h2>Como posso ajudar?</h2><p>Consulte os dados da VAZ, tire dúvidas do app ou cole a mensagem de um cliente.</p></div>';
 list.scrollTop=list.scrollHeight;const send=root.getElementById('send');send.disabled=busy;send.textContent=busy?'Respondendo…':'Enviar';
 if(root.getElementById('prepare')){root.getElementById('prepare').disabled=busy;root.getElementById('prepare').onclick=prepare;root.getElementById('cancel').disabled=busy;root.getElementById('cancel').onclick=()=>{messages.at(-1).used=true;messages.push({role:'assistant',content:'Ficha cancelada. Nenhum registro foi salvo.'});persist();render()}}
}
function show(open){panel.hidden=!open;if(open){render();root.getElementById('message').focus()}}
function refresh(){
 const id=user()?.uid?key():'';button.hidden=!id;
 if(id!==scope){requestController?.abort();scope=id;busy=false;show(false);messages=[];if(id)load()}
}
async function send(){
 if(busy)return;refresh();if(!user()?.uid)return;
 const field=root.getElementById('message'),message=field.value.trim();if(!message)return;
 const api=String(window.VAZ_ASSISTANT_API||'').replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9.-]+(?:\/[^?#]*)?$/i.test(api)){notice('A conexão online do assistente ainda não foi ativada. Seus dados continuam disponíveis nas telas do aplicativo.');return}
 const identity=scope,history=messages.slice(-8).map(m=>({role:m.role,content:m.content.slice(0,1500)}));
 busy=true;notice('Preparando resposta…');render();requestController=new AbortController();const timeout=setTimeout(()=>requestController.abort(),65000);
 try{
  const token=await auth.currentUser.getIdToken();
  const response=await fetch(api+'/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({message,history,today:localDay()}),signal:requestController.signal});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Não consegui responder agora.');
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
  if(plan.kind==='clients'){
   if(appState.clients.some(c=>String(c.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===String(r.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))throw Error('Já existe um cliente com esse nome. Confira em Clientes antes de criar outro.');
   if(!document.getElementById('modal-backdrop')?.classList.contains('hidden')){notice('Conclua ou feche o formulário aberto antes de conferir esta ficha.');return}
   openClientModal();set('c-name',r.name);set('c-phone',r.phone);set('c-responsible',r.responsible);set('c-street',r.address);set('c-ref',r.reference);set('c-location',r.location);if(/\b(ltda|construcoes|construções|s\/a)\b/i.test(r.name))select('c-type','PJ');
  }else if(plan.kind==='transactions'){
   if(r.date!==localDay())throw Error('A data mudou desde que a ficha foi criada. Envie a mensagem novamente.');
   if(!document.getElementById('modal-backdrop')?.classList.contains('hidden')){notice('Conclua ou feche o formulário aberto antes de conferir esta ficha.');return}
   openTransactionModal(r.type);set('t-desc',r.description);set('t-amount',r.amount);set('t-date',r.date);select('t-cat',r.category);select('t-method',r.paymentMethod);
   const method=document.getElementById('t-method');if(method&&method.value.toLowerCase()!==r.paymentMethod.toLowerCase()){const option=document.createElement('option');option.value=r.paymentMethod;option.textContent=r.paymentMethod;method.appendChild(option);method.value=r.paymentMethod}
  }else throw Error('Tipo de registro não reconhecido.');
  item.used=true;messages.push({role:'assistant',content:'Abri a ficha preenchida no aplicativo. Confira os campos e use o botão de confirmação da própria tela. Abrir a ficha ainda não salva o registro.'});persist();show(false);
 }catch(error){notice(error.message)}
}
function mount(){
 const host=document.createElement('div');document.body.appendChild(host);root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>:host{font:14px system-ui;color:#19362b}*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:11px 14px;background:#e7eee9;color:#194a37}button:disabled{opacity:.5;cursor:wait}#toggle{position:fixed;right:18px;bottom:100px;z-index:65;box-shadow:0 5px 24px #0003;background:#166747;color:white;font-weight:700;padding:14px 18px}#panel{position:fixed;right:16px;bottom:16px;width:min(440px,calc(100vw - 24px));height:min(710px,calc(100dvh - 32px));z-index:70;background:#fff;border:1px solid #d9e5dc;border-radius:18px;box-shadow:0 12px 50px #0004;overflow:hidden;display:flex;flex-direction:column}#panel[hidden],button[hidden]{display:none}header{padding:16px;display:flex;align-items:center;justify-content:space-between;background:#174c39;color:#fff}header small{display:block;color:#bfd9c9;margin-top:5px}header button{background:#ffffff21;color:white}#messages{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:16px}.bubble{max-width:95%;padding:13px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.bubble small{display:block;font-size:10px;opacity:.65;margin-bottom:4px}.mine{background:#ddf0e1;align-self:flex-end}.theirs{background:#f0f4ef;align-self:flex-start}.welcome{margin:auto;text-align:center;color:#60786a}.welcome h2{font-size:20px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#prepare,#send{background:#176849;color:white}form{padding:12px;border-top:1px solid #e3ebe3}textarea{font:inherit;font-size:16px;width:100%;border:1px solid #cddcd0;border-radius:10px;padding:12px;min-height:74px;max-height:160px;resize:vertical}#notice{font-size:12px;color:#86591d;padding:0 14px;white-space:pre-wrap}footer{font-size:10px;color:#718276;padding:0 14px 12px}#hints{display:flex;gap:5px;overflow:auto;padding:10px}#hints button{white-space:nowrap;font-size:11px} @media(max-width:500px){#panel{right:6px;bottom:6px;width:calc(100vw - 12px);height:calc(100dvh - 12px)}#toggle{right:12px}}</style><button id="toggle" hidden>Conversar com assistente</button><section id="panel" hidden aria-label="Assistente VAZ"><header><div><strong>Assistente VAZ</strong><small>${currentEnv==='prod'?'Produção':'Teste'} · Converse, consulte e organize</small></div><div><button id="new" title="Nova conversa">Nova</button> <button id="close" aria-label="Fechar conversa">✕</button></div></header><div id="hints"><button>O que você pode fazer?</button><button>Quanto entrou hoje?</button><button>Estoque baixo</button></div><div id="messages" role="log" aria-live="polite"></div><div id="notice" role="status"></div><form><textarea id="message" data-autocapitalize="off" placeholder="Digite ou cole a mensagem do cliente…" required aria-label="Mensagem"></textarea><div class="actions"><button id="send">Enviar</button></div></form><footer>Groq processa suas mensagens e o contexto. Confira as fichas antes de salvar. Histórico guardado neste aparelho.</footer></section>`;
 button=root.getElementById('toggle');panel=root.getElementById('panel');button.onclick=()=>{refresh();if(user()?.uid)show(true)};root.getElementById('close').onclick=()=>show(false);root.querySelector('form').onsubmit=e=>{e.preventDefault();send()};root.getElementById('new').onclick=()=>{if(busy)return;messages=[];persist();notice('');render()};root.getElementById('hints').querySelectorAll('button').forEach(b=>b.onclick=()=>{root.getElementById('message').value=b.textContent;send()});
 root.getElementById('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
 refresh();if(typeof auth!=='undefined'&&auth)auth.onAuthStateChanged(()=>setTimeout(refresh,100));setInterval(refresh,1200);
}
if(document.readyState==='complete')mount();else window.addEventListener('load',mount,{once:true});
