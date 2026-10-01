const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  if(!/^(?:images\/)?[a-z0-9-]+\.(?:html|css|js|svg|webp)$/.test(name)){res.writeHead(404);res.end();return;}
  const file=path.join(__dirname,name);fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(data);});
}).listen(8765,'127.0.0.1',()=>process.stdout.write('Preview: http://127.0.0.1:8765\n'));
