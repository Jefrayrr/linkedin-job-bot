const puppeteer = require('puppeteer');

async function testConnection() {
  console.log('🚀 Probando conexión a LinkedIn...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  page.setDefaultTimeout(60000);

  try {
    console.log('🔗 Navegando a LinkedIn...');
    await page.goto('https://www.linkedin.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('⏳ Esperando 5 segundos...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const url = page.url();
    console.log(`📍 URL actual: ${url}`);

    if (url.includes('linkedin.com')) {
      console.log('✅ Conexión exitosa a LinkedIn');
      
      // Intentar navegación a jobs
      console.log('🔗 Navegando a LinkedIn Jobs...');
      await page.goto('https://www.linkedin.com/jobs/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      
      console.log('⏳ Esperando 5 segundos...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const jobsUrl = page.url();
      console.log(`📍 URL de jobs: ${jobsUrl}`);
      
      if (jobsUrl.includes('linkedin.com/jobs')) {
        console.log('✅ Navegación a Jobs exitosa');
        
        // Intentar búsqueda simple
        console.log('🔍 Intentando búsqueda simple...');
        await page.goto('https://www.linkedin.com/jobs/search/?keywords=React%20Developer', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        
        console.log('⏳ Esperando 5 segundos...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const searchUrl = page.url();
        console.log(`📍 URL de búsqueda: ${searchUrl}`);
        
        if (searchUrl.includes('linkedin.com/jobs/search')) {
          console.log('✅ Búsqueda exitosa');
          
          // Extraer links
          const links = await page.evaluate(() => {
            const anchors = document.querySelectorAll('a[href*="/jobs/view/"]');
            return Array.from(anchors).map(a => a.href.split('?')[0]).filter(href => href.includes('/jobs/view/'));
          });
          
          console.log(`📊 Links encontrados: ${links.length}`);
          if (links.length > 0) {
            console.log('✅ Extracción de links exitosa');
            console.log('📋 Primeros 3 links:');
            links.slice(0, 3).forEach((link, i) => {
              console.log(`  ${i + 1}. ${link}`);
            });
          }
        } else {
          console.log('❌ Falló navegación a búsqueda');
        }
      } else {
        console.log('❌ Falló navegación a Jobs');
      }
    } else {
      console.log('❌ Falló conexión a LinkedIn');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n⏳ Esperando 30 segundos para revisión manual...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  await browser.close();
}

testConnection();
