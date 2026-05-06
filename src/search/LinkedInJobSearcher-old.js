const puppeteer = require('puppeteer');

class LinkedInJobSearcher {
  constructor(page, jobStateManager) {
    this.page = page;
    this.jobStateManager = jobStateManager;

    this.baseUrl = 'https://www.linkedin.com/jobs/search/?keywords=';

    this.queries = [
      // FRONTEND
      '("React Developer" OR "Frontend Developer") AND (JavaScript OR React) AND (Junior OR "Entry Level" OR Trainee)',

      // FULLSTACK
      '("Full Stack Developer" OR "Software Developer") AND (JavaScript OR "Node.js" OR React) AND (Junior OR "Entry Level" OR Trainee)',

      // BACKEND
      '("Backend Developer" OR "Node.js Developer") AND ("Node.js" OR JavaScript OR API) AND (Junior OR "Entry Level" OR Trainee)'
    ];
  }

  async performAllSearches() {
    console.log('🔍 INICIANDO BÚSQUEDA');
    
    let allLinks = [];

    for (const query of this.queries) {
      console.log(`\n� ${query}`);

      const links = await this.searchJobs(query);
      allLinks.push(...links);

      await this.delay(3000);
    }

    const uniqueLinks = [...new Set(allLinks)];

    console.log(`\n Total: ${allLinks.length}`);
    console.log(`✅ Únicos: ${uniqueLinks.length}`);

    return uniqueLinks;
  }

  async searchJobs(query) {
    try {
      const url = this.buildUrl(query);

      console.log(`🌐 ${url}`);

      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await this.delay(5000);

      await this.autoScroll();

      const links = await this.extractLinks();

      console.log(`✅ ${links.length} encontrados`);

      return links;

    } catch (error) {
      console.error('❌ Error en searchJobs:', error.message);
      return [];
    }
  }

  async extractJobsFromPage(query) {
    try {
      console.log('📋 Extrayendo empleos de la página...');
      
      const jobs = await this.page.evaluate(() => {
        const jobs = [];
        
        // Múltiples selectores para encontrar empleos en LinkedIn
        const jobSelectors = [
          'a[href*="/jobs/view/"]',
          'a[href*="/jobs/search/results/"]',
          '.job-card-container a',
          '.jobs-search__results-list a',
          '[data-job-id] a',
          '.job-search-card__link-wrapper a'
        ];
        
        let jobElements = [];
        
        // Intentar con cada selector hasta encontrar elementos
        for (const selector of jobSelectors) {
          jobElements = document.querySelectorAll(selector);
          if (jobElements.length > 0) {
            console.log(`✅ Encontrados ${jobElements.length} elementos con selector: ${selector}`);
            break;
          }
        }
        
        console.log(`📊 Total elementos encontrados: ${jobElements.length}`);
        
        for (const element of jobElements) {
          try {
            const link = element.href || element.getAttribute('href') || '';
            if (!link) continue;
            
            const cleanLink = link.split('?')[0]; // limpiar parámetros
            
            // Verificar si es un link de empleo válido
            if (cleanLink.includes('/jobs/view/') || cleanLink.includes('/jobs/search/results/')) {
              // Extraer información básica del empleo - basado en la estructura real de LinkedIn
              let title = 'Título no encontrado';
              let company = 'Empresa no especificada';
              let location = 'Ubicación no especificada';
              
              // Buscar en el contenedor del empleo (estructura actual de LinkedIn)
              const jobContainer = element.closest('[class*="_84e51078"], [class*="ec5425c9"], [class*="job-card"], [class*="card"]');
              
              if (jobContainer) {
                // MÉTODO 1: Extraer título del span.sr-only (texto para screen readers)
                const srOnlySpan = element.querySelector('span.sr-only');
                if (srOnlySpan && srOnlySpan.innerText) {
                  title = srOnlySpan.innerText.trim();
                }
                
                // MÉTODO 2: Buscar en el contenedor más grande
                const bigContainer = element.closest('div') || element.parentElement;
                if (bigContainer) {
                  // Extraer todo el texto visible del contenedor
                  const allText = bigContainer.innerText || '';
                  const textLines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                  
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
                      }
                    } 
                    // Si no es ubicación y parece empresa, es empresa
                    else if (company === 'Empresa no especificada' && line.length > 2) {
                      company = line;
                    }
                  }
                }
                
                // MÉTODO 3: Fallback con selectores específicos
                if (company === 'Empresa no especificada') {
                  const companyElement = jobContainer.querySelector('[class*="company"], [class*="company-name"], [class*="primary"]');
                  if (companyElement) {
                    company = companyElement.innerText.trim();
                  }
                }
                
                if (location === 'Ubicación no especificada') {
                  const locationElement = jobContainer.querySelector('[class*="location"], [class*="job-location"], [class*="metadata"]');
                  if (locationElement) {
                    location = locationElement.innerText.trim();
                  }
                }
              }
              
              // Último fallback: usar el texto del elemento original
              if (title === 'Título no encontrado') {
                title = element.innerText.trim() || element.getAttribute('aria-label') || element.getAttribute('title');
              }
              
              // Extraer jobId del link
              const jobIdMatch = cleanLink.match(/\/jobs\/view\/(\d+)/);
              const jobId = jobIdMatch ? jobIdMatch[1] : 
                           element.getAttribute('data-job-id') || 
                           cleanLink;
              
              // Extraer tiempo de publicación si está disponible
              const timeElement = element.querySelector('[class*="time"], .job-card-list__time, .base-search-card__time');
              const postedTime = timeElement ? timeElement.innerText.trim() : 'Reciente';
              
              jobs.push({
                jobId: jobId,
                title: title,
                company: company,
                location: location,
                link: cleanLink,
                postedTime: postedTime,
                searchQuery: window.currentQuery || query || 'No especificada',
                source: 'LinkedIn',
                extractedAt: new Date().toISOString()
              });
            }
          } catch (error) {
            console.log('Error extrayendo job individual:', error.message);
          }
        }
        
        return jobs;
      });
      
      console.log(`📊 Extraídos ${jobs.length} empleos de la página actual`);
      return jobs;
      
    } catch (error) {
      console.error('Error extrayendo empleos:', error.message);
      return [];
    }
  }

  async autoScroll() {
    console.log('📜 Haciendo scroll para cargar todos los resultados...');
    
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

  removeDuplicates(jobs) {
    const seen = new Set();
    return jobs.filter(job => {
      const key = job.jobId;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async saveJobsToState(jobs) {
    console.log('💾 Guardando empleos en el sistema de estado...');
    
    for (const job of jobs) {
      try {
        // Verificar si ya existe
        if (!this.jobStateManager.processedJobs.has(job.jobId)) {
          // Agregar al estado
          this.jobStateManager.addProcessedJob(job);
          
          // Aplicar scoring si está disponible
          if (typeof advancedScorer !== 'undefined' && advancedScorer) {
            const score = advancedScorer.calculateScore(job);
            job.score = score;
            job.recommendations = score.recommendations;
            console.log(`📊 Scoring para ${job.title}: ${score.totalScore} (${score.level})`);
          }
        }
      } catch (error) {
        console.error(`Error guardando job ${job.jobId}:`, error.message);
      }
    }
    
    // Guardar estado
    await this.jobStateManager.saveState();
    console.log('✅ Empleos guardados exitosamente');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LinkedInJobSearcher;
