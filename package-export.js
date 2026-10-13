/* Local, dependency-free JSON + PNG packages. ZIP entries use STORE and UTF-8 names. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({jsonBytes:10 * 1024 * 1024,pngBytes:2 * 1024 * 1024,packageBytes:32 * 1024 * 1024,pixels:16777216,dimension:2048,jsonFiles:256,names:5000,directoryDepth:4,directories:256});
  const TYPES = ['CityNames','NPCNames','CompanyNames','FamilyNames','CountryNames','Dialogues','Events','Festivals','Items','Quests','SpecialNPCs'];
  const NAME_TYPES = ['CityNames','NPCNames','CompanyNames','FamilyNames','CountryNames'];
  // Exact underlying order from LibraryType. The Unity root-name overload of
  // Enum.TryParse is case-sensitive, but also accepts numeric/comma values.
  const LIBRARY_ORDER = ['CityNames','NPCNames','CompanyNames','SpecialNPCs','Quests','Events','Festivals','FamilyNames','Dialogues','CountryNames','Items'];
  const encoder = new TextEncoder();
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const crcTable = new Uint32Array(256);
  for (let n=0;n<256;n++) {let c=n;for(let k=0;k<8;k++) c=(c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;crcTable[n]=c >>> 0;}
  function crc32(bytes) {let c=0xffffffff;for (const byte of bytes) c=crcTable[(c ^ byte) & 255] ^ (c >>> 8);return (c ^ 0xffffffff) >>> 0;}
  function safeBaseName(value, fallback = 'MyLibrary') {
    if (typeof value !== 'string') throw new Error('文件名必须是文本');
    let name=value.trim().replace(/\.(?:json|zip)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,80);
    if (!name) name=fallback;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name='_'+name;
    return name;
  }
  function modFolderName(value) {
    const name=safeBaseName(value,'MyMod');
    let classification=-1;
    if (/^[+-]?\d+$/.test(name)) classification=Number(name);
    else {
      const parts=name.split(',').map(part=>LIBRARY_ORDER.indexOf(part.trim()));
      if(parts.every(part=>part >= 0)) classification=parts.reduce((result,part)=>result | part,0);
    }
    if(Number.isInteger(classification) && classification >= 0 && classification < LIBRARY_ORDER.length) throw new Error('Mod 包名会被游戏误识别为库分类，请更换名称：'+name);
    return name;
  }
  function normalizeRelativePath(path, png = false) {
    if (typeof path !== 'string' || !path || path.length > (png ? 240 : 512) || path !== path.trim()
      || /[\\:\x00-\x1f<>"|?*]/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
        || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('文件路径必须是安全的相对路径，不能包含 ..、反斜线、绝对路径或无效文件名');
    if (png && !/\.png$/i.test(path)) throw new Error('物品图标必须使用相对 PNG 路径');
    return path;
  }
  async function toBytes(value) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength));
    if (typeof Blob !== 'undefined' && value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    throw new Error('文件内容必须是 Uint8Array、ArrayBuffer 或 Blob');
  }
  function fileMap(files) {
    const result=new Map();
    if (files === undefined || files === null) return result;
    const pairs=files instanceof Map ? files : object(files) ? Object.entries(files) : null;
    if (!pairs) throw new Error('图标文件必须是 Map 或路径到文件的对象');
    const seen=new Set();
    for (const [key,value] of pairs) {
      normalizeRelativePath(key);
      if (seen.has(key.toLowerCase())) throw new Error('文件路径重复：'+key);
      seen.add(key.toLowerCase());result.set(key,value);
    }
    return result;
  }
  function inspectPng(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 33 || bytes.length > LIMITS.pngBytes) throw new Error('PNG 必须是合法且不超过 2 MiB 的文件');
    const signature=[137,80,78,71,13,10,26,10];
    if (!signature.every((value,i) => bytes[i] === value)) throw new Error('图标不是 PNG 文件');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR') throw new Error('PNG 缺少有效 IHDR');
    const width=view.getUint32(16),height=view.getUint32(20);
    if (!width || !height || width > LIMITS.dimension || height > LIMITS.dimension) throw new Error('PNG 尺寸最多 2048×2048');
    let offset=8,sawData=false,sawEnd=false,sawHeader=false;
    while (offset < bytes.length) {
      if (offset+12 > bytes.length) throw new Error('PNG 数据被截断');
      const size=view.getUint32(offset),end=offset+12+size;
      if (end > bytes.length) throw new Error('PNG 数据被截断');
      const kind=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
      if (!/^[A-Za-z]{4}$/.test(kind) || crc32(bytes.subarray(offset+4,offset+8+size)) !== view.getUint32(offset+8+size)) throw new Error('PNG 区块校验失败');
      if (kind === 'IHDR') {if(sawHeader || offset !== 8) throw new Error('PNG 包含重复 IHDR');sawHeader=true;}
      if (kind === 'IDAT') sawData=true;
      if (kind === 'IEND') {if(size !== 0 || end !== bytes.length) throw new Error('PNG 结束区块无效');sawEnd=true;}
      offset=end;
    }
    if (!sawData || !sawEnd) throw new Error('PNG 缺少图像数据或结束区块');
    return {width,height,pixels:width * height};
  }
  async function validatePng(bytes, options = {}) {
    const info=inspectPng(bytes),blob=new Blob([bytes],{type:'image/png'});
    if (typeof root.createImageBitmap === 'function') {
      let bitmap;
      try {bitmap=await root.createImageBitmap(blob);if (bitmap.width !== info.width || bitmap.height !== info.height) throw new Error('PNG 解码尺寸不一致');return {...info,decoded:true};}
      catch (error) {if (typeof root.Image !== 'function') throw new Error('PNG 实际解码失败：'+error.message);}
      finally {bitmap?.close();}
    }
    if (typeof root.Image === 'function' && root.URL?.createObjectURL) {
      const url=root.URL.createObjectURL(blob);
      try {
        const image=await new Promise((resolve,reject) => {const img=new root.Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('PNG 实际解码失败'));img.src=url;});
        if (image.naturalWidth !== info.width || image.naturalHeight !== info.height) throw new Error('PNG 解码尺寸不一致');
        return {...info,decoded:true};
      } finally {root.URL.revokeObjectURL(url);}
    }
    if (isNode && options.allowHeaderOnly === true) return {...info,decoded:false};
    throw new Error('当前浏览器没有可用的 PNG 解码器，请使用现代浏览器导出物品包');
  }
  // Web Crypto is unavailable on an HTTP custom domain. Hashing public PNG
  // bytes still needs to work there; this SHA-256 fallback handles that case.
  function portableSha256(bytes) {
    const constants=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64),view=new DataView(padded.buffer),words=new Uint32Array(64);
    padded.set(bytes);padded[bytes.length]=128;view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(padded.length-4,(bytes.length*8) >>> 0);
    const hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const rotate=(value,bits)=>(value >>> bits) | (value << (32-bits));
    for(let offset=0;offset<padded.length;offset+=64) {
      for(let i=0;i<16;i++) words[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++) {const x=words[i-15],y=words[i-2];words[i]=(words[i-16]+(rotate(x,7)^rotate(x,18)^(x >>> 3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y >>> 10))) >>> 0;}
      let [a,b,c,d,e,f,g,h]=hash;
      for(let i=0;i<64;i++) {
        const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e & f)^((~e) & g))+constants[i]+words[i]) >>> 0;
        const second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a & b)^(a & c)^(b & c))) >>> 0;
        h=g;g=f;f=e;e=(d+first) >>> 0;d=c;c=b;b=a;a=(first+second) >>> 0;
      }
      [a,b,c,d,e,f,g,h].forEach((value,i)=>hash[i]=(hash[i]+value) >>> 0);
    }
    return [...hash].map(value=>value.toString(16).padStart(8,'0')).join('');
  }
  async function sha256(bytes) {
    let crypto=root.crypto;
    if (!crypto?.subtle && isNode && typeof require === 'function') crypto=require('node:crypto').webcrypto;
    if (!crypto?.subtle) return portableSha256(bytes);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    return Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function addPng(files, path, file, options = {}) {
    if (!(files instanceof Map)) throw new Error('addPng 需要 Map 文件容器');
    const name=normalizeRelativePath(path,true);
    if (Array.from(files.keys()).some(key=>key.toLowerCase() === name.toLowerCase())) throw new Error('文件路径重复：'+name);
    const bytes=await toBytes(file),info=await validatePng(bytes,options);
    files.set(name,bytes);return {...info,path:name,hash:await sha256(bytes)};
  }
  function assertNoCredentials(data) {
    function walk(value, depth) {
      if (depth > 64) throw new Error('JSON 嵌套深度最多 64');
      if (object(value)) for (const [key,child] of Object.entries(value)) {
        if (/^(?:api_?key|authorization|password|access_?token|refresh_?token|secret|private_?key|\$type)$/i.test(key)) throw new Error('共享内容不能包含凭据或脚本元数据：'+key);
        walk(child,depth+1);
      }
      else if (Array.isArray(value)) value.forEach(child=>walk(child,depth+1));
      else if (typeof value === 'number' && !Number.isFinite(value) || value === undefined || typeof value === 'function' || typeof value === 'bigint') throw new Error('内容包含无法交付的 JSON 值');
    }
    walk(data,0);
  }
  function checkedData(data, type, options, resources = null) {
    if (!TYPES.includes(type) || !object(data)) throw new Error('不支持的库分类或根对象');
    assertNoCredentials(data);
    if (data.SchemaVersion !== 1 || data.ProfileId !== 'crownfall1-v1') throw new Error('交付文件需明确 SchemaVersion=1 和 ProfileId=crownfall1-v1');
    const roots=['SchemaVersion','ProfileId',...(NAME_TYPES.includes(type) ? ['Items'] : type === 'Dialogues' ? ['Lines','Conversations','Profiles'] : ['Entries'])];
    if (Object.keys(data).some(key=>!roots.includes(key))) throw new Error('库根包含误分类字段、manifest 或不支持的字段');
    let canonical;
    if (root.GLAssets?.validate) canonical=root.GLAssets.validate(data,type,resources);
    else if (options.validated !== true) throw new Error('需要先加载游戏内容校验器 GLAssets');
    const clean=JSON.parse(JSON.stringify(data));
    const bytes=encoder.encode(JSON.stringify(clean,null,2));
    if (bytes.length > LIMITS.jsonBytes) throw new Error('单个 JSON 最多 10 MiB');
    return {data:clean,canonical:canonical || clean,bytes};
  }
  // The game's Mod preflight discovers item resources before reading any event
  // graph. This local scope follows that order without altering GLAssets.profile.
  function packageResources(libraries) {
    if (!Array.isArray(libraries)) throw new Error('Mod 库列表必须是数组');
    const ids=new Set(),tags=new Set(),qualityTags={Common:'普通',Uncommon:'良好',Rare:'精英',Epic:'史诗',Legendary:'传说'};
    for (const library of libraries) {
      if (!object(library)) throw new Error('Mod 库条目必须是 {type,name,data,files?}');
      if (library.type !== 'Items') continue;
      const data=library.data;
      if (!object(data) || !Array.isArray(data.Entries) || !data.Entries.length || data.Entries.length > 5000) throw new Error('物品包需要 1～5000 个 Entries');
      for(const item of data.Entries) {
        if(!object(item) || typeof item.Id !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/.test(item.Id) || item.Id.includes('..')) throw new Error('物品 ID 缺失或无效：'+(item?.Id || ''));
        if(ids.has(item.Id)) throw new Error('不同物品库含重复 ID：'+item.Id);
        ids.add(item.Id);
        const rarity=item.Rarity ?? 'Common';
        if(!Object.hasOwn(qualityTags,rarity)) throw new Error('物品 Rarity 无效');
        const itemTags=item.Tags ?? [];
        if(!Array.isArray(itemTags) || itemTags.length > 64 || itemTags.some(tag=>typeof tag !== 'string' || !tag.trim() || tag.trim().length > 80)) throw new Error('物品 Tags 无效');
        itemTags.forEach(tag=>tags.add(tag.trim()));tags.add(qualityTags[rarity]);
      }
    }
    if(ids.size > 5000) throw new Error('合并后的物品库超过 5000 条');
    return {items:[...ids],commodities:[...ids],itemTags:[...tags]};
  }
  function mergeResources(first,second) {
    return Object.fromEntries(['items','commodities','itemTags'].map(key=>[key,[...new Set([...(first?.[key] || []),...(second?.[key] || [])])]]));
  }
  function validateLibraryInPackage(data,type,libraries = [],options = {}) {
    let resources=packageResources(libraries);
    // A preview may not have been added to the basket yet. Its own IDs/tags
    // belong to the preview scope, but actual package duplicate checks remain.
    if(type === 'Items') resources=mergeResources(resources,packageResources([{type,data}]));
    for(const library of libraries) if(library.type === 'Items') checkedData(library.data,'Items',options,resources);
    return checkedData(data,type,options,resources).canonical;
  }
  function validateLibraries(libraries,options = {}) {
    if (!Array.isArray(libraries) || !libraries.length || libraries.length > LIMITS.jsonFiles) throw new Error('Mod 包需要 1～256 个分类 JSON 文件');
    const resources=packageResources(libraries);
    const clean=libraries.map(library=>({...library,data:checkedData(library.data,library.type,options,resources).canonical}));
    return {libraries:clean,resources,warnings:overlayWarnings(clean)};
  }
  function validateIconRect(icon, info) {
    const x=icon.X ?? 0,y=icon.Y ?? 0,width=icon.Width ?? 0,height=icon.Height ?? 0,ppu=icon.PixelsPerUnit ?? 100;
    if ([x,y,width,height].some(value=>!Number.isInteger(value) || value < 0) || !Number.isFinite(ppu) || ppu < 1 || ppu > 10000) throw new Error('图标切片或 PixelsPerUnit 无效');
    if (width === 0 && height === 0) {if(x || y) throw new Error('整张图标不能有切片偏移');}
    else if (!width || !height || x+width > info.width || y+height > info.height) throw new Error('图标切片越出 PNG 边界');
  }
  async function itemIcons(data, files, options) {
    if (!Array.isArray(data.Entries) || !data.Entries.length || data.Entries.length > 5000) throw new Error('物品包需要 1～5000 个 Entries');
    const source=fileMap(files),icons=new Map(),ids=new Set();
    for (const item of data.Entries) {
      if (!object(item) || typeof item.Id !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/.test(item.Id) || item.Id.includes('..') || ids.has(item.Id)) throw new Error('物品 ID 缺失、无效或重复');
      ids.add(item.Id);
      if (!object(item.Icon)) throw new Error(item.Id+' 缺少 PNG 图标定义');
      const path=normalizeRelativePath(item.Icon.Path,true);
      if (!source.has(path)) throw new Error(item.Id+' 缺少 PNG 文件：'+path);
      let image=icons.get(path);
      if (!image) {
        const bytes=await toBytes(source.get(path)),info=await validatePng(bytes,options),hash=await sha256(bytes);
        image={path,bytes,...info,hash};icons.set(path,image);
      }
      if (item.Icon.Hash !== undefined && item.Icon.Hash !== '') {
        if (typeof item.Icon.Hash !== 'string' || !/^[a-f0-9]{64}$/.test(item.Icon.Hash) || item.Icon.Hash !== image.hash) throw new Error(item.Id+' 的 PNG Hash 与文件字节不一致');
      }
      validateIconRect(item.Icon,image);
    }
    // Extra uploads are neither silently bundled nor able to become arbitrary files.
    for (const path of source.keys()) if (!icons.has(path)) throw new Error('已上传的图标未被物品引用：'+path);
    return [...icons.values()];
  }
  function buildZipEntries(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 65535) throw new Error('ZIP 文件列表为空或过多');
    const paths=new Set(),prepared=[];let total=22,offset=0;
    for (const entry of entries) {
      const path=normalizeRelativePath(entry.path),name=encoder.encode(path);
      if (!(entry.bytes instanceof Uint8Array) || name.length > 65535 || paths.has(path.toLowerCase())) throw new Error('ZIP 文件字节无效或路径重复：'+path);
      paths.add(path.toLowerCase());
      const bytes=entry.bytes;
      if (bytes.length > LIMITS.packageBytes) throw new Error('ZIP 文件过大');
      prepared.push({path,name,bytes,crc:crc32(bytes),offset});offset+=30+name.length+bytes.length;total+=76+2*name.length+bytes.length;
    }
    if (prepared.reduce((sum,entry)=>sum+entry.bytes.length,0) > LIMITS.packageBytes) throw new Error('JSON 和 PNG 总大小最多 32 MiB');
    const result=new Uint8Array(total),view=new DataView(result.buffer);let cursor=0;
    for (const entry of prepared) {
      view.setUint32(cursor,0x04034b50,true);view.setUint16(cursor+4,20,true);view.setUint16(cursor+6,0x0800,true);
      view.setUint16(cursor+8,0,true);view.setUint16(cursor+10,0,true);view.setUint16(cursor+12,33,true);
      view.setUint32(cursor+14,entry.crc,true);view.setUint32(cursor+18,entry.bytes.length,true);view.setUint32(cursor+22,entry.bytes.length,true);
      view.setUint16(cursor+26,entry.name.length,true);view.setUint16(cursor+28,0,true);
      result.set(entry.name,cursor+30);result.set(entry.bytes,cursor+30+entry.name.length);cursor+=30+entry.name.length+entry.bytes.length;
    }
    const centralOffset=cursor;
    for (const entry of prepared) {
      view.setUint32(cursor,0x02014b50,true);view.setUint16(cursor+4,20,true);view.setUint16(cursor+6,20,true);view.setUint16(cursor+8,0x0800,true);
      view.setUint16(cursor+10,0,true);view.setUint16(cursor+12,0,true);view.setUint16(cursor+14,33,true);
      view.setUint32(cursor+16,entry.crc,true);view.setUint32(cursor+20,entry.bytes.length,true);view.setUint32(cursor+24,entry.bytes.length,true);
      view.setUint16(cursor+28,entry.name.length,true);view.setUint16(cursor+30,0,true);view.setUint16(cursor+32,0,true);
      view.setUint16(cursor+34,0,true);view.setUint16(cursor+36,0,true);view.setUint32(cursor+38,0,true);view.setUint32(cursor+42,entry.offset,true);
      result.set(entry.name,cursor+46);cursor+=46+entry.name.length;
    }
    view.setUint32(cursor,0x06054b50,true);view.setUint16(cursor+4,0,true);view.setUint16(cursor+6,0,true);
    view.setUint16(cursor+8,prepared.length,true);view.setUint16(cursor+10,prepared.length,true);
    view.setUint32(cursor+12,cursor-centralOffset,true);view.setUint32(cursor+16,centralOffset,true);view.setUint16(cursor+20,0,true);
    return result;
  }
  function resultPackage(entries, name, warnings) {
    const bytes=buildZipEntries(entries);
    return {blob:new Blob([bytes],{type:'application/zip'}),fileName:safeBaseName(name)+'.zip',entries:entries.map(entry=>entry.path),warnings};
  }
  function packagePixelLimit(images) {
    const unique=new Map();for(const image of images) unique.set(image.hash,image.pixels);
    if ([...unique.values()].reduce((sum,pixels)=>sum+pixels,0) > LIMITS.pixels) throw new Error('物品 PNG 解码总像素最多 16,777,216');
  }
  function validateModDirectories(entries, folder) {
    const directories=new Map();
    for(const entry of entries) {
      const parts=entry.path.slice(folder.length+1).split('/'),type=parts[1],parents=parts.slice(2,-1);
      if(parts[0] !== 'NameLibraries' || !TYPES.includes(type)) throw new Error('Mod ZIP 文件必须位于实际库分类目录');
      if(parents.length > LIMITS.directoryDepth) throw new Error('Mod '+type+' 分类目录最多嵌套 4 层；物品库名子目录也占一层');
      const known=directories.get(type) || new Set(['']);
      for(let i=1;i<=parents.length;i++) known.add(parents.slice(0,i).join('/').toLowerCase());
      if(known.size > LIMITS.directories) throw new Error('Mod '+type+' 分类最多包含 256 个目录（含分类根目录和 icons 子目录）');
      directories.set(type,known);
    }
  }
  async function buildItemPackage(data, name, files, options = {}) {
    const checked=checkedData(data,'Items',options),folder=safeBaseName(name),images=await itemIcons(checked.data,files,options);
    packagePixelLimit(images);
    const entries=[{path:folder+'/'+folder+'.json',bytes:checked.bytes},...images.map(image=>({path:folder+'/'+image.path,bytes:image.bytes}))];
    return resultPackage(entries,folder,images.some(image=>!image.decoded) ? ['Node 环境仅验证 PNG 结构和尺寸；没有执行浏览器图像解码。'] : []);
  }
  function overlayWarnings(libraries) {
    const names=new Map(),ids=new Map(),itemIds=new Set(),entryGroups=new Map(),dialogueGroups={Lines:new Map(),Conversations:new Map(),Profiles:new Map()},warnings=[];
    for (const library of libraries) {
      const {type,data}=library;
      if (NAME_TYPES.includes(type)) {
        if (!Array.isArray(data.Items)) throw new Error(type+' 需要 Items');
        const unique=names.get(type) || new Set();
        for(const name of data.Items) if(typeof name === 'string' && name.trim()) unique.add(name.trim());
        if(unique.size > LIMITS.names) throw new Error(type+' 合并后超过 5000 个不同名字');
        names.set(type,unique);
      } else if (type === 'Items') {
        for(const entry of data.Entries || []) {if(itemIds.has(entry.Id)) throw new Error('不同物品库含重复 ID：'+entry.Id);itemIds.add(entry.Id);}
        if(itemIds.size > LIMITS.names) throw new Error('合并后的物品库超过 5000 条');
      } else {
        const collections=type === 'Dialogues' ? ['Lines','Conversations','Profiles'] : ['Entries'];
        for(const collection of collections) for(const entry of data[collection] || []) {
          const id=entry.Id || (type === 'Events' ? 'content_' : '')+entry.Name,key=type+'/'+collection+'/'+id;
          if(ids.has(key)) warnings.push(type+' 的 '+id+' 在多个库中重复，游戏会整条覆盖；请优先使用唯一 ID。');
          ids.set(key,true);
          if(type === 'Dialogues') dialogueGroups[collection].set(id,entry);
          else {const group=entryGroups.get(type) || new Map();group.set(id,entry);entryGroups.set(type,group);}
        }
      }
    }
    for(const [type,group] of entryGroups) if(group.size > LIMITS.names) throw new Error(type+' 合并后的内容库超过 5000 条');
    const mergedDialogue={SchemaVersion:1,ProfileId:'crownfall1-v1',...Object.fromEntries(Object.entries(dialogueGroups).map(([key,group])=>[key,[...group.values()]]))};
    if(Object.values(dialogueGroups).reduce((sum,group)=>sum+group.size,0) > LIMITS.names) throw new Error('合并后的对话库 Lines、Conversations、Profiles 合计超过 5000 条');
    if(encoder.encode(JSON.stringify(mergedDialogue)).length > LIMITS.jsonBytes) throw new Error('合并后的对话库超过 10 MiB');
    return warnings;
  }
  async function buildModPackage(libraries, packName, files, options = {}) {
    if (!Array.isArray(libraries) || !libraries.length || libraries.length > LIMITS.jsonFiles) throw new Error('Mod 包需要 1～256 个分类 JSON 文件');
    const folder=modFolderName(packName),globalFiles=fileMap(files),resources=packageResources(libraries),checked=[],entries=[],allImages=[],usedGlobal=new Set();
    for (const library of libraries) {
      if (!object(library)) throw new Error('Mod 库条目必须是 {type,name,data,files?}');
      const type=library.type,name=safeBaseName(library.name),value=checkedData(library.data,type,options,resources);
      checked.push({type,data:value.data});
      const relative='NameLibraries/'+type+(type === 'Items' ? '/'+name : '');
      entries.push({path:folder+'/'+relative+'/'+name+'.json',bytes:value.bytes});
      if (type === 'Items') {
        let source;
        if (library.files !== undefined) source=library.files;
        else {
          source=new Map();
          for(const item of value.data.Entries || []) {
            const icon=item.Icon?.Path;
            if(typeof icon !== 'string') continue;
            const candidates=[type+'/'+name+'.json/'+icon,'NameLibraries/'+type+'/'+name+'.json/'+icon,relative+'/'+icon];
            const matches=candidates.filter(key=>globalFiles.has(key));
            if(matches.length !== 1) throw new Error(name+' 的 PNG 文件缺失或定位不唯一：'+icon);
            source.set(icon,globalFiles.get(matches[0]));usedGlobal.add(matches[0]);
          }
        }
        const images=await itemIcons(value.data,source,options);allImages.push(...images);
        entries.push(...images.map(image=>({path:folder+'/'+relative+'/'+image.path,bytes:image.bytes})));
      }
    }
    for(const key of globalFiles.keys()) if(!usedGlobal.has(key)) throw new Error('Mod 图标文件未被任何库引用：'+key);
    validateModDirectories(entries,folder);
    packagePixelLimit(allImages);
    const warnings=overlayWarnings(checked);
    if(allImages.some(image=>!image.decoded)) warnings.push('Node 环境仅验证 PNG 结构和尺寸；没有执行浏览器图像解码。');
    return resultPackage(entries,folder,warnings);
  }
  function downloadPackage(result) {
    if (!result?.blob || !result.fileName) throw new Error('下载包尚未构建');
    const url=root.URL.createObjectURL(result.blob),anchor=root.document.createElement('a');
    anchor.href=url;anchor.download=result.fileName;root.document.body.append(anchor);anchor.click();anchor.remove();
    root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);
  }
  const api={LIMITS,TYPES,NAME_TYPES,crc32,safeBaseName,normalizeRelativePath,inspectPng,validatePng,addPng,packageResources,validateLibraryInPackage,validateLibraries,buildZipEntries,buildItemPackage,buildModPackage,downloadPackage};
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  root.GLPackages=api;
})(typeof window !== 'undefined' ? window : globalThis);

