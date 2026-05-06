const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

// Importar componentes del pipeline
const JobStateManager = require('./state/JobStateManager');
const JobSearchEngine = require('./search/JobSearchEngine');
const JobDataExtractor = require('./extractors/JobDataExtractor');
const LinkedInScroller = require('./scroll/LinkedInScroller');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Almacenamiento de sesiones de navegador
const browserSessions = new Map();

// Configuración del viewport
const VIEWPORT_CONFIG = {
  width: 1280,
  height: 720
};

// Configuración del perfil persistente
const PERSISTENT_PROFILE = {
  name: 'linkedin-persistent-profile',
  dir: path.join(__dirname, '../data/browser-profile'),
  args: [
    '--user-data-dir=' + path.join(__dirname, '../data/browser-profile'),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor'
  ]
};

// Inicializar componentes del sistema
const jobStateManager = new JobStateManager();
const jobSearchEngine = new JobSearchEngine();
const jobExtractor = new JobDataExtractor();
const linkedInScroller = new LinkedInScroller();
const AdvancedJobScorer = require('./scoring/AdvancedJobScorer');
const LinkedInJobSearcher = require('./search/LinkedInJobSearcher');

// Cargar perfil de usuario para scoring (solo cuando se necesite)
let userProfile = null;
let advancedScorer = null;

function initializeScorer() {
  if (!userProfile) {
    try {
      userProfile = require('../data/userProfile.json');
      advancedScorer = new AdvancedJobScorer(userProfile, userProfile.preferences);
      console.log('✅ Perfil de usuario cargado exitosamente para scoring');
    } catch (error) {
      console.log('⚠️ No se pudo cargar el perfil del usuario:', error.message);
      console.log('📝 El scoring no estará disponible hasta que se cree el perfil');
    }
  }
}

// Variable para controlar el estado de búsqueda automática
let autoSearchEnabled = false; // Desactivado temporalmente para evitar problemas

// Variable para evitar duplicación de inicialización del JobStateManager
let jobStateManagerInitialized = false;

// Sistema de persistencia de cookies
const cookiesFile = path.join(__dirname, '../data/linkedin-cookies.json');
const fs = require('fs').promises;

// Función para realizar búsqueda automática de empleos
async function performAutoSearch(socket, session) {
  try {
    // Verificar que la sesión siga activa
    if (!session || !session.page || !session.isInitialized) {
      console.log('Sesión no válida, cancelando búsqueda automática');
      return;
    }

    console.log('INICIANDO BÚSQUEDA AUTOMÁTICA...');
    
    // Notificar inicio de búsqueda
    socket.emit('search-status', { 
      status: 'running', 
      message: 'Buscando empleos en LinkedIn...' 
    });

    // Configuración de búsqueda por defecto
    
    // Esperar a que cargue la página
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Realizar scroll progresivo para cargar más resultados
    console.log('📜 Iniciando scroll progresivo...');
    const scrollResults = await linkedInScroller.performProgressiveScroll(session.page, 5);
    console.log(`✅ Scroll completado. Se encontraron ${scrollResults.totalJobs} jobs potenciales`);
    
    // Extraer datos de los jobs encontrados
    console.log('📊 Extrayendo datos de jobs...');
    const extractedJobs = await jobExtractor.extractJobData(session.page, scrollResults.jobElements);
    console.log(`✅ Se extrajeron ${extractedJobs.length} jobs`);
    
    // Aplicar scoring multi-dimensional a cada job
    console.log('🎯 Aplicando scoring multi-dimensional...');
    const scoredJobs = [];
    
    for (const job of extractedJobs) {
      const scoringResult = await advancedScorer.scoreJob(job.description, job);
      
      if (scoringResult.rejected) {
        console.log(`❌ Job rechazado: ${job.title} - ${scoringResult.reason}`);
        continue;
      }
      
      const scoredJob = {
        ...job,
        score: scoringResult.score,
        grade: scoringResult.grade,
        dimensions: scoringResult.dimensions,
        analysis: scoringResult.analysis,
        recommendations: scoringResult.recommendations
      };
      
      scoredJobs.push(scoredJob);
      console.log(`✅ Job evaluado: ${job.title} - Score: ${scoringResult.score.toFixed(2)}/5.0 (${scoringResult.grade})`);
    }
    
    // Filtrar por score mínimo
    const minScoreThreshold = 3.0;
    const highScoreJobs = scoredJobs.filter(job => job.score >= minScoreThreshold);
    const excellentJobs = scoredJobs.filter(job => job.score >= 4.0);
    
    console.log(`📊 Resultados del scoring:`);
    console.log(`- Total evaluados: ${scoredJobs.length}`);
    console.log(`- Aprobados (≥${minScoreThreshold}): ${highScoreJobs.length}`);
    console.log(`- Excelentes (≥4.0): ${excellentJobs.length}`);
    
    // Filtrar jobs incrementalmente
    console.log('🔄 Filtrando jobs incrementalmente...');
    const filteredJobs = await incrementalJobFilter.filterJobs(highScoreJobs);
    console.log(`✅ ${filteredJobs.newJobs.length} jobs nuevos después del filtrado`);
    
    // Procesar y almacenar los nuevos jobs
    if (filteredJobs.newJobs.length > 0) {
      console.log('💾 Almacenando nuevos jobs con scoring...');
      await jobStorage.storeJobs(filteredJobs.newJobs);
      console.log(`✅ ${filteredJobs.newJobs.length} jobs almacenados exitosamente`);
      
      // Actualizar estado del sistema
      await jobStateManager.addProcessedJobs(filteredJobs.newJobs.map(job => job.jobId));
      await jobStateManager.updateLastRun();
      
      // Enviar resultados al cliente con scoring detallado
      socket.emit('search-results', {
        totalFound: extractedJobs.length,
        evaluated: scoredJobs.length,
        qualified: highScoreJobs.length,
        excellent: excellentJobs.length,
        newJobs: filteredJobs.newJobs.map(job => ({
          ...job,
          score: job.score,
          grade: job.grade,
          dimensions: job.dimensions,
          recommendations: job.recommendations
        })),
        averageScore: highScoreJobs.reduce((sum, job) => sum + job.score, 0) / highScoreJobs.length,
        message: `Se encontraron ${filteredJobs.newJobs.length} jobs calificados (score ≥ ${minScoreThreshold})`
      });
      
      console.log('=== BÚSQUEDA AUTOMÁTICA CON SCORING COMPLETADA ===');
    } else {
      console.log('ℹ️ No se encontraron nuevos jobs calificados');
      socket.emit('search-results', {
        totalFound: extractedJobs.length,
        evaluated: scoredJobs.length,
        qualified: 0,
        excellent: 0,
        newJobs: [],
        averageScore: 0,
        message: 'No se encontraron nuevos jobs calificados'
      });
    }
    
    await jobStateManager.addToSearchHistoryWithSave(
      searchConfig.keywords || 'General',
      processedJobs.length,
      newJobs.length,
      Date.now() - Date.now()
    );

    // Enviar resultados al cliente
    socket.emit('search-results', {
      success: true,
      summary: {
        total: processedJobs.length,
        new: newJobs.length,
        duplicates: duplicateJobs.length,
        old: oldJobs.length
      },
      newJobs: newJobs.slice(0, 10), // Enviar solo los primeros 10 nuevos jobs
      searchConfig
    });

    socket.emit('search-status', { 
      status: 'completed', 
      message: `Búsqueda completada. ${newJobs.length} nuevos empleos encontrados.` 
    });

    console.log('=== BÚSQUEDA AUTOMÁTICA COMPLETADA ===');

  } catch (error) {
    console.error('Error en búsqueda automática:', error);
    
    socket.emit('search-status', { 
      status: 'error', 
      message: `Error en búsqueda: ${error.message}` 
    });

    socket.emit('search-results', {
      success: false,
      error: error.message
    });
  }
}

class BrowserSession {
  constructor(socketId) {
    this.socketId = socketId;
    this.browser = null;
    this.page = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log(`Iniciando navegador para sesión ${this.socketId}`);
      
      // Inicializar Puppeteer con perfil persistente
      this.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: VIEWPORT_CONFIG,
        userDataDir: path.join(__dirname, '../data/browser-profile'),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--start-maximized'
        ]
      });

      this.page = await this.browser.newPage();
      this.isInitialized = true;

      // Navegar automáticamente a LinkedIn y verificar sesión
      console.log('🔥 Usando perfil persistente para mantener sesión real de LinkedIn');
      console.log('Navegando a página de LinkedIn...');
      
      try {
        await this.page.goto('https://www.linkedin.com', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        console.log('Navegación a LinkedIn completada');
        
        // Intentar cargar cookies de sesión guardada
        console.log('=== CARGANDO SESIÓN DE LINKEDIN ===');
        const cookiesLoaded = await this.loadCookies();
        
        if (cookiesLoaded) {
          console.log('✓ Sesión de LinkedIn restaurada desde cookies');
          
          // Verificar si la sesión está realmente activa
          console.log('🔍 Verificando si la sesión está activa con perfil persistente...');
          
          try {
            // Esperar un momento para que cargue completamente
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verificar si estamos en el feed (sesión activa) o en login
            const currentUrl = this.page.url();
            console.log(`📍 URL actual: ${currentUrl}`);
            
            if (currentUrl.includes('linkedin.com/feed/') || currentUrl.includes('linkedin.com/in/')) {
              console.log('✅ Sesión de LinkedIn activa detectada');
              return true;
            } else if (currentUrl.includes('linkedin.com/login')) {
              console.log('⚠️ Sesión expirada, se necesita login manual');
              return true;
            } else {
              console.log('� Redirigiendo a feed para verificar sesión...');
              await this.page.goto('https://www.linkedin.com/feed/', {
                waitUntil: 'networkidle2',
                timeout: 15000
              });
              
              const finalUrl = this.page.url();
              if (finalUrl.includes('linkedin.com/feed/')) {
                console.log('✅ Sesión de LinkedIn confirmada y activa');
                return true;
              } else {
                console.log('⚠️ No hay sesión activa, se necesita login manual');
                return true;
              }
            }
            
          } catch (verifyError) {
            console.log('❌ Error verificando sesión:', verifyError.message);
            console.log('⚠️ No hay cookies guardadas o error al cargar');
            return true;
          }
        } else {
          console.log('⚠️ No hay cookies guardadas, necesitarás iniciar sesión manualmente');
          console.log('=== ESPERANDO INICIO DE SESIÓN MANUAL ===');
          return true;
        }
        
      } catch (navError) {
        console.log('Error en navegación inicial:', navError.message);
        
        // Para cualquier error de navegación, continuar con el flujo autónomo
        console.log('🔄 Error detectado, continuando con flujo autónomo...');
        try {
          // Intentar ir a about:blank como fallback
          await this.page.goto('about:blank', { timeout: 5000 });
          console.log('✅ Navegación básica completada, iniciando búsqueda autónoma...');
        } catch (fallbackError) {
          console.log('⚠️ Error en fallback, continuando de todas formas...');
        }
        
        // Continuar aunque falle la navegación - el sistema es autónomo
        return true;
      }

    } catch (error) {
      console.error(`Error al inicializar navegador para sesión ${this.socketId}:`, error);
      return false;
    }
  }

  async captureScreenshot() {
    if (!this.page) return null;
    
    try {
      const screenshot = await this.page.screenshot({
        type: 'png',
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width: VIEWPORT_CONFIG.width,
          height: VIEWPORT_CONFIG.height
        }
      });
      
      return screenshot.toString('base64');
    } catch (error) {
      console.error(`Error al capturar pantalla:`, error);
      return null;
    }
  }

  async click(x, y) {
    if (!this.page) return false;
    
    try {
      await this.page.mouse.click(x, y);
      return true;
    } catch (error) {
      console.error(`Error al hacer click en (${x}, ${y}):`, error);
      return false;
    }
  }

  async type(text) {
    if (!this.page) return false;
    
    try {
      await this.page.keyboard.type(text);
      return true;
    } catch (error) {
      console.error(`Error al escribir texto:`, error);
      return false;
    }
  }

  async keypress(key) {
    if (!this.page) return false;
    
    try {
      await this.page.keyboard.press(key);
      return true;
    } catch (error) {
      console.error(`Error al presionar tecla:`, error);
      return false;
    }
  }

  async close() {
    if (this.browser) {
      // Guardar cookies antes de cerrar
      await this.saveCookies();
      await this.browser.close();
    }
    this.isInitialized = false;
  }

  async saveCookies() {
    if (!this.page) return;
    
    try {
      console.log('=== GUARDANDO COOKIES DE SESIÓN ===');
      const cookies = await this.page.cookies();
      
      console.log(`🍪 Encontradas ${cookies.length} cookies para guardar`);
      console.log(`📁 Guardando en: ${cookiesFile}`);
      
      await fs.writeFile(cookiesFile, JSON.stringify(cookies, null, 2));
      
      console.log(`✓ ${cookies.length} cookies guardadas exitosamente`);
      console.log('💡 Estas cookies se usarán automáticamente la próxima vez');
      console.log('=== COOKIES GUARDADAS CORRECTAMENTE ===');
      
    } catch (error) {
      console.error('❌ Error al guardar cookies:', error);
      console.error('Stack trace:', error.stack);
    }
  }

  async loadCookies() {
    if (!this.page) return;
    
    try {
      console.log('=== CARGANDO COOKIES DE SESIÓN ===');
      const cookiesData = await fs.readFile(cookiesFile, 'utf8');
      const cookies = JSON.parse(cookiesData);
      
      console.log(`🍪 Encontradas ${cookies.length} cookies guardadas`);
      
      // Establecer cookies directamente sin navegar primero
      console.log('🍪 Estableciendo cookies en el navegador...');
      await this.page.setCookie(...cookies);
      
      // Esperar un momento para que se apliquen las cookies
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Navegar al feed para verificar si la sesión está activa
      console.log('🔍 Verificando si la sesión está activa con perfil persistente...');
      await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2' });
      
      // Esperar a que cargue completamente
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verificar si realmente estamos logueados
      const isLoggedIn = await this.checkIfLoggedIn();
      
      if (isLoggedIn) {
        console.log(`✅ Sesión de LinkedIn restaurada exitosamente con perfil persistente (${cookies.length} cookies)`);
        console.log('🎉 LinkedIn mantiene la sesión activa entre ejecuciones del navegador');
        return true;
      } else {
        console.log('⚠️ Las cookies se cargaron pero la sesión no está activa');
        console.log('🔑 Puede que las cookies expiraron o LinkedIn cambió la estructura');
        console.log('💡 El perfil persistente debería mantener la sesión activa');
        console.log('🔄 Necesitarás iniciar sesión manualmente esta vez');
        return false;
      }
      
    } catch (error) {
      console.log('❌ No hay cookies guardadas o error al cargar:', error.message);
      return false;
    }
  }

  async checkIfLoggedIn() {
    try {
      // Verificar si la página sigue conectada
      if (!this.page || this.page.isClosed()) {
        console.log('Página no disponible para verificar sesión');
        return false;
      }
      
      // Verificar múltiples indicadores de sesión
      const selectors = [
        '.feed-shared-update-v2', // Contenido del feed
        '.global-nav__me', // Botón de perfil
        '[data-control-name="share"]', // Botón de compartir
        '.scaffold-finite-scroll__content' // Contenido principal
      ];
      
      for (const selector of selectors) {
        try {
          const element = await this.page.$(selector, { timeout: 2000 });
          if (element) {
            console.log(`Sesión activa detectada por: ${selector}`);
            return true;
          }
        } catch (selectorError) {
          // Continuar con siguiente selector
          continue;
        }
      }
      
      // Verificar si hay elementos de login
      try {
        const loginElements = await this.page.$$('input#username, input[type="password"], .login__form', { timeout: 2000 });
        if (loginElements.length > 0) {
          console.log('Se detectaron elementos de login - sesión no activa');
          return false;
        }
      } catch (loginError) {
        // Continuar
      }
      
      console.log('No se pudo determinar estado de sesión');
      return false;
      
    } catch (error) {
      console.error('Error verificando sesión:', error.message);
      return false;
    }
  }
}

// WebSocket handlers
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Iniciar navegador
  socket.on('start-browser', async () => {
    console.log(`Solicitud de inicio de navegador para ${socket.id}`);
    console.log('🚀 Iniciando Chrome2 (navegador del bot)');
    
    // Inicializar el gestor de estado (solo una vez)
    if (!jobStateManagerInitialized) {
      console.log('=== INICIANDO SESIÓN DEL SISTEMA ===');
      await jobStateManager.initialize();
      jobStateManagerInitialized = true;
    } else {
      console.log('📝 JobStateManager ya inicializado, continuando...');
    }
    
    // Cerrar ventanas existentes de Chrome2 antes de iniciar nuevo
    console.log('=== CERRANDO VENTANAS DE CHROME2 EXISTENTES ===');
    await closeBotChromeWindows();
    
    // Cerrar sesión existente si hay una
    const existingSession = browserSessions.get(socket.id);
    if (existingSession) {
      console.log('Cerrando sesión existente del mismo cliente...');
      await existingSession.close();
      browserSessions.delete(socket.id);
    }
    
    // Validar y restaurar sesión guardada
    console.log('=== VALIDANDO SESIÓN GUARDADA ===');
    const sessionStats = jobStateManager.getStats();
    
    if (sessionStats.processedJobsCount > 0) {
      console.log(`Sesión guardada encontrada:`);
      console.log(`- Jobs procesados: ${sessionStats.processedJobsCount}`);
      console.log(`- Última ejecución: ${sessionStats.lastRunFormatted}`);
      console.log(`- Total histórico: ${sessionStats.totalProcessed}`);
      
      // Notificar al cliente sobre la sesión existente
      socket.emit('session-restored', {
        hasSession: true,
        stats: sessionStats,
        message: `Sesión restaurada con ${sessionStats.processedJobsCount} jobs procesados`
      });
    } else {
      console.log('No hay sesión guardada, iniciando nueva sesión');
      socket.emit('session-restored', {
        hasSession: false,
        stats: sessionStats,
        message: 'Nueva sesión iniciada'
      });
    }
    
    // Inicializar el scorer solo cuando se necesite
    initializeScorer();
    
    const session = new BrowserSession(socket.id);
    const success = await session.initialize();
    
    if (success) {
      browserSessions.set(socket.id, session);
      
      // Enviar primera captura de pantalla (página en blanco)
      const screenshot = await session.captureScreenshot();
      if (screenshot) {
        socket.emit('browser-screen', {
          image: screenshot,
          width: VIEWPORT_CONFIG.width,
          height: VIEWPORT_CONFIG.height
        });
      }
      
      socket.emit('browser-status', { status: 'started' });
      console.log('✅ Chrome2 iniciado exitosamente. Iniciando búsqueda automática...');
      
      // Iniciar automáticamente las búsquedas específicas
      setTimeout(async () => {
        try {
          console.log('🚀 INICIANDO BÚSQUEDA AUTÓNOMA DE EMPLEOS');
          
          // Primero verificar el estado de la sesión de LinkedIn y esperar login manual
          console.log('🔍 VERIFICANDO ESTADO DE SESIÓN DE LINKEDIN...');
          
          try {
            const currentUrl = session.page.url();
            console.log(`📍 URL actual: ${currentUrl}`);
            
            // Esperar un momento para que cargue completamente
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verificar si estamos en una página de LinkedIn válida
            const pageContent = await session.page.evaluate(() => {
              return {
                url: window.location.href,
                title: document.title,
                hasLinkedInClass: document.body.classList.contains('linkedin') || document.querySelector('.global-nav') !== null,
                isLoginPage: window.location.href.includes('/login')
              };
            });
            
            console.log(`📄 Página actual: ${pageContent.title}`);
            console.log(`🌐 URL detectada: ${pageContent.url}`);
            console.log(`✅ LinkedIn detectado: ${pageContent.hasLinkedInClass}`);
            console.log(`🔐 Es página de login: ${pageContent.isLoginPage}`);
            
            if (!pageContent.url.includes('linkedin.com')) {
              console.log('🔄 No estamos en LinkedIn, navegando al feed principal...');
              await session.page.goto('https://www.linkedin.com/feed/', {
                waitUntil: 'networkidle2',
                timeout: 20000
              });
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Si estamos en página de login, esperar que el usuario inicie sesión
            if (pageContent.isLoginPage) {
              console.log('🔐 LinkedIn requiere login manual');
              console.log('📝 Por favor inicia sesión en LinkedIn manualmente');
              console.log('⏳ Esperando 60 segundos para login manual...');
              
              // Notificar al cliente que necesita login manual
              socket.emit('job-search-status', { 
                status: 'waiting_login',
                message: 'Por favor inicia sesión en LinkedIn manualmente. El sistema esperará 60 segundos...'
              });
              
              // Esperar 60 segundos para que el usuario inicie sesión
              await new Promise(resolve => setTimeout(resolve, 60000));
              
              // Verificar nuevamente después de la espera
              const newPageContent = await session.page.evaluate(() => {
                return {
                  url: window.location.href,
                  isLoginPage: window.location.href.includes('/login')
                };
              });
              
              if (newPageContent.isLoginPage) {
                console.log('❌ Usuario no inició sesión, cancelando búsqueda');
                socket.emit('job-search-status', { 
                  status: 'error',
                  message: 'No se detectó inicio de sesión. Por favor inicia sesión manualmente y vuelve a intentar.'
                });
                return;
              }
              
              console.log('✅ Sesión de LinkedIn iniciada exitosamente');
            }
            
            // Notificar inicio de búsqueda
            socket.emit('job-search-status', { 
              status: 'searching',
              message: 'Sesión verificada. Iniciando búsqueda autónoma de empleos...'
            });
            
          } catch (verifyError) {
            console.log('⚠️ Error verificando sesión, continuando igual:', verifyError.message);
          }
          
          // Crear instancia del buscador específico
          const jobSearcher = new LinkedInJobSearcher(session.page, jobStateManager);
          
          // Realizar todas las búsquedas específicas con scoring
          const searchResults = await jobSearcher.performAllSearches();
          
          // Los resultados ya vienen con datos completos y scoring
          const jobsToSave = searchResults.map(job => ({
            jobId: job.link.split('/').pop() || job.link,
            title: job.title || 'Job from LinkedIn',
            company: job.company || 'Company',
            location: job.location || 'Location',
            link: job.link,
            postedTime: 'Recent',
            query: job.searchQuery || 'LinkedIn Search',
            extractedAt: job.extractedAt || new Date().toISOString(),
            description: job.description || '',
            scoring: job.scoring,
            searchRound: job.searchRound,
            approved: !job.scoring.rejected,
            score: job.scoring.score,
            grade: job.scoring.grade
          }));
          
          // Verificar si el método existe antes de usarlo
          if (typeof jobStateManager.addJob === 'function') {
            for (const job of jobsToSave) {
              jobStateManager.addJob(job);
            }
            await jobStateManager.saveState();
          } else {
            console.log('⚠️ jobStateManager.addJob no disponible, guardando directamente en estado');
            // Guardar directamente en el estado si el método no existe
            if (jobStateManager.state) {
              jobStateManager.state.jobs = jobStateManager.state.jobs || [];
              jobStateManager.state.jobs.push(...jobsToSave);
              await jobStateManager.saveState();
            }
          }
          
          // Enviar resultados al cliente
          socket.emit('job-search-complete', {
            status: 'completed',
            results: searchResults,
            message: `Búsqueda autónoma completada. Se encontraron ${searchResults.length} empleos únicos.`
          });
          
          console.log('✅ BÚSQUEDA AUTÓNOMA COMPLETADA');
          console.log(`📊 Total empleos únicos: ${searchResults.length}`);
          
          // Enviar captura de pantalla final
          const screenshot = await session.captureScreenshot();
          if (screenshot) {
            socket.emit('browser-screen', {
              image: screenshot,
              width: VIEWPORT_CONFIG.width,
              height: VIEWPORT_CONFIG.height
            });
          }
          
        } catch (error) {
          console.error('❌ Error en búsqueda autónoma:', error);
          socket.emit('job-search-status', { 
            status: 'error',
            message: 'Error en búsqueda autónoma: ' + error.message
          });
        }
      }, 5000); // Esperar 5 segundos antes de iniciar búsqueda
      
    } else {
      socket.emit('browser-status', { status: 'error', message: 'No se pudo iniciar Chrome2' });
    }
  });

  // Iniciar búsqueda manual con búsquedas específicas
  socket.on('start-job-search', async () => {
    console.log(`🔥 INICIANDO BÚSQUEDA ESPECÍFICA DE EMPLEOS para ${socket.id}`);
    
    const session = browserSessions.get(socket.id);
    if (session && session.isInitialized) {
      try {
        // Crear instancia del buscador específico
        const jobSearcher = new LinkedInJobSearcher(session.page, jobStateManager);
        
        // Notificar inicio de búsqueda
        socket.emit('job-search-status', { 
          status: 'searching',
          message: 'Iniciando búsqueda específica de empleos (Frontend, Full Stack, Backend)...'
        });
        
        // Realizar todas las búsquedas específicas
        const searchResults = await jobSearcher.performAllSearches();
        
        // Guardar resultados en el estado
        await jobSearcher.saveJobsToState(searchResults.uniqueJobs);
        
        // Enviar resultados al cliente
        socket.emit('job-search-complete', {
          status: 'completed',
          results: searchResults,
          message: `Búsqueda completada. Se encontraron ${searchResults.uniqueJobs.length} empleos únicos.`
        });
        
        console.log('✅ BÚSQUEDA ESPECÍFICA COMPLETADA');
        console.log(`📊 Total empleos únicos: ${searchResults.uniqueJobs.length}`);
        console.log(`📁 Categorías procesadas: ${searchResults.categories}`);
        
        // Enviar captura de pantalla final
        const screenshot = await session.captureScreenshot();
        if (screenshot) {
          socket.emit('browser-screen', {
            image: screenshot,
            width: VIEWPORT_CONFIG.width,
            height: VIEWPORT_CONFIG.height
          });
        }
        
      } catch (error) {
        console.error('❌ Error en búsqueda específica:', error);
        socket.emit('job-search-status', { 
          status: 'error',
          message: 'Error en búsqueda específica: ' + error.message
        });
      }
    } else {
      socket.emit('job-search-status', { 
        status: 'error',
        message: 'Navegador no iniciado. Por favor inicia el navegador primero.'
      });
    }
  });

  // Captura de pantalla
  socket.on('request-screenshot', async () => {
    const session = browserSessions.get(socket.id);
    if (session && session.isInitialized) {
      const screenshot = await session.captureScreenshot();
      if (screenshot) {
        socket.emit('browser-screen', {
          image: screenshot,
          width: VIEWPORT_CONFIG.width,
          height: VIEWPORT_CONFIG.height
        });
      }
    }
  });

  // Eventos del mouse
  socket.on('mouse-click', async (data) => {
    const session = browserSessions.get(socket.id);
    if (session && session.isInitialized) {
      await session.click(data.x, data.y);
      
      // Enviar nueva captura después del click
      setTimeout(async () => {
        const screenshot = await session.captureScreenshot();
        if (screenshot) {
          socket.emit('browser-screen', {
            image: screenshot,
            width: VIEWPORT_CONFIG.width,
            height: VIEWPORT_CONFIG.height
          });
        }
      }, 500);
    }
  });

  // Eventos del teclado
  socket.on('keyboard-type', async (data) => {
    const session = browserSessions.get(socket.id);
    if (session && session.isInitialized) {
      await session.type(data.text);
      
      // Enviar nueva captura después de escribir
      setTimeout(async () => {
        const screenshot = await session.captureScreenshot();
        if (screenshot) {
          socket.emit('browser-screen', {
            image: screenshot,
            width: VIEWPORT_CONFIG.width,
            height: VIEWPORT_CONFIG.height
          });
        }
      }, 300);
    }
  });

  socket.on('keyboard-key', async (data) => {
    const session = browserSessions.get(socket.id);
    if (session && session.isInitialized) {
      await session.keypress(data.key);
      
      // Enviar nueva captura después de la tecla
      setTimeout(async () => {
        const screenshot = await session.captureScreenshot();
        if (screenshot) {
          socket.emit('browser-screen', {
            image: screenshot,
            width: VIEWPORT_CONFIG.width,
            height: VIEWPORT_CONFIG.height
          });
        }
      }, 300);
    }
  });

  // Desconexión
  socket.on('disconnect', async () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    
    const session = browserSessions.get(socket.id);
    if (session) {
      await session.close();
      browserSessions.delete(socket.id);
    }
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Endpoint para test de scoring sin LinkedIn
app.get('/test-scoring', async (req, res) => {
  try {
    console.log('=== INICIANDO TEST DE SCORING DESDE ENDPOINT ===');
    
    const { runScoringTest } = require('./scoring-test');
    const results = await runScoringTest();
    
    res.json({
      success: true,
      message: 'Test de scoring completado exitosamente',
      results: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error en test de scoring:', error);
    res.status(500).json({
      success: false,
      message: 'Error en test de scoring',
      error: error.message
    });
  }
});

// Endpoint para obtener resultados del test
app.get('/scoring-results', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const resultsPath = path.join(__dirname, '../data/scoring-test-results.json');
    
    if (fs.existsSync(resultsPath)) {
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      res.json({
        success: true,
        results: results
      });
    } else {
      res.json({
        success: false,
        message: 'No hay resultados de test disponibles'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al leer resultados',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

// Función para cerrar solo las ventanas del Chrome2 (perfil del bot)
async function closeBotChromeWindows() {
  try {
    console.log('=== CERRANDO VENTANAS DE CHROME2 (BOT) ===');
    console.log('📝 Preservando Chrome1 (navegador personal)');
    
    const { exec } = require('child_process');
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows - buscar procesos Chrome que usen el perfil del bot
      const profileDir = path.join(__dirname, '../data/browser-profile').replace(/\//g, '\\');
      
      exec(`tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV`, (error, stdout, stderr) => {
        if (!error && stdout) {
          const lines = stdout.split('\n');
          const chromeProcesses = lines.filter(line => line.includes('chrome.exe'));
          
          if (chromeProcesses.length > 0) {
            console.log(`🔍 Encontrados ${chromeProcesses.length} procesos Chrome`);
            console.log('⚠️  Para distinguir Chrome1 vs Chrome2, usaremos el perfil específico');
            console.log('📂 Perfil del bot:', profileDir);
            
            // Cerrar Chrome que podría estar usando el perfil del bot
            // Nota: Esto es más seguro ya que solo afecta al perfil específico
            exec(`taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq *${profileDir}*"`, (killError, killStdout, killStderr) => {
              if (killError) {
                console.log('ℹ️  No se encontraron ventanas Chrome2 específicas (normal)');
              } else {
                console.log('✅ Ventanas Chrome2 cerradas exitosamente');
              }
            });
          } else {
            console.log('ℹ️  No hay procesos Chrome activos');
          }
        } else {
          console.log('ℹ️  No se encontraron procesos Chrome');
        }
      });
    } else if (platform === 'darwin') {
      // macOS - cerrar Chrome usando el perfil específico
      const profileDir = path.join(__dirname, '../data/browser-profile');
      exec(`pkill -f "Google Chrome.*${profileDir}"`, (error, stdout, stderr) => {
        if (error) {
          console.log('ℹ️  No se encontraron ventanas Chrome2 específicas (normal)');
        } else {
          console.log('✅ Ventanas Chrome2 cerradas exitosamente');
        }
      });
    } else {
      // Linux - cerrar Chrome usando el perfil específico
      const profileDir = path.join(__dirname, '../data/browser-profile');
      exec(`pkill -f "chrome.*${profileDir}"`, (error, stdout, stderr) => {
        if (error) {
          console.log('ℹ️  No se encontraron ventanas Chrome2 específicas (normal)');
        } else {
          console.log('✅ Ventanas Chrome2 cerradas exitosamente');
        }
      });
    }
    
  } catch (error) {
    console.log('Error al cerrar ventanas Chrome:', error.message);
    // No detener la inicialización por este error
  }
}

// Inicializar el sistema al iniciar el servidor
async function initializeSystem() {
  try {
    console.log('=== INICIANDO SISTEMA LINKEDIN JOB BOT ===');
    
    // NO cerrar ventanas Chrome2 al iniciar servidor - se hará al presionar "Iniciar Navegador"
    console.log('📝 Esperando acción del usuario para iniciar Chrome2...');
    
    // NO inicializar JobStateManager automáticamente - se hará al presionar "Iniciar Navegador"
    console.log('📝 Sistema listo esperando acciones del usuario...');
    
    console.log('=== SISTEMA COMPLETAMENTE INICIALIZADO ===');
    
  } catch (error) {
    console.error('Error al inicializar el sistema:', error);
  }
}

server.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Dashboard disponible en: http://localhost:${PORT}`);
  
  // Inicializar el sistema
  await initializeSystem();
});
