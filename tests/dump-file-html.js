const puppeteer = require('puppeteer');
const path = require('path');

const ROOT = path.join('C:', 'Users', 'user', 'OneDrive', 'Desktop', 'sistema-buffet');
const PAGES = ['cadastro-evento.html','area-cliente.html','evento-detalhado.html','eventos.html','clientes-lista.html','cliente-detalhado.html'];
(async ()=>{
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  for (const p of PAGES){
    const fileUrl = 'file:///' + path.join(ROOT, p).replace(/\\/g, '/');
    try{
      await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });
      const html = await page.content();
      const found = html.includes('res.cloudinary.com');
      console.log('FILE', p, 'cloudinary_in_html=', found);
      if (found) {
        const idx = html.indexOf('res.cloudinary.com');
        console.log(html.slice(Math.max(0, idx-200), idx+200));
      } else {
        console.log('--- snippet (first 400 chars) ---');
        console.log(html.slice(0,400));
      }
    }catch(e){ console.error('ERR', p, e && e.message); }
  }
  await browser.close();
})();
