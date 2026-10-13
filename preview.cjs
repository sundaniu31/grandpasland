const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
function createServer(){return http.createServer((req,res)=>{
  let name;
  try {name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';}
  catch {res.writeHead(400);res.end();return;}
  if(!/^(?:images\/)?[a-z0-9-]+\.(?:html|css|js|json|md|svg|webp)$/.test(name)){res.writeHead(404);res.end();return;}
  const file=path.join(__dirname,name);fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end();return;}
    const extension=path.extname(file),headers={'Content-Type':types[extension],'Cache-Control':'no-store'};
    if(extension === '.md') headers['Content-Disposition']='attachment; filename="'+path.basename(file)+'"';
    res.writeHead(200,headers);res.end(data);
  });
});}
if(require.main === module) createServer().listen(8765,'127.0.0.1',()=>process.stdout.write('Preview: http://127.0.0.1:8765\n'));
module.exports={createServer};
