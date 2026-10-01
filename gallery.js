'use strict';
const A=window.GLAssets;
const $=id=>document.getElementById(id);
const REPO='sundaniu31/grandpasland';
const API='https://api.github.com/repos/'+REPO;
const typeByLower=Object.fromEntries(Object.keys(A.TYPES).map(type=>[type.toLowerCase(),type]));
let works=[];
let selectedTag='';
let partial=false;
let commentRequest=null;
function typeOf(value){return typeByLower[String(value||'').toLowerCase()]||'';}
function cleanTags(values) {return Array.from(new Set(values.filter(tag=>typeof tag==='string').map(tag=>tag.trim()).filter(tag=>tag&&tag.length<=24&&!/[<>\x00-\x1F]/.test(tag)))).slice(0,5);}
function metadata(body){const match=(body||'').match(/^\s*<!--\s*gl-asset:\s*(\{[^\n]*\})\s*-->/);if(!match)return {};try{return JSON.parse(match[1]);}catch{return {};}}
function workOf(issue) {
  const body=typeof issue.body==='string'?issue.body:'';
  const meta=metadata(body);
  const labels=Array.isArray(issue.labels)?issue.labels.map(label=>typeof label==='string'?label:label.name):[];
  const bodyType=body.match(/(?:^|\n)\s*类型\s*[：:]\s*([a-z]+)/i);
  const type=typeOf(meta.type)||labels.map(typeOf).find(Boolean)||typeOf(bodyType?.[1]);
  const blocks=[...body.matchAll(/```json\s*\r?\n([\s\S]*?)```/gi)];
  let data=null,error='',json='';
  if(blocks.length){json=blocks[0][1].trim();}
  else {
    const raw=body.replace(/^\s*<!--[\s\S]*?-->/,'').trim();
    if(raw.startsWith('{'))json=raw;
    else {const start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start>=0&&end>start)json=raw.slice(start,end+1);}
  }
  if(!type)return null;
  if(json){try{data=A.validate(A.parseJSON(json),type);}catch(e){error=e.message;}}
  else error='这份分享尚未附上可读取的 JSON，请到原帖查看。';
  const tagLine=body.match(/(?:^|\n)\s*标签\s*[：:]\s*([^\n]+)/);
  const tags=cleanTags([...(Array.isArray(meta.tags)?meta.tags:[]),...(tagLine?tagLine[1].split(/[,，]/):[]),...labels.filter(label=>!typeOf(label))]);
  const description=body.replace(/<!--[\s\S]*?-->/g,'').replace(/```[\s\S]*?```/g,'').split('\n').filter(line=>line.trim()&&!/^\s*(类型|标签|JSON|资产内容)\s*[：:]/i.test(line)).map(line=>line.replace(/^\s*介绍\s*[：:]\s*/,'')).join('\n').trim().slice(0,2000);
  return {number:issue.number,title:String(issue.title||'未命名作品').replace(/^【分享】\s*/,''),type,tags,data,error,description:description||'作者还没有填写作品介绍。',author:String(issue.user?.login||'玩家'),date:issue.created_at,comments:Number(issue.comments)||0,url:'https://github.com/'+REPO+'/issues/'+issue.number};
}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function badge(text){return element('span','pill',text);}
function apiError(response){return response.status===403||response.status===429?'GitHub 请求额度暂时用尽，请稍后再试。':response.status===404?'分享数据暂时不可用，请到社区原帖查看。':'GitHub 返回 HTTP '+response.status+'，请稍后重试。';}
async function load() {
  $('list').setAttribute('aria-busy','true');
  try {
    const issues=[];
    for(let page=1;page<=10;page++){
      const response=await fetch(API+'/issues?state=open&sort=created&direction=desc&per_page=100&page='+page,{headers:{Accept:'application/vnd.github+json'}});
      if(!response.ok)throw new Error(apiError(response));
      const batch=await response.json();if(!Array.isArray(batch))throw new Error('分享数据格式异常');
      issues.push(...batch.filter(issue=>!issue.pull_request));
      if(batch.length<100)break;
      if(page===10)partial=true;
    }
    works=issues.map(workOf).filter(Boolean);renderTags();render();
  } catch(error) {
    $('list').className='empty glass';$('list').replaceChildren(element('h2','', '暂时没有连接到分享广场'),element('p','',error instanceof TypeError?'请检查网络，或打开 GitHub 社区原帖。':error.message));
    const retry=element('button','btn','重新加载');retry.addEventListener('click',load);$('list').append(retry);
  } finally {$('list').setAttribute('aria-busy','false');}
}
function renderTags() {
  const tags=Array.from(new Set(works.flatMap(work=>work.tags))).sort((a,b)=>a.localeCompare(b,'zh-CN'));
  $('tagFilters').replaceChildren();
  if(!tags.length)return;
  ['',...tags].forEach(tag=>{const button=element('button','tag-button',tag||'全部标签');button.type='button';button.setAttribute('aria-pressed',String(tag===selectedTag));button.addEventListener('click',()=>{selectedTag=tag;renderTags();render();});$('tagFilters').append(button);});
}
function render() {
  const keyword=$('search').value.trim().toLowerCase();
  const type=$('filter').value,days=Number($('timeFilter').value)||0;
  const cutoff=days?Date.now()-days*86400000:0;
  const items=works.filter(work=>(!type||work.type===type)&&(!selectedTag||work.tags.includes(selectedTag))&&(!cutoff||new Date(work.date).getTime()>=cutoff)&&(!keyword||[work.title,work.description,...work.tags].join(' ').toLowerCase().includes(keyword)));
  const mode=$('sort').value;
  items.sort((a,b)=>mode==='comments'?b.comments-a.comments:new Date(mode==='old'?a.date:b.date)-new Date(mode==='old'?b.date:a.date));
  $('count').textContent=items.length+' 份灵感'+(partial?' · 当前展示最近 1000 条记录范围内的作品':'');
  $('list').replaceChildren();
  if(!items.length){$('list').className='empty glass';$('list').append(element('h2','',works.length?'换个关键词，发现新的灵感。':'第一份灵感，等你种下。'),element('p','',works.length?'可以尝试其他类型、时间或标签。':'广场还没有可展示的作品。去工坊创作，再来分享你的世界。'));const button=element('button','btn','分享我的作品 ↗');button.addEventListener('click',()=>openShare());$('list').append(button);return;}
  $('list').className='asset-grid';
  items.forEach(work=>{
    const card=element('article','asset-card glass');
    const tags=element('div','asset-tags');tags.append(badge(A.TYPES[work.type]));work.tags.forEach(tag=>tags.append(badge(tag)));card.append(tags,element('h3','',work.title),element('p','',work.description.slice(0,120)));
    const meta=element('div','meta');meta.append(element('span','',work.author+' · '+dateOf(work.date)),element('span','',work.comments+' 条评论'));card.append(meta);
    const button=element('button','btn btn-small','查看作品 ↗');button.addEventListener('click',()=>openDetail(work));card.append(button);$('list').append(card);
  });
  const issueParam=Number(new URLSearchParams(location.search).get('asset'));
  if(issueParam&&!$('detailDialog').open){const work=works.find(w=>w.number===issueParam);if(work)openDetail(work);}
}
function dateOf(value){const date=new Date(value);return Number.isNaN(date.getTime())?'未知日期':date.toLocaleDateString('zh-CN');}
async function openDetail(work) {
  commentRequest?.abort();commentRequest=new AbortController();const controller=commentRequest;
  $('detailTitle').textContent=work.title;$('detailTags').replaceChildren(badge(A.TYPES[work.type]),...work.tags.map(badge));$('detailMeta').textContent=work.author+' · '+dateOf(work.date);$('detailDescription').textContent=work.description;
  $('detailSource').href=work.url;$('commentLink').href=work.url+'#issuecomment-new';
  $('detailCode').hidden=!work.data;$('detailStatus').hidden=true;$('detailDownload').disabled=!work.data;
  if(work.data)$('detailCode').textContent=JSON.stringify(work.data,null,2);else A.status($('detailStatus'),work.error,'error');
  $('detailDownload').onclick=()=>{try{A.download(A.validate(work.data,work.type),work.title);}catch(error){A.status($('detailStatus'),error.message,'error');}};
  $('comments').textContent='正在读取评论…';if(!$('detailDialog').open)$('detailDialog').showModal();
  const address=new URL(location.href);address.searchParams.set('asset',work.number);address.searchParams.delete('share');history.replaceState(null,'',address);
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(API+'/issues/'+work.number+'/comments?per_page=100',{headers:{Accept:'application/vnd.github+json'},signal:controller.signal});
    if(!response.ok)throw new Error(apiError(response));
    const comments=await response.json();if(!Array.isArray(comments))throw new Error('评论数据格式异常');
    if(commentRequest!==controller)return;
    $('comments').replaceChildren();
    if(!comments.length)$('comments').append(element('p','tip','还没有评论。到 GitHub 留下第一条反馈。'));
    comments.forEach(comment=>{const block=element('article','comment');block.append(element('strong','',comment.user?.login||'玩家'),element('small','', ' · '+dateOf(comment.created_at)),element('p','',comment.body||''));$('comments').append(block);});
    if(response.headers.get('Link')?.includes('rel="next"'))$('comments').append(element('p','tip','这里展示前 100 条评论，完整讨论请打开原帖。'));
  } catch(error) {if(commentRequest===controller)$('comments').textContent=controller.signal.aborted?'评论读取已停止，可到原帖查看。':(error instanceof TypeError?'评论暂时无法读取，请到原帖查看。':error.message);}finally{clearTimeout(timer);}
}
function openShare() {$('shareStatus').hidden=true;$('shareDialog').showModal();}
$('shareBtn').addEventListener('click',openShare);
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('detailDialog').addEventListener('close',()=>{commentRequest?.abort();const address=new URL(location.href);address.searchParams.delete('asset');history.replaceState(null,'',address);});
['search','filter','timeFilter','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
let draftArea=null;
$('shareForm').addEventListener('input',()=>{if(draftArea){draftArea.remove();draftArea=null;}$('shareStatus').hidden=true;});
$('shareForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('publishBtn');button.disabled=true;
  try {
    const file=$('shareFile').files[0];if(!file)throw new Error('请选择 .json 文件');
    if(!/\.json$/i.test(file.name))throw new Error('请选择 .json 文件');if(file.size>A.MAX_FILE_BYTES)throw new Error('文件超过 1 MB');
    const type=$('shareType').value,name=$('shareName').value.trim(),description=$('shareDescription').value.trim();
    if(!name||!description)throw new Error('请填写作品名称和介绍');
    const rawTags=$('shareTags').value.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean);const tags=cleanTags(rawTags);
    if(rawTags.length>5||tags.length!==new Set(rawTags).size)throw new Error('请使用最多 5 个标签，每个标签不超过 24 字，不能含尖括号');
    const text=await file.text();if(/(?:ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|"(?:apiKey|api_key|Authorization)"\s*:)/i.test(text+'\n'+description))throw new Error('内容可能含有密钥，请删除后再分享');
    const data=A.validate(A.parseJSON(text),type);
    const body='<!-- gl-asset: '+JSON.stringify({version:1,type,tags})+' -->\n介绍：'+description+'\n类型：'+type+'\n标签：'+tags.join(', ')+'\n\n```json\n'+JSON.stringify(data,null,2)+'\n```';
    if(body.length>50000)throw new Error('分享内容过大，请拆成更小的库，或在 GitHub 原帖附上文件。');
    const url=new URL('https://github.com/'+REPO+'/issues/new');url.searchParams.set('title','【分享】'+name);url.searchParams.set('body',body);
    if(draftArea){draftArea.remove();draftArea=null;}
    if(url.href.length>7000){
      draftArea=element('div','');const label=element('label','', '复制下方完整正文，在 GitHub 草稿中粘贴后提交');label.htmlFor='draftBody';const area=element('textarea','preview');area.id='draftBody';area.readOnly=true;area.value=body;area.style.minHeight='180px';const link=element('a','btn','打开 GitHub 草稿 ↗');const short=new URL('https://github.com/'+REPO+'/issues/new');short.searchParams.set('title','【分享】'+name);link.href=short.href;link.target='_blank';link.rel='noopener noreferrer';draftArea.append(label,area,link);$('shareForm').append(draftArea);A.status($('shareStatus'),'格式通过校验。内容较长，请复制下方正文后打开 GitHub 草稿。');area.focus();area.select();
    }else {
      draftArea=element('div','actions');const link=element('a','btn btn-primary','打开 GitHub 发布草稿 ↗');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';draftArea.append(link);$('shareForm').append(draftArea);A.status($('shareStatus'),'格式通过校验。点击下方按钮，到 GitHub 提交完成分享。');link.focus();
    }
  }catch(error){A.status($('shareStatus'),error.message,'error');}finally{button.disabled=false;}
});
const params=new URLSearchParams(location.search);
if(params.get('share')==='1') {const type=typeOf(params.get('type'));if(type)$('shareType').value=type;$('shareName').value=(params.get('name')||'').slice(0,80);openShare();}
load();
