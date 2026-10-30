import assert from 'node:assert/strict';import {answerOperation,advanceOperation,parseWhatsAppClient} from './assistant-planner.mjs';
const state={clients:[],inventory:[]};const name={id:'test',intent:'createClient',fields:{},waiting:'name'};const pasted='[13/10, 06:29] Remetente Fictícia: Cliente Exemplo, Rua Exemplo, 20\n[13/10, 06:29] Remetente Fictícia: Contato (65) 99999 0000';assert.equal(answerOperation(name,pasted,state),null);assert.equal(answerOperation(name,'Cliente Exemplo, Rua Exemplo, 20',state),null);const phone={...name,fields:{name:'Cliente Exemplo'},waiting:'phone'};assert.equal(answerOperation(phone,'Remetente não',state),null);assert.equal(answerOperation(phone,'O nome correto é Cliente Exemplo',state).operation.fields.name,'Cliente Exemplo');const draft=answerOperation(phone,'Contato (65) 99999 0000',state);assert.equal(draft.record.name,'Cliente Exemplo');assert.equal(draft.record.phone,'(65) 99999 0000');const bad=advanceOperation({intent:'createClient',fields:{name:pasted}},state);assert.equal(bad.operation.waiting,'name');console.log('OK: mensagem composta e correção não viram campos locais; telefone com espaço aceito e nome antigo contaminado recusado. Dados fictícios.');

const local=parseWhatsAppClient(pasted,state);assert.equal(local.record.name,'Cliente Exemplo');assert.equal(local.record.phone,'(65) 99999 0000');assert.equal(local.record.address,'Rua Exemplo, 20');assert.equal(local.operation.localOnly,true);console.log('OK: cabeçalhos e remetente separados localmente; cliente, endereço e telefone identificados sem rede.');

const formatted=`[15/10, 16:00] +55 65 9000-1111: *Detalhes para o Agendamento e Instalação do Pilar Pré-Moldado:*
- *Nome Completo:*
- Cliente Fictícia da Silva
- *Endereço Completo:*
- rua Fictícia casa 07 Q 130 bairro Exemplo
- *Ponto de Referência:*
- ao lado do mercado fictício
- *Localização:*
-
- *Telefones para Contatos:*
- 65999990000
- *Vídeo da entrada do portão até o local de instalação do pilar:*
[15/10, 16:04] +55 65 9000-1111: Quais as forma de pagamento`;
const labeled=parseWhatsAppClient(formatted,state);assert.equal(labeled.record.name,'Cliente Fictícia da Silva');assert.equal(labeled.record.phone,'65999990000');assert.equal(labeled.record.address,'rua Fictícia casa 07 Q 130 bairro Exemplo');assert.equal(labeled.record.reference,'ao lado do mercado fictício');assert.equal(labeled.record.location,undefined);assert.doesNotMatch(JSON.stringify(labeled.record),/9000-1111|pagamento|Vídeo|Detalhes/);console.log('OK: formulário WhatsApp com marcadores, títulos, contato sem máscara e mensagem extra; remetente e pergunta não entram no cadastro.');
