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
            
            console.log('=== SESIÓN INICIADA CORRECTAMENTE ===');
            
        } catch (error) {
            console.log('No hay sesión guardada, creando nueva sesión...');
            console.log(`Error: ${error.message}`);
            console.log('Creando nueva sesión de emergencia...');
            
            // Inicializar estado vacío
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
            console.log('=== NUEVA SESIÓN DE EMERGENCIA CREADA ===');
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
            console.log('=== CARGANDO SESIÓN GUARDADA ===');
            console.log(`📁 Buscando archivo: ${this.stateFile}`);
            
            // Verificar si el archivo existe
            try {
                await fs.access(this.stateFile);
                console.log('✓ Archivo de sesión encontrado');
            } catch {
                console.log('❌ Archivo de sesión no existe');
                throw new Error('Archivo no encontrado');
            }
            
            // Leer y parsear el archivo
            const data = await fs.readFile(this.stateFile, 'utf8');
            const parsed = JSON.parse(data);
            
            // Obtener estadísticas del archivo
            const fileStats = await fs.stat(this.stateFile);
            console.log(`📊 Tamaño del archivo: ${fileStats.size} bytes`);
            console.log(`📅 Última modificación: ${fileStats.mtime.toLocaleString()}`);
            
            // Reconstruir el estado
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
            
            console.log('✓ Estado reconstruido exitosamente:');
            console.log(`- Jobs procesados: ${this.state.processedJobs.size}`);
            console.log(`- Última ejecución: ${this.state.lastRun ? new Date(this.state.lastRun).toLocaleString() : 'Nunca'}`);
            console.log(`- Búsquedas en historial: ${this.state.searchHistory.length}`);
            console.log(`- Versión del estado: ${parsed.version || 'No especificada'}`);
            console.log(`- Guardado originalmente: ${parsed.savedAt ? new Date(parsed.savedAt).toLocaleString() : 'No registrado'}`);
            console.log('=== SESIÓN CARGADA CORRECTAMENTE ===');
            
        } catch (error) {
            console.log('No hay sesión guardada anteriormente, creando nueva sesión...');
            console.log('🔄 Inicializando sesión vacía...');
            
            // Inicializar estado vacío
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
            
            // Guardar estado inicial
            await this.saveState();
        }
    }

    async saveState() {
        try {
            console.log('=== INICIANDO GUARDADO DE SESIÓN ===');
            
            // Asegurar que el directorio exista
            await this.ensureDataDirectory();
            console.log('✓ Directorio de datos verificado');
            
            const stateToSave = {
                lastRun: this.state.lastRun,
                processedJobs: Array.from(this.state.processedJobs),
                searchHistory: this.state.searchHistory.slice(-100), // Mantener últimos 100 registros
                stats: this.state.stats,
                savedAt: Date.now(),
                version: '1.0.0'
            };
            
            console.log('Preparando datos para guardar:');
            console.log(`- Jobs procesados: ${stateToSave.processedJobs.length}`);
            console.log(`- Última ejecución: ${stateToSave.lastRun ? new Date(stateToSave.lastRun).toLocaleString() : 'No definida'}`);
            console.log(`- Total histórico: ${stateToSave.stats.totalProcessed}`);
            console.log(`- Búsquedas en historial: ${stateToSave.searchHistory.length}`);
            
            const jsonData = JSON.stringify(stateToSave, null, 2);
            await fs.writeFile(this.stateFile, jsonData);
            
            // Verificar que el archivo se guardó correctamente
            try {
                await fs.access(this.stateFile);
                const stats = await fs.stat(this.stateFile);
                console.log(`✓ Sesión guardada exitosamente (${stats.size} bytes)`);
                console.log(`📁 Archivo: ${this.stateFile}`);
            } catch (verifyError) {
                throw new Error(`No se pudo verificar el archivo guardado: ${verifyError.message}`);
            }
            
            console.log('=== SESIÓN GUARDADA CORRECTAMENTE ===');
            console.log('========================');
            
        } catch (error) {
            console.error('❌ ERROR CRÍTICO AL GUARDAR SESIÓN:', error);
            console.error('Stack trace:', error.stack);
            
            // Intentar backup
            try {
                const backupFile = this.stateFile + '.backup';
                await fs.writeFile(backupFile, JSON.stringify({
                    error: error.message,
                    timestamp: Date.now(),
                    partialState: {
                        processedJobs: Array.from(this.state.processedJobs),
                        lastRun: this.state.lastRun
                    }
                }, null, 2));
                console.log(`📄 Backup de emergencia guardado en: ${backupFile}`);
            } catch (backupError) {
                console.error('❌ Error incluso en backup:', backupError);
            }
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

    async hasSessionFile() {
        try {
            await fs.access(this.stateFile);
            return true;
        } catch {
            return false;
        }
    }

    getStats() {
        return {
            ...this.state.stats,
            processedJobsCount: this.state.processedJobs.size,
            lastRun: this.state.lastRun,
            lastRunFormatted: this.state.lastRun ? new Date(this.state.lastRun).toLocaleString() : 'Nunca'
        };
    }

    async diagnoseSession() {
        console.log('=== DIAGNÓSTICO COMPLETO DE SESIÓN ===');
        
        try {
            // Verificar directorio
            await this.ensureDataDirectory();
            console.log('✓ Directorio de datos accesible');
            
            // Verificar archivo de estado
            try {
                await fs.access(this.stateFile);
                const stats = await fs.stat(this.stateFile);
                console.log('✓ Archivo de estado existe');
                console.log(`📊 Tamaño: ${stats.size} bytes`);
                console.log(`📅 Modificado: ${stats.mtime.toLocaleString()}`);
                
                // Leer contenido
                const data = await fs.readFile(this.stateFile, 'utf8');
                const parsed = JSON.parse(data);
                
                console.log('📋 Contenido del estado:');
                console.log(`  - Versión: ${parsed.version || 'No especificada'}`);
                console.log(`  - Guardado: ${parsed.savedAt ? new Date(parsed.savedAt).toLocaleString() : 'No registrado'}`);
                console.log(`  - Jobs procesados: ${(parsed.processedJobs || []).length}`);
                console.log(`  - Última ejecución: ${parsed.lastRun ? new Date(parsed.lastRun).toLocaleString() : 'Nunca'}`);
                console.log(`  - Total histórico: ${parsed.stats?.totalProcessed || 0}`);
                console.log(`  - Búsquedas: ${(parsed.searchHistory || []).length}`);
                
                return {
                    fileExists: true,
                    fileSize: stats.size,
                    lastModified: stats.mtime,
                    content: parsed,
                    isValid: true
                };
                
            } catch (fileError) {
                console.log('❌ Archivo de estado no existe o está corrupto');
                console.log(`Error: ${fileError.message}`);
                return {
                    fileExists: false,
                    error: fileError.message,
                    isValid: false
                };
            }
            
        } catch (error) {
            console.error('❌ Error en diagnóstico:', error);
            return {
                error: error.message,
                isValid: false
            };
        }
    }

    async forceSessionSave() {
        console.log('=== FORZANDO GUARDADO DE SESIÓN ===');
        
        try {
            const stateToSave = {
                lastRun: this.state.lastRun,
                processedJobs: Array.from(this.state.processedJobs),
                searchHistory: this.state.searchHistory.slice(-10), // Solo últimos 10 para diagnóstico
                stats: this.state.stats,
                savedAt: Date.now(),
                version: '1.0.0',
                forced: true
            };
            
            await this.ensureDataDirectory();
            await fs.writeFile(this.stateFile, JSON.stringify(stateToSave, null, 2));
            
            console.log('✓ Sesión guardada forzosamente');
            return true;
            
        } catch (error) {
            console.error('❌ Error al forzar guardado:', error);
            return false;
        }
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
