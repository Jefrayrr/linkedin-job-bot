const fs = require('fs').promises;
const path = require('path');

class JobStateManager {
    constructor() {
        this.stateFile = path.join(__dirname, '../../data/job-state.json');
        this.dataDir = path.join(__dirname, '../../data');
        this.state = {
            lastRun: null,
            processedJobs: new Set(),
            searchHistory: [],
            stats: {
                totalProcessed: 0,
                lastProcessedCount: 0,
                averageProcessingTime: 0
            }
        };
    }

    async initialize() {
        try {
            console.log('=== INICIANDO SESIÓN DEL SISTEMA ===');
            await this.ensureDataDirectory();
            await this.loadState();
            
            console.log(`Estado de sesión cargado exitosamente:`);
            console.log(`- Última ejecución: ${this.state.lastRun ? new Date(this.state.lastRun).toLocaleString() : 'Nunca'}`);
            console.log(`- Jobs procesados: ${this.state.processedJobs.size}`);
            console.log(`- Búsquedas en historial: ${this.state.searchHistory.length}`);
            console.log(`- Total procesados históricos: ${this.state.stats.totalProcessed}`);
            console.log('=== SESIÓN INICIADA CORRECTAMENTE ===');
            
        } catch (error) {
            console.warn('Error al inicializar estado, usando valores por defecto:', error.message);
            console.log('Creando nueva sesión...');
            await this.saveState();
            console.log('=== NUEVA SESIÓN CREADA ===');
        }
    }

    async ensureDataDirectory() {
        try {
            await fs.access(this.dataDir);
        } catch {
            await fs.mkdir(this.dataDir, { recursive: true });
        }
    }

    async loadState() {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            const parsed = JSON.parse(data);
            
            this.state = {
                lastRun: parsed.lastRun || null,
                processedJobs: new Set(parsed.processedJobs || []),
                searchHistory: parsed.searchHistory || [],
                stats: {
                    totalProcessed: parsed.stats?.totalProcessed || 0,
                    lastProcessedCount: parsed.stats?.lastProcessedCount || 0,
                    averageProcessingTime: parsed.stats?.averageProcessingTime || 0
                }
            };
            
            console.log(`Estado cargado: ${this.state.processedJobs.size} jobs procesados`);
        } catch (error) {
            console.warn('No se pudo cargar el estado, inicializando vacío:', error.message);
        }
    }

    async saveState() {
        try {
            // Asegurar que el directorio exista
            await this.ensureDataDirectory();
            
            const stateToSave = {
                lastRun: this.state.lastRun,
                processedJobs: Array.from(this.state.processedJobs),
                searchHistory: this.state.searchHistory.slice(-100), // Mantener últimos 100 registros
                stats: this.state.stats
            };
            
            const jsonData = JSON.stringify(stateToSave, null, 2);
            await fs.writeFile(this.stateFile, jsonData);
            
            console.log('=== SESIÓN GUARDADA ===');
            console.log(`- Jobs procesados: ${stateToSave.processedJobs.length}`);
            console.log(`- Última ejecución: ${stateToSave.lastRun ? new Date(stateToSave.lastRun).toLocaleString() : 'No definida'}`);
            console.log(`- Total histórico: ${stateToSave.stats.totalProcessed}`);
            console.log(`- Búsquedas en historial: ${stateToSave.searchHistory.length}`);
            console.log('========================');
        } catch (error) {
            console.error('Error al guardar estado:', error);
            // No lanzar el error para no interrumpir el flujo
            console.warn('Continuando sin guardar estado...');
        }
    }

    getLastRun() {
        return this.state.lastRun;
    }

    updateLastRun(timestamp = Date.now()) {
        this.state.lastRun = timestamp;
    }

    isJobProcessed(jobId) {
        return this.state.processedJobs.has(jobId);
    }

    markJobAsProcessed(jobId) {
        this.state.processedJobs.add(jobId);
        this.state.stats.totalProcessed++;
    }

    markMultipleJobsAsProcessed(jobIds) {
        jobIds.forEach(id => this.state.processedJobs.add(id));
        this.state.stats.totalProcessed += jobIds.length;
    }

    async markMultipleJobsAsProcessedWithSave(jobIds) {
        jobIds.forEach(id => this.state.processedJobs.add(id));
        this.state.stats.totalProcessed += jobIds.length;
        await this.saveState(); // Guardar inmediatamente
    }

    getProcessedJobsCount() {
        return this.state.processedJobs.size;
    }

    shouldProcessJob(jobId, jobTimestamp) {
        // Condición 1: No ha sido procesado
        const notProcessed = !this.isJobProcessed(jobId);
        
        // Condición 2: Es más reciente que la última ejecución
        const isNewer = this.state.lastRun ? jobTimestamp > this.state.lastRun : true;
        
        return notProcessed && isNewer;
    }

    addToSearchHistory(searchQuery, resultsCount, processedCount, duration) {
        const historyEntry = {
            timestamp: Date.now(),
            query: searchQuery,
            resultsCount,
            processedCount,
            duration,
            success: true
        };
        
        this.state.searchHistory.push(historyEntry);
        
        // Actualizar estadísticas
        this.state.stats.lastProcessedCount = processedCount;
        
        // Calcular promedio móvil de tiempo de procesamiento
        const recentSearches = this.state.searchHistory.slice(-10);
        const avgTime = recentSearches.reduce((sum, entry) => sum + entry.duration, 0) / recentSearches.length;
        this.state.stats.averageProcessingTime = Math.round(avgTime);
    }

    async addToSearchHistoryWithSave(searchQuery, resultsCount, processedCount, duration) {
        this.addToSearchHistory(searchQuery, resultsCount, processedCount, duration);
        await this.saveState(); // Guardar inmediatamente
    }

    getSearchHistory(limit = 10) {
        return this.state.searchHistory.slice(-limit);
    }

    getStats() {
        return {
            ...this.state.stats,
            processedJobsCount: this.state.processedJobs.size,
            lastRun: this.state.lastRun,
            lastRunFormatted: this.state.lastRun ? new Date(this.state.lastRun).toLocaleString() : 'Nunca'
        };
    }

    async cleanupOldProcessedJobs(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 días por defecto
        const cutoff = Date.now() - maxAge;
        const originalSize = this.state.processedJobs.size;
        
        // Nota: Esta implementación es simplificada
        // En producción, necesitaríamos timestamps por jobId
        // Por ahora, solo limpiamos si el conjunto es muy grande
        if (this.state.processedJobs.size > 10000) {
            console.log(`Limpiando jobs procesados antiguos...`);
            // Convertir a array, tomar los más recientes (asumimos que están en orden)
            const recentJobs = Array.from(this.state.processedJobs).slice(-5000);
            this.state.processedJobs = new Set(recentJobs);
            
            const cleaned = originalSize - this.state.processedJobs.size;
            console.log(`Limpiados ${cleaned} jobs procesados antiguos`);
        }
    }

    async resetState() {
        this.state = {
            lastRun: null,
            processedJobs: new Set(),
            searchHistory: [],
            stats: {
                totalProcessed: 0,
                lastProcessedCount: 0,
                averageProcessingTime: 0
            }
        };
        
        await this.saveState();
        console.log('Estado reiniciado');
    }

    // Métodos de depuración
    async exportState() {
        return {
            ...this.state,
            processedJobs: Array.from(this.state.processedJobs)
        };
    }

    async importState(importedState) {
        try {
            this.state = {
                lastRun: importedState.lastRun || null,
                processedJobs: new Set(importedState.processedJobs || []),
                searchHistory: importedState.searchHistory || [],
                stats: importedState.stats || this.state.stats
            };
            
            await this.saveState();
            console.log('Estado importado exitosamente');
        } catch (error) {
            console.error('Error al importar estado:', error);
            throw error;
        }
    }
}

module.exports = JobStateManager;
