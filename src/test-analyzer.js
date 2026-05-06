const puppeteer = require('puppeteer');

class DOMAnalyzer {
  constructor() {
    this.testUrl = 'https://www.linkedin.com/jobs/search/?keywords=(%22Frontend%20Developer%22%20OR%20%22Frontend%20Engineer%22%20OR%20%22Web%20Developer%22%20OR%20%22UI%20Developer%22%20OR%20%22Software%20Engineer%22)%20AND%20(%22React%22%20OR%20%22JavaScript%22%20OR%20%22Angular%22%20OR%20%22Vue%22%20OR%20%22TypeScript%22)%20AND%20(%22Junior%22%20OR%20%22Entry%20Level%22%20OR%20%22Trainee%22%20OR%20%22Intern%22)';
  }

  async init() {
    console.log('🔍 Iniciando analizador de DOM...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    this.page.setDefaultTimeout(60000);
  }

  async analyzeDOM() {
    try {
      console.log(`🔗 Navegando a: ${this.testUrl}`);
      
      await this.page.goto(this.testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.autoScroll();

      console.log('🔬 Analizando estructura DOM...');
      
      const analysis = await this.page.evaluate(() => {
        const jobElements = document.querySelectorAll('a[href*="/jobs/view/"]');
        console.log(`📊 Total enlaces de empleos: ${jobElements.length}`);
        
        if (jobElements.length === 0) {
          return { error: 'No se encontraron enlaces de empleos' };
        }
        
        // Analizar el primer elemento en detalle
        const firstElement = jobElements[0];
        const container = firstElement.closest('[class*="job"], [class*="card"], div');
        
        if (!container) {
          return { error: 'No se encontró contenedor del empleo' };
        }
        
        // Extraer toda la estructura del contenedor
        const containerHTML = container.outerHTML;
        const allElements = container.querySelectorAll('*');
        const textElements = [];
        
        // Analizar todos los elementos con texto
        for (const elem of allElements) {
          const text = elem.innerText?.trim();
          if (text && text.length > 0) {
            textElements.push({
              tag: elem.tagName,
              className: elem.className,
              text: text,
              id: elem.id
            });
          }
        }
        
        // Buscar patrones específicos
        const patterns = {
          titleSelectors: [],
          companySelectors: [],
          locationSelectors: []
        };
        
        // Encontrar selectores que funcionan
        const testSelectors = [
          'span[class*="_30f0389c"]',
          'p[class*="_12a7eae6"]',
          '[class*="title"]',
          '[class*="company"]',
          '[class*="location"]',
          'h3',
          '.job-card-list__title',
          '.job-card-container__company-name',
          '.job-card-container__metadata-item'
        ];
        
        for (const selector of testSelectors) {
          const elements = container.querySelectorAll(selector);
          if (elements.length > 0) {
            if (selector.includes('title') || selector.includes('_30f0389c')) {
              patterns.titleSelectors.push({
                selector,
                count: elements.length,
                text: elements[0].innerText
              });
            } else if (selector.includes('company')) {
              patterns.companySelectors.push({
                selector,
                count: elements.length,
                text: elements[0].innerText
              });
            } else if (selector.includes('location')) {
              patterns.locationSelectors.push({
                selector,
                count: elements.length,
                text: elements[0].innerText
              });
            }
          }
        }
        
        return {
          containerHTML: containerHTML.substring(0, 1000) + '...',
          textElements: textElements.slice(0, 20),
          patterns: patterns,
          totalJobElements: jobElements.length,
          firstJobLink: firstElement.href
        };
      });
      
      console.log('\n📋 ANÁLISIS DE DOM:');
      console.log(`📊 Total empleos: ${analysis.totalJobElements}`);
      console.log(`🔗 Primer enlace: ${analysis.firstJobLink}`);
      
      console.log('\n🎯 SELECTORES QUE FUNCIONAN:');
      console.log('📝 Título:');
      analysis.patterns.titleSelectors.forEach(sel => {
        console.log(`  ✅ ${sel.selector} (${sel.count} elementos): "${sel.text}"`);
      });
      
      console.log('\n🏢 Empresa:');
      analysis.patterns.companySelectors.forEach(sel => {
        console.log(`  ✅ ${sel.selector} (${sel.count} elementos): "${sel.text}"`);
      });
      
      console.log('\n📍 Ubicación:');
      analysis.patterns.locationSelectors.forEach(sel => {
        console.log(`  ✅ ${sel.selector} (${sel.count} elementos): "${sel.text}"`);
      });
      
      console.log('\n📄 ELEMENTOS DE TEXTO ENCONTRADOS:');
      analysis.textElements.forEach((elem, index) => {
        console.log(`${index + 1}. ${elem.tag}.${elem.className}: "${elem.text}"`);
      });
      
      console.log('\n📦 HTML DEL CONTENEDOR (primeros 1000 chars):');
      console.log(analysis.containerHTML);
      
    } catch (error) {
      console.error('❌ Error en análisis:', error);
    }
  }

  async autoScroll() {
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
          }, 1000);
        });
      });
    } catch (error) {
      console.log('Error en scroll:', error.message);
    }
  }

  async close() {
    await this.browser.close();
  }
}

async function runAnalysis() {
  const analyzer = new DOMAnalyzer();
  
  try {
    await analyzer.init();
    await analyzer.analyzeDOM();
    
    console.log('\n⏳ Esperando 60 segundos para análisis manual...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await analyzer.close();
  }
}

runAnalysis();
