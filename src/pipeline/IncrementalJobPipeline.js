const JobStateManager = require('../state/JobStateManager');
const JobSearchEngine = require('../search/JobSearchEngine');
const JobDataExtractor = require('../extractors/JobDataExtractor');
const IncrementalJobFilter = require('../filters/IncrementalJobFilter');
const LinkedInScroller = require('../scroll/LinkedInScroller');
const JobDeduplicator = require('../deduplication/JobDeduplicator');
const JobScorer = require('../scoring/JobScorer');
const JobStorage = require('../storage/JobStorage');

class IncrementalJobPipeline {
    constructor() {
        // Inicializar componentes
        this.stateManager = new JobStateManager();
        this.searchEngine = new JobSearchEngine();
        this.jobExtractor = new JobDataExtractor();
        this.jobFilter = new IncrementalJobFilter(this.stateManager);
        this.scroller = new LinkedInScroller();
        this.deduplicator = new JobDeduplicator(this.stateManager);
        this.jobScorer = new JobScorer();
        this.jobStorage = new JobStorage();

        // Configuración del pipeline
        this.config = {
            maxJobsPerRun: 200,
            enableScoring: true,
            enableDeduplication: true,
            enableIntelligentScroll: true,
            autoSave: true,
            userPreferences: {}
        };

        // Estado del pipeline
        this.isRunning = false;
        this.currentRun = null;
        this.stats = {
            totalRuns: 0,
            totalJobsProcessed: 0,
            totalNewJobs: 0,
            averageRunTime: 0,
            lastRunTime: null,
            lastRunResult: null
        };
    }

    /**
     * Inicializa el pipeline
     */
    async initialize() {
        console.log('Inicializando pipeline incremental...');
        
        try {
            // Inicializar componentes
            await this.stateManager.initialize();
            await this.jobStorage.initialize();

            console.log('Pipeline inicializado exitosamente');
            return true;
        } catch (error) {
            console.error('Error inicializando pipeline:', error);
            return false;
        }
    }

    /**
     * Ejecuta el pipeline completo de búsqueda incremental
     * @param {Object} searchConfig - Configuración de búsqueda
     * @param {Object} options - Opciones adicionales
     * @returns {Object} Resultado de la ejecución
     */
    async runPipeline(searchConfig, options = {}) {
        if (this.isRunning) {
            throw new Error('Pipeline ya está en ejecución');
        }

        this.isRunning = true;
        const startTime = Date.now();
        
        this.currentRun = {
            id: `run-${Date.now()}`,
            startTime,
            config: searchConfig,
            status: 'running'
        };

        console.log(`Iniciando ejecución del pipeline: ${this.currentRun.id}`);

        try {
            // Fase 1: Inicialización
            const initResult = await this.phase1_Initialization(searchConfig);
            
            // Fase 2: Adquisición de datos
            const acquisitionResult = await this.phase2_DataAcquisition(initResult.page, searchConfig);
            
            // Fase 3: Procesamiento y filtrado
            const processingResult = await this.phase3_Processing(acquisitionResult.jobs);
            
            // Fase 4: Almacenamiento
            const storageResult = await this.phase4_Storage(processingResult.newJobs);
            
            // Fase 5: Actualización de estado
            await this.phase5_StateUpdate(processingResult);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Resultado final
            const finalResult = {
                runId: this.currentRun.id,
                duration,
                success: true,
                phases: {
                    initialization: initResult,
                    acquisition: acquisitionResult,
                    processing: processingResult,
                    storage: storageResult
                },
                summary: {
                    totalJobsFound: acquisitionResult.jobs.length,
                    newJobs: processingResult.newJobs.length,
                    duplicateJobs: processingResult.duplicateJobs.length,
                    oldJobs: processingResult.oldJobs.length,
                    cutoffTriggered: processingResult.cutoffTriggered
                }
            };

            // Actualizar estadísticas
            this.updatePipelineStats(finalResult);

            this.currentRun.status = 'completed';
            this.currentRun.result = finalResult;

            console.log(`Pipeline completado exitosamente en ${duration}ms`);
            
            return finalResult;

        } catch (error) {
            console.error('Error en ejecución del pipeline:', error);
            
            const errorResult = {
                runId: this.currentRun.id,
                duration: Date.now() - startTime,
                success: false,
                error: error.message,
                stack: error.stack
            };

            this.currentRun.status = 'failed';
            this.currentRun.result = errorResult;

            return errorResult;

        } finally {
            this.isRunning = false;
            this.stats.lastRunTime = Date.now();
            this.stats.lastRunResult = this.currentRun.result;
        }
    }

    /**
     * Fase 1: Inicialización
     */
    async phase1_Initialization(searchConfig) {
        console.log('Fase 1: Inicialización');
        
        const result = {
            lastRun: this.stateManager.getLastRun(),
            processedJobsCount: this.stateManager.getProcessedJobsCount(),
            optimizedConfig: null,
            page: null
        };

        try {
            // Optimizar configuración de búsqueda
            result.optimizedConfig = this.searchEngine.optimizeForIncrementalSearch(
                searchConfig,
                result.lastRun
            );

            console.log(`Configuración optimizada:`, result.optimizedConfig);

            return result;

        } catch (error) {
            console.error('Error en fase 1:', error);
            throw error;
        }
    }

    /**
     * Fase 2: Adquisición de datos
     */
    async phase2_DataAcquisition(page, searchConfig) {
        console.log('Fase 2: Adquisición de datos');
        
        const result = {
            searchURL: null,
            jobs: [],
            scrollStats: null
        };

        try {
            // Construir URL de búsqueda
            result.searchURL = this.searchEngine.buildSearchURL(searchConfig);
            console.log(`URL de búsqueda: ${result.searchURL}`);

            // Navegar a la página de búsqueda
            // Nota: Esta parte se implementará cuando se integre con el navegador remoto
            console.log('Navegando a página de búsqueda...');

            // Realizar scroll progresivo para obtener jobs
            const scrollResult = await this.scroller.performProgressiveScroll(
                page,
                (currentPage) => this.jobExtractor.extractAllJobs(currentPage),
                {
                    maxScrollAttempts: 10,
                    scrollDelay: 2000
                }
            );

            result.jobs = scrollResult.jobs;
            result.scrollStats = scrollResult.stats;

            console.log(`Adquisición completada: ${result.jobs.length} jobs encontrados`);

            return result;

        } catch (error) {
            console.error('Error en fase 2:', error);
            throw error;
        }
    }

    /**
     * Fase 3: Procesamiento y filtrado
     */
    async phase3_Processing(jobs) {
        console.log('Fase 3: Procesamiento y filtrado');
        
        const result = {
            deduplicatedJobs: [],
            scoredJobs: [],
            newJobs: [],
            duplicateJobs: [],
            oldJobs: [],
            cutoffTriggered: false,
            processingStats: {}
        };

        try {
            // Paso 1: Deduplicación
            if (this.config.enableDeduplication) {
                console.log('Realizando deduplicación...');
                const deduplicationResult = await this.deduplicator.deduplicateJobs(jobs);
                result.deduplicatedJobs = deduplicationResult.uniqueJobs;
                result.duplicateJobs = [...deduplicationResult.duplicateJobs, ...deduplicationResult.similarJobs];
                result.processingStats.deduplication = deduplicationResult.stats;
            } else {
                result.deduplicatedJobs = jobs;
            }

            // Paso 2: Scoring
            if (this.config.enableScoring) {
                console.log('Calculando scores...');
                for (const job of result.deduplicatedJobs) {
                    const scoredJob = await this.jobScorer.scoreJob(job, this.config.userPreferences);
                    result.scoredJobs.push(scoredJob);
                }
                result.processingStats.scoring = this.jobScorer.getScoringStats();
            } else {
                result.scoredJobs = result.deduplicatedJobs;
            }

            // Paso 3: Filtrado incremental
            console.log('Aplicando filtrado incremental...');
            const filterResult = await this.jobFilter.filterJobsIncremental(result.scoredJobs);
            
            result.newJobs = filterResult.newJobs;
            result.oldJobs = filterResult.oldJobs;
            result.cutoffTriggered = filterResult.cutoffTriggered;
            result.processingStats.filtering = filterResult.stats;

            console.log(`Procesamiento completado: ${result.newJobs.length} nuevos, ${result.duplicateJobs.length} duplicados, ${result.oldJobs.length} viejos`);

            return result;

        } catch (error) {
            console.error('Error en fase 3:', error);
            throw error;
        }
    }

    /**
     * Fase 4: Almacenamiento
     */
    async phase4_Storage(newJobs) {
        console.log('Fase 4: Almacenamiento');
        
        const result = {
            storedJobs: 0,
            storageErrors: [],
            storageStats: {}
        };

        try {
            if (newJobs.length > 0) {
                console.log(`Almacenando ${newJobs.length} nuevos jobs...`);
                
                const storageResult = await this.jobStorage.storeJobs(newJobs);
                result.storedJobs = storageResult.stored;
                result.storageErrors = storageResult.errors;
                result.storageStats = await this.jobStorage.getStorageStats();

                // Marcar jobs como procesados
                await this.jobFilter.markJobsAsProcessed(newJobs);

                console.log(`Almacenamiento completado: ${result.storedJobs} jobs guardados`);
            } else {
                console.log('No hay nuevos jobs para almacenar');
            }

            return result;

        } catch (error) {
            console.error('Error en fase 4:', error);
            throw error;
        }
    }

    /**
     * Fase 5: Actualización de estado
     */
    async phase5_StateUpdate(processingResult) {
        console.log('Fase 5: Actualización de estado');
        
        try {
            // Actualizar última ejecución
            this.stateManager.updateLastRun();
            
            // Agregar al historial de búsqueda
            const searchQuery = this.currentRun.config.keywords || this.currentRun.config.location || 'General';
            await this.stateManager.addToSearchHistoryWithSave(
                searchQuery,
                processingResult.newJobs.length + processingResult.duplicateJobs.length + processingResult.oldJobs.length,
                processingResult.newJobs.length,
                Date.now() - this.currentRun.startTime
            );

            console.log('Estado actualizado exitosamente');

        } catch (error) {
            console.error('Error en fase 5:', error);
            throw error;
        }
    }

    /**
     * Actualiza estadísticas del pipeline
     * @param {Object} result - Resultado de la ejecución
     */
    updatePipelineStats(result) {
        this.stats.totalRuns++;
        this.stats.totalJobsProcessed += result.summary.totalJobsFound;
        this.stats.totalNewJobs += result.summary.newJobs;

        // Calcular tiempo promedio
        const totalRunTime = this.stats.averageRunTime * (this.stats.totalRuns - 1) + result.duration;
        this.stats.averageRunTime = Math.round(totalRunTime / this.stats.totalRuns);
    }

    /**
     * Obtiene estadísticas completas del pipeline
     * @returns {Object} Estadísticas del pipeline
     */
    async getPipelineStats() {
        const stateStats = this.stateManager.getStats();
        const storageStats = await this.jobStorage.getStorageStats();
        const filterStats = this.jobFilter.getFilterStats();
        const deduplicationStats = this.deduplicator.getDeduplicationStats();
        const scoringStats = this.jobScorer.getScoringStats();
        const scrollStats = this.scroller.getScrollStats();

        return {
            pipeline: this.stats,
            state: stateStats,
            storage: storageStats,
            filter: filterStats,
            deduplication: deduplicationStats,
            scoring: scoringStats,
            scroll: scrollStats,
            currentRun: this.currentRun,
            isRunning: this.isRunning
        };
    }

    /**
     * Configura el pipeline
     * @param {Object} newConfig - Nueva configuración
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('Pipeline configurado:', this.config);
    }

    /**
     * Establece preferencias de usuario
     * @param {Object} preferences - Preferencias del usuario
     */
    setUserPreferences(preferences) {
        this.config.userPreferences = preferences;
        console.log('Preferencias de usuario actualizadas');
    }

    /**
     * Busca jobs existentes
     * @param {Object} criteria - Criterios de búsqueda
     * @returns {Array} Jobs encontrados
     */
    async searchJobs(criteria) {
        return await this.jobStorage.searchJobs(criteria);
    }

    /**
     * Obtiene jobs recientes
     * @param {number} limit - Límite de jobs
     * @returns {Array} Jobs recientes
     */
    async getRecentJobs(limit = 50) {
        return await this.jobStorage.searchJobs({
            sortBy: 'timestamp',
            limit
        });
    }

    /**
     * Obtiene jobs con mejor score
     * @param {number} limit - Límite de jobs
     * @returns {Array} Jobs mejor calificados
     */
    async getTopJobs(limit = 50) {
        return await this.jobStorage.searchJobs({
            minScore: 70,
            sortBy: 'score',
            limit
        });
    }

    /**
     * Reinicia el pipeline
     */
    async reset() {
        console.log('Reiniciando pipeline...');
        
        try {
            // Reiniciar estado
            await this.stateManager.resetState();
            
            // Reiniciar estadísticas de componentes
            this.jobFilter.resetStats();
            this.deduplicator.resetStats();
            this.jobScorer.resetStats();
            
            // Reiniciar estadísticas del pipeline
            this.stats = {
                totalRuns: 0,
                totalJobsProcessed: 0,
                totalNewJobs: 0,
                averageRunTime: 0,
                lastRunTime: null,
                lastRunResult: null
            };
            
            console.log('Pipeline reiniciado exitosamente');
            
        } catch (error) {
            console.error('Error reiniciando pipeline:', error);
            throw error;
        }
    }

    /**
     * Exporta estado completo del pipeline
     * @returns {Object} Estado exportable
     */
    async exportState() {
        return {
            config: this.config,
            stats: this.stats,
            state: await this.stateManager.exportState(),
            storage: await this.jobStorage.getStorageStats(),
            currentRun: this.currentRun
        };
    }
}

module.exports = IncrementalJobPipeline;
