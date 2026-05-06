const puppeteer = require('puppeteer');
const AdvancedJobScorer = require('../scoring/AdvancedJobScorer');
const fs = require('fs');
const path = require('path');

class LinkedInScraper {
  constructor(page, jobStateManager = null) {
    this.page = page;
    this.jobStateManager = jobStateManager;
    this.jobScorer = null;
    this.userProfile = null;
    
    this.queries = [
      'Frontend Developer', 
      'Full Stack Developer',
      'Backend Developer'
    ];
    
    // Inicializar el sistema de scoring
    this.initializeScoring();
  }

  /**
   * Inicializar el sistema de scoring con el perfil del usuario
   */
  initializeScoring() {
    try {
      // Cargar perfil del usuario
      const userProfilePath = path.join(__dirname, '../../data/userProfile.json');
      if (fs.existsSync(userProfilePath)) {
        this.userProfile = JSON.parse(fs.readFileSync(userProfilePath, 'utf8'));
        console.log('✅ Perfil de usuario cargado para scoring');
      } else {
        console.log('⚠️ No se encontró perfil de usuario, usando valores por defecto');
        this.userProfile = this.getDefaultUserProfile();
      }

      // Inicializar el scorer - userProfile contiene CV y preferencias
      this.jobScorer = new AdvancedJobScorer(this.userProfile, this.userProfile);
      console.log('✅ Sistema de scoring inicializado');
    } catch (error) {
      console.error('❌ Error inicializando scoring:', error);
      this.userProfile = this.getDefaultUserProfile();
      this.jobScorer = new AdvancedJobScorer(this.userProfile, this.userProfile);
    }
  }

  /**
   * Perfil de usuario por defecto
   */
  getDefaultUserProfile() {
    return {
      personalInfo: {
        name: "Usuario",
        title: "Desarrollador de Software",
        location: "Bogotá, Colombia"
      },
      experience: [
        {
          company: "Empresa",
          role: "Desarrollador",
          duration: "2 años",
          skills: ["javascript", "react", "node.js"],
          achievements: ["Desarrollo de aplicaciones web"]
        }
      ],
      skills: {
        technical: ["javascript", "react", "node.js", "html", "css"],
        soft: ["trabajo en equipo", "resolución de problemas"]
      },
      preferences: {
        locations: ["Bogotá", "remoto"],
        salary: 5000000,
        workTypes: ["full-time", "remoto"]
      }
    };
  }

  async performAllSearches() {
    console.log('🔍 INICIANDO BÚSQUEDA CON SCORING');

    // Verificar sesión de LinkedIn solo una vez al inicio
    await this.ensureLinkedInSession();

    let allJobs = [];

    const searchRounds = [
      {
        label: 'Bogotá (remoto + híbrido)',
        geoId: '102361989',
        workTypes: '2,3'
      },
      {
        label: 'Colombia sin Bogotá (solo remoto)',
        geoId: '100876405', // GeoID de Colombia
        workTypes: '2'
      }
    ];

    for (const round of searchRounds) {
      console.log(`\n📍 ${round.label}`);

      for (const query of this.queries) {
        console.log(`\n🔍 ${query}`);

        const jobs = await this.searchAndScore(query, round);
        allJobs.push(...jobs);

        await this.delay(4000);
      }
    }

    // Eliminar duplicados basados en el link del empleo
    const uniqueJobs = this.deduplicateJobs(allJobs);

    console.log(`\n📊 Total: ${allJobs.length}`);
    console.log(`✅ Únicos: ${uniqueJobs.length}`);

    // Mostrar resumen de scoring
    this.showScoringSummary(uniqueJobs);

    return uniqueJobs;
  }

  buildSearchURL(query, { geoId, workTypes }) {
    const baseUrl = 'https://www.linkedin.com/jobs/search/';

    const params = new URLSearchParams({
      geoId,
      keywords: query,
      origin: 'JOB_SEARCH_PAGE_LOCATION_HISTORY',
      refresh: true,
      f_WT: workTypes  // '2,3' o '2'
    });

    return `${baseUrl}?${params.toString()}`;
  }

  async searchAndScore(query, roundOptions) {
    // Construir URL con parámetros dinámicos
    const url = this.buildSearchURL(query, roundOptions);
    console.log(`🔗 Navegando a: ${url}`);

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded'
    });

    await this.delay(5000);

    // Analizar DOM actual para entender la estructura
    await this.analyzeCurrentDOM();

    // Scroll inteligente con detección de Load More
    await this.smartScrollWithLoadMore();

    // Extraer datos completos de los empleos
    const jobs = await this.extractJobsWithDetails();
    console.log(`📊 Empleos extraídos para "${query}": ${jobs.length}`);

    // Calificar cada empleo
    const scoredJobs = [];
    for (const job of jobs) {
      try {
        console.log(`🎯 Calificando: ${job.title}`);
        
        // Primero hacer scoring rápido con snippet para gate-pass
        const quickScoreResult = await this.jobScorer.scoreJob(job.description, {
          title: job.title,
          company: job.company,
          location: job.location
        });
        
        // Si pasa el gate-pass, extraer descripción completa para scoring preciso
        let finalScoreResult = quickScoreResult;
        let fullDescription = null;
        
        if (!quickScoreResult.rejected) {
          console.log(`📄 Extrayendo descripción completa para: ${job.title}`);
          fullDescription = await this.extractFullJobDescription(job.link);
          if (fullDescription) {
            // Re-calcular con descripción completa
            finalScoreResult = await this.jobScorer.scoreJob(fullDescription, {
              title: job.title,
              company: job.company,
              location: job.location
            });
            console.log(`✅ Scoring actualizado con descripción completa`);
          }
        }

        const scoredJob = {
          ...job,
          description: fullDescription || job.description,
          scoring: finalScoreResult,
          extractedAt: new Date().toISOString(),
          searchQuery: query,
          searchRound: roundOptions.label
        };

        scoredJobs.push(scoredJob);
        
        // Mostrar resultado del scoring
        const status = finalScoreResult.rejected ? '❌ RECHAZADO' : '✅ APROBADO';
        console.log(`${status} - Score: ${finalScoreResult.score.toFixed(2)}/5.0 (${finalScoreResult.grade})`);
        
        if (finalScoreResult.rejected) {
          console.log(`   Motivo: ${finalScoreResult.reason}`);
        }
      } catch (error) {
        console.error(`❌ Error calificando empleo "${job.title}":`, error.message);
        // Agregar empleo sin scoring si hay error
        scoredJobs.push({
          ...job,
          scoring: { rejected: true, reason: 'Error en scoring', score: 0, grade: 'F' },
          extractedAt: new Date().toISOString(),
          searchQuery: query,
          searchRound: roundOptions.label
        });
      }
    }

    return scoredJobs;
  }

  /**
   * Extraer datos completos de los empleos (no solo links)
   */
  async extractJobsWithDetails() {
    const jobs = await this.page.evaluate(() => {
      const jobElements = document.querySelectorAll('a[href*="/jobs/view/"]');
      const jobs = [];

      jobElements.forEach((element, index) => {
        try {
          const link = element.href.split('?')[0];
          if (!link.includes('/jobs/view/')) return;

          // Extraer título - limpiar duplicados
          const titleElement = element.querySelector('.job-card-list__title') || 
                              element.querySelector('.base-job-card__title') ||
                              element;
          let rawTitle = titleElement.textContent.trim();
          // Eliminar duplicados (ej: "Frontend DeveloperFrontend Developer")
          const title = rawTitle.replace(/^(.+?)\1+$/, '$1').trim();

          // Extraer empresa
          const companyElement = element.closest('.job-card-container')?.querySelector('.job-card-container__company-name') ||
                                 element.closest('.base-job-card')?.querySelector('.base-job-card__company-name') ||
                                 element.querySelector('[data-field="companyName"]');
          const company = companyElement ? companyElement.textContent.trim() : 'Empresa no especificada';

          // Extraer ubicación
          const locationElement = element.closest('.job-card-container')?.querySelector('.job-card-container__metadata-item') ||
                                  element.closest('.base-job-card')?.querySelector('.base-job-card__location') ||
                                  element.querySelector('[data-field="location"]');
          const location = locationElement ? locationElement.textContent.trim() : 'Ubicación no especificada';

          // Extraer descripción parcial si está disponible
          const descriptionElement = element.closest('.job-card-container')?.querySelector('.job-card-container__snippet') ||
                                     element.closest('.base-job-card')?.querySelector('.base-job-card__snippet');
          const description = descriptionElement ? descriptionElement.textContent.trim() : '';

          jobs.push({
            link,
            title,
            company,
            location,
            description,
            index
          });
        } catch (error) {
          console.error('Error extrayendo empleo:', error);
        }
      });

      return jobs;
    });

    // Eliminar duplicados basados en el link
    const uniqueJobs = jobs.filter((job, index, self) => 
      index === self.findIndex(j => j.link === job.link)
    );

    return uniqueJobs;
  }

  /**
   * Extraer descripción completa de un job específico
   */
  async extractFullJobDescription(jobUrl) {
    try {
      console.log(`📄 Extrayendo descripción completa de: ${jobUrl}`);
      
      // Abrir nueva pestaña para no perder la página de búsqueda
      const newPage = await this.page.browser().newPage();
      await newPage.goto(jobUrl, { waitUntil: 'domcontentloaded' });
      await this.delay(2000);
      
      // Extraer descripción completa
      const description = await newPage.evaluate(() => {
        // Múltiples selectores para encontrar la descripción
        const descSelectors = [
          '.description__text',
          '.jobs-description__content',
          '[data-field="description"]',
          '.show-more-less-html__markup',
          '.job-description',
          '.jobs-box__html-content'
        ];
        
        for (const selector of descSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
        
        // Fallback: buscar cualquier texto largo que parezca descripción
        const allTextElements = document.querySelectorAll('div, section, article');
        for (const element of allTextElements) {
          const text = element.textContent.trim();
          if (text.length > 200 && !text.includes('Aplicar ahora') && 
              !text.includes('Save job') && !text.includes('Share')) {
            return text;
          }
        }
        
        return '';
      });
      
      await newPage.close();
      return description;
    } catch (error) {
      console.error('❌ Error extrayendo descripción completa:', error);
      return '';
    }
  }

  /**
   * Eliminar empleos duplicados basados en el link
   */
  deduplicateJobs(jobs) {
    const seen = new Set();
    return jobs.filter(job => {
      if (seen.has(job.link)) {
        return false;
      }
      seen.add(job.link);
      return true;
    });
  }

  /**
   * Mostrar resumen de scoring
   */
  showScoringSummary(jobs) {
    const approved = jobs.filter(job => !job.scoring.rejected);
    const rejected = jobs.filter(job => job.scoring.rejected);
    
    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    approved.forEach(job => {
      grades[job.scoring.grade]++;
    });

    console.log('\n📊 === RESUMEN DE SCORING ===');
    console.log(`✅ Aprobados: ${approved.length} (${(approved.length/jobs.length*100).toFixed(1)}%)`);
    console.log(`❌ Rechazados: ${rejected.length} (${(rejected.length/jobs.length*100).toFixed(1)}%)`);
    console.log('\n📈 Calificaciones de aprobados:');
    Object.entries(grades).forEach(([grade, count]) => {
      if (count > 0) {
        console.log(`   Grade ${grade}: ${count} empleos`);
      }
    });

    // Mostrar top 5 empleos mejor calificados
    const topJobs = approved
      .sort((a, b) => b.scoring.score - a.scoring.score)
      .slice(0, 5);

    if (topJobs.length > 0) {
      console.log('\n🏆 TOP 5 EMPLEOS MEJOR CALIFICADOS:');
      topJobs.forEach((job, index) => {
        console.log(`${index + 1}. ${job.title} - ${job.company}`);
        console.log(`   Score: ${job.scoring.score.toFixed(2)}/5.0 (${job.scoring.grade})`);
        console.log(`   Ubicación: ${job.location}`);
        console.log('');
      });
    }
  }

  async ensureLinkedInSession() {
    console.log('🔐 Verificando sesión de LinkedIn...');
    
    // Ir a la página principal de LinkedIn
    await this.page.goto('https://www.linkedin.com', {
      waitUntil: 'domcontentloaded'
    });
    
    await this.delay(3000);
    
    // Verificar si estamos logueados
    const isLoggedIn = await this.page.evaluate(() => {
      return !document.querySelector('button[aria-label="Sign in"]') && 
             !document.querySelector('.login__form') &&
             window.location.href.includes('linkedin.com/feed');
    });
    
    console.log(`🔐 ¿Está logueado? ${isLoggedIn}`);
    
    if (!isLoggedIn) {
      console.log('⚠️ No hay sesión activa. Esperando login manual...');
      console.log('⏳ Por favor inicia sesión en LinkedIn. Esperando 60 segundos...');
      
      // Esperar a que el usuario inicie sesión manualmente
      await this.delay(60000);
      
      // Verificar de nuevo
      const stillNotLoggedIn = await this.page.evaluate(() => {
        return document.querySelector('button[aria-label="Sign in"]') || 
               document.querySelector('.login__form');
      });

      if (stillNotLoggedIn) {
        console.log('❌ Sigue sin sesión. Continuando sin login...');
      } else {
        console.log('✅ Sesión iniciada exitosamente');
      }
    }
  }

  async analyzeCurrentDOM() {
    console.log('\n📋 ANÁLISIS DEL DOM ACTUAL');
    
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
        jobLinkSample: Array.from(jobLinks).slice(0, 3).map(link => ({
          href: link.href.split('?')[0],
          text: link.innerText.substring(0, 50),
          classes: link.className,
          parentClasses: link.parentElement ? link.parentElement.className : 'no-parent'
        }))
      };
    });
    
    console.log('📊 Datos del DOM actual:', analysis);
  }

  async smartScrollWithLoadMore() {
    console.log('\n📜 Scroll inteligente con detección de Load More...');
    
    let lastJobCount = 0;
    let scrollCount = 0;
    const maxScrolls = 20;
    
    while (scrollCount < maxScrolls) {
      scrollCount++;
      
      // Scroll al final
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Esperar carga dinámica
      await this.delay(3000);
      
      // Analizar estado actual
      const currentState = await this.page.evaluate(() => {
        const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
        const loadMoreButtons = document.querySelectorAll('button[class*="load-more"], button[class*="show-more"], [aria-label*="more"]');
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], .skeleton');
        
        return {
          jobCount: jobLinks.length,
          pageHeight: document.body.scrollHeight,
          loadMoreButtons: loadMoreButtons.length,
          loadMoreButtonText: Array.from(loadMoreButtons).map(btn => btn.innerText).join(', '),
          loadingElements: loadingElements.length
        };
      });
      
      console.log(`📊 Scroll ${scrollCount}: ${currentState.jobCount} jobs, Load More: ${currentState.loadMoreButtons}, Loading: ${currentState.loadingElements}`);
      
      // Verificar si hay progreso
      const jobProgress = currentState.jobCount - lastJobCount;
      
      if (jobProgress > 0) {
        console.log(`✅ Progreso detectado: +${jobProgress} jobs`);
        lastJobCount = currentState.jobCount;
      }
      
      // Si hay botones de "Load More", intentar hacerles clic
      if (currentState.loadMoreButtons > 0) {
        console.log(`🔄 Hay botones Load More: ${currentState.loadMoreButtonText}`);
        
        try {
          const clicked = await this.page.evaluate(() => {
            const loadMoreBtn = document.querySelector('button[class*="load-more"], button[class*="show-more"], [aria-label*="more"]');
            if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
              loadMoreBtn.click();
              return true;
            }
            return false;
          });
          
          if (clicked) {
            await this.delay(3000);
            
            // Verificar si se cargaron más jobs
            const afterClick = await this.page.evaluate(() => {
              return document.querySelectorAll('a[href*="/jobs/view/"]').length;
            });
            
            if (afterClick > lastJobCount) {
              console.log(`✅ Load More funcionó: ${afterClick - lastJobCount} nuevos jobs`);
              lastJobCount = afterClick;
            }
          }
        } catch (error) {
          console.log('❌ Error haciendo clic en Load More:', error.message);
        }
      } else {
        // Si no hay botones Load More, verificar si hay más contenido
        const isAtBottom = await this.page.evaluate(() => {
          return window.scrollY + window.innerHeight >= document.body.scrollHeight - 100;
        });
        
        if (isAtBottom && jobProgress === 0) {
          console.log('🏁 Llegamos al final sin más contenido');
          break;
        }
      }
    }
    
    console.log(`✅ Scroll completado después de ${scrollCount} intentos. Total final: ${lastJobCount} jobs`);
  }

  delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = LinkedInScraper;
