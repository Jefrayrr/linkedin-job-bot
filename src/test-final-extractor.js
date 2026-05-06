const puppeteer = require('puppeteer');

class FinalExtractorTest {
  constructor() {
    this.testUrl = 'https://www.linkedin.com/jobs/search/?keywords=(%22Frontend%20Developer%22%20OR%20%22Frontend%20Engineer%22%20OR%20%22Web%20Developer%22%20OR%20%22UI%20Developer%22%20OR%20%22Software%20Engineer%22)%20AND%20(%22React%22%20OR%20%22JavaScript%22%20OR%20%22Angular%22%20OR%20%22Vue%22%20OR%20%22TypeScript%22)%20AND%20(%22Junior%22%20OR%20%22Entry%20Level%22%20OR%20%22Trainee%22%20OR%20%22Intern%22)';
  }

  async init() {
    console.log('🚀 Iniciando extractor final...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    this.page.setDefaultTimeout(60000);
  }

  async testFinalExtractor() {
    try {
      console.log(`🔗 Navegando a: ${this.testUrl}`);
      
      await this.page.goto(this.testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.autoScroll();

      console.log('📋 Extrayendo con método final...');
      
      const jobs = await this.page.evaluate(() => {
        const jobElements = document.querySelectorAll('a[href*="/jobs/view/"]');
        const jobs = [];
        
        console.log(`📊 Encontrados ${jobElements.length} enlaces de empleos`);
        
        for (const element of jobElements) {
          try {
            const link = element.href.split('?')[0];
            
            if (link.includes('/jobs/view/')) {
              // Extraer información usando el método más robusto
              let title = 'Título no encontrado';
              let company = 'Empresa no especificada';
              let location = 'Ubicación no especificada';
              
              // MÉTODO 1: Extraer título del span.sr-only (texto para screen readers)
              const srOnlySpan = element.querySelector('span.sr-only');
              if (srOnlySpan && srOnlySpan.innerText) {
                title = srOnlySpan.innerText.trim();
                console.log(`✅ Título encontrado en sr-only: ${title}`);
              }
              
              // MÉTODO 2: Buscar en el contenedor más grande
              const bigContainer = element.closest('div') || element.parentElement;
              if (bigContainer) {
                // Extraer todo el texto visible del contenedor
                const allText = bigContainer.innerText || '';
                const textLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                
                console.log(`📄 Líneas de texto encontradas:`, textLines);
                
                // Analizar las líneas para encontrar empresa y ubicación
                for (let i = 0; i < textLines.length; i++) {
                  const line = textLines[i];
                  
                  // Ignorar líneas que ya contienen el título
                  if (line === title) continue;
                  
                  // Ignorar líneas con patrones conocidos
                  if (line.includes('antiguos alumnos') || 
                      line.includes('Publicado') || 
                      line.includes('hace') || 
                      line.includes('semana') ||
                      line.includes('alumnos') ||
                      line.includes('Apply') ||
                      line.includes('Save')) {
                    continue;
                  }
                  
                  // Si contiene coma o palabras de ubicación, es ubicación
                  if (line.includes(',') || 
                      line.includes('Remote') || 
                      line.includes('Hybrid') ||
                      /\b(USA|United States|New York|California|Texas|Florida|London|Paris|Berlin|Madrid|Bogotá|Mexico|Argentina|Chile|Perú|Remote|Hybrid)\b/i.test(line)) {
                    if (location === 'Ubicación no especificada') {
                      location = line;
                      console.log(`📍 Ubicación encontrada: ${location}`);
                    }
                  } 
                  // Si no es ubicación y parece empresa, es empresa
                  else if (company === 'Empresa no especificada' && line.length > 2) {
                    company = line;
                    console.log(`🏢 Empresa encontrada: ${company}`);
                  }
                }
              }
              
              // MÉTODO 3: Extraer jobId del link
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
      
    } catch (error) {
      console.error('❌ Error en extractor final:', error);
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

async function runFinalTest() {
  const tester = new FinalExtractorTest();
  
  try {
    await tester.init();
    await tester.testFinalExtractor();
    
    console.log('\n⏳ Esperando 60 segundos para revisión manual...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
  } catch (error) {
    console.error('❌ Error en test final:', error);
  } finally {
    await tester.close();
  }
}

runFinalTest();
