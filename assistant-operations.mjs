import {norm,money,localDay} from './assistant-core.mjs';
const clean=v=>norm(v).replace(/[^a-z0-9, .]/g,' ').replace(/\s+/g,' ').trim();
const active=s=>!['cancelled','canceled'].includes(s.status);
const sum=(rows,field)=>rows.reduce((n,r)=>n+Math.round(Number(r[field]||0)*100),0)/100;
export function factoryOverview(state,helpers={},month=localDay().slice(0,7),day=''){
 const start=day||month+'-01',end=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0);const last=day||localDay(end),period=day?'dia':'mês';
 const movements=(state.transactions||[]).filter(t=>['entrada','saida'].includes(t.type)&&Number.isFinite(t.amount)&&t.amount>=0&&typeof t.date==='string');
 const rows=movements.filter(t=>t.date>=start&&t.date<=last);
 const sales=(state.sales||[]).filter(active),monthSales=sales.filter(s=>(s.orderDate||s.date)>=start&&(s.orderDate||s.date)<=last);
 const production=(state.production||[]).filter(p=>p.date>=start&&p.date<=last);
 const native=day?null:helpers.monthlyClosing?.(month);
 const incoming=native?.incoming??sum(rows.filter(t=>t.type==='entrada'),'amount'),outgoing=native?.outgoing??sum(rows.filter(t=>t.type==='saida'),'amount');
 const stock=state.inventory||[],low=stock.filter(p=>Number(p.stock)<=Number(p.minStock||0)),zero=stock.filter(p=>Number(p.stock)<=0);
 const delivery=sales.filter(s=>(helpers.deliveryState?.(s)||s.deliveryStatus)!=='delivered');
 const debts=helpers.balance?sales.filter(s=>helpers.balance(s)>0):sales.filter(s=>['unpaid','pending','partial','overdue'].includes(s.paymentStatus));
 const lines=[`Balanço da fábrica — ${day?day.split('-').reverse().join('/'):month.slice(5)+'/'+month.slice(0,4)}`,'',`Entradas de caixa no ${period}: ${money(incoming)}`,`Saídas de caixa no ${period}: ${money(outgoing)}`,`Resultado de caixa do ${period}: ${money(incoming-outgoing)}`];
 if(native)lines.push(`Saldo dos lançamentos até o fim do mês: ${money(native.closing)}`);
 lines.push(`Vendas do ${period}: ${native?.salesCount??monthSales.length} • ${money(native?.salesTotal??sum(monthSales,'total'))}`,`Produções registradas no ${period}: ${(native?.production||production).length}`, '', 'Situação atual',`Estoque: ${stock.length} produtos/materiais cadastrados; ${low.length} no mínimo ou abaixo; ${zero.length} sem saldo disponível.`, `Pedidos com pagamento pendente: ${debts.length}${helpers.balance?' • '+money(debts.reduce((s,r)=>s+Math.round(helpers.balance(r)*100),0)/100):''}`,`Pedidos ainda não entregues: ${delivery.length}`,'','Pontos de atenção');
 if(low.length)lines.push(`Conferir reposição/produção dos ${low.length} itens com estoque baixo. Os demais itens não estão necessariamente zerados.`);
 if(debts.length)lines.push(`Conferir os ${debts.length} pagamentos pendentes e seus prazos.`);
 if(delivery.length)lines.push(`Organizar os ${delivery.length} pedidos ainda não entregues.`);
 if(!low.length&&!debts.length&&!delivery.length)lines.push('Nenhuma dessas pendências apareceu nos dados carregados.');
 if(native?.warnings?.length)lines.push('',...native.warnings.slice(0,3));
 lines.push('','Caixa não representa lucro. Estoque e pendências acima são atuais; os totais do período consideram os registros do aplicativo.');
 return lines.join('\n');
}
const aliases={pilares:'pilar',pilare:'pilar',manilhas:'manilha',tampas:'tampa',caixas:'caixa',litros:'litro',aguas:'agua',blocos:'bloco',metros:'metro'};
const ignored=new Set(['para','de','da','do','das','dos','d','agua','no','na','nos','nas','estoque','un','unidade','unidades','peca','pecas','ao','a','o','e','em','com','hoje','agora']);
function tokens(value){return clean(value).split(' ').map(v=>aliases[v]||v).filter(v=>v&&!ignored.has(v))}
export function findProducts(description,inventory){
 const wanted=tokens(description);if(!wanted.length)return [];
 return inventory.filter(p=>{const have=tokens(p.name);return wanted.every(w=>have.includes(w))});
}
export function operationDraft(pending,kind,state){
 const product=(state.inventory||[]).find(p=>String(p.id)===String(pending.productId));
 if(!product)return {action:'question',content:'Esse produto não está mais no cadastro. Confira o estoque antes de continuar.'};
 if(!Number.isFinite(pending.quantity)||pending.quantity<=0)return {action:'question',content:'Qual quantidade você quer registrar?'};
 if(kind==='production'&&product.type!=='final')return {action:'question',content:'A fabricação exige um produto acabado. Para esse material posso preparar uma entrada de estoque.'};
 if(kind==='stock'&&pending.type==='saida'&&pending.quantity>Math.max(0,Number(product.stock)))return {action:'answer',content:`O saldo disponível de ${product.name} é ${Number(product.stock)} ${product.unit||''}. A saída de ${pending.quantity} não pode ser preparada com esse saldo.`};
 const record={productId:product.id,productName:product.name,quantity:pending.quantity,type:pending.type||'entrada',date:localDay()};
 return {action:'draft',kind,record,content:kind==='production'?`Fabricação: ${record.quantity} ${product.unit||'un'} de ${product.name}.\nConfira e confirme para registrar a produção e o consumo dos materiais da receita. Nada foi salvo ainda.`:`${record.type==='entrada'?'Entrada/ajuste':'Saída/ajuste'}: ${record.quantity} ${product.unit||'un'} de ${product.name}.\nEsse ajuste não registra fabricação nem consome materiais. Confira e confirme para registrar; nada foi salvo ainda.`};
}
function chooseOperation(pending,state){
 const product=(state.inventory||[]).find(p=>String(p.id)===String(pending.productId));
 if(!product)return {action:'question',content:'Não encontrei esse produto no cadastro atual.'};
 if(!Number.isFinite(pending.quantity)||pending.quantity<=0)return {action:'decision',content:`Produto identificado: ${product.name}. Quantas unidades você quer ${pending.mode==='production'?'registrar como fabricadas':'lançar'}?`,decision:{...pending,stage:'quantity'},choices:[]};
 if(pending.mode==='production')return operationDraft(pending,'production',state);
 if(pending.mode==='stock'||pending.type==='saida'||product.type!=='final')return operationDraft(pending,'stock',state);
 return {action:'decision',content:`Encontrei ${product.name}. Para adicionar ${pending.quantity} ${product.unit||'un'}, qual foi a origem?\n\nFabricação: aumenta o produto e consome os materiais da receita.\nAjuste/entrada: corrige ou acrescenta o saldo sem registrar fabricação.\n\nNenhum registro foi salvo.`,decision:{...pending,stage:'origin'},choices:[{label:'Foi fabricação',value:'Foi fabricação'},{label:'É ajuste de estoque',value:'É ajuste de estoque'}]};
}
function productQuestion(pending,candidates){return {action:'decision',content:`${Number.isFinite(pending.quantity)?`Tenho a quantidade: ${pending.quantity} ${pending.quantity===1?'unidade':'unidades'}${pending.mode==='production'?' fabricadas':''}. `:'Consigo registrar no app. '}${candidates.length?'Qual produto/capacidade você quer registrar?':'Qual é o nome ou a capacidade do produto?'}${Number.isFinite(pending.quantity)?' Não precisa repetir a quantidade.':''}`,decision:{...pending,stage:'product',candidates:candidates.map(p=>p.id)},choices:candidates.slice(0,8).map(p=>({label:p.name,value:p.name}))}}
const intentWords=new Set(['lancar','lanca','lance','lancamento','adicione','adiciona','adicionar','coloca','coloque','colocar','acrescente','acrescenta','acrescentar','entrada','ajuste','ajustar','retire','retira','retirar','baixa','perda','saida','fabricamos','fabriquei','fabricar','fabricando','fabricou','produzimos','produzi','produzir','produzido','fabricacao','producao','eu','ja','mais','ola','por','favor','pode','poderia','voce','vc','preciso','gostaria','quero','que','me','tem','como','consegue']);
function withoutQuantity(value,state,mode,type){const description=tokens(value).filter(t=>!intentWords.has(t)).join(' ');const candidates=description?findProducts(description,state.inventory||[]):(state.inventory||[]).filter(p=>mode!=='production'||p.type==='final');const base={mode,type,description,quantity:null};return candidates.length===1&&description?chooseOperation({...base,productId:candidates[0].id},state):productQuestion(base,candidates)}
export function pendingOperation(messages,state){
 for(let i=messages.length-1;i>=0;i--){const entry=messages[i];if(entry.contextBoundary)break;if(entry.role!=='user')continue;
  if(!/\b(?:fabri|produz|lanc|adicion|coloc|acrescent|ajust|retir|baixa|perda)/.test(clean(entry.content)))continue;
  const result=operationalReply(entry.content,state);
  if(result?.decision)return result.decision;
  if(result?.action==='draft'&&['production','stock'].includes(result.kind))return{stage:'product',quantity:result.record.quantity,type:result.record.type,mode:result.kind==='production'?'production':'stock',candidates:[result.record.productId]};
 }
 return null;
}
export function operationalReply(message,state,helpers={},pending=null,previousOverview=false){
 const value=clean(message);
 if(/^(?:como esta|como ta|qual|quanto|quais|mostr|ver |consul)/.test(value)&&/estoque/.test(value)&&!/lanc|adicion|fabric|registr|retir/.test(value))return{action:'query',query:{dataset:'inventory',filter:/baixo|minimo/.test(value)?'low_stock':'',summary:false}};
 if(/^(?:quanto|qual|mostr|ver |consul)/.test(value)&&/entrou|saiu|entradas|saidas/.test(value)&&/hoje|ontem/.test(value)){const date=new Date();if(/ontem/.test(value))date.setDate(date.getDate()-1);const day=localDay(date);return{action:'query',query:{dataset:'transactions',filter:/saiu|saidas/.test(value)?'saida':'entrada',dateFrom:day,dateTo:day,summary:true}};}

 const lastMonth=/mes passado|mes anterior/.test(value);const d=new Date();if(lastMonth)d.setMonth(d.getMonth()-1,1);const reportMonth=localDay(d).slice(0,7);
 if(/resultado|balanco|balancado/.test(value)&&!/estoque|lanc|registr/.test(value))return {action:'answer',content:factoryOverview(state,helpers,reportMonth),overview:true};
 if(/\bvendas?\b/.test(value)&&/quantas|quanto|resumo|resumido|esse mes|este mes|mes passado/.test(value)&&!/aument|melhor|registr|lanc/.test(value))return {action:'query',query:{dataset:'sales',dateFrom:reportMonth+'-01',dateTo:localDay(new Date(d.getFullYear(),d.getMonth()+1,0)),summary:true}};

 if(/\bbalanco\b|\bpanorama\b|\bresumo (?:da |de )?(?:fabrica|empresa|operacao)\b|como (?:esta|vai|anda).*(?:fabrica|empresa)/.test(value)||previousOverview&&/(?:o\s*que|oque|onde).*(?:precisa|ajuda|ajusta|melhora)/.test(value)){
  const raw=norm(message),match=raw.match(/(\d{4})-(0[1-9]|1[0-2])/);const month=match?match[0]:localDay().slice(0,7);let day='';
  const explicit=raw.match(/\b\d{4}-\d{2}-\d{2}\b/);if(explicit){const parsed=new Date(explicit[0]+'T12:00:00');if(Number.isNaN(parsed.getTime())||localDay(parsed)!==explicit[0])return{action:'question',content:'Essa data não é válida. Qual dia você quer consultar?'};day=explicit[0]}
  if(/\bhoje\b/.test(value))day=localDay();
  if(/\bontem\b/.test(value)){const previous=new Date();previous.setDate(previous.getDate()-1);day=localDay(previous)}
  if(!match&&!day&&/\b(?:anual|ano|semana|semanal|passado|anterior|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(value))return{action:'question',content:'Qual mês você quer no balanço? Posso mostrar o mês atual ou outro mês, como 2026-09. Também posso mostrar o balanço de hoje ou ontem.'};
  const report=factoryOverview(state,helpers,month,day);
  return {action:'answer',content:previousOverview&&/(?:o\s*que|oque|onde).*(?:precisa|ajuda|ajusta|melhora)/.test(value)?'Pontos de atenção'+report.split('Pontos de atenção')[1]:report,overview:true};
 }
 const isProduction=/\b(?:fabri(?:camos|quei|car|cando|cou)|produzimos|produzi|produzir|produzido|fabricacao|producao)\b/.test(value);
 const isStock=/\b(?:lancar|lanca|lance|lancamento|adicione|adiciona|adicionar|coloca|coloque|colocar|acrescente|acrescenta|acrescentar|ajuste|ajustar|retire|retira|retirar|baixa|perda)\b/.test(value)||/\b(?:entrada|saida)\b/.test(value)&&/\bestoque\b/.test(value);
 if(!isProduction&&!/\bestoque\b/.test(value)&&/\b(?:reais|pix|dinheiro|debito|credito|recebimento|despesa)\b/.test(value))return null;
 const amountMatch=value.match(/(?<!\d)(\d+(?:,\d+)?)(?:\s+|(?=[a-z]))(.+)/);
 if(pending?.stage==='quantity'&&!(isProduction||isStock)){
  const words={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};const answer=value.replace(/^(?:sao|foram|a quantidade e|quantidade)\s+/,'');const found=answer.match(/^(-?\d+(?:,\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)(?:\s+(.*))?$/);
  if(found&&!/\b(?:litro|litros)\b/.test(found[2]||'')){const qty=words[found[1]]??Number(found[1].replace(',','.'));if(Number.isFinite(qty)&&qty>0)return chooseOperation({...pending,quantity:qty},state)}
  if(/^(?:sim|pode|ok|vc consegue|voce consegue|consegue|quanto|qual quantidade)$/.test(value)||found)return chooseOperation(pending,state);
 }
 if(pending&&/^(?:(?:vc|voce)\s+)?(?:consegue|pode)(?: mesmo)?$/.test(value))return pending.stage==='product'?productQuestion(pending,(state.inventory||[]).filter(p=>!pending.candidates?.length||pending.candidates.some(id=>String(id)===String(p.id)))):chooseOperation(pending,state);
 if(pending?.stage==='product'&&!(isProduction||isStock)){
  const all=state.inventory||[],list=pending.candidates?.length?all.filter(p=>pending.candidates.some(id=>String(id)===String(p.id))):all;
  let matched=findProducts(value,list);
  if(!matched.length&&/\b(?:pilar|pilares|manilha|manilhas|tampa|tampas|bloco|blocos)\b/.test(value))matched=findProducts(value,all);
  if(matched.length===1)return chooseOperation({...pending,productId:matched[0].id},state);
  if(matched.length>1)return productQuestion(pending,matched);
  if(!/^(?:quanto|quem|qual|quais|como|o que|oque|bom dia|boa tarde|boa noite|ola|oi)\b/.test(value))return productQuestion(pending,list);
 }
 if((isProduction||isStock)&&amountMatch){
  const prefix=value.slice(0,amountMatch.index);if(tokens(prefix).some(t=>!intentWords.has(t)))return withoutQuantity(value,state,isProduction?'production':'ask','entrada');
  if(/^[-−]/.test((String(message).match(/[-−+]?\d+(?:,\d+)?/)||[''])[0]))return{action:'question',content:'Informe uma quantidade positiva para a movimentação.'};
  const quantity=Number(amountMatch[1].replace(',','.'));let description=amountMatch[2].replace(/\b(?:no|ao|para o|em|do) estoque\b.*$/,'').trim();
  description=description.replace(/^(?:unidades?|pecas?)\s+(?:de\s+)?/,'');
  if(!quantity||quantity<=0)return {action:'question',content:'Qual quantidade positiva você quer registrar?'};
  const candidates=findProducts(description,state.inventory||[]);
  const base={quantity,type:/\b(?:retire|retira|retirar|baixa|perda|saida)\b/.test(value)?'saida':'entrada',mode:isProduction?'production':/\b(?:ajuste|ajustar|compra|comprei)\b/.test(value)?'stock':'ask'};
  if(!candidates.length)return productQuestion({...base,description},[]);
  if(candidates.length>1)return productQuestion({...base,description},candidates);
  return chooseOperation({...base,productId:candidates[0].id},state);
 }
 if((isProduction||isStock)&&!amountMatch&&!pending)return withoutQuantity(value,state,isProduction?'production':'ask',/\b(?:retire|retira|retirar|baixa|perda|saida)\b/.test(value)?'saida':'entrada');
 if(pending?.stage==='product'){
  const list=(state.inventory||[]).filter(p=>pending.candidates.some(id=>String(id)===String(p.id)));
  const chosen=list.filter(p=>clean(p.name)===value);if(chosen.length===1)return chooseOperation({...pending,productId:chosen[0].id},state);
 }
 if(pending?.stage==='origin'){
  if(/\b(?:fabricacao|producao|fabri(?:camos|quei|cou)|produzimos|produzi)\b/.test(value))return operationDraft(pending,'production',state);
  if(/\b(?:ajuste|entrada|compra|comprei|correcao|saldo|sobra)\b/.test(value))return operationDraft(pending,'stock',state);
  if(/^(?:sim|pode|ok|pode fazer|adiciona|adicione)$/.test(value))return{action:'decision',content:'Preciso distinguir a origem para não lançar os materiais errado. Foi fabricação ou ajuste de estoque?',decision:pending,choices:[{label:'Foi fabricação',value:'Foi fabricação'},{label:'É ajuste de estoque',value:'É ajuste de estoque'}]};
  if(/(?:por\s*que|porque|pq|qual a diferenca|como funciona)/.test(value))return chooseOperation(pending,state);
 }
 if(/(?:voce|vc|assistente).*(?:pode|consegue).*(?:estoque|fabricar|produzir|producao|fabricacao)/.test(value))return{action:'answer',content:'Posso preparar fabricação e ajustes de estoque nas fichas originais do app. Diga a quantidade e o produto. Se a origem não estiver clara, pergunto se foi fabricação ou ajuste; isso evita consumir materiais ou mudar o saldo de forma errada. Você confere e confirma antes de salvar.'};
 return null;
}
