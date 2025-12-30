const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..'); // workspace root
const PORT = process.env.PORT || 3334;

const mime = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.gif':'image/gif'
};

function send404(res){ res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); }

const server = http.createServer((req,res)=>{
  try{
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(ROOT, urlPath);
    if (urlPath === '/' || urlPath === '') filePath = path.join(ROOT, 'index.html');
    // prevent directory traversal
    if (!filePath.startsWith(ROOT)) return send404(res);
    fs.stat(filePath, (err, st)=>{
      if (err) return send404(res);
      if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err, data)=>{
        if (err) return send404(res);
        const ext = path.extname(filePath).toLowerCase();
        const type = mime[ext] || 'application/octet-stream';
        res.writeHead(200, {'Content-Type': type});
        res.end(data);
      });
    });
  }catch(e){ send404(res); }
});

server.listen(PORT, ()=>{
  console.log('static server', 'serving', ROOT, 'on', PORT);
});

process.on('SIGINT', ()=>{ server.close(()=>process.exit(0)); });
