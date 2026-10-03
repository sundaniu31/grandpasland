/* Shared game-compatible library validation. No keys or account credentials. */
(function (root) {
  'use strict';
  const TYPES = Object.freeze({CityNames:'城市名库',NPCNames:'NPC 名字库',CompanyNames:'公司名库',FamilyNames:'家族名库',Quests:'支线库',Events:'事件库',Festivals:'节日库',SpecialNPCs:'特定 NPC 库'});
  const NAME_TYPES = ['CityNames','NPCNames','CompanyNames','FamilyNames'];
  const MAX_FILE_BYTES = 1024 * 1024;
  const GAME_PATH = '%USERPROFILE%\\AppData\\LocalLow\\DefaultCompany\\Crownfall1\\NameLibraries\\';
  const INT_MIN = -2147483648, INT_MAX = 2147483647;
  const SUPPORTED_PROFILE_ID = 'crownfall1-v1';
  const GAMEPLAY_FIELDS = ['EventType','Repeatable','Score','Tags','RumorHint','DescriptionVariants','CausalTagModifiers','Target','TriggerConsequences','Options'];
  const ENTRY_FIELDS = ['Name','Description','Stages','Id','Type','Weight','CooldownDays','RuleType','RuleDayInYear','RuleSeason','RulePeriodDays','RuleDurationDays','LinkedEventIds',...GAMEPLAY_FIELDS];
  let profile = null;
  function object(value) {return value !== null && typeof value === 'object' && !Array.isArray(value);}
  function fields(value, allowed, path) {
    if (!object(value)) throw new Error(path+' 必须是对象');
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(path+'.'+key+' 是游戏不支持的字段');
  }
  function string(value, field, required = false, max = 10000) {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string') throw new Error(field + ' 必须是文本');
    const text = value.trim();
    if (required && !text) throw new Error(field + ' 不能为空');
    if (text.length > max) throw new Error(field + ' 超过 ' + max + ' 个字符');
    return text;
  }
  function integer(value, fallback, field, min, max) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(field + ' 必须是 ' + min + '–' + max + ' 的整数');
    return value;
  }
  function number(value, fallback, field, min = -3.4028234663852886e38, max = 3.4028234663852886e38) {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(field+' 必须是 '+min+'–'+max+' 的有限数值');
    return value;
  }
  function boolean(value, fallback, field) {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error(field+' 必须是 true 或 false');
    return value;
  }
  function array(value, field, limit) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(field+' 必须是数组');
    if (value.length > limit) throw new Error(field+' 最多支持 '+limit+' 项');
    return value;
  }
  function enumValue(value, fallback, options, field) {
    if (value === undefined) return fallback;
    if (!options.includes(value)) throw new Error(field + ' 的值无效');
    return value;
  }
  function flags(value, fallback, options, field) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string') throw new Error(field+' 必须是枚举名称文本');
    const values = value.split(',').map(part => part.trim());
    if (!values.length || values.some(part => !part || !options.includes(part)) || new Set(values).size !== values.length) throw new Error(field+' 的标签无效，请使用逗号分隔的枚举名称');
    if (values.length > 1 && values.includes('None')) throw new Error(field+' 不能同时包含 None 和其他标签');
    return values.join(', ');
  }
  function freeze(value) {if (object(value) || Array.isArray(value)) {Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  function configureProfile(value) {
    if (value === null) {profile=null;return;}
    if (!object(value) || value.schemaVersion !== 1 || value.profileId !== SUPPORTED_PROFILE_ID
      || !Number.isInteger(value.daysPerYear) || value.daysPerYear < 1 || !object(value.enums) || !object(value.effects)) throw new Error('游戏内容协议配置无效');
    for (const key of ['GameEventType','EventTag','ConditionType','ComparisonOp']) if (!Array.isArray(value.enums[key]) || value.enums[key].some(item => typeof item !== 'string')) throw new Error('游戏内容协议缺少 '+key+' 枚举');
    profile=freeze(JSON.parse(JSON.stringify(value)));
  }
  function getProfile() {return profile;}
  function requireProfile(path) {if (!profile) throw new Error(path+' 需要先加载游戏内容协议 content-profile.json，请刷新页面后重试');return profile;}
  function resource(value, kind, path) {
    if (!value || !kind) return;
    const active=requireProfile(path), available=active.resources?.[kind] || [];
    if (active.resourcesComplete?.[kind] === true && !available.includes(value)) throw new Error(path+' 引用了游戏资源目录中不存在的值：'+value);
  }
  function descriptorValue(value, descriptor, path, depth = 0) {
    if (!object(descriptor) || depth > 32) throw new Error(path+' 的协议配置无效');
    if (descriptor.enum) return descriptor.enumFlags || descriptor.flags ? flags(value,undefined,descriptor.enum,path) : enumValue(value,undefined,descriptor.enum,path);
    switch (descriptor.type) {
      case 'integer': return integer(value,undefined,path,descriptor.minimum ?? INT_MIN,descriptor.maximum ?? INT_MAX);
      case 'number': return number(value,undefined,path,descriptor.minimum ?? -3.4028234663852886e38,descriptor.maximum ?? 3.4028234663852886e38);
      case 'boolean': return boolean(value,undefined,path);
      case 'string': {const text=string(value,path,false,descriptor.maxLength ?? 10000);resource(text,descriptor.resource,path);return text;}
      case 'array': return array(value,path,descriptor.maxItems ?? 1024).map((item,index) => descriptorValue(item,descriptor.items,path+'['+index+']',depth+1));
      case 'object': {
        fields(value,Object.keys(descriptor.properties || {}),path);
        const clean={};for (const [key,item] of Object.entries(value)) clean[key]=descriptorValue(item,descriptor.properties[key],path+'.'+key,depth+1);
        return clean;
      }
      default: throw new Error(path+' 的参数类型不受支持');
    }
  }
  function effectList(value, path, state, depth = 0) {
    return array(value,path,1024).map((effect,index) => {
      const at=path+'['+index+']';fields(effect,['Type','Parameters','Children'],at);
      if (depth > 32 || ++state.count > 1024) throw new Error(at+' 效果组合过深或超过 1024 个');
      const active=requireProfile(at), type=string(effect.Type,at+'.Type',true,200);
      if (!Object.hasOwn(active.effects,type)) throw new Error(at+'.Type 未注册的效果：'+type);
      const spec=active.effects[type];let input=effect.Parameters === undefined ? {} : effect.Parameters;
      if (typeof input === 'string') {try {input=parseJSON(input);}catch (error) {throw new Error(at+'.Parameters '+error.message);}}
      fields(input,Object.keys(spec.parameters || {}),at+'.Parameters');
      const parameters={};for (const [key,item] of Object.entries(input)) parameters[key]=descriptorValue(item,spec.parameters[key],at+'.Parameters.'+key);
      const parameter=(key) => Object.hasOwn(parameters,key) ? parameters[key] : spec.parameters?.[key]?.default;
      if (parameter('TargetMode') === 'SpecificId' && !(parameter('SpecificCharId') > 0)) throw new Error(at+'.Parameters.SpecificCharId 必须大于 0');
      if (parameter('TargetMode') === 'RandomInSettlement' && !(parameter('TargetCount') > 0)) throw new Error(at+'.Parameters.TargetCount 必须大于 0');
      if (parameter('TargetMode') === 'ByTag' && !parameter('TargetTagName')) throw new Error(at+'.Parameters.TargetTagName 不能为空');
      if (parameter('RemainingDays') === 0 || parameter('RemainingDays') < -1) throw new Error(at+'.Parameters.RemainingDays 必须为 -1 或正数');
      if (type === 'RandomEffect') number(parameter('Chance'),undefined,at+'.Parameters.Chance',0,1);
      if (parameter('Target') === 'FixedSettlement' && !parameter('SettlementId')) throw new Error(at+'.Parameters.SettlementId 不能为空');
      if (['InfectDiseaseEffect','ModifyHealRateEffect'].includes(type) && !parameter('DiseaseName')) throw new Error(at+'.Parameters.DiseaseName 不能为空');
      if (/^Modify(Supply|Demand)(ByTag)?Effect$/.test(type) && !(parameter(type.includes('ByTag') ? 'ItemTag' : 'ItemId'))) throw new Error(at+'.Parameters.'+(type.includes('ByTag') ? 'ItemTag' : 'ItemId')+' 不能为空');
      if (['GiveItemEffect','RemoveItemEffect'].includes(type) && !parameter('ItemId')) throw new Error(at+'.Parameters.ItemId 不能为空');
      for (const [field,desc] of Object.entries(spec.parameters || {})) if (desc.resource && !parameter(field) && !(type === 'CureDiseaseEffect' && field === 'DiseaseName')) throw new Error(at+'.Parameters.'+field+' 不能为空');
      if (parameter('DurationDays') < 0) throw new Error(at+'.Parameters.DurationDays 不能小于 0');
      const children=array(effect.Children,at+'.Children',1024);
      if (children.length && !spec.allowsChildren) throw new Error(at+'.Children '+type+' 不支持子效果');
      return {Type:type,Parameters:parameters,Children:effectList(children,at+'.Children',state,depth+1)};
    });
  }
  function condition(value, path) {
    fields(value,['Type','Param','Threshold','Op'],path);const active=requireProfile(path);
    const clean={Type:enumValue(value.Type,'Gold',active.enums.ConditionType,path+'.Type'),Param:string(value.Param,path+'.Param',false,200),Threshold:integer(value.Threshold,0,path+'.Threshold',INT_MIN,INT_MAX),Op:enumValue(value.Op,'GreaterEqual',active.enums.ComparisonOp,path+'.Op')};
    if (['Stat','HasTag','HasItem'].includes(clean.Type) && !clean.Param) throw new Error(path+'.Param 不能为空');
    if (clean.Type === 'Stat' && active.enums.StatType) enumValue(clean.Param,undefined,active.enums.StatType,path+'.Param');
    if (clean.Type === 'HasItem') resource(clean.Param,'items',path+'.Param');
    return clean;
  }
  function gameplay(entry, clean, path) {
    const active=requireProfile(path);
    clean.EventType=enumValue(entry.EventType,'Notice',active.enums.GameEventType,path+'.EventType');
    clean.Repeatable=boolean(entry.Repeatable,true,path+'.Repeatable');
    clean.Score=integer(entry.Score,0,path+'.Score',-10,10);
    clean.Tags=flags(entry.Tags,'None',active.enums.EventTag,path+'.Tags');
    clean.RumorHint=string(entry.RumorHint,path+'.RumorHint');
    clean.DescriptionVariants=array(entry.DescriptionVariants,path+'.DescriptionVariants',100).map((text,index) => string(text,path+'.DescriptionVariants['+index+']',true));
    clean.CausalTagModifiers=array(entry.CausalTagModifiers,path+'.CausalTagModifiers',100).map((value,index) => {
      const at=path+'.CausalTagModifiers['+index+']';fields(value,['targetTag','probabilityMultiplier','durationDays','decayOverTime'],at);
      const multiplier=number(value.probabilityMultiplier,1,at+'.probabilityMultiplier',0);
      if (multiplier <= 0) throw new Error(at+'.probabilityMultiplier 必须大于 0');
      return {targetTag:flags(value.targetTag,'None',active.enums.EventTag,at+'.targetTag'),probabilityMultiplier:multiplier,durationDays:integer(value.durationDays,1,at+'.durationDays',1,INT_MAX),decayOverTime:boolean(value.decayOverTime,false,at+'.decayOverTime')};
    });
    const target=entry.Target === undefined ? {} : entry.Target;fields(target,['ActorId','PlayerId','SettlementId','RandomSettlement'],path+'.Target');
    clean.Target={ActorId:integer(target.ActorId,0,path+'.Target.ActorId',0,INT_MAX),PlayerId:integer(target.PlayerId,0,path+'.Target.PlayerId',0,INT_MAX),SettlementId:string(target.SettlementId,path+'.Target.SettlementId',false,200),RandomSettlement:boolean(target.RandomSettlement,false,path+'.Target.RandomSettlement')};
    clean.TriggerConsequences=effectList(entry.TriggerConsequences,path+'.TriggerConsequences',{count:0});
    clean.Options=array(entry.Options,path+'.Options',100).map((value,index) => {
      const at=path+'.Options['+index+']';fields(value,['OptionText','AutoExecute','Tooltip','Conditions','Consequences','HasInputField','InputLabel','InputDefault','InputMin','InputMax'],at);
      const option={OptionText:value.OptionText === undefined ? '继续' : string(value.OptionText,at+'.OptionText',true,200),AutoExecute:boolean(value.AutoExecute,false,at+'.AutoExecute'),Tooltip:string(value.Tooltip,at+'.Tooltip'),Conditions:array(value.Conditions,at+'.Conditions',100).map((item,i) => condition(item,at+'.Conditions['+i+']')),Consequences:effectList(value.Consequences,at+'.Consequences',{count:0}),HasInputField:boolean(value.HasInputField,false,at+'.HasInputField'),InputLabel:value.InputLabel === undefined ? '输入数值' : string(value.InputLabel,at+'.InputLabel',false,200),InputDefault:integer(value.InputDefault,1,at+'.InputDefault',INT_MIN,INT_MAX),InputMin:integer(value.InputMin,1,at+'.InputMin',INT_MIN,INT_MAX),InputMax:integer(value.InputMax,100,at+'.InputMax',INT_MIN,INT_MAX)};
      if (option.HasInputField && (option.InputMin > option.InputMax || option.InputDefault < option.InputMin || option.InputDefault > option.InputMax)) throw new Error(at+' 的输入默认值必须在 InputMin 与 InputMax 之间');
      return option;
    });
  }
  function parseJSON(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('没有可读取的 JSON 内容');
    if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('文件超过 1 MB');
    const source=text.trim().replace(/^\uFEFF/, '');let parsed;
    try {parsed=JSON.parse(source);} catch {throw new Error('JSON 无法解析，请检查引号、逗号与括号');}
    // JSON.parse silently overwrites repeated object fields; the game's reader rejects them.
    // Scan the already syntax-checked source so browser and game imports agree.
    let index=0;
    const whitespace=() => {while (/\s/.test(source[index] || '') && index < source.length) index++;};
    function quoted() {
      const start=index++;
      while (index < source.length) {const character=source[index++];if (character === '\\') index++;else if (character === '"') break;}
      return JSON.parse(source.slice(start,index));
    }
    function value(depth,path) {
      whitespace();const character=source[index];
      if ((character === '{' || character === '[') && depth >= 64) throw new Error(path+' JSON 嵌套超过 64 层');
      if (character === '{') {
        index++;whitespace();const keys=new Set();
        if (source[index] === '}') {index++;return;}
        while (index < source.length) {
          whitespace();const key=quoted();
          if (keys.has(key)) throw new Error(path+'.'+key+' JSON 字段重复');keys.add(key);
          whitespace();index++;value(depth+1,path+'.'+key);whitespace();
          if (source[index++] === '}') return;
        }
      } else if (character === '[') {
        index++;whitespace();let item=0;
        if (source[index] === ']') {index++;return;}
        while (index < source.length) {value(depth+1,path+'['+item+']');item++;whitespace();if (source[index++] === ']') return;}
      } else if (character === '"') quoted();
      else while (index < source.length && !/[\s,}\]]/.test(source[index])) index++;
    }
    value(0,'$');return parsed;
  }
  function parseAI(text) {
    if (typeof text !== 'string') throw new Error('AI 返回的内容不是文本');
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return parseJSON(fenced ? fenced[1] : trimmed);
  }
  function validate(data, type) {
    if (!Object.hasOwn(TYPES, type)) throw new Error('请选择支持的资产类型');
    if (!object(data)) throw new Error('JSON 顶层必须是对象');
    const isName = NAME_TYPES.includes(type);
    const key = isName ? 'Items' : 'Entries';
    if (Object.hasOwn(data, isName ? 'Entries' : 'Items')) throw new Error('文件同时包含 Items 和 Entries，请核对资产类型');
    fields(data,[key,'SchemaVersion','ProfileId'],'JSON');
    let bytes;try {bytes=new TextEncoder().encode(JSON.stringify(data)).length;}catch {throw new Error('内容必须是可序列化的 JSON 对象');}
    if (bytes > MAX_FILE_BYTES) throw new Error('文件超过 1 MB');
    const metadata={};
    if (data.SchemaVersion !== undefined) metadata.SchemaVersion=integer(data.SchemaVersion,1,'SchemaVersion',1,1);
    if (data.ProfileId !== undefined) {
      metadata.ProfileId=string(data.ProfileId,'ProfileId',true,200);
      if (metadata.ProfileId !== (profile?.profileId || SUPPORTED_PROFILE_ID)) throw new Error('ProfileId 与当前游戏协议不兼容：'+metadata.ProfileId);
    }
    if (!Array.isArray(data[key]) || data[key].length === 0) throw new Error('需要非空的 ' + key + ' 数组');
    if (data[key].length > 5000) throw new Error('单个库最多支持 5000 个条目');
    if (isName) {
      const items = data.Items.map((item, index) => string(item, '第 ' + (index + 1) + ' 个名字', true, 120));
      if (new Set(items).size !== items.length) throw new Error('名字重复，请删除重复项');
      return {...metadata,Items:items};
    }
    const ids = new Set();
    const entries = data.Entries.map((entry, index) => {
      const prefix = '条目 ' + (index + 1) + ' · ';
      fields(entry,ENTRY_FIELDS,'Entries['+index+']');
      const clean = {Name:string(entry.Name, prefix+'Name',true,200),Description:string(entry.Description,prefix+'Description',true),Stages:[]};
      clean.Stages = array(entry.Stages,prefix+'Stages',100).map((stage, stageIndex) => {
        fields(stage,['StageName','Description'],prefix+'Stages['+stageIndex+']');
        return {StageName:string(stage.StageName,prefix+'阶段 '+(stageIndex+1)+' 名称',true,200),Description:string(stage.Description,prefix+'阶段描述',true)};
      });
      clean.Id = string(entry.Id,prefix+'Id',false,200);
      clean.Type = string(entry.Type,prefix+'Type',false,80);
      clean.Weight = integer(entry.Weight,10,prefix+'Weight',1,100000);
      clean.CooldownDays = integer(entry.CooldownDays,0,prefix+'CooldownDays',0,100000);
      clean.RuleType = enumValue(entry.RuleType,'Periodic',['Periodic','BySeason','ByDayInYear'],prefix+'RuleType');
      clean.RuleDayInYear = integer(entry.RuleDayInYear,1,prefix+'RuleDayInYear',1,INT_MAX);
      if (type === 'Festivals' && clean.RuleType === 'ByDayInYear') {
        const active=requireProfile(prefix+'RuleDayInYear');
        integer(clean.RuleDayInYear,1,prefix+'RuleDayInYear',1,active.daysPerYear);
      }
      clean.RuleSeason = enumValue(entry.RuleSeason,'Spring',['Spring','Summer','Autumn','Winter'],prefix+'RuleSeason');
      clean.RulePeriodDays = integer(entry.RulePeriodDays,15,prefix+'RulePeriodDays',1,100000);
      clean.RuleDurationDays = integer(entry.RuleDurationDays,1,prefix+'RuleDurationDays',1,100000);
      clean.LinkedEventIds = array(entry.LinkedEventIds,prefix+'LinkedEventIds',1000).map(id => string(id,prefix+'关联事件 Id',true,200));
      if (new Set(clean.LinkedEventIds).size !== clean.LinkedEventIds.length) throw new Error(prefix+'LinkedEventIds 不能重复');
      if (profile || GAMEPLAY_FIELDS.some(field => Object.hasOwn(entry,field))) gameplay(entry,clean,'Entries['+index+']');
      const effectiveId=clean.Id || 'content_'+clean.Name;
      if (ids.has(effectiveId)) throw new Error('条目 Id 重复：'+effectiveId);ids.add(effectiveId);
      return clean;
    });
    const result={...metadata,Entries:entries};
    if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_FILE_BYTES) throw new Error('规范化后的文件超过 1 MB，请减少条目或描述长度');
    return result;
  }
  function buildGenerationPrompt(settings) {
    const english=settings.language === 'en';
    if (NAME_TYPES.includes(settings.type)) return english ? 'Return only {"Items":["name"]}. Each name is unique nonempty text, at most 120 characters. Do not add gameplay fields.' : '仅输出 {"Items":["名字"]}，每个名字为不重复的非空文本，最多 120 个字符。';
    if (['Quests','SpecialNPCs'].includes(settings.type)) return (english?'This library is a narrative draft; the game has no external gameplay execution entry point yet. Return only Entries with Name,Description,Id,Type:"",Stages:[{StageName,Description}],Weight,CooldownDays. Do not add gameplay effects or invent rewards that the game executes. ':'此类库是内容草稿，游戏尚无外部玩法执行入口。仅输出 Entries，其中使用 Name、Description、Id、Type:""、Stages:[{StageName,Description}]、Weight、CooldownDays。不要添加子效果或编造游戏已执行的奖励。')+JSON.stringify({Entries:[{Name:english?'Entry name':'条目名称',Description:english?'Story description':'故事描述',Id:'author_library_entry_01',Type:'',Stages:[{StageName:english?'Stage name':'阶段名称',Description:english?'Stage description':'阶段描述'}],Weight:settings.weight ?? 10,CooldownDays:settings.cooldown ?? 0}]});
    const active=requireProfile('生成内容');
    const example={SchemaVersion:1,ProfileId:active.profileId,Entries:[{Id:'author_library_event_01',Name:english?'Event name':'事件名称',Description:english?'What happens':'事件描述',Type:'',Weight:settings.weight ?? 10,CooldownDays:settings.cooldown ?? 0,EventType:'Notice',Repeatable:true,Score:0,Tags:'None',Target:{RandomSettlement:true},TriggerConsequences:[],Options:[]}]};
    const catalog={};
    for (const [key,spec] of Object.entries(active.effects)) {
      if (spec.status === 'logOnly' || spec.requiresBindings === true) continue;
      const parameters={};for (const [field,desc] of Object.entries(spec.parameters || {})) parameters[field]=Object.fromEntries(Object.entries(desc).filter(([name]) => !['description','title'].includes(name)));
      catalog[key]={parameters,allowsChildren:!!spec.allowsChildren,requiresCharacter:!!spec.requiresCharacter,supportsStoredNpc:!!spec.supportsStoredNpc};
      if (spec.bindingRules?.length) catalog[key].bindingRules=spec.bindingRules;
      if (spec.characterRules?.length) catalog[key].characterRules=spec.characterRules;
      if (spec.contextRules?.length) catalog[key].contextRules=spec.contextRules;
    }
    // The exported catalog repeats inherited fields. Keep their exact descriptors once in the prompt.
    const specs=Object.values(catalog), commonParameters={};
    if (specs.length) for (const [field,desc] of Object.entries(specs[0].parameters)) {
      if (specs.every(spec => JSON.stringify(spec.parameters[field]) === JSON.stringify(desc))) commonParameters[field]=desc;
    }
    for (const spec of specs) for (const field of Object.keys(commonParameters)) delete spec.parameters[field];
    const rules=english ? [
      'Use exact case-sensitive game fields and enum names. Type is an optional legacy handler key, not the library category; leave it empty unless a known handler is required.',
      'Compose executable effects only from the catalog below. Each effect is {Type,Parameters:{...},Children:[]}. Parameters contain public configuration fields only. Unknown types/fields and numeric enum values are forbidden. Add actual TriggerConsequences for Events; prose alone does not change the game.',
      'Parameters may contain the common parameters plus that effect\'s own catalog parameters. Effects that only log or always require unavailable game/world bindings are excluded; do not invent conversation titles, quest IDs, anchors or character IDs. Some effects have conditional bindingRules: avoid any parameter combination that matches a rule\'s when and nonEmpty/minimum conditions, because the referenced fields cannot be verified. Context-only variants remain usable.',
      'Options are optional and should be [] for events that execute directly. Add choices only if the player asks for them. Options may contain OptionText,AutoExecute,Tooltip,Conditions,Consequences,HasInputField,InputLabel,InputDefault,InputMin,InputMax. Conditions use Type,Param,Threshold,Op.',
      'Optional entry fields include Stages:[{StageName,Description}],RumorHint,DescriptionVariants:[string],CausalTagModifiers:[{targetTag,probabilityMultiplier:positive number,durationDays:positive integer,decayOverTime:boolean}]. Target allows ActorId,PlayerId,SettlementId,RandomSettlement only. Tags and targetTag combine enum names with commas.',
      'Portable world events use Target.RandomSettlement and {SettlementName}; character effects use RandomInSettlement/AllInSettlement with CharacterKind. Do not invent fixed player/NPC IDs or settlement names. Player and Self require actual runtime player/actor context. Stored NPCs require supportsStoredNpc:true. Economy/flag effects need their subsystem and event location.',
      'DiseaseName,ItemId,ItemTag must reference available game resources. Do not invent disease/item definitions. If a resource list is incomplete, avoid using unlisted references in newly generated content. LinkedEventIds must refer to actual entries and their libraries must be selected in the game.',
      'Children are supported only by allowsChildren:true; maximum depth 32 and 1024 effects per consequence list. SpecificId needs a positive SpecificCharId; RandomInSettlement needs positive TargetCount; RemainingDays is -1 or positive; Chance is 0–1. Inputs must satisfy InputMin <= InputDefault <= InputMax.',
      'Festivals use RuleType Periodic/BySeason/ByDayInYear, RuleSeason Spring/Summer/Autumn/Winter, positive RulePeriodDays and RuleDurationDays. RuleDayInYear must be 1–'+active.daysPerYear+'. Quests and SpecialNPCs are narrative drafts without an external gameplay execution path.'
    ] : [
      '字段大小写与游戏一致，枚举使用名称文本。Type 是可选的旧处理器路由键，不是库分类；没有已知处理器时留空。',
      '只使用下面目录中的效果组合实际行为。每个效果格式为 {Type,Parameters:{参数对象},Children:[]}，参数仅能使用目录公开的配置字段。不得添加未知效果、字段或数字枚举。Events 应含实际 TriggerConsequences，仅有描述不能改变游戏。',
      'Parameters 可同时使用“公共参数”和该效果自身的参数。仅输出日志或始终依赖未提供的游戏/世界绑定目录的效果已排除；不要编造对话标题、任务编号、导航锚点或角色编号。部分效果含条件 bindingRules：不得生成满足 when 及 nonEmpty/minimum 条件的参数组合，此时引用的 fields 尚无法验证；只依赖事件上下文的组合可以使用。',
      '直接执行的事件使用 Options:[]；只有玩家要求选择时才加入选项。选项可用 OptionText、AutoExecute、Tooltip、Conditions、Consequences、HasInputField、InputLabel、InputDefault、InputMin、InputMax。Conditions 使用 Type、Param、Threshold、Op。',
      '条目还可用 Stages:[{StageName,Description}]、RumorHint、DescriptionVariants:[文本]、CausalTagModifiers:[{targetTag,probabilityMultiplier:正数,durationDays:正整数,decayOverTime:布尔值}]。Target 只支持 ActorId、PlayerId、SettlementId、RandomSettlement。Tags 和 targetTag 用逗号连接枚举名称。',
      '跨存档通用的世界事件使用 Target.RandomSettlement 和 {SettlementName} 占位符；角色效果用 RandomInSettlement 或 AllInSettlement 并指定 CharacterKind。不要编造固定角色 ID 或聚落名称。Player/Self 依赖实际玩家/角色上下文；离场 NPC 只可使用 supportsStoredNpc:true 的效果。经济和标记效果也需要相应系统与事件地点。',
      'DiseaseName、ItemId、ItemTag 引用下方真实资源。不得编造疾病或物品定义。资源目录不完整时，新生成内容也尽量仅使用已列出的引用。LinkedEventIds 必须引用真实事件，并在游戏中同时选择相关库。',
      '仅 allowsChildren:true 支持 Children；嵌套最多 32 层，每组后果最多 1024 个效果。SpecificId 要求正数 SpecificCharId；RandomInSettlement 要求正数 TargetCount；RemainingDays 为 -1 或正数；Chance 在 0–1 之间。输入满足 InputMin <= InputDefault <= InputMax。',
      '节日 RuleType 为 Periodic/BySeason/ByDayInYear，RuleSeason 为 Spring/Summer/Autumn/Winter，周期与持续天数为正数。RuleDayInYear 范围 1–'+active.daysPerYear+'。Quests、SpecialNPCs 当前属于内容草稿，尚无外部玩法执行入口。'
    ];
    return rules.join('\n')+'\n'+(english?'Root example: ':'根对象示例：')+JSON.stringify(example)+'\n'+(english?'Game enums: ':'游戏枚举：')+JSON.stringify(active.enums)+'\n'+(english?'Common parameters: ':'公共参数：')+JSON.stringify(commonParameters)+'\n'+(english?'Effect catalog: ':'效果目录：')+JSON.stringify(catalog)+'\n'+(english?'Game resources: ':'游戏资源：')+JSON.stringify(active.resources || {})+'\n'+(english?'Resource catalog completeness: ':'资源目录完整性：')+JSON.stringify(active.resourcesComplete || {});
  }
  function walkEffects(entry, visit) {
    function walk(list,ancestors,option) {for (const effect of list || []) {visit(effect,ancestors,option);walk(effect.Children,[...ancestors,effect],option);}}
    walk(entry.TriggerConsequences,[],null);for (const option of entry.Options || []) walk(option.Consequences,[],option);
  }
  function describeEffects(entry, language = 'zh-CN') {
    const english=language === 'en', summaries=[];
    const parameter=(effect,key) => effect.Parameters?.[key] ?? profile?.effects[effect.Type]?.parameters?.[key]?.default;
    function targetText(effect) {
      const mode=parameter(effect,'TargetMode') || 'Self', kind=parameter(effect,'CharacterKind');
      const noun=kind === 'Npc' ? (english?'NPCs':'NPC') : kind === 'Player' ? (english?'players':'玩家') : (english?'characters':'角色');
      if (mode === 'RandomInSettlement') return english?'random '+(parameter(effect,'TargetCount') || 1)+' '+noun+' in the settlement':'城中随机 '+(parameter(effect,'TargetCount') || 1)+' 名'+noun;
      if (mode === 'AllInSettlement') return english?'all '+noun+' in the settlement':'城中全部'+noun;
      if (mode === 'Player') return english?'the contextual player':'当前事件玩家';
      if (mode === 'SpecificId') return english?'character #'+parameter(effect,'SpecificCharId'):'角色 #'+parameter(effect,'SpecificCharId');
      if (mode === 'ByTag') return english?'characters tagged '+parameter(effect,'TargetTagName'):'带“'+parameter(effect,'TargetTagName')+'”标签的角色';
      return english?'the contextual actor':'当前事件角色';
    }
      walkEffects(entry,(effect,ancestors,option) => {
      if (profile?.effects[effect.Type]?.allowsChildren) return;
      const parameters=effect.Parameters || {};const parts=Object.entries(parameters).filter(([key]) => key !== 'EffectName').map(([key,value]) => key+'='+JSON.stringify(value));
      let text=effect.Type+(parts.length ? ' ('+parts.join(', ')+')' : '');
      const delta=parameter(effect,'Delta'), direction=delta >= 0 ? (english?'increase':'增加') : (english?'decrease':'减少');
      const attributes={ModifyHealthEffect:english?'health':'健康',ModifyPrestigeEffect:english?'prestige':'声望',ModifyHappinessEffect:english?'happiness':'幸福',ModifyAgeEffect:english?'age':'年龄'};
      if (effect.Type === 'InfectDiseaseEffect') text=english?targetText(effect)+' become infected with '+parameter(effect,'DiseaseName'):targetText(effect)+'感染“'+parameter(effect,'DiseaseName')+'”';
      else if (effect.Type === 'CureDiseaseEffect') text=english?'Cure '+(parameter(effect,'DiseaseName') || 'all diseases')+' for '+targetText(effect):'治愈'+targetText(effect)+'的'+(parameter(effect,'DiseaseName') ? '“'+parameter(effect,'DiseaseName')+'”' : '全部疾病');
      else if (attributes[effect.Type]) text=targetText(effect)+(english?' ': '的')+attributes[effect.Type]+' '+direction+' '+Math.abs(delta)+(parameter(effect,'IsPercentage') ? '%' : '');
      else if (/^Modify(Supply|Demand)(ByTag)?Effect$/.test(effect.Type)) {
        const location=parameter(effect,'Target') === 'FixedSettlement' ? parameter(effect,'SettlementId') : (entry.Target?.SettlementId || (english?'event settlement':'事件所在城市'));
        const item=parameter(effect,effect.Type.includes('ByTag') ? 'ItemTag' : 'ItemId');
        text=location+' '+item+' '+(effect.Type.includes('Demand') ? (english?'demand':'需求') : (english?'supply':'供应'))+' '+direction+' '+Math.abs(delta);
        if (parameter(effect,'DurationDays') > 0) text+=english?' for '+parameter(effect,'DurationDays')+' days':'，持续 '+parameter(effect,'DurationDays')+' 天';
      }
      const qualifiers=ancestors.filter(parent=>parent.Type === 'RandomEffect' || parent.Type === 'ConditionEffect').map(parent=>parent.Type === 'RandomEffect' ? (english?'chance ':'概率 ')+Math.round(parameter(parent,'Chance')*10000)/100+'%' : (english?'when flag ':'当标记“')+parameter(parent,'Flag')+(english?(parameter(parent,'Condition') === 'FlagNotSet'?' is absent':' is set'):(parameter(parent,'Condition') === 'FlagNotSet'?'”未设置':'”已设置')));
      if (option) qualifiers.unshift((english?'option ':'选项“')+option.OptionText+(english?'':'”'));
      if (qualifiers.length) text='['+qualifiers.join('；')+'] '+text;
      // Retaining the type makes the preview traceable to the catalog and the game's history.
      if (!text.startsWith(effect.Type)) text+=' ['+effect.Type+']';
      summaries.push(text);
    });
    const prefix=english?'Effects: ':'效果：';
    return summaries.length ? prefix+summaries.slice(0,12).join('；')+(summaries.length > 12 ? ' … ('+summaries.length+')' : '') : (english?'No executable effect configured':'未配置可执行子效果');
  }
  function getValidationWarnings(data, type, language = 'zh-CN') {
    const checked=validate(data,type), english=language === 'en', warnings=new Set();
    if (NAME_TYPES.includes(type)) return [];
    if (['Quests','SpecialNPCs'].includes(type)) warnings.add(english?'This library currently loads as narrative data; the game has no external gameplay execution entry point.':'此类库当前仅加载内容数据，游戏尚无外部玩法执行入口。');
    for (const entry of checked.Entries) {
      if (entry.LinkedEventIds.length) warnings.add(english?'Linked event IDs require selecting the corresponding event library in the game.':'关联事件编号需要在游戏中同时选择对应事件库。');
      if (entry.Target?.ActorId || entry.Target?.PlayerId || entry.Target?.SettlementId) warnings.add(english?'Fixed character IDs or settlement names are tied to a particular world.':'固定角色编号或聚落名称依赖特定世界，分享后需要重新绑定。');
    walkEffects(entry,(effect,ancestors,option) => {
        const spec=profile?.effects[effect.Type];if (!spec) return;
        if (spec.status === 'logOnly') warnings.add(english?effect.Type+' currently only writes a game log; it does not display a UI or spawn an object.':effect.Type+' 当前仅输出游戏日志，尚未实现显示界面或生成物体。');
        for (const binding of getEffectBindings(effect)) warnings.add(english?effect.Type+' requires verified game resources or world-specific bindings; check '+binding.fields.join(', ')+'. These references are not verified by this profile.':effect.Type+' 需要匹配游戏真实资源或世界中的绑定；请核对 '+binding.fields.join('、')+'。当前目录无法验证这些引用。'+(binding.notes ? ' '+binding.notes : ''));
        const param=(key) => effect.Parameters?.[key] ?? spec.parameters?.[key]?.default;
        const mode=param('TargetMode');
        if (mode === 'SpecificId' || param('Target') === 'FixedSettlement') warnings.add(english?'Some effects use fixed character IDs or settlement names and depend on a particular world.':'部分效果使用固定角色编号或聚落名称，依赖特定世界。');
        if ((['AllInSettlement','RandomInSettlement'].includes(mode) || param('Target') === 'TargetLocation') && !entry.Target?.SettlementId && !entry.Target?.RandomSettlement) warnings.add(english?'Some effects require a settlement supplied by the runtime event context.':'部分效果需要运行时事件上下文提供城市位置。');
        const requirements=getEffectContextRequirements(effect), interactive=option && option.AutoExecute === false;
        if (!interactive && ((requirements.requiresActor && !entry.Target?.ActorId) || (requirements.requiresPlayer && !entry.Target?.PlayerId))) warnings.add(english?'Some effects require an actor/player supplied by the runtime event context.':'部分效果需要运行时事件上下文提供实际角色或玩家。');
        if (effectRequiresCharacter(effect) && !spec.supportsStoredNpc && ['AllInSettlement','RandomInSettlement'].includes(mode) && param('CharacterKind') !== 'Player') warnings.add(english?'Some group effects require active characters and do not support stored/off-scene NPCs.':'部分群体效果要求已加载角色，不支持离场 NPC 数据。');
        for (const [field,desc] of Object.entries(spec.parameters || {})) if (desc.resource && param(field) && profile.resourcesComplete?.[desc.resource] !== true) warnings.add(english?'The '+desc.resource+' resource catalog is incomplete; the game must verify this reference at import/runtime.':desc.resource+' 资源目录不完整，此引用还需游戏导入或运行时确认。');
      });
    }
    return Array.from(warnings).slice(0,20);
  }
  function getEffectBindings(effect) {
    const spec=profile?.effects[effect.Type];if (!spec) return [];
    const parameter=(key) => effect.Parameters?.[key] ?? spec.parameters?.[key]?.default;
    const bindings=[];
    if (spec.requiresBindings === true) bindings.push({fields:spec.requiredBindingFields || spec.bindingFields || [],notes:spec.notes || ''});
    for (const rule of spec.bindingRules || []) {
      if (!Object.entries(rule.when || {}).every(([key,value]) => parameter(key) === value)) continue;
      const boundFields=(rule.fields || []).filter(key => {
        const value=parameter(key);
        if (rule.nonEmpty === true && (value === undefined || value === null || value === '')) return false;
        if (rule.minimum !== undefined && !(typeof value === 'number' && value >= rule.minimum)) return false;
        return true;
      });
      if (boundFields.length) bindings.push({fields:boundFields,notes:rule.notes || spec.notes || ''});
    }
    return bindings;
  }
  function effectRequiresCharacter(effect) {
    const spec=profile?.effects[effect.Type];if (!spec) return false;
    const parameter=(key) => effect.Parameters?.[key] ?? spec.parameters?.[key]?.default;
    let required=!!spec.requiresCharacter;
    for (const rule of spec.characterRules || []) if (Object.entries(rule.when || {}).every(([key,value]) => parameter(key) === value) && typeof rule.requiresCharacter === 'boolean') required=rule.requiresCharacter;
    return required;
  }
  function getEffectContextRequirements(effect) {
    const spec=profile?.effects[effect.Type];if (!spec) return {requiresActor:false,requiresPlayer:false};
    const parameter=(key) => effect.Parameters?.[key] ?? spec.parameters?.[key]?.default;
    const mode=parameter('TargetMode');
    const requirements={requiresActor:mode === 'Self' && effectRequiresCharacter(effect),requiresPlayer:mode === 'Player'};
    for (const rule of spec.contextRules || []) if (Object.entries(rule.when || {}).every(([key,value]) => parameter(key) === value)) {
      requirements.requiresActor ||= rule.requiresActor === true;
      requirements.requiresPlayer ||= rule.requiresPlayer === true;
    }
    return requirements;
  }
  function fileName(value) {
    const raw = String(value || 'MyLibrary').trim().replace(/\.json$/i,'');
    const safe = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/[. ]+$/g,'').slice(0,80) || 'MyLibrary';
    return (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? '_'+safe : safe) + '.json';
  }
  function download(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
    const anchor = document.createElement('a');anchor.href=url;anchor.download=fileName(name);document.body.append(anchor);anchor.click();anchor.remove();setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  function status(element, message, kind = 'success') {element.textContent=message;element.dataset.kind=kind;element.hidden=false;}
  function count(data) {return (data.Items || data.Entries).length;}
  const api = {TYPES,NAME_TYPES,MAX_FILE_BYTES,GAME_PATH,configureProfile,getProfile,parseJSON,parseAI,validate,buildGenerationPrompt,describeEffects,getValidationWarnings,getEffectBindings,effectRequiresCharacter,getEffectContextRequirements,fileName,download,status,count};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  root.GLAssets=api;
})(typeof window !== 'undefined' ? window : globalThis);
