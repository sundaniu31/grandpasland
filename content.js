/* Profile loading and sharing are common to the workshop and gallery. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./assets.js'),globalThis);
  else root.GLContent=factory(root.GLAssets,root);
})(typeof window!=='undefined'?window:globalThis,function(A,root){
  'use strict';
  let pending=null;
  const t=(zh,en)=>root.GLI18n?.language==='en'?en:zh;
  function requiresProfile(type){return type==='Events'||type==='Festivals'||type==='Items';}
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
        throw new Error(t('游戏兼容目录无法加载，事件、节日和物品库暂时不能生成或下载。请刷新页面重试。','The game compatibility profile could not be loaded. Events, festivals and items cannot be generated or downloaded. Refresh and retry.')+' ('+(controller.signal.aborted?'timeout':String(error.message).slice(0,160))+')');
      }finally{clearTimeout(timer);}
    })();
    try{return await pending;}finally{pending=null;}
  }
  async function ensureProfile(type){return requiresProfile(type)?loadProfile():A.getProfile();}
  function supportMessage(type){
    if(type==='AIStyles')return t('世界 AI 风格是独立 JSON 文件。游戏中打开“新游戏 → AI → 世界风格”，导入或载入后点击“应用风格”。它为后续 AI 请求提供共同背景与表达要求，不修改实际事实、角色记忆、模型或 APIKey；不能加入 Mod 包。','World AI styles are standalone JSON files. In the game, open New game → AI → World style, import or load the file, then click Apply style. It supplies shared background and expression guidance to subsequent AI requests without changing facts, character memories, models or API keys. It cannot be included in a Mod pack.');
    if(type==='ModPack')return t('数据模组包需要解压后放入游戏 Mods/<包名>/NameLibraries/<分类>/。启用后在新世界使用，现有存档保留原快照。远端附件未经网站实物检查，游戏导入和启用时仍会校验。','Extract a data Mod pack into game Mods/<pack>/NameLibraries/<category>/. Enable it for a new world; existing saves retain snapshots. Remote attachments have not been inspected by this website; game import/activation still validates them.');
    if(type==='Items')return t('物品库需要完整 JSON + PNG 图标包。只分享 JSON 缺少实际图标，不能直接作为完整物品包导入。远端 ZIP 附件未经网站实物检查。','Items need a complete JSON + PNG icon package. JSON alone lacks actual icons and is not a complete item import package. Remote ZIP attachments have not been inspected by the website.');
    if(type==='Dialogues')return t('对话库提供台词、分支回答和 AI 人设；选项中的玩法变化依赖已注册事件。AI 自由回复仍需游戏内配置模型和 APIKey。','Dialogue libraries provide lines, answer branches and AI context. Gameplay changes depend on registered option events; free AI replies still need an in-game model and API key.');
    if(type==='Quests'||type==='SpecialNPCs')return t('此类型目前可导入并保存为草稿；游戏尚未接通外部条目的执行入口。','This type can be imported and saved as a draft; the game does not yet execute these external entries.');
    if(requiresProfile(type))return t('检查结构、效果参数和资源引用；具体效果还取决于游戏中的角色、地点与运行环境。','Checks structure, effect parameters and resource references. Actual effects also depend on characters, locations and the game state.');
    return t('名字库会在创建世界时使用；现有存档使用已保存的库快照。','Name libraries are used when creating a world; existing saves use their stored library snapshots.');
  }
  function summary(data,type){
    if(!data)return '';
    if(type==='AIStyles')return t('风格名称：','Style name: ')+data.Name+'\n'+t('共同背景：','Shared background: ')+(data.WorldBackground.slice(0,240)||t('未填写','Not provided'))+(data.WorldBackground.length>240?'…':'')+'\n'+t('表达要求：','Expression guidance: ')+(data.StyleInstructions.slice(0,240)||t('未填写','Not provided'))+(data.StyleInstructions.length>240?'…':'');
    if(A.NAME_TYPES.includes(type))return t('名字：','Names: ')+data.Items.slice(0,8).join('、')+(data.Items.length>8?'…':'');
    if(type==='Dialogues'||type==='Items'){
      const protocols=root.GLProtocols||(typeof require==='function'?require('./library-protocols.js'):null);
      return protocols?.summary(data,type,root.GLI18n?.language)||'';
    }
    return data.Entries.map(entry=>entry.Name+' — '+(requiresProfile(type)?A.describeTrigger(entry,root.GLI18n?.language)+'；':'')+(A.describeEffects(entry,root.GLI18n?.language)||t('无直接子效果。','No direct effects.'))+(entry.LinkedEventIds?.length?t('；关联事件：','; linked events: ')+entry.LinkedEventIds.join(', '):'')).join('\n');
  }
  function issueBody({type,tags,description},data){
    if(type==='Items'||type==='ModPack')throw new Error(t('请分享包含真实 PNG 的完整 ZIP 包链接；物品 JSON 或模组清单不能作为完整内容包分享。','Share a complete ZIP package link with actual PNG files. An item JSON or Mod manifest alone is not a complete content package.'));
    const profile=A.getProfile();
    const metadata={version:1,type,tags};
    if(type==='AIStyles')Object.assign(metadata,{schemaVersion:1,profileId:'crownfall1-v1'});
    if(requiresProfile(type)&&profile)Object.assign(metadata,{schemaVersion:profile.schemaVersion,profileId:profile.profileId});
    const body='<!-- gl-asset: '+JSON.stringify(metadata)+' -->\n介绍：'+description+'\n类型：'+type+'\n标签：'+tags.join(', ')+'\n\n```json\n'+JSON.stringify(data,null,2)+'\n```';
    if(body.length>50000)throw new Error(type==='AIStyles'?t('世界风格超过本站 GitHub 分享正文容量。请缩短背景与风格文本后重试，或直接把下载的 JSON 文件分享给朋友；AIStyles 不支持 Mod ZIP。','This world style exceeds the website’s GitHub post capacity. Shorten its background and style text, or share the downloaded JSON file directly with friends. AIStyles does not support Mod ZIP packages.'):t('分享内容超过 GitHub 正文容量，请拆成更小的 JSON 库，或制作完整 Mod ZIP 并分享 GitHub 附件链接。','This library exceeds the GitHub post capacity. Split it into smaller JSON libraries or share a complete Mod ZIP through a GitHub attachment link.'));
    return body;
  }
  function validatePackageUrl(value){
    if(typeof value!=='string'||!value.trim()||value.length>2000||/[\x00-\x20\x7f\\]/.test(value.trim()))throw new Error(t('请粘贴有效的 GitHub ZIP 附件或 Release 下载链接。','Paste a valid GitHub ZIP attachment or Release download link.'));
    const source=value.trim();let url,decoded;
    try{url=new URL(source);decoded=decodeURIComponent(source);}catch{throw new Error(t('ZIP 下载链接格式无效。','Invalid ZIP download URL.'));}
    if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||url.search||url.hash||/[\\\x00-\x20\x7f]/.test(decoded.replace(/ /g,''))||/%(?:2f|5c)/i.test(source)||/(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded))throw new Error(t('只接受无账号凭据、查询参数或片段的 HTTPS GitHub ZIP 稳定链接。','Only stable HTTPS GitHub ZIP links without credentials, query parameters or fragments are accepted.'));
    let path;try{path=decodeURIComponent(url.pathname);}catch{throw new Error('ZIP 下载路径无效');}
    const account='[A-Za-z0-9][A-Za-z0-9_.-]{0,99}',file='[^/\\\\:<>\x00-\x1f]+\\.zip';
    const patterns=[new RegExp('^/user-attachments/files/[1-9][0-9]*/'+file+'$','i'),new RegExp('^/'+account+'/'+account+'/files/[1-9][0-9]*/'+file+'$','i'),new RegExp('^/'+account+'/'+account+'/releases/(?:download/[^/]+|latest/download)/'+file+'$','i')];
    if(!patterns.some(pattern=>pattern.test(path)))throw new Error(t('链接必须指向 GitHub 附件或 Releases 的 .zip 文件，不能是网页、图片或其他域名。','The link must point to a GitHub attachment or Releases .zip file, not a page, image or another domain.'));
    return url.href;
  }
  function packageIssueBody({type,tags=[],description='',packageUrl}){
    if(!['Items','ModPack'].includes(type))throw new Error(t('ZIP 分享类型只能是物品库或模组内容包。','ZIP sharing supports Items or Mod packs only.'));
    const url=validatePackageUrl(packageUrl),profile=A.getProfile();
    const metadata={version:2,type,tags,format:'zip',packageUrl:url,schemaVersion:profile?.schemaVersion||1,profileId:profile?.profileId||'crownfall1-v1'};
    return '<!-- gl-asset: '+JSON.stringify(metadata)+' -->\n介绍：'+description+'\n类型：'+type+'\n标签：'+tags.join(', ')+'\n格式：ZIP\n\n[下载完整内容包]('+url+')\n\n远端 ZIP 附件未经网站实物检查；解压并通过游戏导入/启用校验后使用。物品包须包含 JSON 清单与 Icon.Path 对应的实际 PNG，数据模组包须保留 NameLibraries/<分类>/ 文件夹结构。';
  }
  return {loadProfile,ensureProfile,requiresProfile,supportMessage,summary,issueBody,validatePackageUrl,packageIssueBody};
});
