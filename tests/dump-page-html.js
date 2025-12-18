const puppeteer = require('puppeteer');

const BASE = process.env.BASE_URL || 'http://localhost:3333';
const PAGES = ['/cliente-detalhado.html','/evento-detalhado.html','/area-cliente.html'];
(async ()=>{
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  for (const p of PAGES){
    try{
      await page.goto(BASE + p, { waitUntil: 'networkidle2', timeout: 30000 });
      const html = await page.content();
      const found = html.includes('res.cloudinary.com');
      console.log('PAGE', p, 'cloudinary_in_html=', found);
      if (found) {
        const idx = html.indexOf('res.cloudinary.com');
        console.log(html.slice(Math.max(0, idx-200), idx+200));
      } else {
        console.log('--- snippet (first 800 chars) ---');
        console.log(html.slice(0,800));
      }
    }catch(e){ console.error('ERR', p, e && e.message); }
  }
  await browser.close();
})();