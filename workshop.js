'use strict';
const A = window.GLAssets;
const $ = id => document.getElementById(id);
let activeRequest = null;
let resultType = null;
let resultName = null;
const fieldIds = ['apiUrl','apiModel','apiKey','rememberKey','libType','libName','nameCount','nameDesc','contentDesc','entryCount','weight','cooldown','ruleType','ruleSeason','ruleDay','rulePeriod','ruleDuration'];
function enableGroup(id, enabled) {$(id).hidden=!enabled;$(id).querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=!enabled;el.required=enabled;});}
function updateFields() {
  const type=$('libType').value;
  const isName=A.NAME_TYPES.includes(type);
  enableGroup('nameFields',isName);
  enableGroup('contentFields',!isName);
  enableGroup('festivalFields',type==='Festivals');
  const festival=type==='Festivals';
  enableGroup('periodField',festival&&$('ruleType').value==='Periodic');
  enableGroup('seasonField',festival&&$('ruleType').value==='BySeason');
  enableGroup('dayField',festival&&$('ruleType').value==='ByDayInYear');
}
$('libType').addEventListener('change',updateFields);
$('ruleType').addEventListener('change',updateFields);
updateFields();
// Clear the old automatically stored key; opting in is explicit in the new UI.
try {localStorage.removeItem('gl_key');if(localStorage.getItem('gl_remember_key')==='yes'){$('rememberKey').checked=true;$('apiKey').value=localStorage.getItem('gl_api_key')||'';}} catch {}
function persistKey() {
  try {
    if($('rememberKey').checked){localStorage.setItem('gl_remember_key','yes');localStorage.setItem('gl_api_key',$('apiKey').value.trim());}
    else {localStorage.removeItem('gl_remember_key');localStorage.removeItem('gl_api_key');}
  } catch {A.status($('status'),'浏览器不允许本地保存，Key 将仅在本次页面中使用。','loading');}
}
$('rememberKey').addEventListener('change',persistKey);
$('apiKey').addEventListener('change',persistKey);
$('clearKey').addEventListener('click',()=>{$('rememberKey').checked=false;$('apiKey').value='';persistKey();A.status($('status'),'已清除当前 Key 和此设备上的保存记录。');});
function snapshot() {
  const endpoint=new URL($('apiUrl').value.trim());
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new Error('AI 接口必须使用 HTTPS，且不能在地址中包含账号或密码');
  const model=$('apiModel').value.trim(),key=$('apiKey').value.trim(),name=$('libName').value.trim();
  if(!model||!key||!name)throw new Error('请填写模型名、API Key 和库名');
  const type=$('libType').value,isName=A.NAME_TYPES.includes(type),description=$(isName?'nameDesc':'contentDesc').value.trim();
  if(!description)throw new Error('请填写风格或内容描述');
  return {language:window.GLI18n?.language||'zh-CN',endpoint:endpoint.href,model,key,name,type,isName,description,count:Number($(isName?'nameCount':'entryCount').value),weight:Number($('weight').value),cooldown:Number($('cooldown').value),ruleType:$('ruleType').value,ruleSeason:$('ruleSeason').value,ruleDay:Number($('ruleDay').value),rulePeriod:Number($('rulePeriod').value),ruleDuration:Number($('ruleDuration').value)};
}
function promptFor(settings) {
  let example;
  if(settings.isName)example={Items:['示例名称']};
  else {
    const item={Name:'条目名称',Description:'中文详细描述，100–200 字',Stages:[],Id:'唯一的英文短标识',Type:settings.type,Weight:settings.weight,CooldownDays:settings.cooldown,LinkedEventIds:[]};
    if(settings.type==='Quests'||settings.type==='SpecialNPCs')item.Stages=[{StageName:'阶段名称',Description:'阶段详细描述'}];
    if(settings.type==='Festivals')Object.assign(item,{RuleType:settings.ruleType,RuleSeason:settings.ruleSeason,RuleDayInYear:settings.ruleDay,RulePeriodDays:settings.rulePeriod,RuleDurationDays:settings.ruleDuration});
    example={Entries:[item]};
  }
  if(settings.language==='en') {
    if(!settings.isName){example.Entries[0].Name='Entry name';example.Entries[0].Description='A detailed English description, 100–200 words';if(example.Entries[0].Stages.length)example.Entries[0].Stages=[{StageName:'Stage name',Description:'Stage description'}];}
    else example.Items=['Example name'];
    return 'Generate '+settings.type+' content for Grandpas Land. Write all names, descriptions and stage text in English. Player prompt: '+settings.description+'\nReturn exactly '+settings.count+' '+(settings.isName?'unique names':'entries')+'. Return only one valid JSON object, without Markdown or explanations. Keep the field names and enum values exactly as shown. '+(settings.type==='Quests'?'Use 3–5 stages per quest. ':'')+'Do not claim that story descriptions have executed gameplay rewards. Format example: '+JSON.stringify(example);
  }
  return '为《爷爷的地 Grandpas Land》生成'+A.TYPES[settings.type]+'。玩家描述：\n'+settings.description+'\n生成 '+settings.count+' 个'+(settings.isName?'不重复的名字':'独立条目')+'。只输出一个合法 JSON 对象，不能包含 Markdown 或解释。字段大小写与下面示例一致，数组长度应为请求数量。'+(settings.type==='Quests'?'每个支线含 3–5 个 Stages。':'')+'不要把故事叙述写成实际已执行的游戏奖励。格式示例：\n'+JSON.stringify(example);
}
function errorText(error, settings) {
  let message=error.message||'请求失败';
  if(settings.key)message=message.split(settings.key).join('[Key 已隐藏]');
  return message.slice(0,700);
}
function checkedPreview() {
  if(!resultType)throw new Error('请先生成资产');
  const data=A.validate(A.parseJSON($('preview').value),resultType);
  $('resultCount').textContent=A.count(data)+' 个条目';
  return data;
}
$('generatorForm').addEventListener('submit',async event=>{
  event.preventDefault();if(activeRequest)return;
  let settings;
  try {settings=snapshot();}catch(error){A.status($('status'),error.message,'error');return;}
  const controller=new AbortController();activeRequest=controller;
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},90000);
  fieldIds.forEach(id=>$(id).disabled=true);$('clearKey').disabled=true;$('genBtn').disabled=true;$('genBtn').textContent='灵感正在生长…';$('cancelBtn').hidden=false;
  A.status($('status'),'正在生成，通常需要 10–60 秒。','loading');
  try {
    const response=await fetch(settings.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+settings.key},body:JSON.stringify({model:settings.model,messages:[{role:'system',content:'你是游戏内容库生成器。严格返回要求的 JSON 字段，不要添加代码或 Markdown。'},{role:'user',content:promptFor(settings)}],temperature:1}),signal:controller.signal});
    if(!response.ok)throw new Error('AI 服务返回 HTTP '+response.status+'。'+(response.status===401?'请检查 Key。':response.status===429?'请求过多或额度不足，请稍后重试。':response.status>=500?'服务暂时不可用，请稍后重试。':'请检查接口、模型名和账户权限。'));
    const payload=await response.json();
    const text=payload?.choices?.[0]?.message?.content;
    const data=A.validate(A.parseAI(text),settings.type);
    if(A.count(data)!==settings.count)throw new Error('AI 返回 '+A.count(data)+' 个条目，与要求的 '+settings.count+' 个不一致，请减少数量后重试');
    if(!settings.isName)data.Entries.forEach((entry,index)=>{
      entry.Id=entry.Id||'gl_'+settings.type.toLowerCase()+'_'+Date.now().toString(36)+'_'+(index+1);
      entry.Type=settings.type;entry.Weight=settings.weight;entry.CooldownDays=settings.cooldown;
      if(settings.type==='Festivals')Object.assign(entry,{RuleType:settings.ruleType,RuleSeason:settings.ruleSeason,RuleDayInYear:settings.ruleDay,RulePeriodDays:settings.rulePeriod,RuleDurationDays:settings.ruleDuration});
    });
    const checked=A.validate(data,settings.type);
    resultType=settings.type;resultName=settings.name;
    $('preview').value=JSON.stringify(checked,null,2);$('resultType').textContent=A.TYPES[resultType];$('resultCount').textContent=A.count(checked)+' 个条目';
    $('importPath').textContent=A.GAME_PATH+resultType+'\\'+A.fileName(resultName);
    $('shareResult').href='gallery.html?share=1&type='+encodeURIComponent(resultType)+'&name='+encodeURIComponent(resultName);
    $('outputPlaceholder').hidden=true;$('result').hidden=false;$('resultStatus').hidden=true;
    A.status($('status'),'生成完成，格式已通过校验。可以编辑预览，下载会保存最新内容。');
  } catch(error) {
    if(controller.signal.aborted)A.status($('status'),timedOut?'生成超过 90 秒，已停止等待。请减少数量或稍后重试。':'已取消本次生成。服务商可能已处理请求并产生费用。','error');
    else if(error instanceof TypeError)A.status($('status'),'无法连接 AI 接口。请检查网络、接口地址及服务商是否允许浏览器跨域请求，详见使用文档。','error');
    else A.status($('status'),errorText(error,settings),'error');
  } finally {
    clearTimeout(timeout);activeRequest=null;fieldIds.forEach(id=>$(id).disabled=false);updateFields();$('clearKey').disabled=false;$('genBtn').disabled=false;$('genBtn').textContent='生成我的资产 ↗';$('cancelBtn').hidden=true;
  }
});
$('cancelBtn').addEventListener('click',()=>activeRequest?.abort());
$('preview').addEventListener('input',()=>{$('resultStatus').hidden=true;});
$('checkBtn').addEventListener('click',()=>{try{const data=checkedPreview();A.status($('resultStatus'),'格式通过校验，共 '+A.count(data)+' 个条目。');}catch(error){A.status($('resultStatus'),error.message,'error');}});
$('dlBtn').addEventListener('click',()=>{try{const data=checkedPreview();A.download(data,resultName);A.status($('resultStatus'),'已下载预览中的最新内容：'+A.fileName(resultName));}catch(error){A.status($('resultStatus'),error.message,'error');}});
