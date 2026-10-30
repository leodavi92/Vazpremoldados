import {norm,localDay,money} from './assistant-core.mjs';

export const ACTION_CATALOG=Object.freeze({
 createClient:'Cadastrar cliente',updateClient:'Atualizar cliente',recordTransaction:'Registrar entrada ou despesa',adjustStock:'Registrar entrada ou saída de estoque',recordProduction:'Registrar fabricação e consumo de materiais',createSale:'Criar venda e registrar recebimento',receiveSale:'Registrar recebimento de pedido',completeDelivery:'Confirmar entrega',cancelSale:'Cancelar pedido com motivo e tratamento do estoque',payMaterialPurchase:'Registrar pagamento de compra de matéria-prima'
});
const clone=value=>JSON.parse(JSON.stringify(value));
const text=value=>typeof value==='string'?value.trim():'';
function idFor(state){return ['clients','transactions','production','stockMovements','materialPurchases','auditLog'].reduce((max,key)=>(state[key]||[]).reduce((n,r)=>Math.max(n,Number(r.id)||0),max),Date.now())+1}
function amount(value){if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.00001)throw Error('Informe um valor positivo com até duas casas decimais.');return Math.round(value*100)/100}
function day(value,today){const result=value||today;if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number.isNaN(Date.parse(result))||new Date(result+'T12:00:00Z').toISOString().slice(0,10)!==result||result>today)throw Error('Confira a data do lançamento; ela não pode ser futura.');return result}
function method(state,value){const simplified=v=>norm(v).replace(/cartao (?:de )?/g,'').trim();const found=(state.config?.paymentMethods||[]).find(v=>simplified(v)===simplified(value));if(!found)throw Error('Forma de pagamento não cadastrada no app.');return found}
function account(state,value){const found=value||(state.accounts||[])[0];if(!(state.accounts||[]).includes(found))throw Error('Conta financeira não encontrada.');return found}
function product(state,id){const found=(state.inventory||[]).find(p=>String(p.id)===String(id));if(!found||!Number.isFinite(found.stock))throw Error('Produto não encontrado ou saldo inválido.');return found}
function quantity(value){if(!Number.isFinite(value)||value<=0)throw Error('Informe uma quantidade positiva.');return value}

/** All commands execute on a clone. Failed validation never changes the live app. */
export function executeAction(original,command,options={}){
 if(!command||typeof command.id!=='string'||!command.id||!ACTION_CATALOG[command.action])throw Error('Ação inválida. Nada foi alterado.');
 const existing=(original.assistantOperations||[]).find(op=>op.id===command.id);
 if(existing)return {state:original,result:existing.result,repeated:true};
 const state=clone(original),r=command.record||{},today=options.today||localDay();
 let result;
 if(command.action==='createClient'){
  const name=text(r.name),phone=text(r.phone);
  if(!name||!/(?:\+?55[\s-]*)?\(?\d{2}\)?[\s-]*\d{4,5}[\s-]?\d{4}(?!\d)/.test(phone))throw Error('Nome e telefone com DDD são necessários.');
  if((state.clients||[]).some(c=>norm(c.name)===norm(name)))throw Error('Já existe um cliente com esse nome. Peça para atualizar o cadastro existente.');
  const id=idFor(state),row={id,createdAt:Date.now(),name,phone,type:/\b(?:ltda|s\/a)\b/i.test(name)?'PJ':'PF',taxId:'',email:''};
  for(const key of ['responsible','address','reference','location','email','taxId'])if(text(r[key]))row[key]=text(r[key]);
  if(row.address)row.street=row.address;
  (state.clients||=[]).push(row);result={id,kind:'clients',message:`Cliente cadastrado: ${row.name}. Registro #${id}.`};
 }else if(command.action==='updateClient'){
  const row=(state.clients||[]).find(c=>String(c.id)===String(r.clientId));if(!row)throw Error('Cliente não encontrado.');
  let changed=false;for(const key of ['name','phone','responsible','address','reference','location','email','taxId'])if(Object.hasOwn(r,key)){if(typeof r[key]!=='string')throw Error('Campo de cliente inválido.');row[key]=r[key].trim();if(key==='address'){row.street=row.address;for(const part of ['block','number','neighborhood','city','state'])row[part]=''}changed=true}
  if(!changed||!row.name)throw Error('Informe o campo que deseja atualizar.');
  if(row.phone&&!/\(?\d{2}\)?[\s-]*\d{4,5}[\s-]?\d{4}/.test(row.phone))throw Error('Confira o novo telefone com DDD.');
  if((state.clients||[]).some(c=>c.id!==row.id&&norm(c.name)===norm(row.name)))throw Error('Esse nome já pertence a outro cadastro.');
  result={id:row.id,kind:'clients',message:`Cadastro de ${row.name} atualizado. Registro #${row.id}.`};
 }else if(command.action==='recordTransaction'){
  if(!['entrada','saida'].includes(r.type)||!text(r.description))throw Error('Informe entrada/saída e o motivo do lançamento.');
  const value=amount(r.amount),paymentMethod=method(state,r.paymentMethod),date=day(r.date,today),financialAccount=account(state,r.account);
  if(r.saleId)throw Error('Para receber um pedido use a ação de recebimento da venda.');
  const id=idFor(state),row={id,type:r.type,amount:value,description:text(r.description),date,category:text(r.category)||'Outros',account:financialAccount,paymentMethod};
  (state.transactions||=[]).push(row);result={id,kind:'transactions',message:`${r.type==='saida'?'Despesa':'Entrada'} registrada: ${money(value)} — ${row.description}. Registro #${id}.`};
 }else if(command.action==='payMaterialPurchase'){
  const purchase=(state.materialPurchases||[]).find(p=>String(p.id)===String(r.purchaseId));if(!purchase||!['unpaid','partial'].includes(purchase.paymentStatus))throw Error('Essa compra não está mais pendente. Nenhum pagamento duplicado foi registrado.');
  const value=amount(Math.round((purchase.total-(purchase.paidAmount||0))*100)/100),paymentMethod=method(state,r.paymentMethod),financialAccount=account(state,r.account),date=day(r.date,today);if(date<purchase.date)throw Error('O pagamento não pode ser anterior à compra.');
  if(Number.isFinite(r.amount)&&Math.round(r.amount*100)!==Math.round(value*100))throw Error('O saldo dessa compra mudou. Confira o valor antes de registrar o pagamento.');
  const id=idFor(state);(state.transactions||=[]).push({id,type:'saida',amount:value,date,description:'Pagamento de compra: '+purchase.productName+' · '+purchase.supplier,category:'Compra de Matéria-Prima',account:financialAccount,paymentMethod,materialPurchaseId:purchase.id});purchase.paymentStatus='paid';purchase.paidAmount=purchase.total;purchase.paidAt=date;purchase.transactionId=id;
  result={id,kind:'transactions',message:'Pagamento da compra registrado: '+money(value)+'. O estoque não foi alterado novamente. Registro #'+id+'.'};
 }else if(command.action==='adjustStock'){
  const p=product(state,r.productId),qty=quantity(r.quantity),date=day(r.date,today);if(!['entrada','saida'].includes(r.type))throw Error('Informe entrada ou saída de estoque.');
  if(r.type==='saida'&&qty>Math.max(0,p.stock))throw Error(`Saldo insuficiente: ${p.name} tem ${p.stock} ${p.unit||'un'} disponíveis.`);
  const purchase=r.origin==='purchase';let unitPrice=0,totalPrice=0,paidAmount=0,paymentMethod,financialAccount;
  if(purchase){
   if(p.type!=='raw'||r.type!=='entrada')throw Error('A compra de matéria-prima exige entrada em um material cadastrado.');
   unitPrice=amount(r.unitPrice);totalPrice=amount(Math.round(unitPrice*qty*100)/100);
   if(!['paid','unpaid','partial'].includes(r.purchasePayment))throw Error('Informe se a compra já foi paga ou ficou a prazo.');
   paidAmount=r.purchasePayment==='paid'?totalPrice:r.purchasePayment==='partial'?amount(r.amountPaid):0;if(r.purchasePayment==='partial'&&paidAmount>=totalPrice)throw Error('O pagamento parcial deve ser menor que o total.');
   if(['paid','partial'].includes(r.purchasePayment)){paymentMethod=method(state,r.paymentMethod);financialAccount=account(state,r.account)}
   if(r.purchasePayment!=='paid'&&(!text(r.supplier)||!/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate||'')||Number.isNaN(Date.parse(r.dueDate))||new Date(r.dueDate+'T12:00:00Z').toISOString().slice(0,10)!==r.dueDate||r.dueDate<date))throw Error('Informe o fornecedor e um vencimento válido, igual ou posterior à compra.');
  }
  const oldStock=p.stock;p.stock=Number((p.stock+(r.type==='entrada'?qty:-qty)).toFixed(6));
  const id=idFor(state);const movement={id,productId:p.id,productName:p.name,type:r.type,qty,date,oldStock,newStock:p.stock,unitPrice,totalPrice,reason:text(r.reason)||(purchase?'Compra de matéria-prima':'Lançamento pelo assistente')};(state.stockMovements||=[]).push(movement);
  if(purchase){
   p.costPrice=unitPrice;
   const bill={id,productId:p.id,productName:p.name,qty,unitPrice,total:totalPrice,date,supplier:text(r.supplier),paymentStatus:r.purchasePayment,paidAmount,stockMovementId:id};if(r.purchasePayment!=='paid')bill.dueDate=r.dueDate;
   if(paidAmount>0){const tid=idFor(state);(state.transactions||=[]).push({id:tid,type:'saida',amount:paidAmount,date,description:`Compra: ${qty} ${p.unit||'un'} de ${p.name}`,category:'Compra de Matéria-Prima',account:financialAccount,paymentMethod,materialPurchaseId:id,stockMovementId:id});bill.transactionId=tid;if(r.purchasePayment==='paid')bill.paidAt=date;movement.transactionId=tid}
   (state.materialPurchases||=[]).push(bill);
  }
  result={id,kind:'stockMovements',message:`${r.type==='entrada'?'Entrada':'Saída'} registrada: ${qty} ${p.unit||'un'} de ${p.name}. Saldo: ${p.stock} ${p.unit||'un'}. Registro #${id}.`+(purchase?`\nCompra: ${money(unitPrice)} por ${p.unit||'unidade'} · total ${money(totalPrice)}. Custo cadastrado atualizado para o valor desta entrada.`+(r.purchasePayment==='paid'?`\nSaída de ${money(paidAmount)} registrada em ${financialAccount}, via ${paymentMethod}.`:`\nA pagar: ${money(Math.round((totalPrice-paidAmount)*100)/100)} a ${r.supplier}, vencimento ${r.dueDate}. ${paidAmount>0?'Saída parcial de '+money(paidAmount)+' registrada.':'Não houve saída de caixa agora.'}`):'')};
 }else if(command.action==='recordProduction'){
  const p=product(state,r.productId),qty=quantity(r.quantity),date=day(r.date,today);
  if(p.type!=='final'||!Number.isInteger(qty)||!Array.isArray(p.recipe)||!p.recipe.length)throw Error('A fabricação exige produto acabado, quantidade inteira e receita cadastrada.');
  const needs=new Map();for(const item of p.recipe){product(state,item.productId);quantity(item.qty);needs.set(String(item.productId),(needs.get(String(item.productId))||0)+item.qty*qty)}
  const materials=[];for(const [id,total] of needs){const material=product(state,id);if(material.id===p.id)throw Error('A receita não pode consumir o próprio produto.');if(material.stock+1e-9<total)throw Error(`Material insuficiente: ${material.name}. Necessário ${Number(total.toFixed(6))}; disponível ${material.stock}.`);materials.push({productId:material.id,name:material.name,qty:Number(total.toFixed(6))})}
  for(const item of materials){const material=product(state,item.productId);material.stock=Number((material.stock-item.qty).toFixed(6))}
  p.stock=Number((p.stock+qty).toFixed(6));const id=idFor(state);(state.production||=[]).push({id,productId:p.id,productName:p.name,qty,date,materials});
  result={id,kind:'production',message:`Fabricação registrada: ${qty} ${p.unit||'un'} de ${p.name}. Materiais baixados conforme a receita. Saldo do produto: ${p.stock}. Registro #${id}.`};
 }else if(command.action==='createSale'){
  const p=product(state,r.productId),qty=quantity(r.quantity),date=day(r.date,today),client=(state.clients||[]).find(c=>String(c.id)===String(r.clientId));
  if(!client&&r.consumerFinal!==true)throw Error('Informe um cliente cadastrado ou escolha Consumidor Final.');
  const total=amount(r.total),received=r.received;if(!Number.isFinite(received)||received<0||received>total)throw Error('Informe quanto foi recebido, de zero até o total da venda.');
  if(!['delivered','scheduled'].includes(r.deliveryStatus))throw Error('Informe se o produto foi entregue ou será entregue depois.');
  if(r.deliveryStatus==='delivered'&&qty>Math.max(0,p.stock))throw Error('Não há saldo disponível para concluir essa entrega imediata.');
  if(r.deliveryStatus==='scheduled'&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.deliveryDate||'')||Number.isNaN(Date.parse(r.deliveryDate))||new Date(r.deliveryDate+'T12:00:00Z').toISOString().slice(0,10)!==r.deliveryDate||r.deliveryDate<date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.deliveryTime||'')))throw Error('Informe data e horário válidos para a entrega agendada.');
  if(typeof options.native?.snapshotSaleItems!=='function'||received>0&&typeof options.native?.receiveSale!=='function')throw Error('A venda ainda não está conectada nesta versão.');
  const items=options.native.snapshotSaleItems(state,[{productId:p.id,name:p.name,qty,price:total/qty}]);
  const id=(state.sales||[]).reduce((max,s)=>Math.max(max,Number(s.id)||0),99999)+1;
  const sale={id,clientId:client?.id||0,clientName:client?.name||'Consumidor Final',deliveryContact:client?clone(client):{name:'Consumidor Final'},date,orderDate:date,items,total,payments:[],fee:0,discount:0,status:'pending',paymentStatus:'unpaid',deliveryStatus:r.deliveryStatus,deliveryDate:r.deliveryStatus==='scheduled'?r.deliveryDate:null,deliveryTime:r.deliveryStatus==='scheduled'?r.deliveryTime:null,deliveryHelperCount:0,deliveryHelperCostTotal:0};
  if(r.deliveryStatus==='delivered')sale.deliveredAt=date;
  (state.sales||=[]).push(sale);p.stock=Number((p.stock-qty).toFixed(6));
  if(received>0)options.native.receiveSale(state,{saleId:id,amount:amount(received),paymentMethod:method(state,r.paymentMethod),installments:r.installments||1,date});
  result={id,kind:'sales',message:`Venda #${id} registrada para ${sale.clientName}: ${qty} ${p.unit||'un'} de ${p.name}, total ${money(total)}. Recebido: ${money(received)}. Falta receber: ${money(total-received)}.`};
 }else{
  const sale=(state.sales||[]).find(s=>String(s.id)===String(r.saleId));if(!sale||sale.status==='cancelled')throw Error('Pedido não encontrado ou cancelado.');
  if(command.action==='cancelSale'&&(!text(r.reason)||typeof r.returnStock!=='boolean'||command.confirmed!==true))throw Error('Cancelamento exige motivo, decisão sobre retorno do estoque e confirmação explícita.');
  const callback=options.native?.[command.action];if(typeof callback!=='function')throw Error('Essa ação ainda não está conectada nesta versão. Nada foi alterado.');
  const args={...r,saleId:sale.id};
  if(command.action==='receiveSale'){args.amount=amount(r.amount);args.paymentMethod=method(state,r.paymentMethod);args.date=day(r.date,today);args.installments=r.installments||1}
  if(command.action==='completeDelivery'){if(!Number.isFinite(r.helperAmount)||r.helperAmount<0)throw Error('Informe o custo do ajudante ou zero quando não houve custo.');args.account=account(state,r.account);args.helperName=text(r.helperName)}
  callback(state,args);
  result={id:sale.id,kind:'sales',message:`${command.action==='receiveSale'?'Recebimento registrado':command.action==='completeDelivery'?'Entrega confirmada':'Pedido cancelado'} no pedido #${sale.id}.`};
 }
 (state.auditLog||=[]).push({id:idFor(state),action:'assistant:'+command.action,recordId:result.id,commandId:command.id,date:today});
 (state.assistantOperations||=[]).push({id:command.id,action:command.action,date:today,result});
 return {state,result,repeated:false};
}

export function commandForPlan(plan,id){
 const mapping={clients:'createClient',transactions:'recordTransaction',stock:'adjustStock',production:'recordProduction',sale:'createSale',client_update:'updateClient',sale_payment:'receiveSale',delivery:'completeDelivery',sale_cancel:'cancelSale',material_payment:'payMaterialPurchase'};
 const action=mapping[plan?.kind];if(!action)throw Error('A ficha não corresponde a uma ação disponível.');
 return{id,action,record:plan.record,confirmed:plan.kind==='sale_cancel'};
}
