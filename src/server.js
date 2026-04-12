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

// Inicializar componentes del sistema
const jobStateManager = new JobStateManager();
const jobSearchEngine = new JobSearchEngine();
const jobExtractor = new JobDataExtractor();
const linkedInScroller = new LinkedInScroller();

// Variable para controlar el estado de búsqueda automática
let autoSearchEnabled = true;

// Función para realizar búsqueda automática de empleos
async function performAutoSearch(socket, session) {
  try {
    console.log('INICIANDO BÚSQUEDA AUTOMÁTICA...');
    
    // Notificar inicio de búsqueda
    socket.emit('search-status', { 
      status: 'running', 
      message: 'Buscando empleos en LinkedIn...' 
    });

    // Configuración de búsqueda por defecto
    const searchConfig = jobSearchEngine.createDefaultSearchConfig({
      keywords: 'developer software engineer',
      location: 'remote',
      filters: {
        timeFilter: jobSearchEngine.getRecommendedTimeFilter(jobStateManager.getLastRun()),
        jobTypes: ['fulltime'],
        workplaceTypes: ['remote', 'hybrid']
      }
    });

    console.log(`Configuración de búsqueda:`, searchConfig);

    // Construir URL de búsqueda
    const searchURL = jobSearchEngine.buildSearchURL(searchConfig);
    console.log(`Navegando a: ${searchURL}`);

    // Navegar a la página de búsqueda
    await session.page.goto(searchURL, { waitUntil: 'networkidle2' });
    
    // Esperar a que cargue la página
    await session.page.waitForTimeout(3000);

    socket.emit('search-status', { 
      status: 'scrolling', 
      message: 'Realizando scroll para encontrar empleos...' 
    });

    // Realizar scroll progresivo
    const scrollResult = await linkedInScroller.performProgressiveScroll(
      session.page,
      (currentPage) => jobExtractor.extractAllJobs(currentPage),
      {
        maxScrollAttempts: 5,
        scrollDelay: 2000
      }
    );

    console.log(`Scroll completado: ${scrollResult.jobs.length} jobs encontrados`);

    socket.emit('search-status', { 
      status: 'processing', 
      message: `Procesando ${scrollResult.jobs.length} empleos encontrados...` 
    });

    // Extraer y normalizar timestamps
    const processedJobs = scrollResult.jobs.map(job => ({
      ...job,
      timestamp: job.timestamp || Date.now()
    }));

    // Filtrar jobs nuevos
    const newJobs = [];
    const duplicateJobs = [];
    const oldJobs = [];

    for (const job of processedJobs) {
      const shouldProcess = jobStateManager.shouldProcessJob(job.jobId, job.timestamp);
      
      if (shouldProcess) {
        newJobs.push(job);
      } else if (jobStateManager.isJobProcessed(job.jobId)) {
        duplicateJobs.push(job);
      } else {
        oldJobs.push(job);
      }
    }

    console.log(`Resultados del filtrado:`);
    console.log(`- Jobs nuevos: ${newJobs.length}`);
    console.log(`- Jobs duplicados: ${duplicateJobs.length}`);
    console.log(`- Jobs viejos: ${oldJobs.length}`);

    // Marcar jobs nuevos como procesados
    if (newJobs.length > 0) {
      const jobIds = newJobs.map(job => job.jobId);
      await jobStateManager.markMultipleJobsAsProcessedWithSave(jobIds);
      console.log(`${newJobs.length} jobs marcados como procesados`);
    }

    // Actualizar última ejecución
    jobStateManager.updateLastRun();
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
      
      this.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: VIEWPORT_CONFIG,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport(VIEWPORT_CONFIG);
      
      // Navegar a LinkedIn
      await this.page.goto('https://www.linkedin.com/login', {
        waitUntil: 'networkidle2'
      });

      this.isInitialized = true;
      console.log(`Navegador iniciado para sesión ${this.socketId}`);
      
      return true;
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
      await this.browser.close();
    }
    this.isInitialized = false;
  }
}

// WebSocket handlers
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Iniciar navegador
  socket.on('start-browser', async () => {
    console.log(`Solicitud de inicio de navegador para ${socket.id}`);
    
    const session = new BrowserSession(socket.id);
    const success = await session.initialize();
    
    if (success) {
      browserSessions.set(socket.id, session);
      
      // Enviar primer captura de pantalla
      const screenshot = await session.captureScreenshot();
      if (screenshot) {
        socket.emit('browser-screen', {
          image: screenshot,
          width: VIEWPORT_CONFIG.width,
          height: VIEWPORT_CONFIG.height
        });
      }
      
      socket.emit('browser-status', { status: 'started' });
      
      // Iniciar búsqueda automática si está habilitada
      if (autoSearchEnabled) {
        console.log('=== INICIANDO BÚSQUEDA AUTOMÁTICA DE EMPLEOS ===');
        
        // Notificar al cliente que se está iniciando la búsqueda
        socket.emit('search-status', { 
          status: 'starting', 
          message: 'Iniciando búsqueda automática de empleos...' 
        });
        
        // Esperar un momento para que el navegador se estabilice
        setTimeout(async () => {
          await performAutoSearch(socket, session);
        }, 3000);
      }
    } else {
      socket.emit('browser-status', { status: 'error', message: 'No se pudo iniciar el navegador' });
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

const PORT = process.env.PORT || 3000;

// Inicializar el sistema al iniciar el servidor
async function initializeSystem() {
  try {
    console.log('=== INICIANDO SISTEMA LINKEDIN JOB BOT ===');
    await jobStateManager.initialize();
    console.log('=== SISTEMA COMPLETAMENTE INICIALIZADO ===');
  } catch (error) {
    console.error('Error crítico al inicializar el sistema:', error);
  }
}

server.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Dashboard disponible en: http://localhost:${PORT}`);
  
  // Inicializar el sistema
  await initializeSystem();
});
