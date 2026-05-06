const puppeteer = require('puppeteer');

class DOMAnalyzer {
  constructor() {
    this.baseUrl = 'https://www.linkedin.com/jobs/search/?keywords=';
  }

  async init() {
    console.log('🔍 Iniciando analizador DOM...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    this.page.setDefaultTimeout(0); // Sin timeout
  }

  async analyzeDOM(query = 'React Developer') {
    try {
      console.log(`🔍 Analizando DOM para: ${query}`);
      
      const url = this.baseUrl + encodeURIComponent(query);
      
      // Navegación sin timeout
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded'
      });

      // Análisis inicial del DOM
      await this.analyzeInitialDOM();
      
      // Análisis de scroll y carga dinámica
      await this.analyzeScrollLoading();
      
      // Análisis final
      await this.analyzeFinalDOM();
      
    } catch (error) {
      console.error('❌ Error en análisis DOM:', error);
    }
  }

  async analyzeInitialDOM() {
    console.log('\n📋 ANÁLISIS INICIAL DEL DOM');
    
    const analysis = await this.page.evaluate(() => {
      const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
      const jobCards = document.querySelectorAll('[class*="job"], [class*="card"], [class*="result"]');
      
      return {
        totalLinks: document.querySelectorAll('a').length,
        jobLinks: jobLinks.length,
        jobCards: jobCards.length,
        pageHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollPosition: window.scrollY,
        jobLinkSample: Array.from(jobLinks).slice(0, 3).map(link => ({
          href: link.href.split('?')[0],
          text: link.innerText.substring(0, 50),
          classes: link.className,
          parentClasses: link.parentElement ? link.parentElement.className : 'no-parent'
        })),
        jobCardClasses: Array.from(jobCards).map(card => card.className).slice(0, 5)
      };
    });
    
    console.log('📊 Datos iniciales:', analysis);
    
    // Buscar contenedores principales
    const containers = await this.page.evaluate(() => {
      const selectors = [
        '.jobs-search__results-list',
        '[class*="results"]',
        '[class*="list"]',
        '[class*="container"]',
        'main',
        '[role="main"]'
      ];
      
      const found = [];
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          found.push({
            selector: selector,
            count: elements.length,
            sample: Array.from(elements).map(el => ({
              height: el.scrollHeight,
              children: el.children.length,
              classes: el.className
            }))[0]
          });
        }
      });
      
      return found;
    });
    
    console.log('📦 Contenedores encontrados:', containers);
  }

  async analyzeScrollLoading() {
    console.log('\n📜 ANÁLISIS DE CARGA POR SCROLL');
    
    let lastHeight = 0;
    let scrollCount = 0;
    let noChangeCount = 0;
    const maxNoChange = 5;
    
    while (scrollCount < 20 && noChangeCount < maxNoChange) {
      scrollCount++;
      
      // Scroll al final
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Esperar un poco para que cargue
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Analizar estado actual
      const currentAnalysis = await this.page.evaluate(() => {
        const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
        return {
          jobLinks: jobLinks.length,
          pageHeight: document.body.scrollHeight,
          scrollPosition: window.scrollY,
          loadingElements: document.querySelectorAll('[class*="loading"], [class*="spinner"], .skeleton').length
        };
      });
      
      console.log(`📊 Scroll ${scrollCount}:`, currentAnalysis);
      
      // Verificar si cambió algo
      if (currentAnalysis.pageHeight === lastHeight) {
        noChangeCount++;
        console.log(`⚠️ Sin cambios en altura (${noChangeCount}/${maxNoChange})`);
      } else {
        noChangeCount = 0;
        lastHeight = currentAnalysis.pageHeight;
        console.log(`✅ Altura cambió a: ${currentAnalysis.pageHeight}px`);
      }
      
      // Si hay elementos de carga, esperar más
      if (currentAnalysis.loadingElements > 0) {
        console.log(`⏳ Hay ${currentAnalysis.loadingElements} elementos de carga, esperando...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`🏁 Scroll completado después de ${scrollCount} intentos`);
  }

  async analyzeFinalDOM() {
    console.log('\n📋 ANÁLISIS FINAL DEL DOM');
    
    const finalAnalysis = await this.page.evaluate(() => {
      const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
      
      // Analizar estructura de los links
      const linkAnalysis = Array.from(jobLinks).slice(0, 10).map(link => {
        const parent = link.closest('[class*="job"], [class*="card"], [class*="result"]');
        return {
          href: link.href.split('?')[0],
          text: link.innerText.substring(0, 100),
          classes: link.className,
          parentClasses: parent ? parent.className : 'no-parent',
          parentTag: parent ? parent.tagName : 'no-parent',
          depth: this.getDepth(link)
        };
      });
      
      // Buscar patrones de paginación
      const pagination = document.querySelectorAll('[class*="pagination"], [class*="page"], [class*="next"], [class*="more"]');
      
      return {
        totalJobLinks: jobLinks.length,
        uniqueLinks: [...new Set(Array.from(jobLinks).map(link => link.href.split('?')[0]))].length,
        linkAnalysis: linkAnalysis,
        paginationElements: pagination.length,
        paginationClasses: Array.from(pagination).map(el => el.className),
        finalPageHeight: document.body.scrollHeight,
        hasLoadMoreButton: document.querySelectorAll('[class*="load-more"], button:contains("More")').length
      };
    });
    
    console.log('📊 Análisis final:', finalAnalysis);
    
    // Extraer algunos links de ejemplo
    const sampleLinks = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
        .slice(0, 5)
        .map(link => link.href.split('?')[0]);
    });
    
    console.log('🔗 Links de ejemplo:', sampleLinks);
  }

  async getDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentElement) {
      depth++;
      current = current.parentElement;
      if (depth > 10) break;
    }
    return depth;
  }

  async close() {
    await this.browser.close();
  }
}

async function runDOMAnalysis() {
  const analyzer = new DOMAnalyzer();
  
  try {
    await analyzer.init();
    await analyzer.analyzeDOM('React Developer');
    
    console.log('\n⏳ Esperando 30 segundos para revisión manual...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('❌ Error en análisis:', error);
  } finally {
    await analyzer.close();
  }
}

runDOMAnalysis();
