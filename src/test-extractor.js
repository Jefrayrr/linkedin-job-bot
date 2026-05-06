const puppeteer = require('puppeteer');

class LinkedInExtractorTest {
  constructor() {
    this.testUrl = 'https://www.linkedin.com/jobs/search/?keywords=(%22Frontend%20Developer%22%20OR%20%22Frontend%20Engineer%22%20OR%20%22Web%20Developer%22%20OR%20%22UI%20Developer%22%20OR%20%22Software%20Engineer%22)%20AND%20(%22React%22%20OR%20%22JavaScript%22%20OR%20%22Angular%22%20OR%20%22Vue%22%20OR%20%22TypeScript%22)%20AND%20(%22Junior%22%20OR%20%22Entry%20Level%22%20OR%20%22Trainee%22%20OR%20%22Intern%22)';
  }

  async init() {
    console.log('🚀 Iniciando test de extractor de LinkedIn...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null
    });

    this.page = await this.browser.newPage();
  }

  async testExtraction() {
    try {
      console.log(`🔗 Navegando a: ${this.testUrl}`);
      
      await this.page.goto(this.testUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      console.log('⏳ Esperando 5 segundos para que cargue...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Hacer scroll
      await this.autoScroll();

      console.log('🔍 Analizando estructura de la página...');
      
      // Analizar la estructura
      const pageAnalysis = await this.page.evaluate(() => {
        console.log('📊 Analizando DOM...');
        
        // Buscar todos los posibles enlaces de empleos
        const allLinks = document.querySelectorAll('a');
        const jobLinks = [];
        const selectorsTested = [];
        
        // Probar diferentes selectores
        const selectors = [
          'a[href*="/jobs/view/"]',
          'a[href*="/jobs/search/results/"]',
          '.job-card-container a',
          '.jobs-search__results-list a',
          '[data-job-id] a',
          '.job-search-card__link-wrapper a',
          '.base-card a',
          '.job-card a',
          '[class*="job-card"] a'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            selectorsTested.push({
              selector: selector,
              count: elements.length,
              sample: elements[0].href
            });
            console.log(`✅ Selector ${selector}: ${elements.length} elementos`);
          }
        }
        
        // Analizar todos los enlaces que contengan "jobs"
        allLinks.forEach(link => {
          if (link.href && (
            link.href.includes('/jobs/view/') || 
            link.href.includes('/jobs/search/') ||
            link.href.includes('linkedin.com/jobs')
          )) {
            jobLinks.push({
              href: link.href,
              text: link.innerText.trim(),
              className: link.className,
              parentClass: link.parentElement?.className
            });
          }
        });
        
        // Buscar contenedores de empleos
        const containers = document.querySelectorAll('[class*="job"], [class*="card"], [class*="result"]');
        
        return {
          totalLinks: allLinks.length,
          jobLinks: jobLinks.length,
          jobLinksSample: jobLinks.slice(0, 5),
          selectorsTested: selectorsTested,
          containersFound: containers.length,
          pageUrl: window.location.href,
          pageTitle: document.title
        };
      });

      console.log('\n📊 ANÁLISIS DE PÁGINA:');
      console.log(`📄 URL: ${pageAnalysis.pageUrl}`);
      console.log(`📝 Título: ${pageAnalysis.pageTitle}`);
      console.log(`🔗 Total enlaces: ${pageAnalysis.totalLinks}`);
      console.log(`💼 Enlaces de empleos: ${pageAnalysis.jobLinks}`);
      console.log(`📦 Contenedores encontrados: ${pageAnalysis.containersFound}`);
      
      console.log('\n🎯 SELECTORES QUE FUNCIONARON:');
      pageAnalysis.selectorsTested.forEach(test => {
        console.log(`✅ ${test.selector}: ${test.count} elementos`);
        console.log(`   Ejemplo: ${test.sample}`);
      });
      
      console.log('\n📋 EJEMPLOS DE ENLACES DE EMPLEOS:');
      pageAnalysis.jobLinksSample.forEach((link, index) => {
        console.log(`${index + 1}. ${link.text}`);
        console.log(`   ${link.href}`);
        console.log(`   Class: ${link.className}`);
        console.log(`   Parent: ${link.parentClass}`);
        console.log('');
      });

      // Intentar extraer empleos con el método actual
      console.log('\n🔍 PROBANDO EXTRACCIÓN ACTUAL...');
      const extractedJobs = await this.page.evaluate(() => {
        const jobElements = document.querySelectorAll('a[href*="/jobs/view/"]');
        const jobs = [];
        
        for (const element of jobElements) {
          try {
            const link = element.href.split('?')[0];
            
            if (link.includes('/jobs/view/')) {
              const titleElement = element.querySelector('h3, .job-card-list__title, [class*="title"]');
              const companyElement = element.querySelector('[class*="company"], [class*="company-name"]');
              const locationElement = element.querySelector('[class*="location"], [class*="job-location"]');
              
              const title = titleElement ? titleElement.innerText.trim() : 'Título no encontrado';
              const company = companyElement ? companyElement.innerText.trim() : 'Empresa no especificada';
              const location = locationElement ? locationElement.innerText.trim() : 'Ubicación no especificada';
              
              const jobIdMatch = link.match(/\/jobs\/view\/(\d+)/);
              const jobId = jobIdMatch ? jobIdMatch[1] : link;
              
              jobs.push({
                jobId: jobId,
                title: title,
                company: company,
                location: location,
                link: link
              });
            }
          } catch (error) {
            console.log('Error extrayendo job individual:', error.message);
          }
        }
        
        return jobs;
      });
      
      console.log(`📊 Empleos extraídos con método actual: ${extractedJobs.length}`);
      
      if (extractedJobs.length > 0) {
        console.log('\n📋 EMPLEOS EXTRAÍDOS:');
        extractedJobs.forEach((job, index) => {
          console.log(`${index + 1}. ${job.title}`);
          console.log(`   Empresa: ${job.company}`);
          console.log(`   Ubicación: ${job.location}`);
          console.log(`   Link: ${job.link}`);
          console.log(`   JobId: ${job.jobId}`);
          console.log('');
        });
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
          const maxAttempts = 10;

          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            attempts++;

            if (totalHeight >= document.body.scrollHeight || attempts >= maxAttempts) {
              clearInterval(timer);
              resolve();
            }
          }, 500);
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
  const tester = new LinkedInExtractorTest();
  
  try {
    await tester.init();
    await tester.testExtraction();
    
    console.log('\n⏳ Esperando 30 segundos para revisión manual...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    await tester.close();
  }
}

runTest();
