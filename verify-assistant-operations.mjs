import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from './assistant-core.mjs';
import {factoryOverview,findProducts,operationalReply,pendingOperation} from './assistant-operations.mjs';
const day=core.localDay(),month=day.slice(0,7);
const inventory=[{id:1,type:'final',name:"Pilar Para Caixa D'água De 1000 Litros",stock:2,minStock:1,unit:'un'},{id:2,type:'final',name:"Pilar Para Caixa D'água De 3000 Litros",stock:0,minStock:1,unit:'un'},{id:3,type:'raw',name:'Cimento',stock:20,minStock:2,unit:'saco'}];
const state={inventory,transactions:[{type:'entrada',amount:1000,date:day},{type:'saida',amount:100,date:day},{type:'entrada',amount:999,date:'2000-01-01'}],sales:[{id:1,clientName:'Teste',status:'pending',paymentStatus:'unpaid',deliveryStatus:'scheduled',total:500,date:day}],production:[{date:day,qty:4,productName:'Produto fictício'}],clients:[]};
const before=JSON.stringify(state),helpers={balance:s=>s.total,deliveryState:s=>s.deliveryStatus};
const overview=operationalReply('Olá, como está o balanço da fábrica',state,helpers);assert.equal(overview.overview,true);assert.match(overview.content,/Entradas de caixa no mês: R\$\s*1\.000,00/);assert.match(overview.content,/Saídas de caixa no mês: R\$\s*100,00/);assert.match(overview.content,/3 produtos\/materiais cadastrados; 1 no mínimo ou abaixo; 1 sem saldo/);assert.match(overview.content,/Produções registradas no mês: 1/);assert.match(overview.content,/Pedidos com pagamento pendente: 1/);
assert.equal(operationalReply('Oque precisamos ajudar',state,helpers,null,true).overview,true);
const anotherDay=month+(day.endsWith('-01')?'-02':'-01');const withAnotherDay={...state,transactions:[...state.transactions,{type:'entrada',amount:200,date:anotherDay}]};
assert.match(operationalReply('Balanço da fábrica hoje',withAnotherDay).content,/Entradas de caixa no dia: R\$\s*1\.000,00/);
assert.match(operationalReply('Balanço da fábrica em '+day,withAnotherDay).content,/Entradas de caixa no dia: R\$\s*1\.000,00/);
assert.match(operationalReply('Balanço da fábrica em 2020-02',state).content,/02\/2020/);
const input='Adicione 4 pilares para caixa de 1000 litros no estoque';
let result=operationalReply(input,state);assert.equal(result.action,'decision');assert.equal(result.decision.productId,1);assert.equal(result.decision.quantity,4);assert.equal(result.choices.length,2);
const production=operationalReply('Foi fabricação',state,{},result.decision);assert.equal(production.kind,'production');assert.equal(production.record.productId,1);assert.equal(production.record.quantity,4);
const stock=operationalReply('É ajuste de estoque',state,{},result.decision);assert.equal(stock.kind,'stock');assert.equal(stock.record.type,'entrada');
assert.equal(operationalReply('sim',state,{},result.decision).action,'decision');
assert.equal(operationalReply('Fabricamos 4 pilares para caixa de 1000 litros',state).kind,'production');
assert.equal(operationalReply('Adicione -4 pilares para caixa de 1000 litros',state).action,'question');
assert.equal(operationalReply('Adicione pilares para caixa de 1000 litros',state).decision.stage,'quantity');
assert.equal(operationalReply('Retire 9 pilares para caixa de 1000 litros',state).action,'answer');
assert.equal(operationalReply('Saída combustível 100 reais pago no Pix',state),null);
assert.equal(operationalReply('Adicione entrada de 100 reais no Pix',state),null);
assert.equal(findProducts('pilares para caixa de 1000 litros',inventory).length,1);
assert.equal(operationalReply(input,{...state,inventory:[...inventory,{...inventory[0],id:4,name:inventory[0].name+' Altura 3m'}]}).decision.stage,'product');
assert.equal(JSON.stringify(state),before,'Preparar a operação não pode mudar os registros.');
let opened=[];const nodes={'modal-backdrop':{classList:{contains:()=>true}},notice:{textContent:''}};
function field(id,values=[]){return nodes[id]={value:'',options:values.map(value=>({value})),dispatchEvent(){}}}
const ctx={...core,operationalReply,pendingOperation,currentUser:{uid:'ficticio'},currentEnv:'test',appState:structuredClone(state),localStorage:{setItem(){}},Date,Event:class{},document:{getElementById:id=>nodes[id]},console,
 openProductionModal(id,qty){opened.push(['production',id,qty])},
 openStockMovementModal(){opened.push(['stock']);field('sm-prod',['1','2','3']);field('sm-type',['entrada','saida']);field('sm-qty');nodes['sm-gen-expense']={checked:true}}
};
const code=fs.readFileSync(new URL('./assistant.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');vm.createContext(ctx);vm.runInContext(code.slice(0,code.indexOf("if(document.readyState==='complete')")),ctx);
ctx.plan=production;vm.runInContext("root={getElementById:id=>document.getElementById(id)};panel={hidden:false};messages=[{role:'assistant',plan,createdAt:Date.now()}];prepare()",ctx);assert.deepEqual(opened,[['production',1,4]]);
ctx.plan=stock;vm.runInContext("messages=[{role:'assistant',plan,createdAt:Date.now()}];prepare()",ctx);assert.equal(nodes['sm-prod'].value,'1');assert.equal(nodes['sm-qty'].value,4);assert.equal(nodes['sm-type'].value,'entrada');assert.equal(nodes['sm-gen-expense'].checked,false);
vm.runInContext('prepare()',ctx);assert.equal(opened.length,2);assert.equal(JSON.stringify(ctx.appState),before);
for(const id of ['message','messages','send'])field(id);
vm.runInContext('messages=[];scope=key()',ctx);nodes.message.value='Olá, como está o balanço da fábrica';await vm.runInContext('send()',ctx);assert.match(vm.runInContext('messages.at(-1).content',ctx),/Entradas de caixa no mês/);
nodes.message.value=input;await vm.runInContext('send()',ctx);assert.equal(vm.runInContext('messages.at(-1).decision.stage',ctx),'origin');
nodes.message.value='O que você pode fazer?';await vm.runInContext('send()',ctx);
nodes.message.value='Foi fabricação';await vm.runInContext('send()',ctx);assert.equal(vm.runInContext('messages.at(-1).plan.kind',ctx),'production');assert.equal(opened.length,2,'O envio não deve abrir/salvar a ficha sem confirmar.');assert.equal(JSON.stringify(ctx.appState),before);
console.log('OK: balanço financeiro e operacional, atenção ao estoque, pilar 1000 versus 3000, fabricação versus ajuste, ambiguidade, quantidade negativa/capacidade, não interferir no financeiro e fichas nativas sem gravação automática.');
