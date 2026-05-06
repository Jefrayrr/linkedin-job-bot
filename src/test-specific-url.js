const puppeteer = require('puppeteer');

class SpecificURLTest {
  constructor() {
    this.testUrl = 'https://www.linkedin.com/jobs/search/?keywords=(%22Frontend%20Developer%22%20OR%20%22Frontend%20Engineer%22%20OR%20%22Web%20Developer%22%20OR%20%22UI%20Developer%22%20OR%20%22Software%20Engineer%22)%20AND%20(%22React%22%20OR%20%22JavaScript%22%20OR%20%22Angular%22%20OR%20%22Vue%22%20OR%20%22TypeScript%22)%20AND%20(%22Junior%22%20OR%20%22Entry%20Level%22%20OR%20%22Trainee%22%20OR%20%22Intern%22)';
  }

  async init() {
    console.log('🚀 Iniciando test con URL específica...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    this.page.setDefaultTimeout(60000);
  }

  async testSpecificURL() {
    try {
      console.log(`🔗 Navegando a URL específica: ${this.testUrl}`);
      
      await this.page.goto(this.testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log('⏳ Esperando 5 segundos...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verificar página
      const pageUrl = this.page.url();
      console.log(`📍 URL actual: ${pageUrl}`);
      
      if (pageUrl.includes('linkedin.com')) {
        console.log('✅ Página de LinkedIn cargada');
        
        // Hacer scroll
        await this.autoScroll();
        
        // Extraer empleos
        console.log('📋 Extrayendo empleos...');
        
        const jobs = await this.page.evaluate(() => {
          const jobElements = document.querySelectorAll('a[href*="/jobs/view/"]');
          const jobs = [];
          
          console.log(`📊 Encontrados ${jobElements.length} enlaces de empleos`);
          
          for (const element of jobElements) {
            try {
              const link = element.href.split('?')[0];
              
              if (link.includes('/jobs/view/')) {
                // Extraer información usando el método final que funciona
                let title = 'Título no encontrado';
                let company = 'Empresa no especificada';
                let location = 'Ubicación no especificada';
                
                // MÉTODO 1: Extraer título del span.sr-only
                const srOnlySpan = element.querySelector('span.sr-only');
                if (srOnlySpan && srOnlySpan.innerText) {
                  title = srOnlySpan.innerText.trim();
                  console.log(`✅ Título encontrado en sr-only: ${title}`);
                }
                
                // MÉTODO 2: Buscar en el contenedor más grande
                const bigContainer = element.closest('div') || element.parentElement;
                if (bigContainer) {
                  const allText = bigContainer.innerText || '';
                  const textLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                  
                  console.log(`📄 Líneas de texto encontradas:`, textLines);
                  
                  for (let i = 0; i < textLines.length; i++) {
                    const line = textLines[i];
                    
                    if (line === title) continue;
                    
                    if (line.includes('antiguos alumnos') || 
                        line.includes('Publicado') || 
                        line.includes('hace') || 
                        line.includes('semana') ||
                        line.includes('alumnos') ||
                        line.includes('Apply') ||
                        line.includes('Save')) {
                      continue;
                    }
                    
                    if (line.includes(',') || 
                        line.includes('Remote') || 
                        line.includes('Hybrid') ||
                        /\b(USA|United States|New York|California|Texas|Florida|London|Paris|Berlin|Madrid|Bogotá|Mexico|Argentina|Chile|Perú|Remote|Hybrid)\b/i.test(line)) {
                      if (location === 'Ubicación no especificada') {
                        location = line;
                        console.log(`📍 Ubicación encontrada: ${location}`);
                      }
                    } 
                    else if (company === 'Empresa no especificada' && line.length > 2) {
                      company = line;
                      console.log(`🏢 Empresa encontrada: ${company}`);
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
          console.log('\n📋 PRIMEROS 10 EMPLEOS:');
          jobs.slice(0, 10).forEach((job, index) => {
            console.log(`${index + 1}. ${job.title}`);
            console.log(`   Empresa: ${job.company}`);
            console.log(`   Ubicación: ${job.location}`);
            console.log(`   Link: ${job.link}`);
            console.log(`   JobId: ${job.jobId}`);
            console.log('');
          });
        } else {
          console.log('❌ No se encontraron empleos');
          
          // Análisis adicional
          const analysis = await this.page.evaluate(() => {
            const allLinks = document.querySelectorAll('a');
            const jobLinks = Array.from(allLinks).filter(link => 
              link.href && link.href.includes('/jobs/view/')
            );
            
            return {
              totalLinks: allLinks.length,
              jobLinks: jobLinks.length,
              pageContent: document.body.innerText.substring(0, 1000)
            };
          });
          
          console.log('\n🔍 ANÁLISIS DE PÁGINA:');
          console.log(`📄 Total enlaces: ${analysis.totalLinks}`);
          console.log(`💼 Enlaces de empleos: ${analysis.jobLinks}`);
          console.log(`📝 Contenido (primeros 1000 chars): ${analysis.pageContent}`);
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

async function runSpecificTest() {
  const tester = new SpecificURLTest();
  
  try {
    await tester.init();
    await tester.testSpecificURL();
    
    console.log('\n⏳ Esperando 60 segundos para revisión manual...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
  } catch (error) {
    console.error('❌ Error en test específico:', error);
  } finally {
    await tester.close();
  }
}

runSpecificTest();
