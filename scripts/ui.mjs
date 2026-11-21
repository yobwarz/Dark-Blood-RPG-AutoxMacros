import {ID,TRIGGERS,CONDITIONS,ACTIONS,WHEN,STATUS,draft,copy,esc,matches,validate} from './model.mjs';
import {all,activeGM,guard,ensure,read} from './store.mjs';
import {saveFlow,deleteFlow,decide,resume,reconcile,cleanHistory,references} from './engine.mjs';
import {manual,base} from './events.mjs';
import {waitForm} from './dialog.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
const windows=new Set();
export const safe=fn=>async function(...args){try{return await fn.apply(this,args);}catch(e){console.error(ID,e);ui.notifications.warn(e.message);}};
export const refresh=()=>{for(const w of windows)if(w.rendered)w.render(false);};
const opts=(dict,value)=>Object.entries(dict).map(([id,name])=>({id,name,selected:String(value)===id}));
const rows=(list,value)=>list.map(([id,name])=>({id,name,selected:String(value)===id}));
const actors=()=>[...new Map([...all(game.actors),...all(game.scenes).flatMap(s=>all(s.tokens).map(t=>t.actor).filter(Boolean))].map(a=>[a.uuid,a])).values()];
const scenes=()=>all(game.scenes).map(s=>[s.id,s.name]);
const scenarios=()=>[['base','Sistema base'],...(game.sangueEscuro?.api?.cenarios??[]).filter(c=>c.id!=='base').map(c=>[c.id,c.nome])];
const skills=()=>Object.entries(CONFIG.SE.PERICIAS??{}).map(([id,p])=>[id,p.nome]);
export const input=(n,label,v='',type='text')=>`<label>${esc(label)}<input name="${esc(n)}" type="${type}" value="${esc(v)}"></label>`;
export const select=(n,label,list,v)=>`<label>${esc(label)}<select name="${esc(n)}">${list.map(([id,name])=>`<option value="${esc(id)}"${String(v)===id?' selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
const check=(n,label)=>`<label class="ax-check"><input name="${esc(n)}" type="checkbox"> ${esc(label)}</label>`;
export function form(title,content,submit){return waitForm({window:{title},classes:['ax-dialog'],position:{width:600},content:`<div class="ax-form">${content}<p data-form-error role="alert" tabindex="-1"></p></div>`,rejectClose:false,buttons:[{action:'save',label:'Confirmar',default:true,callback:async(e,b)=>submit(new foundry.applications.ux.FormDataExtended(b.form).object)},{action:'cancel',label:'Cancelar',type:'button',callback:()=>null}]});}
function conditionOptions(c){if(c.type==='scene')return scenes();if(c.type==='actor')return actors().map(a=>[a.uuid,a.name]);if(c.type==='scenario')return scenarios();if(c.type==='category')return [['fogo','Arma de fogo'],['branca','Arma branca'],['improvisada','Arma improvisada']];if(['hit','critical'].includes(c.type))return [['true','Sim'],['false','Não']];return null;}
function conditionText(c){const options=conditionOptions(c);return `${CONDITIONS[c.type]} ${options?.find(([id])=>String(id)===String(c.value))?.[1]??c.value}`;}
function actionText(a){if(a.type==='gm'||a.type==='message')return a.text;if(a.type==='roll')return `${a.formula} · CD ${a.dc}`;if(a.type==='skill')return `${CONFIG.SE.PERICIAS?.[a.skill]?.nome??a.skill} · CD ${a.dc}`;if(a.type==='panic')return 'Usa o Teste de Pânico nativo, com CD 12.';return a.uuid;}
export class Editor extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={id:'autoxmacros-editor',tag:'section',classes:['ax-app','ax-editor'],window:{title:'AutoxMacros — Montar automação',resizable:true},position:{width:880,height:820},actions:{ax:safe(async function(e,t){await this.perform(t.dataset.op,t);})}};
 static PARTS={main:{template:`modules/${ID}/templates/editor.hbs`,scrollable:['.ax-body']}};
 constructor(flow=draft()){super({id:'autoxmacros-editor-'+foundry.utils.randomID()});this.draft=copy(flow);}
 collect(){const root=this.element;if(!root?.querySelector)return;const get=(n)=>root.querySelector(`[name="${n}"]`);for(const k of ['name','trigger','mode','cooldown'])if(get(k))this.draft[k]=get(k).value;for(const k of ['enabled','once'])if(get(k))this.draft[k]=get(k).checked;
  this.draft.conditions=[...root.querySelectorAll('[data-condition-row]')].map(row=>({type:row.querySelector('[data-field="type"]').value,value:row.querySelector('[data-field="value"]')?.value??''}));
  this.draft.actions=[...root.querySelectorAll('[data-action-row]')].map(row=>{const a={};for(const el of row.querySelectorAll('[data-field]'))a[el.dataset.field]=el.value;return a;});
 }
 async _prepareContext(){return {flow:this.draft,triggers:opts(TRIGGERS,this.draft.trigger),modes:opts({confirm:'Pedir confirmação ao Mestre',auto:'Automática para eventos do Mestre'},this.draft.mode),conditions:this.draft.conditions.map((c,index)=>({index,types:opts(CONDITIONS,c.type),numeric:['minimum','pv'].includes(c.type),value:c.value,options:rows(conditionOptions(c)??[],c.value)})),actions:this.draft.actions.map((a,index)=>({index,number:index+1,types:opts(ACTIONS,a.type),when:opts(WHEN,a.when),message:['gm','message'].includes(a.type),text:a.text??'',roll:a.type==='roll',formula:a.formula??'1d20',skill:a.type==='skill',skills:rows(skills(),a.skill),hasDc:['roll','skill'].includes(a.type),dc:a.dc??12,macro:a.type==='macro',macros:rows([['','Escolha uma macro'],...all(game.macros).map(m=>[m.uuid,m.name])],a.uuid),journal:a.type==='journal',journals:rows([['','Escolha um diário'],...all(game.journal).filter(j=>!j.flags?.[ID]?.database).map(j=>[j.uuid,j.name])],a.uuid),first:index===0,last:index===this.draft.actions.length-1}))};}
 async _onRender(...args){await super._onRender(...args);this.element.querySelectorAll('[data-rerender]').forEach(el=>el.addEventListener('change',()=>{this.collect();this.render(false);}));this.element.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();this.persist();});}
 async persist(){this.collect();const error=this.element.querySelector('[data-editor-error]');try{await saveFlow(this.draft);await this.close();refresh();}catch(e){error.textContent=e.message;error.focus();}}
 async perform(op,target){guard({paused:true});if(op==='cancel')return this.close();if(op==='save')return this.persist();this.collect();const index=Number(target.dataset.index);
  if(op==='condition')this.draft.conditions.push({type:'scene',value:scenes()[0]?.[0]??''});
  if(op==='action')this.draft.actions.push({type:'gm',when:'always',text:'Novo aviso.'});
  if(op==='removeCondition')this.draft.conditions.splice(index,1);
  if(op==='removeAction')this.draft.actions.splice(index,1);
  if(op==='up'&&index>0)[this.draft.actions[index-1],this.draft.actions[index]]=[this.draft.actions[index],this.draft.actions[index-1]];
  if(op==='down'&&index<this.draft.actions.length-1)[this.draft.actions[index+1],this.draft.actions[index]]=[this.draft.actions[index],this.draft.actions[index+1]];
  if(op==='preview')return preview(this.draft);
  return this.render(false);
 }
}
async function preview(raw){const flow=validate(raw);await references(flow);return form('Testar sem executar',select('actor','Personagem do exemplo',[['','Sem personagem'],...actors().map(a=>[a.uuid,a.name])])+select('scene','Cena do exemplo',[['','Sem cena'],...scenes()],globalThis.canvas?.scene?.id??'')+select('category','Categoria da arma',[['fogo','Arma de fogo'],['branca','Arma branca'],['improvisada','Arma improvisada']])+select('hit','O ataque acertou?',[['true','Sim'],['false','Não']])+select('critical','O ataque foi crítico?',[['false','Não'],['true','Sim']])+input('total','Dano rolado no exemplo',0,'number'),async d=>{const actor=d.actor?await fromUuid(d.actor):null,scene=game.scenes.get(d.scene),event=base(flow.trigger,'preview',actor,scene);Object.assign(event,{category:d.category,hit:d.hit==='true',critical:d.critical==='true',total:Number(d.total)});const result=matches(flow,event);await form('Resultado da simulação',`<p><strong>${esc(result.reason)}</strong></p><ol>${flow.actions.map(a=>`<li>${esc(ACTIONS[a.type])} — ${esc(WHEN[a.when])}</li>`).join('')}</ol><p>Nenhuma ação foi executada, nenhum dado foi rolado e nenhuma macro foi alterada.</p>`,()=>null);});}
async function perform(op,el){guard({paused:true});await ensure();const id=el?.dataset.id,s=read(),flow=s.flows.find(f=>f.id===id);
 if(op==='new')return new Editor().render(true);
 if(op==='example'){const f=draft();f.name='Disparo chama atenção';f.trigger='attack';f.conditions=[{type:'category',value:'fogo'}];f.actions=[{type:'gm',when:'always',text:'{personagem} disparou {arma} em {cena}. Confira quais ameaças podem ouvir e conduza a reação.'},{type:'message',when:'always',text:'O estampido ecoa pelo ambiente.'}];return new Editor(f).render(true);}
 if(op==='refresh'){refresh();return;}
 if(op==='pause'){await game.settings.set(ID,'enabled',game.settings.get(ID,'enabled')===false);refresh();return;}
 if(op==='clean')return form('Limpar histórico visível','<p>Ocultar execuções encerradas? Pedidos, pendências e recibos contra repetição serão preservados.</p>',cleanHistory);
 if(op==='approve')return form('Aprovar execução','<p>Confirme a origem do evento, as condições da cena e os efeitos desta sequência.</p>',()=>decide(id,true));
 if(op==='deny')return decide(id,false);
 if(op==='resume')return resume(id);
 if(op==='review')return form('Conferir etapa incerta',select('decision','Após conferir o chat e os efeitos',[['stop','Encerrar sem repetir nem desfazer efeitos'],['applied','A etapa já foi aplicada; continuar depois']])+input('total','Resultado já obtido, se era dado ou teste',0,'number')+'<p>Nenhuma etapa incerta será repetida por este controle. Se houve rolagem, informe o total real já obtido.</p>'+check('confirmed','Conferi os efeitos antes de encerrar ou continuar'),d=>reconcile(id,{stop:d.decision==='stop',confirmed:!!d.confirmed,total:d.total}));
 if(!flow)throw Error('Automação não encontrada.');
 if(op==='edit')return new Editor(flow).render(true);
 if(op==='duplicate')return saveFlow({...flow,name:flow.name+' — cópia'},{duplicate:true}).then(refresh);
 if(op==='toggle')return saveFlow({...flow,enabled:!flow.enabled}).then(refresh);
 if(op==='delete')return form('Excluir automação','<p>Excluir esta automação? O histórico e os recibos existentes serão preservados.</p>',()=>deleteFlow(id));
 if(op==='preview')return preview(flow);
 if(op==='run')return form('Executar pelo painel',select('actor','Personagem (para testes e mensagens)',[['','Sem personagem'],...actors().map(a=>[a.uuid,a.name])]),d=>manual(id,d.actor||null));
 throw Error('Ação desconhecida.');
}
export class Panel extends HandlebarsApplicationMixin(ApplicationV2){static DEFAULT_OPTIONS={id:'autoxmacros-panel',tag:'section',classes:['ax-app'],window:{title:'Sangue Escuro - AutoxMacros',resizable:true},position:{width:1000,height:800},actions:{ax:safe(async function(e,t){await perform(t.dataset.op,t);refresh();})}};static PARTS={main:{template:`modules/${ID}/templates/panel.hbs`,scrollable:['.ax-body']}};
 async _prepareContext(){if(!activeGM())return {gm:false};const s=read();return {gm:true,paused:game.settings.get(ID,'enabled')===false,flows:s.flows.map(f=>({...f,triggerLabel:TRIGGERS[f.trigger],modeLabel:f.mode==='auto'?'Automática para eventos do Mestre':'Confirmação do Mestre',manual:f.trigger==='manual',conditionLabels:f.conditions.map(conditionText),actionLabels:f.actions.map(a=>({name:ACTIONS[a.type],detail:actionText(a),when:WHEN[a.when]}))})),executions:[...s.executions].reverse().filter(r=>!['done','denied','stopped'].includes(r.status)||r.created>s.hiddenBefore).map(r=>({...r,statusLabel:STATUS[r.status],waiting:r.status==='waiting',ready:r.status==='ready',uncertain:['running','uncertain'].includes(r.status),actorName:r.event.actorName||'Sem personagem',triggerLabel:TRIGGERS[r.event.kind],steps:r.steps.map((st,i)=>({number:i+1,name:ACTIONS[st.action.type],statusLabel:{ready:'Não iniciada',running:'Confira se já foi aplicada',done:'Concluída',skipped:'Condição de resultado não atendida'}[st.status],result:st.result?.label??'',error:st.error}))}))};}
 async _onRender(...a){await super._onRender(...a);windows.add(this);}async close(...a){windows.delete(this);return super.close(...a);}
}
export async function open(){if(!activeGM())throw Error('O painel é gerenciado pelo Mestre ativo.');await ensure();const w=[...windows][0]??new Panel();return w.render(true);}
export class Menu extends ApplicationV2{async render(){return open();}}
