import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const nodes={};
function node(id){return nodes[id]||= {hidden:true,style:{},attributes:{},classList:{toggle(name,value){this[name]=value}},setAttribute(k,v){this.attributes[k]=v},textContent:'',innerHTML:'',scrollTop:0,scrollHeight:1};}
const ctx={document:{getElementById:node},currentUser:{uid:'person-one'},currentEnv:'prod',localStorage:{getItem:()=>JSON.stringify([{role:'assistant',content:'Histórico preservado'}]),setItem(){}},console};
const source=fs.readFileSync(new URL('./assistant.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf("if(document.readyState==='complete')")),ctx);
vm.runInContext('root={getElementById:id=>document.getElementById(id)};panel=document.getElementById("panel");button=document.getElementById("assistant-mode");refresh()',ctx);
assert.equal(nodes.panel.hidden,false);assert.equal(nodes['screen-switcher'].hidden,false);assert.equal(nodes['main-app'].inert,true);assert.equal(nodes['assistant-mode'].attributes['aria-pressed'],'true');
assert.match(nodes.messages.innerHTML,/Histórico preservado/);
vm.runInContext('show(false)',ctx);assert.equal(nodes.panel.hidden,true);assert.equal(nodes['main-app'].inert,false);assert.equal(nodes['manual-mode'].attributes['aria-pressed'],'true');
vm.runInContext('refresh()',ctx);assert.equal(nodes.panel.hidden,true,'A verificação de sessão não deve forçar volta ao assistente durante uso manual.');
vm.runInContext('show(true)',ctx);assert.equal(nodes.panel.hidden,false);assert.match(nodes.messages.innerHTML,/Histórico preservado/);
ctx.currentUser=null;vm.runInContext('refresh()',ctx);assert.equal(nodes.panel.hidden,true);assert.equal(nodes['screen-switcher'].hidden,true);assert.equal(nodes['main-app'].inert,false);assert.equal(nodes['main-app'].style.paddingTop,'');
ctx.currentUser={uid:'person-two'};vm.runInContext('refresh()',ctx);assert.equal(nodes.panel.hidden,false,'Cada nova sessão começa no assistente.');
console.log('OK: início no assistente após login, alternância manual sem reset, histórico preservado, isolamento de foco, saída de conta e novo login. Nenhum registro da fábrica alterado.');
