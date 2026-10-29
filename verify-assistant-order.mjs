import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as core from './assistant-core.mjs';
import {operationalReply,pendingOperation} from './assistant-operations.mjs';
const inventory=[{id:1,name:"Pilar Para Caixa D'água De 1000 Litros",type:'final',stock:0,unit:'un'},{id:2,name:"Pilar Para Caixa D'água De 3000 Litros",type:'final',stock:0,unit:'un'}];
let parsed=operationalReply('Pode lançar no estoque 4 pilares',{inventory});assert.equal(parsed.decision.quantity,4);assert.equal(parsed.decision.stage,'product');
parsed=operationalReply('Sim',{inventory},{},parsed.decision);assert.equal(parsed.decision.quantity,4);assert.equal(parsed.decision.stage,'product');
parsed=operationalReply('Fabriquei 4 pilares hoje',{inventory});assert.equal(parsed.decision.mode,'production');assert.equal(parsed.decision.quantity,4);
parsed=operationalReply('1000 litros',{inventory},{},parsed.decision);assert.equal(parsed.kind,'production');assert.equal(parsed.record.productId,1);assert.equal(parsed.record.quantity,4);
const queried=core.queryState({dataset:'inventory',search:'pilares',filter:''},{inventory});assert.match(queried,/2 registro/);assert.match(queried,/1000 Litros/);
const missing=operationalReply('Fabriquei 4 postes hoje',{inventory});assert.equal(missing.decision.quantity,4);assert.equal(missing.decision.stage,'product');assert.equal(operationalReply('Pilar para caixa de 1000 litros',{inventory},{},missing.decision).record.quantity,4);
const nodes={};const storage=new Map();const opens=[];let network=0;
function node(id){return nodes[id]||={value:'',hidden:false,style:{},classList:{toggle(){},contains:()=>true},setAttribute(){},textContent:'',innerHTML:'',scrollTop:0,scrollHeight:0}}
const state={inventory:structuredClone(inventory),production:[],stockMovements:[],transactions:[],clients:[],sales:[]},before=JSON.stringify(state);
const ctx={...core,operationalReply,pendingOperation,currentUser:{uid:'dummy'},currentEnv:'test',appState:state,document:{getElementById:node},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,Date,
 async fetch(){network++;throw Error('O fluxo local não deve depender do modelo para completar a capacidade.')},openProductionModal(id,qty){opens.push({id,qty})},saveData(){throw Error('Não gravar nos testes')}};
const code=fs.readFileSync(new URL('./assistant.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');vm.createContext(ctx);vm.runInContext(code.slice(0,code.indexOf("if(document.readyState==='complete')")),ctx);
vm.runInContext("root={getElementById:id=>document.getElementById(id)};panel=document.getElementById('panel');scope=key();messages=[]",ctx);
async function send(value){node('message').value=value;await vm.runInContext('send()',ctx)}
await send('Pode lançar no estoque 4 pilares');assert.equal(vm.runInContext('messages.at(-1).decision.quantity',ctx),4);
await send('Sim');assert.equal(vm.runInContext('messages.at(-1).decision.quantity',ctx),4);
await send('Fabriquei 4 pilares hoje');assert.equal(vm.runInContext('messages.at(-1).decision.mode',ctx),'production');
vm.runInContext('messages=[];load()',ctx);assert.equal(vm.runInContext('messages.at(-1).decision.quantity',ctx),4,'Reabrir a página não deve perder o pedido.');
await send('1000 litros');assert.equal(vm.runInContext('messages.at(-1).plan.record.quantity',ctx),4);assert.equal(vm.runInContext('messages.at(-1).plan.kind',ctx),'production');
await send('Pilar para caixa de 1000 litros');assert.equal(vm.runInContext('messages.at(-1).plan.record.quantity',ctx),4);assert.equal(network,0);assert.equal(opens.length,0);assert.equal(JSON.stringify(state),before);
vm.runInContext('prepare()',ctx);assert.deepEqual(opens,[{id:1,qty:4}]);assert.equal(vm.runInContext('pendingOperation(messages,appState)',ctx),null);assert.equal(JSON.stringify(state),before);
// Existing broken conversations must also be recoverable, without asking for quantity again.
ctx.old=[{role:'user',content:'Pode lançar no estoque 4 pilares'},{role:'assistant',content:'Estoque atual • 0 registros'},{role:'user',content:'Sim'},{role:'assistant',content:'Estoque atual • 0 registros'},{role:'user',content:'Fabriquei 4 pilares hoje'},{role:'assistant',content:'Qual é o nome exato e a quantidade?'}];
vm.runInContext('messages=old',ctx);await send('1000 litros');assert.equal(vm.runInContext('messages.at(-1).plan.record.quantity',ctx),4);assert.equal(vm.runInContext('messages.at(-1).plan.record.productId',ctx),1);assert.equal(network,0);
console.log('OK: sequência relatada completa, singular/plural, capacidade separada de quantidade, recuperação de conversa antiga, estado após reabrir, fabricação preservada e ficha nativa com 4 unidades sem gravar nada.');
