const puppeteer = require('puppeteer');

class DOMAnalyzerLogged {
  constructor() {
    this.baseUrl = 'https://www.linkedin.com/jobs/search/?keywords=';
  }

  async init() {
    console.log('🔍 Iniciando analizador DOM con sesión...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir: '../data/browser-profile', // Usar perfil persistente
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    this.page.setDefaultTimeout(0); // Sin timeout
  }

  async analyzeWithSession(query = 'React Developer') {
    try {
      console.log(`🔍 Analizando DOM con sesión para: ${query}`);
      
      // Primero verificar si ya estamos logueados
      await this.page.goto('https://www.linkedin.com', {
        waitUntil: 'domcontentloaded'
      });

      await this.page.waitForTimeout(3000);

      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('button[aria-label="Sign in"]') && 
               !document.querySelector('.login__form') &&
               window.location.href.includes('linkedin.com/feed');
      });

      console.log(`🔐 ¿Está logueado? ${isLoggedIn}`);

      if (!isLoggedIn) {
        console.log('⚠️ No hay sesión activa. Por favor inicia sesión manualmente.');
        console.log('⏳ Esperando 60 segundos para que inicies sesión...');
        
        // Esperar a que el usuario inicie sesión manualmente
        await this.page.waitForTimeout(60000);
        
        // Verificar de nuevo
        const stillNotLoggedIn = await this.page.evaluate(() => {
          return document.querySelector('button[aria-label="Sign in"]') || 
                 document.querySelector('.login__form');
        });

        if (stillNotLoggedIn) {
          console.log('❌ Sigue sin sesión. Abortando análisis.');
          return;
        }
      }

      // Ahora ir a la búsqueda de jobs
      console.log('🔗 Navegando a LinkedIn Jobs...');
      await this.page.goto('https://www.linkedin.com/jobs/', {
        waitUntil: 'domcontentloaded'
      });

      await this.page.waitForTimeout(3000);

      // Hacer la búsqueda específica
      const searchUrl = this.baseUrl + encodeURIComponent(query);
      console.log(`🔍 Buscando: ${searchUrl}`);
      
      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded'
      });

      await this.page.waitForTimeout(5000);

      // Análisis completo del DOM con sesión
      await this.analyzeDOMWithSession();
      
    } catch (error) {
      console.error('❌ Error en análisis DOM con sesión:', error);
    }
  }

  async analyzeDOMWithSession() {
    console.log('\n📋 ANÁLISIS DOM CON SESIÓN ACTIVA');
    
    const analysis = await this.page.evaluate(() => {
      const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
      const jobCards = document.querySelectorAll('[class*="job"], [class*="card"], [class*="result"]');
      
      // Buscar botones de "Load more" o paginación
      const loadMoreButtons = document.querySelectorAll('button[class*="load-more"], button[class*="show-more"], [aria-label*="more"], [aria-label*="Load"]');
      const paginationButtons = document.querySelectorAll('[class*="pagination"] button, [class*="page"] button');
      
      return {
        totalLinks: document.querySelectorAll('a').length,
        jobLinks: jobLinks.length,
        jobCards: jobCards.length,
        pageHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollPosition: window.scrollY,
        loadMoreButtons: loadMoreButtons.length,
        paginationButtons: paginationButtons.length,
        loadMoreText: Array.from(loadMoreButtons).map(btn => btn.innerText),
        paginationText: Array.from(paginationButtons).map(btn => btn.innerText),
        jobLinkSample: Array.from(jobLinks).slice(0, 5).map(link => ({
          href: link.href.split('?')[0],
          text: link.innerText.substring(0, 50),
          classes: link.className,
          parentClasses: link.parentElement ? link.parentElement.className : 'no-parent'
        })),
        jobCardClasses: Array.from(jobCards).map(card => card.className).slice(0, 10)
      };
    });
    
    console.log('📊 Datos con sesión:', analysis);
    
    // Buscar contenedores principales con sesión
    const containers = await this.page.evaluate(() => {
      const selectors = [
        '.jobs-search__results-list',
        '[class*="results"]',
        '[class*="list"]',
        '[class*="container"]',
        'main',
        '[role="main"]',
        '.jobs-search-two-pane__results',
        '[class*="two-pane"]'
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
    
    console.log('📦 Contenedores con sesión:', containers);
    
    // Análisis de scroll y carga dinámica con sesión
    await this.analyzeScrollWithSession();
  }

  async analyzeScrollWithSession() {
    console.log('\n📜 ANÁLISIS DE SCROLL CON SESIÓN');
    
    let lastJobCount = 0;
    let lastHeight = 0;
    let noProgressCount = 0;
    const maxNoProgress = 5;
    let scrollCount = 0;
    
    while (scrollCount < 10 && noProgressCount < maxNoProgress) {
      scrollCount++;
      
      // Scroll al final
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Esperar carga dinámica
      await this.page.waitForTimeout(3000);
      
      // Analizar estado actual
      const currentAnalysis = await this.page.evaluate(() => {
        const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
        const loadMoreButtons = document.querySelectorAll('button[class*="load-more"], button[class*="show-more"]');
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], .skeleton');
        
        return {
          jobLinks: jobLinks.length,
          pageHeight: document.body.scrollHeight,
          scrollPosition: window.scrollY,
          loadMoreButtons: loadMoreButtons.length,
          loadMoreButtonText: Array.from(loadMoreButtons).map(btn => btn.innerText).join(', '),
          loadingElements: loadingElements.length
        };
      });
      
      console.log(`📊 Scroll ${scrollCount} con sesión:`, currentAnalysis);
      
      // Verificar si cambió algo
      const jobProgress = currentAnalysis.jobLinks - lastJobCount;
      const heightProgress = currentAnalysis.pageHeight - lastHeight;
      
      if (jobProgress > 0 || heightProgress > 0) {
        console.log(`✅ Progreso detectado: +${jobProgress} jobs, +${heightProgress}px altura`);
        noProgressCount = 0;
        lastJobCount = currentAnalysis.jobLinks;
        lastHeight = currentAnalysis.pageHeight;
      } else {
        noProgressCount++;
        console.log(`⚠️ Sin progreso (${noProgressCount}/${maxNoProgress})`);
      }
      
      // Si hay botones de "Load more", intentar hacerles clic
      if (currentAnalysis.loadMoreButtons > 0) {
        console.log(`🔄 Hay ${currentAnalysis.loadMoreButtons} botones de "Load more": ${currentAnalysis.loadMoreButtonText}`);
        
        try {
          await this.page.evaluate(() => {
            const loadMoreBtn = document.querySelector('button[class*="load-more"], button[class*="show-more"]');
            if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
              loadMoreBtn.click();
            }
          });
          
          await this.page.waitForTimeout(3000);
          
          // Verificar si se cargaron más jobs
          const afterClick = await this.page.evaluate(() => {
            return document.querySelectorAll('a[href*="/jobs/view/"]').length;
          });
          
          if (afterClick > lastJobCount) {
            console.log(`✅ Load more funcionó: ${afterClick - lastJobCount} nuevos jobs`);
            noProgressCount = 0;
            lastJobCount = afterClick;
          }
        } catch (error) {
          console.log('❌ Error haciendo clic en Load more:', error.message);
        }
      }
    }
    
    console.log(`🏁 Scroll con sesión completado después de ${scrollCount} intentos`);
    
    // Análisis final
    await this.finalAnalysisWithSession();
  }

  async finalAnalysisWithSession() {
    console.log('\n📋 ANÁLISIS FINAL CON SESIÓN');
    
    const finalAnalysis = await this.page.evaluate(() => {
      const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
      
      return {
        totalJobLinks: jobLinks.length,
        uniqueLinks: [...new Set(Array.from(jobLinks).map(link => link.href.split('?')[0]))].length,
        finalPageHeight: document.body.scrollHeight,
        hasLoadMoreButton: document.querySelectorAll('button[class*="load-more"], button[class*="show-more"]').length,
        hasPagination: document.querySelectorAll('[class*="pagination"] button, [class*="page"] button').length
      };
    });
    
    console.log('📊 Análisis final con sesión:', finalAnalysis);
    
    // Extraer links de ejemplo
    const sampleLinks = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
        .slice(0, 10)
        .map(link => link.href.split('?')[0]);
    });
    
    console.log('🔗 Primeros 10 links con sesión:', sampleLinks);
  }

  async close() {
    await this.browser.close();
  }
}

async function runDOMAnalysisWithSession() {
  const analyzer = new DOMAnalyzerLogged();
  
  try {
    await analyzer.init();
    await analyzer.analyzeWithSession('React Developer');
    
    console.log('\n⏳ Esperando 60 segundos para revisión manual...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
  } catch (error) {
    console.error('❌ Error en análisis con sesión:', error);
  } finally {
    await analyzer.close();
  }
}

runDOMAnalysisWithSession();
