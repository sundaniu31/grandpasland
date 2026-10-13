/* Data-only library contracts matching Crownfall1's dialogue and item importers. */
(function (root) {
  'use strict';
  const PROFILE_ID='crownfall1-v1', MAX_BYTES=10*1024*1024, MAX_ENTRIES=5000;
  const INT_MIN=-2147483648, INT_MAX=2147483647;
  const CONDITION_TYPES=['Gold','Health','Prestige','Age','Stat','HasTag','HasItem','NpcLoyalty','NpcGreed'];
  const COMPARISONS=['GreaterEqual','Greater','LessEqual','Less','Equal'];
  const STATS=['Charm','Attack','Defense','Health','Prestige'];
  const QUALITY_TAGS={Common:'普通',Uncommon:'良好',Rare:'精英',Epic:'史诗',Legendary:'传说'};
  const SCENES=['ambient','conversation','meet','enter_tavern','tavern'];
  function object(value) {return value !== null && typeof value === 'object' && !Array.isArray(value);}
  function fields(value,allowed,path) {
    if (!object(value)) throw new Error(path+' 必须是对象');
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(path+'.'+key+' 是游戏不支持的字段');
  }
  // Preserve text and identifiers exactly; trimming identifiers silently changes node/resource links.
  function text(value,path,fallback='',max=Infinity,required=false) {
    if (value === undefined) value=fallback;
    if (typeof value !== 'string') throw new Error(path+' 必须是文本');
    if (value.length > max) throw new Error(path+' 最多 '+max+' 个字符');
    if (required && !value.trim()) throw new Error(path+' 不能为空');
    return value;
  }
  function integer(value,path,fallback=0,min=INT_MIN,max=INT_MAX) {
    if (value === undefined) value=fallback;
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(path+' 必须是 '+min+'–'+max+' 的整数');
    return value;
  }
  function number(value,path,fallback,min,max) {
    if (value === undefined) value=fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(path+' 必须是 '+min+'–'+max+' 的有限数值');
    return value;
  }
  function boolean(value,path,fallback=false) {
    if (value === undefined) value=fallback;
    if (typeof value !== 'boolean') throw new Error(path+' 必须是 true 或 false');
    return value;
  }
  function list(value,path,max=MAX_ENTRIES) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(path+' 必须是数组');
    if (value.length > max) throw new Error(path+' 最多 '+max+' 项');
    return value;
  }
  function enumValue(value,path,fallback,values) {
    if (value === undefined) value=fallback;
    if (!values.includes(value)) throw new Error(path+' 的值无效；支持 '+values.join(' / '));
    return value;
  }
  function metadata(data,required) {
    if (required && (data.SchemaVersion === undefined || data.ProfileId === undefined)) throw new Error('$ 必须明确包含 SchemaVersion 和 ProfileId');
    if (data.SchemaVersion !== undefined && data.SchemaVersion !== 1) throw new Error('$.SchemaVersion 必须是 1');
    if (data.ProfileId !== undefined && data.ProfileId !== PROFILE_ID) throw new Error('$.ProfileId 必须是 '+PROFILE_ID);
    return {SchemaVersion:1,ProfileId:PROFILE_ID};
  }
  function uniqueId(value,path,ids,max=128) {
    const id=text(value,path,'',max,true);
    if (ids.has(id)) throw new Error(path+' 编号重复：'+id);
    ids.add(id);return id;
  }
  function optionCondition(value,path) {
    fields(value,['Type','Param','Threshold','Op'],path);
    const clean={Type:enumValue(value.Type,path+'.Type','Gold',CONDITION_TYPES),Param:text(value.Param,path+'.Param'),Threshold:integer(value.Threshold,path+'.Threshold'),Op:enumValue(value.Op,path+'.Op','GreaterEqual',COMPARISONS)};
    if (clean.Type === 'Stat' && !STATS.includes(clean.Param)) throw new Error(path+'.Param 必须是有效属性名');
    if (['HasTag','HasItem'].includes(clean.Type) && !clean.Param.trim()) throw new Error(path+'.Param 不能为空');
    return clean;
  }
  function conditions(value,path) {return list(value,path).map((item,index)=>optionCondition(item,path+'['+index+']'));}
  function match(value,path) {
    if (value === undefined) value={};
    fields(value,['NpcIds','PlayerIds','NpcTags','PlayerTags','Tone','Conditions'],path);
    const ids=key=>list(value[key],path+'.'+key).map((id,index)=>integer(id,path+'.'+key+'['+index+']',0,1,INT_MAX));
    const tags=key=>list(value[key],path+'.'+key).map((tag,index)=>text(tag,path+'.'+key+'['+index+']','',Infinity,true));
    return {NpcIds:ids('NpcIds'),PlayerIds:ids('PlayerIds'),NpcTags:tags('NpcTags'),PlayerTags:tags('PlayerTags'),Tone:enumValue(value.Tone,path+'.Tone','',['','warm','cold','neutral']),Conditions:conditions(value.Conditions,path+'.Conditions')};
  }
  function dialogueText(value,path) {
    if (value === undefined) value={};
    fields(value,['Text','TextKey','Table','Translations'],path);
    const translations=value.Translations === undefined ? {} : value.Translations;
    if (!object(translations)) throw new Error(path+'.Translations 必须是语言到文本的对象');
    const clean={Text:text(value.Text,path+'.Text','',4000),TextKey:text(value.TextKey,path+'.TextKey'),Table:text(value.Table,path+'.Table','AGame_NPC'),
      Translations:Object.fromEntries(Object.entries(translations).map(([language,translation])=>{
        text(language,path+'.Translations语言代码','',32,true);
        return [language,text(translation,path+'.Translations.'+language,'',4000)];
      }))};
    if (!clean.Text.trim() && !clean.TextKey.trim() && !Object.values(clean.Translations).some(item=>item.trim())) throw new Error(path+' 需要台词、翻译或本地化键');
    if (clean.TextKey && !clean.Table.trim()) throw new Error(path+'.Table 本地化表不能为空');
    return clean;
  }
  function validateDialogues(data) {
    fields(data,['SchemaVersion','ProfileId','Lines','Conversations','Profiles'],'$');
    const meta=metadata(data,true);
    if (!['Lines','Conversations','Profiles'].some(key=>data[key] !== undefined)) throw new Error('$ 对话库需要 Lines、Conversations 或 Profiles 数组');
    let ids=new Set();
    const Lines=list(data.Lines,'$.Lines').map((line,index)=>{
      const path='$.Lines['+index+']';fields(line,['Id','Scene','Weight','Match','Text'],path);
      return {Id:uniqueId(line.Id,path+'.Id',ids),Scene:text(line.Scene,path+'.Scene','ambient',Infinity,true),Weight:integer(line.Weight,path+'.Weight',1,0,1000000),Match:match(line.Match,path+'.Match'),Text:dialogueText(line.Text,path+'.Text')};
    });
    ids=new Set();
    const Conversations=list(data.Conversations,'$.Conversations').map((conversation,index)=>{
      const path='$.Conversations['+index+']';
      fields(conversation,['Id','Title','Default','Priority','Match','StartNodeId','Nodes'],path);
      const clean={Id:uniqueId(conversation.Id,path+'.Id',ids),Title:text(conversation.Title,path+'.Title'),Default:boolean(conversation.Default,path+'.Default',true),Priority:integer(conversation.Priority,path+'.Priority',10),Match:match(conversation.Match,path+'.Match'),StartNodeId:text(conversation.StartNodeId,path+'.StartNodeId'),Nodes:[]};
      const nodes=list(conversation.Nodes,path+'.Nodes',512), nodeIds=new Set();
      if (!nodes.length) throw new Error(path+'.Nodes 需要 1–512 个节点');
      for (let i=0;i<nodes.length;i++) {
        fields(nodes[i],['Id','Speaker','Text','NextNodeId','Options'],path+'.Nodes['+i+']');
        uniqueId(nodes[i].Id,path+'.Nodes['+i+'].Id',nodeIds);
      }
      if (!nodeIds.has(clean.StartNodeId)) throw new Error(path+'.StartNodeId 起始节点不存在');
      const link=(value,at)=>{const id=text(value,at);if (id && !nodeIds.has(id)) throw new Error(at+' 目标节点不存在：'+id);return id;};
      clean.Nodes=nodes.map((node,i)=>{
        const at=path+'.Nodes['+i+']', optionIds=new Set();
        const parsed={Id:node.Id,Speaker:enumValue(node.Speaker,at+'.Speaker','npc',['npc','player']),Text:dialogueText(node.Text,at+'.Text'),NextNodeId:link(node.NextNodeId,at+'.NextNodeId'),Options:list(node.Options,at+'.Options',16).map((option,j)=>{
          const op=at+'.Options['+j+']';fields(option,['Id','Text','NextNodeId','EventId','Conditions'],op);
          return {Id:uniqueId(option.Id,op+'.Id',optionIds),Text:dialogueText(option.Text,op+'.Text'),NextNodeId:link(option.NextNodeId,op+'.NextNodeId'),EventId:text(option.EventId,op+'.EventId','',128),Conditions:conditions(option.Conditions,op+'.Conditions')};
        })};
        if (parsed.NextNodeId && parsed.Options.length) throw new Error(at+' 不能同时配置 NextNodeId 和 Options');
        return parsed;
      });return clean;
    });
    ids=new Set();
    const Profiles=list(data.Profiles,'$.Profiles').map((profile,index)=>{
      const path='$.Profiles['+index+']';fields(profile,['Id','Priority','Match','Persona','Knowledge'],path);
      return {Id:uniqueId(profile.Id,path+'.Id',ids),Priority:integer(profile.Priority,path+'.Priority',10),Match:match(profile.Match,path+'.Match'),Persona:text(profile.Persona,path+'.Persona','',8000),Knowledge:list(profile.Knowledge,path+'.Knowledge',128).map((entry,i)=>text(entry,path+'.Knowledge['+i+']','',4000))};
    });
    if (Lines.length+Conversations.length+Profiles.length > MAX_ENTRIES) throw new Error('$ 对话库三个数组合计最多 5000 条');
    return {...meta,Lines,Conversations,Profiles};
  }
  function itemIcon(value,path) {
    if (value === undefined) value={};
    fields(value,['Path','Hash','X','Y','Width','Height','PixelsPerUnit'],path);
    const clean={Path:text(value.Path,path+'.Path','',240,true),Hash:text(value.Hash,path+'.Hash'),
      X:integer(value.X,path+'.X',0,0,INT_MAX),Y:integer(value.Y,path+'.Y',0,0,INT_MAX),Width:integer(value.Width,path+'.Width',0,0,INT_MAX),Height:integer(value.Height,path+'.Height',0,0,INT_MAX),PixelsPerUnit:number(value.PixelsPerUnit,path+'.PixelsPerUnit',100,1,10000)};
    if (/[:\\]/.test(clean.Path) || clean.Path.split('/').some(part=>!part || part === '.' || part === '..') || !/\.png$/i.test(clean.Path)) throw new Error(path+'.Path 必须是 JSON 目录内的相对 PNG 路径');
    if (clean.Hash && !/^[a-f0-9]{64}$/.test(clean.Hash)) throw new Error(path+'.Hash 必须是 64 位小写 SHA-256');
    if ((!clean.Width) !== (!clean.Height)) throw new Error(path+' Width 和 Height 必须同时为 0 或同时为正数');
    if (!clean.Width && (clean.X || clean.Y)) throw new Error(path+' 整张图标不能有切片偏移');
    // Every imported image is at most 2048x2048; actual PNG bounds are checked during packaging/import.
    if (clean.Width && (clean.X+clean.Width > 2048 || clean.Y+clean.Height > 2048)) throw new Error(path+' 切片超出最大 2048×2048 图标范围');
    return clean;
  }
  function source(value,path) {
    fields(value,['Type','SettlementId','RequiresMine','DailyRate','MaxStock','InitialStock','EventId','Description'],path);
    const clean={Type:enumValue(value.Type,path+'.Type','Trade',['Trade','Production','EventReward','Loot','Crafting']),SettlementId:text(value.SettlementId,path+'.SettlementId','',120),RequiresMine:boolean(value.RequiresMine,path+'.RequiresMine'),DailyRate:integer(value.DailyRate,path+'.DailyRate',0,0,1000000),MaxStock:integer(value.MaxStock,path+'.MaxStock',0,0,1000000),InitialStock:integer(value.InitialStock,path+'.InitialStock',0,0,1000000),EventId:text(value.EventId,path+'.EventId','',120),Description:text(value.Description,path+'.Description','',1000)};
    if (clean.InitialStock > clean.MaxStock) throw new Error(path+'.InitialStock 不能超过 MaxStock');
    if (clean.Type === 'Production' && (!clean.DailyRate || !clean.MaxStock)) throw new Error(path+' Production 需要正数 DailyRate 和 MaxStock');
    return clean;
  }
  function itemReferences(entries,resources) {
    const provided=key=>Array.isArray(resources?.[key])?resources[key]:[];
    const ids=entries.map(item=>item.Id);
    return {items:[...new Set([...ids,...provided('items')])],commodities:[...new Set([...ids,...provided('commodities')])],itemTags:[...new Set([...entries.flatMap(item=>[...item.Tags,QUALITY_TAGS[item.Rarity]]),...provided('itemTags')])]};
  }
  function validateItems(data,assets,resources=null) {
    fields(data,['SchemaVersion','ProfileId','Entries'],'$');
    const meta=metadata(data,false), active=assets?.getProfile?.();
    if (!active) throw new Error('Items 需要先加载游戏内容协议 content-profile.json，请刷新页面后重试');
    const entries=list(data.Entries,'$.Entries'), ids=new Set();
    if (!entries.length) throw new Error('$.Entries 需要 1–5000 个物品定义');
    const Entries=entries.map((entry,index)=>{
      const path='$.Entries['+index+']';
      fields(entry,['Id','Name','Description','Category','Rarity','BaseValue','MaximumStack','Weight','Perishable','ShelfLifeDays','Tags','UseEffects','Sources','Icon'],path);
      const id=uniqueId(entry.Id,path+'.Id',ids,80);
      if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(id) || id.includes('..')) throw new Error(path+'.Id 仅允许英文字母、数字、下划线、连字符和点，不能以点开头或包含 ..');
      const clean={Id:id,Name:text(entry.Name,path+'.Name','',120,true),Description:text(entry.Description,path+'.Description','',4000),Category:enumValue(entry.Category,path+'.Category','Material',['Material','Consumable','Quest','Special']),Rarity:enumValue(entry.Rarity,path+'.Rarity','Common',['Common','Uncommon','Rare','Epic','Legendary']),BaseValue:integer(entry.BaseValue,path+'.BaseValue',100,0,100000000),MaximumStack:integer(entry.MaximumStack,path+'.MaximumStack',100,1,1000000),Weight:integer(entry.Weight,path+'.Weight',1,0,1000000),Perishable:boolean(entry.Perishable,path+'.Perishable'),ShelfLifeDays:integer(entry.ShelfLifeDays,path+'.ShelfLifeDays',0,0,1000000),Tags:list(entry.Tags,path+'.Tags',64).map((tag,i)=>text(tag,path+'.Tags['+i+']','',80,true)),UseEffects:list(entry.UseEffects,path+'.UseEffects',1024),Sources:list(entry.Sources,path+'.Sources',64).map((entry,i)=>source(entry,path+'.Sources['+i+']')),Icon:itemIcon(entry.Icon,path+'.Icon')};
      if (clean.Perishable && !clean.ShelfLifeDays) throw new Error(path+'.ShelfLifeDays 易腐物品保质期必须大于 0');
      if (clean.UseEffects.length && clean.Category !== 'Consumable') throw new Error(path+'.UseEffects 仅 Consumable 可配置使用效果');
      return clean;
    });
    const localResources=itemReferences(Entries,resources);
    for (let index=0;index<Entries.length;index++) {
      const path='$.Entries['+index+'].UseEffects';
      if (typeof assets.validateEffects !== 'function' && Entries[index].UseEffects.length) throw new Error(path+' 需要更新网站效果校验模块');
      Entries[index].UseEffects=assets.validateEffects ? assets.validateEffects(Entries[index].UseEffects,path,localResources) : [];
    }
    return {...meta,Entries};
  }
  function validate(data,type,assets,resources=null) {
    let clean;
    if (type === 'Dialogues') clean=validateDialogues(data);
    else if (type === 'Items') clean=validateItems(data,assets,resources);
    else throw new Error('协议模块不支持此库类型：'+type);
    if (new TextEncoder().encode(JSON.stringify(clean)).length > MAX_BYTES) throw new Error('规范化后的文件超过 10 MiB');
    return clean;
  }
  function count(data,type) {return type === 'Dialogues' || data?.Lines || data?.Conversations || data?.Profiles ? (data.Lines?.length || 0)+(data.Conversations?.length || 0)+(data.Profiles?.length || 0) : data?.Entries?.length || 0;}
  function summary(data,type,language='zh-CN') {
    const english=language === 'en';
    if (type === 'Dialogues') return english ? (data.Lines?.length || 0)+' lines · '+(data.Conversations?.length || 0)+' conversations · '+(data.Profiles?.length || 0)+' AI profiles' : (data.Lines?.length || 0)+' 条台词 · '+(data.Conversations?.length || 0)+' 个会话 · '+(data.Profiles?.length || 0)+' 个人设';
    return english ? (data.Entries?.length || 0)+' item definitions; PNG icons required' : (data.Entries?.length || 0)+' 个物品定义；须配套 PNG 图标';
  }
  function walkEffects(list,visit) {for (const effect of list || []) {visit(effect);walkEffects(effect.Children,visit);walkEffects(effect.ElseChildren,visit);for (const branch of effect.WeightedBranches || []) walkEffects(branch.Children,visit);}}
  function getValidationWarnings(data,type,assets,language='zh-CN',resources=null) {
    const clean=validate(data,type,assets,resources), english=language === 'en', warnings=new Set(), active=assets?.getProfile?.();
    const scopedResources=type === 'Items'?itemReferences(clean.Entries,resources):resources;
    const add=(zh,en)=>warnings.add(english?en:zh);
    if (type === 'Dialogues') {
      if (!count(clean,type)) add('库中没有内容；可以导入，但不会新增对话。','This empty library adds no dialogue.');
      const checkConditions=values=>{if ((values || []).some(condition=>condition.Type === 'HasItem')) add('HasItem 物品引用需在目标游戏中核验；对话导入不会创建物品。','HasItem references must be verified in the target game; dialogue import does not create items.');};
      const checkMatch=value=>{
        if (value.NpcIds.length || value.PlayerIds.length) add('固定角色编号依赖特定世界，分享后需要重新绑定；跨世界优先使用实际已有标签。','Fixed character IDs are world-specific; portable files should use verified existing tags.');
        if (value.NpcTags.length || value.PlayerTags.length) add('Match 标签必须已经存在于实际角色；对话文件不会自动添加角色标签。','Match tags must already exist on actual characters; dialogue files do not add character tags.');
        checkConditions(value.Conditions);
      };
      const checkText=value=>{if (value.TextKey) add('本地化键需要对应游戏字符串表；建议同时提供 Text 和 zh-Hans/en 翻译作为备用文本。','Localization keys require matching game tables; include Text and zh-Hans/en translations as fallbacks.');};
      for (const line of clean.Lines) {
        checkMatch(line.Match);checkText(line.Text);
        if (!SCENES.includes(line.Scene)) add('Scene='+line.Scene+' 虽可解析，但当前没有对应自动触发调用；现有场景为 '+SCENES.join(' / ')+'。','Scene='+line.Scene+' has no current automatic consumer; supported scenes are '+SCENES.join(' / ')+'.');
        if (['ambient','meet','enter_tavern','tavern'].includes(line.Scene) && (line.Match.PlayerIds.length || line.Match.PlayerTags.length || line.Match.Conditions.length)) add('公共闲聊通常没有具体玩家，玩家匹配与条件可能导致台词无法出现。','Public chatter usually has no specific player; player matches/conditions may make lines unavailable.');
        if (['ambient','meet','enter_tavern','tavern'].includes(line.Scene) && JSON.stringify(line.Text).includes('{player}')) add('公共闲聊的 {player} 可能为空；用 {name}/{npc}/{city} 更合适。','The {player} placeholder may be empty in public chatter; prefer {name}/{npc}/{city}.');
      }
      for (const conversation of clean.Conversations) {
        checkMatch(conversation.Match);
        if (!conversation.Default) add('Default:false 会话需要实际事件或调用选择其 Id；不会自动成为默认 NPC 对话。','Default:false conversations need an event/call referencing their Id; they are not automatic NPC defaults.');
        if (!conversation.Nodes.some(node=>!node.NextNodeId && !node.Options.length)) add('会话未配置结束节点；建议提供无条件“再见”选项和一个结束节点。','This conversation has no terminal node; add an unconditional goodbye option and terminal node.');
        for (const node of conversation.Nodes) {
          checkText(node.Text);
          for (const option of node.Options) {
            checkText(option.Text);checkConditions(option.Conditions);
            if (option.EventId) add('选项 EventId 必须指向同时选中且可执行的真实事件；缺失、冷却或条件不满足时选项可能被隐藏。','Option EventId must reference an available selected event; missing/cooling/ineligible events can hide that option.');
          }
          if (node.Options.length > 9) add('数字快捷键覆盖 1–9，更多选项需要鼠标选择；常规回答建议 2–4 项。','Number shortcuts cover 1–9; additional choices need mouse input. Prefer 2–4 ordinary answers.');
          if (node.Options.length && node.Options.every(option=>option.EventId || option.Conditions.length)) add('某个问题的全部回答依赖事件或条件；请增加不带 EventId/Conditions 的退出回答。','All answers at a node depend on events/conditions; add an unconditional exit.');
        }
      }
      for (const persona of clean.Profiles) checkMatch(persona.Match);
      if (clean.Profiles.length) add('Profiles 只提供 AI 人设与知识；自由回复仍需要游戏中配置并启用可用的 APIKey/模型。请勿把密钥写入库文件。','Profiles provide AI persona/knowledge only; free replies still need a configured, enabled API key/model. Never put credentials in library files.');
      if (active?.resourcesComplete?.items === true) {
        const allConditions=[...clean.Lines.flatMap(line=>line.Match.Conditions),...clean.Profiles.flatMap(profile=>profile.Match.Conditions),...clean.Conversations.flatMap(conversation=>[...conversation.Match.Conditions,...conversation.Nodes.flatMap(node=>node.Options.flatMap(option=>option.Conditions))])];
        for (const condition of allConditions) if (condition.Type === 'HasItem' && !active.resources?.items?.includes(condition.Param)) add('HasItem='+condition.Param+' 不在当前资源目录，使用前需安装并选择提供该物品的库。','HasItem='+condition.Param+' is absent from the current catalog; install/select its item library before use.');
      }
    } else {
      add('JSON 校验只确认定义；完整物品包还必须包含每个 Icon.Path 对应的真实 PNG（单张 ≤2 MiB、≤2048×2048，包 ≤32 MiB、总解码像素 ≤16777216）。','JSON validation only checks definitions. A complete package must include each actual Icon.Path PNG (≤2 MiB, ≤2048×2048; package ≤32 MiB and ≤16777216 decoded pixels).');
      for (const item of clean.Entries) {
        if (active.resources?.items?.includes(item.Id)) add('物品 '+item.Id+' 与当前资源目录重名，游戏不能覆盖内置或已启用的物品；请使用设计者独立命名空间。','Item '+item.Id+' collides with the current resource catalog; built-in/enabled items cannot be overwritten. Use a designer namespace.');
        if (item.Sources.some(source=>['EventReward','Loot','Crafting'].includes(source.Type))) add('EventReward/Loot/Crafting 当前仅记录来源说明，不会自动生成掉落、奖励或制作配方。','EventReward/Loot/Crafting currently describe acquisition only; they do not create automatic rewards, loot or recipes.');
        if (item.Sources.some(source=>source.SettlementId)) add('Sources.SettlementId 是实际聚落名称，固定名称依赖特定世界。','Sources.SettlementId is an actual settlement name and depends on the target world.');
        if (item.Sources.some(source=>['Trade','Production'].includes(source.Type) && !source.SettlementId)) add('未指定城市的 Trade/Production 面向优先级至少 75 的城镇；RequiresMine 还需要附近两格内有矿。','Unbound Trade/Production applies to settlements of priority ≥75; RequiresMine also needs a mine within two hexes.');
        if (item.Icon.Hash) add('Icon.Hash 必须和实际 PNG 的 SHA-256 相同，首次制作通常省略 Hash，由游戏导入时计算。','Icon.Hash must match the actual PNG SHA-256; normally omit it and let game import calculate it.');
        if (item.Icon.Width) add('图标切片仍需根据实际 PNG 尺寸核验，JSON 无法确认图像内容和切片边界。','Icon slices must be checked against the actual PNG dimensions; JSON cannot confirm image content/bounds.');
        walkEffects(item.UseEffects,effect=>{
          for (const reference of assets.getEffectResourceReferences?.(effect) || []) if (reference.value && active.resourcesComplete?.[reference.resource] !== true && !scopedResources?.[reference.resource]?.includes(reference.value)) add(reference.resource+' 资源目录不完整，物品使用效果的引用仍需游戏核验。','The '+reference.resource+' catalog is incomplete; game import/runtime must verify these use-effect references.');
          const requirements=assets.getEffectContextRequirements?.(effect) || {};
          if (requirements.requiresPlayer) add('UseEffects 中的 Player 目标仅在使用者为玩家时有上下文；通用 NPC/玩家物品优先 TargetMode:Self。','Player targets in UseEffects are only available for player consumers; prefer TargetMode:Self for both NPCs and players.');
          if (assets.getEffectBindings?.(effect)?.length) add('部分物品效果依赖真实任务、对话、预制体或世界资源绑定，不能仅靠生成 JSON 创建。','Some item effects need real quest/dialogue/prefab/world bindings; generating JSON does not create them.');
        });
      }
      if (clean.Entries.some(item=>item.UseEffects.length)) add('物品先被消耗，再依次执行效果；后续效果失败不回滚已执行内容，应在游戏中验证完整链路。','Items are consumed before effects run; later failure does not roll back earlier effects. Test the complete chain in-game.');
    }
    return [...warnings].slice(0,20);
  }
  function generationCount(settings) {return Number.isInteger(settings.count) && settings.count > 0 ? Math.min(settings.count,MAX_ENTRIES) : 10;}
  function buildGenerationPrompt(settings,assets) {
    const english=settings.language === 'en', requested=generationCount(settings);
    const prefix=english ? 'Return only one standard UTF-8 JSON object, no Markdown or explanation. Use exact case-sensitive fields, SchemaVersion:1 and ProfileId:"crownfall1-v1". Never include scripts, CLR $type, API keys or executable commands. Use stable IDs in your own namespace, e.g. designer.pack.entry. ' : '仅返回一个标准 UTF-8 JSON 对象，不要 Markdown 或解释。字段大小写必须准确，明确包含 SchemaVersion:1、ProfileId:"crownfall1-v1"。禁止脚本、CLR $type、APIKey 或执行命令；Id 使用设计者独立命名空间，如 designer.pack.entry。';
    if (settings.type === 'Dialogues') {
      const kind=['Lines','Conversations','Profiles'].includes(settings.dialogueKind)?settings.dialogueKind:'Conversations';
      const scene=SCENES.includes(settings.dialogueScene)?settings.dialogueScene:'ambient';
      const example={SchemaVersion:1,ProfileId:PROFILE_ID,Lines:[],Conversations:[],Profiles:[]};
      if (kind === 'Lines') example.Lines=[{Id:'designer.pack.line_01',Scene:scene,Weight:1,Match:{},Text:{Text:english?'Another busy day in {city}.':'{city}今天也很热闹。',Translations:{'zh-Hans':'{city}今天也很热闹。',en:'Another busy day in {city}.'}}}];
      else if (kind === 'Profiles') example.Profiles=[{Id:'designer.pack.persona_01',Priority:10,Match:{},Persona:english?'You are a resident. Be brief and admit uncertainty.':'你是本地居民，回答简短自然，不知道的事情直说。',Knowledge:[english?'Use the game-provided NPC, player and settlement context.':'角色、玩家和城市名称以游戏提供的上下文为准。']}];
      else example.Conversations=[{Id:'designer.pack.conversation_01',Title:english?'Greeting':'居民问候',Default:true,Priority:10,Match:{},StartNodeId:'greeting',Nodes:[
        {Id:'greeting',Speaker:'npc',Text:{Text:english?'Hello, {player}. What would you like to know?':'你好，{player}。想了解什么？'},Options:[
          {Id:'ask_city',Text:{Text:english?'Tell me about this place.':'说说这里的生活。'},NextNodeId:'city',EventId:'',Conditions:[]},
          {Id:'goodbye',Text:{Text:english?'Goodbye.':'再见。'},NextNodeId:'end',EventId:'',Conditions:[]}]},
        {Id:'city',Speaker:'npc',Text:{Text:english?'I live in {city}. Life has its ups and downs.':'我住在{city}，日子有忙有闲。'},Options:[{Id:'back',Text:{Text:english?'Ask something else.':'再问点别的。'},NextNodeId:'greeting',EventId:'',Conditions:[]},{Id:'leave',Text:{Text:english?'Goodbye.':'先聊到这里。'},NextNodeId:'end',EventId:'',Conditions:[]}]},
        {Id:'end',Speaker:'npc',Text:{Text:english?'Safe travels, {player}.':'一路顺风，{player}。'},NextNodeId:'',Options:[]}]}];
      const rules=english?[
        'Generate exactly '+requested+' '+kind+' entries; leave the other two root arrays empty. '+(kind === 'Lines'?'Requested Scene: '+scene+'.':''),
        'Root allows only SchemaVersion,ProfileId,Lines,Conversations,Profiles; no Entries/Items or executable effects. Sum ≤5000.',
        'Line={Id,Scene,Weight:0..1000000,Match,Text}; Conversation={Id,Title,Default:boolean,Priority:int,Match,StartNodeId,Nodes}; Profile={Id,Priority:int,Match,Persona,Knowledge}.',
        'Text is an OBJECT {Text,TextKey,Table:"AGame_NPC",Translations:{"zh-Hans":"简体中文","en":"English"}}. Use actual requested-language Text, optional translations; do not invent localization keys. Text/translation ≤4000 chars.',
        'Match={NpcIds:[],PlayerIds:[],NpcTags:[],PlayerTags:[],Tone:"",Conditions:[]}; Tone only ""/warm/cold/neutral. Match:{} is portable and general; do not invent character IDs/tags. IDs, matching tags and conditions require actual game data. Public ambient/meet/enter_tavern/tavern lines should avoid PlayerIds,PlayerTags,Conditions and {player}.',
        'Scenes with current consumers: ambient,conversation,meet,enter_tavern,tavern. Placeholders {name}/{npc}=actual NPC, {player}=actual conversation player, {city}=settlement. Never hardcode a global hero.',
        'Each Conversation has 1–512 Nodes, a valid StartNodeId; Node={Id,Speaker:"npc" or "player",Text,NextNodeId,Options:[{Id,Text,NextNodeId,EventId,Conditions}]}. Node cannot combine nonempty NextNodeId with Options. Links refer only to nodes in the same conversation.',
        'IDs are unique within each root collection / within each conversation Nodes / within each node Options; ≤128 chars. Options ≤16 per node, ordinary questions have 2–4 choices. Do not add numeric answer prefixes; the UI numbers choices. Every question/loop needs an unconditional goodbye answer and terminal node.',
        'EventId must be "" unless the caller supplies a real registered event and selects its event library; text alone cannot award items or change stats. Never invent reward/event IDs. All condition arrays use only {Type,Param,Threshold:int,Op}. Types: '+CONDITION_TYPES.join('/')+'; Op: '+COMPARISONS.join('/')+'. Stat Param: '+STATS.join('/')+'. HasTag/HasItem need verified existing tag/item.',
        'Profiles are AI context only: Persona ≤8000, Knowledge ≤128 strings of ≤4000 chars. They do not configure/enable an AI model, grant rewards, create quests or modify memory. API keys/models are configured separately in-game. Default:false conversations require an explicit event/call by conversation Id; use Default:true for ordinary greeting.'
      ]:[
        '仅生成 '+requested+' 个 '+kind+' 条目，其他两个根数组为空。'+(kind === 'Lines'?'本次 Scene:'+scene+'。':''),
        '根字段只可用 SchemaVersion、ProfileId、Lines、Conversations、Profiles，不能放 Entries/Items 或执行效果。三个数组合计 ≤5000。',
        'Line={Id,Scene,Weight:0..1000000,Match,Text}；Conversation={Id,Title,Default:布尔,Priority:整数,Match,StartNodeId,Nodes}；Profile={Id,Priority:整数,Match,Persona,Knowledge}。',
        'Text 必须是对象 {Text,TextKey,Table:"AGame_NPC",Translations:{"zh-Hans":"简体中文","en":"English"}}；正文使用请求语言，可加翻译。不要编造本地化键，每条正文/翻译 ≤4000 字符。中文语言代码使用 zh-Hans。',
        'Match={NpcIds:[],PlayerIds:[],NpcTags:[],PlayerTags:[],Tone:"",Conditions:[]}，Tone 仅 ""/warm/cold/neutral。通用跨世界内容用 Match:{}；不能编造角色编号或标签，限定匹配须有真实游戏数据。公共 ambient/meet/enter_tavern/tavern 台词不用 PlayerIds、PlayerTags、Conditions 或 {player}。',
        '现有 Scene 为 ambient、conversation、meet、enter_tavern、tavern；{name}/{npc} 为实际 NPC，{player} 为实际对话玩家，{city} 为所在聚落，不能固定全局主角。',
        '每会话 1–512 个 Nodes，StartNodeId 必须存在。Node={Id,Speaker:"npc"/"player",Text,NextNodeId,Options:[{Id,Text,NextNodeId,EventId,Conditions}]}；同节点不能同时有非空 NextNodeId 与 Options，跳转仅能指向同会话的节点。',
        'Id 在每个根集合/同会话节点/同节点选项中分别唯一，≤128字符。每节点 ≤16 选项，常规提问用 2–4 个。不要给回答加 1、2 等编号，游戏 UI 会编号；每个提问或循环都应保留无条件“再见”回答和结束节点。',
        '未提供已注册真实事件及其选中事件库时 EventId=""，不能编造奖励或事件编号。Conditions 仅 {Type,Param,Threshold:整数,Op}；Type:'+CONDITION_TYPES.join('/')+'；Op:'+COMPARISONS.join('/')+'；Stat 的 Param:'+STATS.join('/')+'；HasTag/HasItem 需要实际已有标签/物品。',
        'Profiles 仅为 AI 人设和资料知识，Persona ≤8000，Knowledge ≤128 项且每项 ≤4000字符；不会配置或启用模型，也不会发奖励、创建任务或直接改记忆。APIKey/模型另在游戏配置。Default:false 会话须通过事件或调用会话 Id 打开，普通问候用 Default:true。'
      ];
      return prefix+'\n'+rules.join('\n')+'\n'+(english?'One-entry shape example: ':'单条结构示例（数量按本次要求）：')+JSON.stringify(example);
    }
    if (settings.type !== 'Items') throw new Error('协议模块不支持此库类型：'+settings.type);
    const active=assets?.getProfile?.();if (!active) throw new Error('Items 生成需要游戏内容协议 content-profile.json');
    const paths=Array.isArray(settings.iconPaths)?settings.iconPaths.filter(path=>typeof path === 'string' && path.trim()):[];
    const compact=assets.getGenerationCatalog?.({allowLibraryEventReferences:false});
    const catalog=compact?.catalog || {},commonParameters=compact?.commonParameters || {};
    if (!compact) for (const [type,spec] of Object.entries(active.effects || {})) if (!spec.requiresBindings && !spec.requiresNetworkPrefabBinding && spec.status !== 'logOnly') catalog[type]={parameters:spec.parameters,allowsChildren:!!spec.allowsChildren,allowsElseChildren:!!spec.allowsElseChildren,allowsWeightedBranches:!!spec.allowsWeightedBranches,supportsGenericDuration:spec.supportsGenericDuration,parameterRules:spec.parameterRules,requiredAnyOf:spec.requiredAnyOf,contextRules:spec.contextRules,bindingRules:spec.bindingRules,durationRules:spec.durationRules};
    const example={SchemaVersion:1,ProfileId:PROFILE_ID,Entries:[{Id:'designer.pack.herb_01',Name:english?'Field herb':'田野草药',Description:english?'A common trade material.':'常见的交易药材。',Category:'Material',Rarity:'Common',BaseValue:10,MaximumStack:100,Weight:1,Perishable:false,ShelfLifeDays:0,Tags:['药材'],UseEffects:[],Sources:[{Type:'Trade',SettlementId:'',RequiresMine:false,DailyRate:0,MaxStock:30,InitialStock:10,EventId:'',Description:''}],Icon:{Path:paths[0] || 'icons/designer.pack.herb_01.png',PixelsPerUnit:100}}]};
    const rules=english?[
      'Generate exactly '+requested+' Entries. Root only SchemaVersion,ProfileId,Entries, not snapshot ProfileId crownfall1-items-v1/Icons/PngBase64. IDs ≤80 ASCII letters/digits/_/./-, no leading dot or ".."; never overwrite catalog item IDs.',
      'Item fields: Id,Name(nonempty ≤120),Description(≤4000),Category(Material/Consumable/Quest/Special),Rarity(Common/Uncommon/Rare/Epic/Legendary),BaseValue(int 0..100000000),MaximumStack(int 1..1000000),Weight(int 0..1000000),Perishable(boolean),ShelfLifeDays(int 0..1000000),Tags(≤64 nonblank strings ≤80),UseEffects,Sources,Icon. Equipment is unsupported for external definitions.',
      'Perishable:true requires ShelfLifeDays≥1. Only Consumable can have UseEffects. UseEffects follows the same registered effect graph schema: {Type,Parameters,Children,ElseChildren,WeightedBranches}; only descriptor-supported branches/parameters, max depth32/count1024. Prefer Self for actual consumer (NPC or player); Player requires a player consumer. Item is consumed before effects and effects are not transactional. UseEffects:[] is valid; do not invent CLR types or resources.',
      'Sources ≤64 {Type:Trade/Production/EventReward/Loot/Crafting,SettlementId:"",RequiresMine:boolean,DailyRate:int0..1000000,MaxStock:int0..1000000,InitialStock:int0..MaxStock,EventId:"",Description:""}. Production needs positive DailyRate and MaxStock. SettlementId ≤120 is an actual city name, not guessed numeric ID. Empty Trade/Production targets towns of priority≥75; RequiresMine needs a mine within two hexes. EventReward/Loot/Crafting are metadata only; EventId does not create a reward.',
      'Icon={Path:relative PNG path,PixelsPerUnit:1..10000, X:0,Y:0,Width:0,Height:0}; full image uses zero rectangle fields; slices need positive Width/Height and real image bounds. Do not output Hash unless actual PNG SHA-256 is supplied. No absolute paths, colon, backslash, empty path segments or "."/".." segments.',
      'Every Icon.Path must accompany an actual PNG (≤2MiB,≤2048×2048). JSON is only a manifest; a complete import package also includes these image files, ≤32MiB total and ≤16777216 unique decoded pixels. Never claim generated JSON includes image data.',
      paths.length?'Only these actual uploaded Icon.Path values are available; reuse them if needed: '+JSON.stringify(paths):'No PNG is supplied yet. Generate placeholder paths icons/<itemId>.png and state through the product status that corresponding images must be supplied before complete package export.',
      'UseEffects resource references may use existing resources or Items/Tags defined in this same Entries array; dependencies in other libraries must be installed/selected. Incomplete resources catalogs are not proof that invented references exist. Avoid effects requiring quest/dialogue/prefab/navigation bindings unless caller explicitly supplies them.'
    ]:[
      '仅生成 '+requested+' 个 Entries。根字段只可用 SchemaVersion、ProfileId、Entries；不能输出内部快照的 crownfall1-items-v1、Icons 或 PngBase64。Id ≤80 位英文字母/数字/_/./-，不能以点开头或包含 ..，不得覆盖目录已有物品编号。',
      '物品字段：Id、Name（非空≤120）、Description（≤4000）、Category（Material/Consumable/Quest/Special）、Rarity（Common/Uncommon/Rare/Epic/Legendary）、BaseValue（整数0..100000000）、MaximumStack（整数1..1000000）、Weight（整数0..1000000）、Perishable（布尔）、ShelfLifeDays（整数0..1000000）、Tags（≤64个非空文本，每个≤80）、UseEffects、Sources、Icon。外部新增 Equipment 装备不支持。',
      'Perishable:true 要求 ShelfLifeDays≥1；仅 Consumable 可以有 UseEffects。使用效果采用同一已注册子效果协议 {Type,Parameters,Children,ElseChildren,WeightedBranches}，只使用目录允许的参数/分支，深度≤32/节点数≤1024。通用 NPC/玩家消耗品优先 TargetMode:Self，Player 要求使用者为玩家。物品先消耗，效果不支持事务回滚。UseEffects:[] 合法，不能编造 CLR 类型或资源。',
      'Sources ≤64个 {Type:Trade/Production/EventReward/Loot/Crafting,SettlementId:"",RequiresMine:布尔,DailyRate:整数0..1000000,MaxStock:整数0..1000000,InitialStock:整数0..MaxStock,EventId:"",Description:""}。Production 的 DailyRate/MaxStock 必须大于0。SettlementId ≤120 是真实城市名，不能编造编号；空城市的 Trade/Production 面向优先级≥75城镇，RequiresMine 要求两格内有矿。EventReward/Loot/Crafting 仅来源说明，EventId 不会自动发奖励。',
      'Icon={Path:相对PNG路径,PixelsPerUnit:1..10000,X:0,Y:0,Width:0,Height:0}。整图矩形均0，切片宽高均正且在真实图像内；未提供实际 PNG 的 SHA-256 时不要输出 Hash。不能有绝对路径、冒号、反斜杠、空段、.或..段。',
      '每个 Icon.Path 必须配套真实 PNG（单张≤2MiB、≤2048×2048）；JSON只是清单，完整包须包含这些图像，总体≤32MiB且去重解码像素≤16777216。不能声称生成JSON已包含图像数据。',
      paths.length?'只能使用这些实际上传的 Icon.Path，可复用：'+JSON.stringify(paths):'当前未提供 PNG，可生成待补路径 icons/<itemId>.png；完整包下载前必须补齐相应图像，这条说明应由产品状态显示，JSON内不能添加额外说明字段。',
      'UseEffects 可引用真实资源或同一 Entries 包内定义的 Items/Tags；其他库依赖须安装并选中。目录不完整不代表编造引用存在；不要生成没有实际任务、对话、预制体或导航绑定的效果。'
    ];
    const knownResources=Object.fromEntries(Object.keys(active.resources || {}).map(kind=>[kind,assets.getKnownResourceValues?.(kind,settings.packageResources) || active.resources[kind]]));
    return prefix+'\n'+rules.join('\n')+'\n'+(english?'One-entry shape example: ':'单条结构示例（数量按本次要求）：')+JSON.stringify(example)+'\n'+(english?'Common parameters: ':'公共参数：')+JSON.stringify(commonParameters)+'\n'+(english?'Effect descriptors: ':'允许的效果目录：')+JSON.stringify(catalog)+'\n'+(english?'Resources: ':'现有资源：')+JSON.stringify(knownResources)+'\n'+(english?'Catalog completeness: ':'资源目录完整性：')+JSON.stringify(active.resourcesComplete || {});
  }
  function describeEffects(data,type,language='zh-CN') {
    const english=language === 'en';
    if (type === 'Dialogues' || data?.Nodes || data?.Lines || data?.Conversations || data?.Profiles || data?.Persona !== undefined) return english?'Dialogue and AI context; gameplay changes require a registered option EventId.':'对话与 AI 资料；玩法变更须关联真实选项 EventId。';
    const effects=data?.UseEffects || data?.Entries?.flatMap(item=>item.UseEffects || []) || [];
    return effects.length ? (english?'Use effects: ':'使用效果：')+effects.map(effect=>effect.Type).join(' / ') : (english?'No use effects; acquisition follows Sources.':'未配置使用效果；物品获取依据 Sources。');
  }
  function describeTrigger(data,type,language='zh-CN') {
    const english=language === 'en';
    if (type === 'Dialogues') return english?'NPC match and scene / explicit conversation call':'NPC 匹配与场景触发 / 指定会话调用';
    return english?'Selected item library / trade, production or explicit grant':'选中物品库 / 贸易、生产或显式给予';
  }
  const api={validate,buildGenerationPrompt,getValidationWarnings,count,summary,describeEffects,describeTrigger};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  root.GLProtocols=api;
})(typeof window !== 'undefined' ? window : globalThis);
