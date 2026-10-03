/* Profile loading and sharing are common to the workshop and gallery. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./assets.js'),globalThis);
  else root.GLContent=factory(root.GLAssets,root);
})(typeof window!=='undefined'?window:globalThis,function(A,root){
  'use strict';
  let pending=null;
  const t=(zh,en)=>root.GLI18n?.language==='en'?en:zh;
  function requiresProfile(type){return type==='Events'||type==='Festivals';}
  async function loadProfile(fetcher=root.fetch?.bind(root)){
    if(A.getProfile())return A.getProfile();
    if(pending)return pending;
    pending=(async()=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),15000);
      try{
        if(!fetcher)throw new Error('fetch unavailable');
        const response=await fetcher('content-profile.json',{signal:controller.signal,cache:'no-cache'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        A.configureProfile(await response.json());
        return A.getProfile();
      }catch(error){
        throw new Error(t('游戏兼容目录无法加载，事件和节日暂时不能生成或下载。请刷新页面重试。','The game compatibility profile could not be loaded. Events and festivals cannot be generated or downloaded. Refresh and retry.')+' ('+(controller.signal.aborted?'timeout':String(error.message).slice(0,160))+')');
      }finally{clearTimeout(timer);}
    })();
    try{return await pending;}finally{pending=null;}
  }
  async function ensureProfile(type){return requiresProfile(type)?loadProfile():A.getProfile();}
  function supportMessage(type){
    if(type==='Quests'||type==='SpecialNPCs')return t('此类型目前可导入并保存为草稿；游戏尚未接通外部条目的执行入口。','This type can be imported and saved as a draft; the game does not yet execute these external entries.');
    if(requiresProfile(type))return t('检查结构、效果参数和资源引用；具体效果还取决于游戏中的角色、地点与运行环境。','Checks structure, effect parameters and resource references. Actual effects also depend on characters, locations and the game state.');
    return t('名字库会在创建世界时使用；现有存档使用已保存的库快照。','Name libraries are used when creating a world; existing saves use their stored library snapshots.');
  }
  function summary(data,type){
    if(!data)return '';
    if(A.NAME_TYPES.includes(type))return t('名字：','Names: ')+data.Items.slice(0,8).join('、')+(data.Items.length>8?'…':'');
    return data.Entries.map(entry=>entry.Name+' — '+(A.describeEffects(entry,root.GLI18n?.language)||t('无直接子效果。','No direct effects.'))+(entry.LinkedEventIds?.length?t('；关联事件：','; linked events: ')+entry.LinkedEventIds.join(', '):'')).join('\n');
  }
  function issueBody({type,tags,description},data){
    const profile=A.getProfile();
    const metadata={version:1,type,tags};
    if(requiresProfile(type)&&profile)Object.assign(metadata,{schemaVersion:profile.schemaVersion,profileId:profile.profileId});
    const body='<!-- gl-asset: '+JSON.stringify(metadata)+' -->\n介绍：'+description+'\n类型：'+type+'\n标签：'+tags.join(', ')+'\n\n```json\n'+JSON.stringify(data,null,2)+'\n```';
    if(body.length>50000)throw new Error(t('分享内容超过 GitHub 正文容量，请拆成更小的 JSON 库。当前广场不能读取附件。','This library exceeds the GitHub post capacity. Split it into smaller JSON libraries; the gallery does not read attachments.'));
    return body;
  }
  return {loadProfile,ensureProfile,requiresProfile,supportMessage,summary,issueBody};
});
