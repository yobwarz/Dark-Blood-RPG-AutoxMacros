import {ID} from './model.mjs';
import {activeGM,all} from './store.mjs';
import {current,ingest} from './engine.mjs';
const health=new Map();
const session=()=>foundry.utils.randomID();let visit=0,sessionId=null,lastVisit=null;
export const canvasInit=()=>{visit++;};
export const enabled=()=>game.system?.id==='sangue-escuro'&&game.modules.get(ID)?.active!==false&&game.settings.get(ID,'enabled')!==false&&activeGM()&&!current();
const sceneOf=(actor,speaker={})=>game.scenes?.get(speaker.scene)??actor?.token?.parent??null;
const turnKey=()=>game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:null;
export function base(kind,key,actor=null,scene=null){return {kind,key,actorUuid:actor?.uuid??null,actorName:actor?.name??'',sceneId:scene?.id??null,sceneName:scene?.name??'',itemUuid:null,itemName:'',category:null,hit:null,critical:null,total:null,pv:Number.isFinite(actor?.system?.pv?.value)?actor.system.pv.value:null,scenario:game.sangueEscuro?.api?.cenarioAtivo??'base',turnKey:turnKey(),trusted:true,authorId:game.user.id,messageUuid:null,signature:null};}
function creator(id,actor){const u=game.users.get(id);return u?.active&&(u.isGM||actor?.testUserPermission?.(u,'OWNER'))?u:null;}
export function seed(){health.clear();for(const a of [...all(game.actors),...all(game.scenes).flatMap(s=>all(s.tokens).map(t=>t.actor))].filter(Boolean))health.set(a.uuid,Number(a.system?.pv?.value));if(!sessionId)sessionId=session();}
export async function chat(doc,_options,userId){if(!enabled())return [];const m=game.messages.get(doc?.id);if(!m||m.uuid!==doc.uuid||m.author?.id!==userId||m.flags?.[ID]?.generated)return [];const attack=m.flags?.['sangue-escuro']?.teste,dmg=m.flags?.['sangue-escuro']?.dano;
 const kind=attack?.kind==='ataque'&&!attack.repetido?'attack':dmg?'damage':null;if(!kind)return [];const data=kind==='attack'?attack:dmg;if(typeof data.origem!=='string')return [];const actor=await fromUuid(data.origem);if(!actor||actor.documentName!=='Actor')return [];const user=creator(userId,actor);if(!user)return [];
 let item=null;if(data.itemUuid){item=await fromUuid(data.itemUuid);if(!item||item.parent?.uuid!==actor.uuid)return [];}
 const e=base(kind,kind+':'+m.uuid,actor,sceneOf(actor,m.speaker));e.trusted=!!user.isGM;e.authorId=user.id;e.messageUuid=m.uuid;e.signature=JSON.stringify(data);e.itemUuid=item?.uuid??null;e.itemName=item?.name??'';e.category=item?.system?.categoria??null;
 if(kind==='attack'){if(typeof data.acertou!=='boolean'||typeof data.critico!=='boolean')return [];e.hit=data.acertou;e.critical=data.critico;}
 if(kind==='damage'){if(!Number.isFinite(data.total)||data.total<0)return [];e.total=data.total;}
 return ingest(e);
}
export async function actorUpdate(actor,_changes,options,userId){const old=health.get(actor.uuid),now=Number(actor.system?.pv?.value);health.set(actor.uuid,now);if(!enabled()||options?.autoxMacros||actor.type!=='character'||!Number.isFinite(old)||old<=0||now!==0)return [];const user=creator(userId,actor);if(!user)return [];const e=base('zero',`zero:${actor.uuid}:${actor._stats?.modifiedTime??session()}:${old}:0`,actor,sceneOf(actor));e.trusted=!!user.isGM;e.authorId=user.id;return ingest(e);}
export async function combatUpdate(combat,changes,options,userId){if(!enabled()||options?.autoxMacros||!combat.started||!['turn','round','started'].some(k=>Object.hasOwn(changes,k)))return [];const user=game.users.get(userId);if(!user?.active||!user.isGM)return [];const actor=combat.combatant?.actor;if(!actor)return [];const e=base('turn',`turn:${combat.id}:${combat.round}:${combat.turn}`,actor,combat.scene??null);return ingest(e);}
export async function sceneReady(canvas){if(!enabled())return [];if(!sessionId)sessionId=session();const scene=canvas?.scene??globalThis.canvas?.scene;if(!scene)return [];const key=`scene:${scene.id}:${sessionId}:${visit}`;if(lastVisit===key)return [];lastVisit=key;return ingest(base('scene',key,null,scene));}
export async function manual(flowId,actorUuid=null){if(!enabled())throw Error('O Mestre ativo deve habilitar o AutoxMacros.');const {read}=await import('./store.mjs');const f=read().flows.find(x=>x.id===flowId);if(!f||f.trigger!=='manual')throw Error('Use uma automação com o gatilho Executar pelo painel.');if(!f.enabled)throw Error('Ative a automação antes de executá-la.');const actor=actorUuid?await fromUuid(actorUuid):null;if(actorUuid&&!actor)throw Error('Personagem não encontrado.');const scene=actor?.token?.parent??globalThis.canvas?.scene??game.scenes?.active??null;const e=base('manual','manual:'+session(),actor,scene);e.flowId=f.id;return ingest(e);}
