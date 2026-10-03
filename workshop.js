'use strict';
const A = window.GLAssets;
const C = window.GLContent;
const $ = id => document.getElementById(id);
const t = (zh,en) => window.GLI18n?.language==='en'?en:zh;
let activeRequest = null;
let resultType = null;
let resultName = null;
let profileLoadError = '';
const fieldIds = ['apiUrl','apiModel','apiKey','rememberKey','libType','libName','nameCount','nameDesc','contentDesc','entryCount','weight','cooldown','triggerPhase','ruleType','ruleSeason','ruleDay','rulePeriod','ruleDuration'];
function enableGroup(id, enabled) {$(id).hidden=!enabled;$(id).querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=!enabled;el.required=enabled;});}
function updateFields() {
  const type=$('libType').value;
  const isName=A.NAME_TYPES.includes(type);
  enableGroup('nameFields',isName);
  enableGroup('contentFields',!isName);
  enableGroup('eventFields',type==='Events');
  enableGroup('festivalFields',type==='Festivals');
  const festival=type==='Festivals';
  enableGroup('periodField',festival&&$('ruleType').value==='Periodic');
  enableGroup('seasonField',festival&&$('ruleType').value==='BySeason');
  enableGroup('dayField',festival&&$('ruleType').value==='ByDayInYear');
  $('supportNote').textContent=C.supportMessage(type);
  const profile=A.getProfile();
  $('ruleDay').max=String(profile?.daysPerYear||3);
  if(activeRequest)fieldIds.forEach(id=>$(id).disabled=true);
}
$('libType').addEventListener('change',updateFields);
$('ruleType').addEventListener('change',updateFields);
updateFields();
function showProfile(){
  const profile=A.getProfile();
  if(profile)profileLoadError='';
  $('profileStatus').textContent=profile?t('游戏兼容目录已加载。当前日历每年 ','Game compatibility profile loaded. Current calendar: ')+profile.daysPerYear+t(' 天。',' days per year.'):(profileLoadError||t('正在加载游戏兼容目录…','Loading the game compatibility profile…'));
  updateFields();
}
showProfile();
C.loadProfile().then(showProfile).catch(error=>{profileLoadError=error.message;showProfile();});
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
  return {language:window.GLI18n?.language||'zh-CN',endpoint:endpoint.href,model,key,name,type,isName,description,count:Number($(isName?'nameCount':'entryCount').value),weight:Number($('weight').value),cooldown:Number($('cooldown').value),triggerPhase:type==='Events'?($('triggerPhase').value || 'Daily'):'Daily',ruleType:$('ruleType').value,ruleSeason:$('ruleSeason').value,ruleDay:Number($('ruleDay').value),rulePeriod:Number($('rulePeriod').value),ruleDuration:Number($('ruleDuration').value)};
}
function promptFor(settings) {
  const request=settings.language==='en'?'Generate '+settings.type+' for Grandpas Land. Write names and descriptions in English. Player request: '+settings.description+'\nReturn exactly '+settings.count+' '+(settings.isName?'unique names':'entries')+'. Return only valid JSON, without Markdown.':'为《爷爷的地 Grandpas Land》生成'+A.TYPES[settings.type]+'。玩家描述：\n'+settings.description+'\n生成 '+settings.count+' 个'+(settings.isName?'不重复的名字':'独立条目')+'。只输出合法 JSON，不要 Markdown。';
  return request+'\n'+A.buildGenerationPrompt(settings);
}
function errorText(error, settings) {
  let message=error.message||'请求失败';
  if(settings.key)message=message.split(settings.key).join('[Key 已隐藏]');
  return message.slice(0,700);
}
async function providerFailure(response){
  let contextHint='';
  if(response.status===400){
    try{
      const body=await response.json();
      const diagnostic=[body?.error?.code,body?.error?.type,body?.error?.message,body?.message].filter(value=>typeof value==='string').join(' ');
      if(/context[_\s-]*length|context.{0,60}(?:window|limit|exceed|too.?long)|maximum.{0,40}context|上下文.{0,30}(?:超|长|限)/i.test(diagnostic))contextHint=t('服务商报告上下文超限。兼容目录占用提示词空间，请改用支持更长上下文的模型，或缩短内容描述。','The provider reports a context limit. The compatibility catalog uses prompt space; use a model with a larger context window or shorten the description.');
    }catch{}
  }
  return 'AI 服务返回 HTTP '+response.status+'。'+(contextHint|| (response.status===401?'请检查 Key。':response.status===429?'请求过多或额度不足，请稍后重试。':response.status>=500?'服务暂时不可用，请稍后重试。':'请检查接口、模型名和账户权限。'));
}
function checkedPreview() {
  if(!resultType)throw new Error('请先生成资产');
  const data=A.validate(A.parseJSON($('preview').value),resultType);
  $('resultCount').textContent=A.count(data)+' 个条目';
  showSummary(data,resultType);
  return data;
}
function showSummary(data,type){
  $('effectSummary').textContent=C.summary(data,type);
  $('validationWarnings').textContent=A.getValidationWarnings(data,type,window.GLI18n?.language).join('\n');
  $('validationWarnings').hidden=!$('validationWarnings').textContent;
}
// AI-generated world events use portable targets. Authors can bind a particular
// world later in the editable preview; ordinary imports keep those bindings.
function checkGeneratedGameplay(data,type){
  if(!C.requiresProfile(type))return;
  const profile=A.getProfile();
  const localEventIds=new Set(data.Entries.map(entry=>entry.Id || 'content_'+entry.Name));
  for(const entry of data.Entries){
    if(entry.Target?.ActorId||entry.Target?.PlayerId||entry.Target?.SettlementId)throw new Error(t('AI 不能为通用世界事件编造固定角色或城市。请使用随机城市与城内目标筛选；特定存档的绑定可在预览中手动编辑。','AI must not invent fixed characters or settlements for portable world events. Use a random settlement and settlement target filters; bindings for a specific save can be edited manually in the preview.'));
    const initial={actor:entry.TriggerPhase==='PlayerStart',player:entry.TriggerPhase==='PlayerStart',storedActor:false};
    function checkConditions(conditions,context){
      for(const condition of conditions||[]){
        const needs=A.getConditionRequirements(condition);
        if(needs.requiresBinding)throw new Error(t('AI 条件引用了需要手动绑定的角色或任务：','AI conditions reference a character or quest that needs manual binding: ')+condition.Type);
        if(needs.resource&&!(profile.resources?.[needs.resource]||[]).includes(condition.Param))throw new Error(t('AI 条件引用了目录尚未提供的游戏资源：','AI conditions reference a game resource not provided by the profile: ')+condition.Param);
        if(needs.requiresActor&&!context.actor||needs.requiresPlayer&&!context.player)throw new Error(t('AI 条件缺少角色或玩家上下文：','AI conditions lack actor or player context: ')+condition.Type);
      }
    }
    checkConditions(entry.TriggerConditions,initial);
    function walk(list,context=initial){
      let hasLeaf=false;
      for(const effect of list||[]){
        const spec=profile.effects[effect.Type];
        if(spec.status==='logOnly')throw new Error(t('AI 使用了尚未实现的效果：','AI used an unimplemented effect: ')+effect.Type);
        if(spec.requiresNetworkPrefabBinding)throw new Error(t('AI 使用的效果需要游戏已注册的联机预制体，请先手动配置并绑定：','This effect needs a registered game network prefab. Configure and bind it manually first: ')+effect.Type);
        const internalEventLink=['TriggerGameEventEffect','ScheduleGameEventEffect'].includes(effect.Type) && localEventIds.has(effect.Parameters?.EventId);
        const bindings=A.getEffectBindings(effect).filter(binding=>!(internalEventLink && binding.fields.every(field=>field==='EventId')));
        if(bindings.length)throw new Error(t('AI 使用的效果需要游戏中已有的资源或世界编号，请先手动绑定：','This generated effect needs existing game resources or world identifiers. Bind them manually first: ')+effect.Type+' ('+bindings.flatMap(binding=>binding.fields).join(', ')+')');
        const parameter=key=>effect.Parameters?.[key]??spec.parameters?.[key]?.default;
        for(const ref of A.getEffectResourceReferences(effect))if(ref.value&&!(profile.resources?.[ref.resource]||[]).includes(ref.value))throw new Error(t('AI 引用了兼容目录尚未提供的游戏资源，请先在游戏中配置并导出：','AI referenced a game resource not present in this profile. Configure it in the game and export the profile first: ')+effect.Type+'.'+ref.field+' = '+ref.value);
        const needsCharacter=A.effectRequiresCharacter(effect);
        const contextNeeds=A.getEffectContextRequirements(effect);
        const mode=parameter('TargetMode');
        if(parameter('SpecificCharId')>0||parameter('SettlementId')||(needsCharacter&&['SpecificId','ByTag'].includes(mode)))throw new Error(t('AI 使用了依赖特定世界的角色或地点绑定：','AI used a character or location binding tied to a specific world: ')+effect.Type);
        if(contextNeeds.requiresActor&&!context.actor||contextNeeds.requiresPlayer&&!context.player)throw new Error(t('自动世界事件缺少角色或玩家上下文，请使用城内筛选，或把需要玩家的效果放在交互选项后果中：','Automatic world events lack actor or player context. Use settlement filters, or put player-dependent effects in an interactive option: ')+effect.Type);
        const groupTarget=['AllInSettlement','RandomInSettlement'].includes(mode);
        const needsSettlement=groupTarget||['TargetLocation','Settlement'].includes(parameter('Target'))||effect.Type==='SetPlayerBirthplaceEffect'&&parameter('Mode')==='ContextSettlement';
        if(needsSettlement&&!context.actor&&!entry.Target?.RandomSettlement)throw new Error(t('城内效果需要选择事件城市，请设置 Target.RandomSettlement：','Settlement effects need an event location. Set Target.RandomSettlement: ')+effect.Type);
        const selected={...context};
        if(groupTarget){selected.actor=true;selected.storedActor=parameter('CharacterKind')!=='Player';}
        else if(mode==='Player'){selected.actor=context.player;selected.storedActor=false;}
        if(needsCharacter&&selected.storedActor&&!spec.supportsStoredNpc)throw new Error(t('此效果不支持离场 NPC，不能用于自动事件的随机 NPC 群体。请选择支持离场 NPC 的效果，或在交互中手动绑定：','This effect does not support off-scene NPCs and cannot target a random NPC group in an automatic event. Use an effect supporting stored NPCs, or bind the targets in an interaction: ')+effect.Type);
        checkConditions(parameter('Conditions'),selected);
        if(spec.allowsChildren||spec.allowsElseChildren||spec.allowsWeightedBranches){
          hasLeaf=walk(effect.Children,selected)||hasLeaf;
          hasLeaf=walk(effect.ElseChildren,selected)||hasLeaf;
          for(const branch of effect.WeightedBranches||[]){const branchLeaf=walk(branch.Children,selected);if(branch.Weight>0)hasLeaf=branchLeaf||hasLeaf;}
        }else hasLeaf=true;
      }
      return hasLeaf;
    }
    let hasLeaf=walk(entry.TriggerConsequences);
    for(const option of entry.Options||[])hasLeaf=walk(option.Consequences,option.AutoExecute?initial:{actor:true,player:true,storedActor:false})||hasLeaf;
    if(type==='Events'&&!hasLeaf)throw new Error(t('AI 返回的事件没有可执行子效果，请明确需要改变的游戏状态后重新生成。','The generated event contains no executable effects. Specify the game state changes and generate again.'));
  }
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
    await C.ensureProfile(settings.type);showProfile();
    if(controller.signal.aborted)throw new Error('Canceled');
    if(settings.type==='Festivals'&&settings.ruleType==='ByDayInYear'&&(!Number.isInteger(settings.ruleDay)||settings.ruleDay<1||settings.ruleDay>A.getProfile().daysPerYear))throw new Error(t('节日日期必须在当前游戏年长范围内。','The festival day must fit the current game calendar.'));
    const response=await fetch(settings.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+settings.key},body:JSON.stringify({model:settings.model,messages:[{role:'system',content:'你是游戏内容库生成器。严格返回要求的 JSON 字段，不要添加代码或 Markdown。'},{role:'user',content:promptFor(settings)}],temperature:1}),signal:controller.signal});
    if(!response.ok)throw new Error(await providerFailure(response));
    const payload=await response.json();
    const text=payload?.choices?.[0]?.message?.content;
    const data=A.parseAI(text);
    if(!settings.isName&&Array.isArray(data?.Entries))data.Entries.forEach((entry,index)=>{
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return;
      entry.Id=entry.Id||'gl_'+settings.type.toLowerCase()+'_'+Date.now().toString(36)+'_'+(index+1);
      entry.Weight=settings.weight;entry.CooldownDays=settings.cooldown;
      if(settings.type==='Events'&&entry.TriggerPhase===undefined)entry.TriggerPhase=settings.triggerPhase;
      if(settings.type==='Festivals')Object.assign(entry,{RuleType:settings.ruleType,RuleSeason:settings.ruleSeason,RuleDayInYear:settings.ruleDay,RulePeriodDays:settings.rulePeriod,RuleDurationDays:settings.ruleDuration});
    });
    const checked=A.validate(data,settings.type);
    if(A.count(checked)!==settings.count)throw new Error('AI 返回 '+A.count(checked)+' 个条目，与要求的 '+settings.count+' 个不一致，请减少数量后重试');
    checkGeneratedGameplay(checked,settings.type);
    resultType=settings.type;resultName=settings.name;
    $('preview').value=JSON.stringify(checked,null,2);$('resultType').textContent=A.TYPES[resultType];$('resultCount').textContent=A.count(checked)+' 个条目';
    $('importPath').textContent=A.GAME_PATH+resultType+'\\'+A.fileName(resultName);
    $('shareResult').href='gallery.html?share=1&type='+encodeURIComponent(resultType)+'&name='+encodeURIComponent(resultName);
    $('outputPlaceholder').hidden=true;$('result').hidden=false;$('resultStatus').hidden=true;
    showSummary(checked,resultType);
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
$('preview').addEventListener('input',()=>{$('resultStatus').hidden=true;$('effectSummary').textContent=t('内容已修改，请重新校验以更新效果预览。','Content edited. Validate again to update the effect preview.');$('validationWarnings').hidden=true;});
$('checkBtn').addEventListener('click',()=>{try{const data=checkedPreview();A.status($('resultStatus'),'格式通过校验，共 '+A.count(data)+' 个条目。');}catch(error){A.status($('resultStatus'),error.message,'error');}});
$('dlBtn').addEventListener('click',()=>{try{const data=checkedPreview();A.download(data,resultName);A.status($('resultStatus'),'已下载预览中的最新内容：'+A.fileName(resultName));}catch(error){A.status($('resultStatus'),error.message,'error');}});
window.addEventListener('gl-languagechange',()=>{showProfile();if(resultType){try{showSummary(A.validate(A.parseJSON($('preview').value),resultType),resultType);}catch{}}});
