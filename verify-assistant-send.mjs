import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as core from './assistant-core.mjs';
import {operationalReply} from './assistant-operations.mjs';
const nodes={};function node(id){return nodes[id]||={value:'',hidden:false,style:{},setAttribute(){},classList:{toggle(){}},innerHTML:'',textContent:'',scrollHeight:0};}
let calls=[];
const question='Qual é o endereço completo e a referência de Cliente Fictício Exemplo?';
const initial='Cliente Fictício Exemplo\nPerto da praça fictícia\n(65) 99999-0000';
const ctx={...core,operationalReply,currentUser:{uid:'fake-user'},currentEnv:'test',appState:{clients:[],transactions:[]},document:{getElementById:node},window:{VAZ_ASSISTANT_API:'https://test.workers.dev'},auth:{currentUser:{async getIdToken(){return 'fake-token'}}},localStorage:{getItem:()=>null,setItem(){}},AbortController,setTimeout,clearTimeout,console,
 async fetch(url,options){const sent=JSON.parse(options.body);calls.push(sent);return{ok:true,async json(){return calls.length===1?{action:'question',content:question}:{action:'draft',kind:'clients',record:{name:'Cliente Fictício Exemplo',phone:'(65) 99999-0000',address:'Estrada Fictícia',reference:'Perto da praça fictícia'}}}}}
};
const code=fs.readFileSync(new URL('./assistant.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');vm.createContext(ctx);vm.runInContext(code.slice(0,code.indexOf("if(document.readyState==='complete')")),ctx);
ctx.initial=initial;ctx.question=question;
vm.runInContext("root={getElementById:id=>document.getElementById(id)};panel=document.getElementById('panel');scope=key();messages=[{role:'user',content:initial},{role:'assistant',content:question}];",ctx);
node('message').value='Estrada Fictícia';await vm.runInContext('send()',ctx);
assert.equal(calls.length,2);assert.match(calls[1].message,/opcionais/);assert.equal(calls[1].history.length,0);
const record=vm.runInContext('messages.at(-1).plan.record',ctx);assert.equal(record.address,'Estrada Fictícia');assert.equal(record.name,'Cliente Fictício Exemplo');assert.equal(ctx.appState.clients.length,0);
const before=calls.length;node('message').value='O que você pode fazer?';await vm.runInContext('send()',ctx);assert.equal(calls.length,before);assert.match(vm.runInContext('messages.at(-1).content',ctx),/consultar clientes/);
node('message').value='Cancela o cadastro';await vm.runInContext('send()',ctx);assert.equal(vm.runInContext('conversationHistory(messages).length',ctx),0);assert.equal(ctx.appState.clients.length,0);
console.log('OK: fluxo real de envio recupera pergunta repetida com uma tentativa, abre ficha sem gravar, ajuda não repete pergunta e cancelamento encerra o contexto. Rede e dados fictícios.');
