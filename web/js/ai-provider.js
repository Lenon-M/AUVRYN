import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js";

const cfg=window.AUVRYN_FIREBASE_CONFIG||window.NEXO_FIREBASE_CONFIG||{};
window.AUVRYN_AI_STATUS={ready:false,model:cfg.aiModel||'gemini-3.8-flash'};
if(cfg?.apiKey&&cfg?.projectId&&cfg?.appId){
  try{
    const app=initializeApp(cfg,'auvryn-ai');
    if(cfg.appCheckSiteKey){
      if(['localhost','127.0.0.1'].includes(location.hostname)&&cfg.aiAppCheckDebug===true) self.FIREBASE_APPCHECK_DEBUG_TOKEN=true;
      initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(cfg.appCheckSiteKey),isTokenAutoRefreshEnabled:true});
    }
    const ai=getAI(app,{backend:new GoogleAIBackend()});
    const actionSchema=Schema.object({properties:{
      type:Schema.enumString({enum:['task','event','exam','assignment','project','habit','summary','library','purchase','trip','goal','journal','health','workout']}),
      title:Schema.string(),date:Schema.string(),time:Schema.string(),endTime:Schema.string(),area:Schema.string(),duration:Schema.number(),discipline:Schema.string(),period:Schema.string(),notes:Schema.string(),frequency:Schema.number(),libraryType:Schema.string(),creator:Schema.string(),status:Schema.string(),due:Schema.string(),content:Schema.string()
    },optionalProperties:['date','time','endTime','area','duration','discipline','period','notes','frequency','libraryType','creator','status','due','content']});
    const responseSchema=Schema.object({properties:{reply:Schema.string(),actions:Schema.array({items:actionSchema,maxItems:6})}});
    const model=getGenerativeModel(ai,{model:cfg.aiModel||'gemini-3.8-flash',generationConfig:{responseMimeType:'application/json',responseSchema,temperature:0.15}});
    window.AUVRYN_AI_INTERPRET=async(text,context={})=>{
      const prompt=`Você é o AUVRYN Assistant, um roteador de organização pessoal. Sua única função é transformar a mensagem do usuário em ações estruturadas para o aplicativo.\n\nData local atual: ${context.today||''}. Curso: ${context.course||''}. Período atual: ${context.currentPeriod||''}. Projetos existentes: ${(context.projects||[]).join(', ')}.\n\nTipos válidos: task=tarefa/pendência; event=compromisso com horário; exam=prova/avaliação; assignment=trabalho acadêmico; project=projeto; habit=hábito recorrente; summary=resumo/anotação acadêmica; library=livro/filme/série/podcast/jogo/música/lugar/experiência; purchase=compra planejada; trip=viagem; goal=objetivo/meta; journal=entrada de diário; health=registro de saúde; workout=ficha de treino.\n\nRegras: use datas ISO YYYY-MM-DD e horários HH:MM. Resolva hoje/amanhã/dias da semana com base na data local. Não invente informações que o usuário não deu. Se for uma tarefa com data, ela já aparecerá na Agenda — não crie um evento duplicado. Se houver vários pedidos, crie várias ações. Para libraryType use book/movie/series/podcast/game/music/place/experience. Para hábitos, frequency é dias por semana. Mantenha títulos curtos e naturais em português. Não dê aconselhamento médico, financeiro ou jurídico; apenas organize o pedido.\n\nMensagem do usuário: ${text}`;
      const result=await model.generateContent(prompt);const parsed=JSON.parse(result.response.text());return {...parsed,source:'ai'};
    };
    window.AUVRYN_AI_STATUS.ready=true;
  }catch(e){console.warn('AUVRYN AI Logic não inicializado:',e);window.AUVRYN_AI_STATUS.error=String(e?.message||e)}
}
