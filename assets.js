/* Shared game-compatible library validation. No keys or account credentials. */
(function (root) {
  'use strict';
  const TYPES = Object.freeze({CityNames:'城市名库',NPCNames:'NPC 名字库',CompanyNames:'公司名库',FamilyNames:'家族名库',Quests:'支线库',Events:'事件库',Festivals:'节日库',SpecialNPCs:'特定 NPC 库'});
  const NAME_TYPES = ['CityNames','NPCNames','CompanyNames','FamilyNames'];
  const MAX_FILE_BYTES = 1024 * 1024;
  const GAME_PATH = '%USERPROFILE%\\AppData\\LocalLow\\DefaultCompany\\Crownfall1\\NameLibraries\\';
  function object(value) {return value !== null && typeof value === 'object' && !Array.isArray(value);}
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
  function enumValue(value, fallback, options, field) {
    if (value === undefined) return fallback;
    if (!options.includes(value)) throw new Error(field + ' 的值无效');
    return value;
  }
  function parseJSON(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('没有可读取的 JSON 内容');
    if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('文件超过 1 MB');
    try {return JSON.parse(text.trim().replace(/^\uFEFF/, ''));} catch {throw new Error('JSON 无法解析，请检查引号、逗号与括号');}
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
    if (!Array.isArray(data[key]) || data[key].length === 0) throw new Error('需要非空的 ' + key + ' 数组');
    if (Object.hasOwn(data, isName ? 'Entries' : 'Items')) throw new Error('文件同时包含 Items 和 Entries，请核对资产类型');
    if (data[key].length > 5000) throw new Error('单个库最多支持 5000 个条目');
    if (isName) {
      const items = data.Items.map((item, index) => string(item, '第 ' + (index + 1) + ' 个名字', true, 120));
      if (new Set(items).size !== items.length) throw new Error('名字重复，请删除重复项');
      return {Items:items};
    }
    const ids = new Set();
    const entries = data.Entries.map((entry, index) => {
      const prefix = '条目 ' + (index + 1) + ' · ';
      if (!object(entry)) throw new Error(prefix + '必须是对象');
      const clean = {Name:string(entry.Name, prefix+'Name',true,200),Description:string(entry.Description,prefix+'Description',true),Stages:[]};
      if (entry.Stages !== undefined && !Array.isArray(entry.Stages)) throw new Error(prefix + 'Stages 必须是数组');
      if ((entry.Stages || []).length > 100) throw new Error(prefix + '阶段数量过多');
      clean.Stages = (entry.Stages || []).map((stage, stageIndex) => {
        if (!object(stage)) throw new Error(prefix + '阶段必须是对象');
        return {StageName:string(stage.StageName,prefix+'阶段 '+(stageIndex+1)+' 名称',true,200),Description:string(stage.Description,prefix+'阶段描述',true)};
      });
      clean.Id = string(entry.Id,prefix+'Id',false,200);
      clean.Type = string(entry.Type,prefix+'Type',false,80);
      clean.Weight = integer(entry.Weight,10,prefix+'Weight',1,100000);
      clean.CooldownDays = integer(entry.CooldownDays,0,prefix+'CooldownDays',0,100000);
      clean.RuleType = enumValue(entry.RuleType,'Periodic',['Periodic','BySeason','ByDayInYear'],prefix+'RuleType');
      clean.RuleDayInYear = integer(entry.RuleDayInYear,1,prefix+'RuleDayInYear',1,365);
      clean.RuleSeason = enumValue(entry.RuleSeason,'Spring',['Spring','Summer','Autumn','Winter'],prefix+'RuleSeason');
      clean.RulePeriodDays = integer(entry.RulePeriodDays,15,prefix+'RulePeriodDays',1,100000);
      clean.RuleDurationDays = integer(entry.RuleDurationDays,1,prefix+'RuleDurationDays',1,100000);
      if (entry.LinkedEventIds !== undefined && !Array.isArray(entry.LinkedEventIds)) throw new Error(prefix+'LinkedEventIds 必须是数组');
      if ((entry.LinkedEventIds || []).length > 1000) throw new Error(prefix+'关联事件数量过多');
      clean.LinkedEventIds = (entry.LinkedEventIds || []).map(id => string(id,prefix+'关联事件 Id',true,200));
      if (clean.Id) {if (ids.has(clean.Id)) throw new Error('条目 Id 重复：'+clean.Id);ids.add(clean.Id);}
      return clean;
    });
    return {Entries:entries};
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
  const api = {TYPES,NAME_TYPES,MAX_FILE_BYTES,GAME_PATH,parseJSON,parseAI,validate,fileName,download,status,count};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  root.GLAssets=api;
})(typeof window !== 'undefined' ? window : globalThis);
