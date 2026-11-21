import {ID,empty,esc,equal} from './model.mjs';
export const all=c=>c?.contents??Array.from(c?.values?.()??c??[]);
export const activeGM=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
export function guard({paused=false}={}){if(!activeGM()||game.system?.id!=='sangue-escuro'||game.modules.get(ID)?.active===false)throw Error('Esta operação exige o Mestre ativo e o AutoxMacros habilitado.');if(!paused&&game.settings.get(ID,'enabled')===false)throw Error('O AutoxMacros está pausado.');}
export const encode=s=>'<pre>'+esc(JSON.stringify(s))+'</pre>';
export const decode=s=>JSON.parse(s.replace(/^\s*<pre[^>]*>/,'').replace(/<\/pre>\s*$/,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&'));
const page=d=>all(d?.pages).find(p=>p.flags?.[ID]?.data);
const database=()=>game.journal.get(game.settings.get(ID,'database'));
let chain=Promise.resolve();export const queue=fn=>{const p=chain.catch(()=>{}).then(fn);chain=p;return p;};
function privatePage(d){if(!d?.flags?.[ID]?.database)throw Error('Arquivo do AutoxMacros indisponível.');const p=page(d);if(!p)throw Error('Página removida. Restaure o backup.');for(const x of [d,p])if((x.ownership?.default??-1)>0||all(game.users).some(u=>!u.isGM&&(x.ownership?.[u.id]??-1)>0))throw Error('O arquivo do AutoxMacros precisa permanecer privado ao Mestre.');return p;}
let opening=null;
export async function ensure(){guard({paused:true});if(opening)return opening;opening=initialize();try{return await opening;}finally{opening=null;}}
async function initialize(){guard({paused:true});let d=database();if(!d){if(game.settings.get(ID,'database'))throw Error('Arquivo removido. Restaure o backup; os recibos não serão reiniciados.');if(all(game.journal).some(x=>x.flags?.[ID]?.database))throw Error('Há um arquivo sem vínculo. Restaure a configuração do banco antes de prosseguir.');d=await JournalEntry.create({name:'AutoxMacros — Arquivo privado do Mestre',ownership:{default:0},flags:{[ID]:{database:true}},pages:[{name:'Automações e execuções',type:'text',ownership:{default:-1},flags:{[ID]:{data:true}},text:{format:1,content:encode(empty())}}]});privatePage(d);await game.settings.set(ID,'database',d.id);}privatePage(d);return d;}
export function read(){guard({paused:true});if(!database()){if(game.settings.get(ID,'database'))throw Error('Arquivo removido. Restaure o backup.');return empty();}const s=decode(privatePage(database()).text.content);if(s.schema!==1||!Array.isArray(s.flows)||!Array.isArray(s.executions)||!s.receipts||!s.limits||!Number.isSafeInteger(s.revision))throw Error('Arquivo do AutoxMacros inválido.');return s;}
export async function save(s){guard({paused:true});const p=privatePage(database());try{await p.update({'text.content':encode(s)});}catch(e){if(!equal(read(),s))throw e;}if(!equal(read(),s))throw Error('Gravação recusada. A operação não foi confirmada.');Hooks.callAll('autoxmacros.refresh');}
