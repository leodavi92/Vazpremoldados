import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from './assistant-core.mjs';
import {executeAction,commandForPlan} from './assistant-actions.mjs';
import {operationalReply,pendingOperation} from './assistant-operations.mjs';
const base={inventory:[{id:1,type:'final',name:'Pilar fictício',stock:-2,unit:'un',recipe:[{productId:2,qty:2}]},{id:2,type:'raw',name:'Material fictício',stock:10,unit:'kg'}],clients:[],transactions:[],production:[],stockMovements:[],sales:[],auditLog:[],accounts:['Caixa Principal'],config:{paymentMethods:['PIX','Dinheiro','Cartão de Débito','Cartão de Crédito']}};
const source=JSON.stringify(base),cmd={id:'same-production',action:'recordProduction',record:{productId:1,quantity:4}};
const made=executeAction(base,cmd);assert.equal(made.state.inventory[0].stock,2);assert.equal(made.state.inventory[1].stock,2);assert.equal(made.state.production.length,1);assert.equal(JSON.stringify(base),source);
const repeated=executeAction(made.state,cmd);assert.equal(repeated.repeated,true);assert.equal(repeated.state.production.length,1);assert.equal(repeated.state.inventory[0].stock,2);
assert.throws(()=>executeAction(base,{...cmd,id:'too-many',record:{productId:1,quantity:6}}),/Material insuficiente/);assert.equal(JSON.stringify(base),source);
assert.throws(()=>executeAction(base,{id:'bad-stock',action:'adjustStock',record:{productId:1,type:'saida',quantity:1}}),/Saldo insuficiente/);
const incoming=executeAction(base,{id:'stock',action:'adjustStock',record:{productId:1,type:'entrada',quantity:4}});assert.equal(incoming.state.inventory[0].stock,2);assert.equal(incoming.state.inventory[1].stock,10);assert.equal(incoming.state.production.length,0);
const client=executeAction(base,{id:'client',action:'createClient',record:{name:'Cliente Fictício',phone:'(65) 99999-0000'}});assert.equal(client.state.clients.length,1);assert.throws(()=>executeAction(client.state,{id:'client2',action:'createClient',record:{name:'Cliente Fictício',phone:'(65) 99999-0000'}}),/Já existe/);
const expense=executeAction(base,{id:'expense',action:'recordTransaction',record:{type:'saida',amount:100,description:'Despesa fictícia',paymentMethod:'Pix'}});assert.equal(expense.state.transactions[0].paymentMethod,'PIX');assert.equal(expense.state.transactions[0].amount,100);assert.equal(expense.state.auditLog.length,1);
assert.throws(()=>executeAction(base,{id:'evil',action:'runSQL',record:{}}),/Ação inválida/);
const withSale={...structuredClone(base),sales:[{id:10,status:'pending'}]};assert.throws(()=>executeAction(withSale,{id:'cancel',action:'cancelSale',record:{saleId:10,returnStock:true,reason:'Teste'}}),/confirmação explícita/);
let callbackCalled=0;const canceled=executeAction(withSale,{id:'cancel',action:'cancelSale',confirmed:true,record:{saleId:10,returnStock:true,reason:'Teste'}},{native:{cancelSale(next){callbackCalled++;next.sales[0].status='cancelled'}}});assert.equal(callbackCalled,1);assert.equal(canceled.state.sales[0].status,'cancelled');assert.equal(withSale.sales[0].status,'pending');

// Exercise the actual confirmation handler, including persistence and retry after failure.
const nodes={};const node=id=>nodes[id]||={value:'',style:{},classList:{toggle(){}},setAttribute(){},textContent:'',innerHTML:'',scrollHeight:0};let writes=0;
const ctx={...core,executeAction,commandForPlan,operationalReply,pendingOperation,appState:structuredClone(base),currentUser:{uid:'test-owner'},currentEnv:'test',crypto:globalThis.crypto,Date,console,document:{getElementById:node},localStorage:{setItem(){}},saveOutcome:'synced',async saveData(){writes++;return ctx.saveOutcome!=='failed'},renderContent(){}};
const script=fs.readFileSync(new URL('./assistant.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');vm.createContext(ctx);vm.runInContext(script.slice(0,script.indexOf("if(document.readyState==='complete')")),ctx);
ctx.plan={kind:'production',record:{productId:1,quantity:4},action:'draft'};vm.runInContext("root={getElementById:id=>document.getElementById(id)};panel={hidden:false};scope=key();messages=[{role:'assistant',plan,createdAt:Date.now()}]",ctx);
await vm.runInContext('executePrepared()',ctx);assert.equal(ctx.appState.production.length,1);assert.equal(writes,1);assert.match(vm.runInContext('messages.at(-1).content',ctx),/Fabricação registrada/);
await vm.runInContext('executePrepared()',ctx);assert.equal(writes,1);
ctx.appState=structuredClone(base);ctx.saveOutcome='failed';vm.runInContext("messages=[{role:'assistant',plan,createdAt:Date.now()}]",ctx);await vm.runInContext('executePrepared()',ctx);assert.equal(ctx.appState.production.length,0);assert.equal(ctx.appState.inventory[0].stock,-2);assert.match(nodes.notice.textContent,/Não foi possível salvar/);
ctx.saveOutcome='synced';await vm.runInContext('executePrepared()',ctx);assert.equal(ctx.appState.production.length,1);assert.equal(ctx.appState.inventory[1].stock,2);
console.log('OK: execução real isolada, materiais e saldo, atomicidade, identificador idempotente, cliente duplicado, financeiro, cancelamento explícito, persistência e repetição após falha. Nenhum dado real acessado.');
