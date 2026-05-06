const puppeteer = require('puppeteer');

class SimpleLinkedInTest {
  constructor() {
    this.testUrl = 'https://www.linkedin.com/jobs/search/?keywords=(%22Frontend%20Developer%22%20OR%20%22Frontend%20Engineer%22%20OR%20%22Web%20Developer%22%20OR%20%22UI%20Developer%22%20OR%20%22Software%20Engineer%22)%20AND%20(%22React%22%20OR%20%22JavaScript%22%20OR%20%22Angular%22%20OR%20%22Vue%22%20OR%20%22TypeScript%22)%20AND%20(%22Junior%22%20OR%20%22Entry%20Level%22%20OR%20%22Trainee%22%20OR%20%22Intern%22)';
  }

  async init() {
    console.log('🚀 Iniciando test simple...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    
    // Configurar user agent para evitar detección
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Configurar timeouts más largos
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(60000);
  }

  async testSimpleExtraction() {
    try {
      console.log(`🔗 Navegando a: ${this.testUrl}`);
      
      // Navegar con waitUntil más flexible
      await this.page.goto(this.testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log('⏳ Esperando 5 segundos para que cargue completamente...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verificar si cargó la página
      const pageUrl = this.page.url();
      console.log(`📍 URL actual: ${pageUrl}`);
      
      if (pageUrl.includes('linkedin.com')) {
        console.log('✅ Página de LinkedIn cargada correctamente');
        
        // Hacer scroll
        await this.autoScroll();
        
        // Extraer empleos con método simple
        console.log('📋 Extrayendo empleos...');
        
        const jobs = await this.page.evaluate(() => {
          const jobElements = document.querySelectorAll('a[href*="/jobs/view/"]');
          const jobs = [];
          
          console.log(`📊 Encontrados ${jobElements.length} enlaces de empleos`);
          
          for (const element of jobElements) {
            try {
              const link = element.href.split('?')[0];
              
              if (link.includes('/jobs/view/')) {
                // Extraer información básica
                const jobContainer = element.closest('[class*="_84e51078"], [class*="ec5425c9"], [class*="job-card"]');
                
                let title = 'Título no encontrado';
                let company = 'Empresa no especificada';
                let location = 'Ubicación no especificada';
                
                if (jobContainer) {
                  // Extraer título
                  const titleElement = jobContainer.querySelector('span[class*="_30f0389c"]');
                  if (titleElement) {
                    title = titleElement.innerText.trim();
                  }
                  
                  // Extraer empresa y ubicación
                  const paragraphs = jobContainer.querySelectorAll('p[class*="_12a7eae6"]');
                  let infoIndex = 0;
                  for (const p of paragraphs) {
                    const text = p.innerText.trim();
                    if (text && !text.includes('antiguos alumnos') && !text.includes('Publicado') && !text.includes('hace')) {
                      if (infoIndex === 0) {
                        company = text;
                      } else if (infoIndex === 1) {
                        location = text;
                      }
                      infoIndex++;
                    }
                  }
                }
                
                const jobIdMatch = link.match(/\/jobs\/view\/(\d+)/);
                const jobId = jobIdMatch ? jobIdMatch[1] : link;
                
                jobs.push({
                  jobId: jobId,
                  title: title,
                  company: company,
                  location: location,
                  link: link,
                  extractedAt: new Date().toISOString()
                });
              }
            } catch (error) {
              console.log('Error extrayendo job:', error.message);
            }
          }
          
          return jobs;
        });
        
        console.log(`📊 Total empleos extraídos: ${jobs.length}`);
        
        if (jobs.length > 0) {
          console.log('\n📋 PRIMEROS 5 EMPLEOS:');
          jobs.slice(0, 5).forEach((job, index) => {
            console.log(`${index + 1}. ${job.title}`);
            console.log(`   Empresa: ${job.company}`);
            console.log(`   Ubicación: ${job.location}`);
            console.log(`   Link: ${job.link}`);
            console.log(`   JobId: ${job.jobId}`);
            console.log('');
          });
        }
        
      } else {
        console.log('❌ No se cargó LinkedIn correctamente');
      }
      
    } catch (error) {
      console.error('❌ Error en test:', error);
    }
  }

  async autoScroll() {
    console.log('📜 Haciendo scroll...');
    
    try {
      await this.page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 500;
          let attempts = 0;
          const maxAttempts = 15;

          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            attempts++;

            if (totalHeight >= document.body.scrollHeight || attempts >= maxAttempts) {
              clearInterval(timer);
              resolve();
            }
          }, 1000);
        });
      });
      
      console.log('✅ Scroll completado');
    } catch (error) {
      console.log('❌ Error en scroll:', error.message);
    }
  }

  async close() {
    await this.browser.close();
  }
}

async function runTest() {
  const tester = new SimpleLinkedInTest();
  
  try {
    await tester.init();
    await tester.testSimpleExtraction();
    
    console.log('\n⏳ Esperando 30 segundos para revisión manual...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    await tester.close();
  }
}

runTest();
