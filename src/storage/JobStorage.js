const fs = require('fs').promises;
const path = require('path');

class JobStorage {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.jobsFile = path.join(this.dataDir, 'jobs.json');
        this.indexFile = path.join(this.dataDir, 'jobs-index.json');
        
        // Configuración
        this.config = {
            maxJobsPerFile: 1000,
            compressionEnabled: true,
            indexUpdateThreshold: 50
        };

        // Índices en memoria
        this.jobsIndex = {
            byId: new Map(),
            byCompany: new Map(),
            byLocation: new Map(),
            byDate: new Map(),
            byScore: new Map(),
            byKeywords: new Map()
        };

        // Estadísticas
        this.stats = {
            totalJobs: 0,
            storageSize: 0,
            lastUpdate: null,
            indexSize: 0
        };
    }

    /**
     * Inicializa el sistema de almacenamiento
     */
    async initialize() {
        try {
            await this.ensureDataDirectory();
            await this.loadJobsIndex();
            console.log('Sistema de almacenamiento inicializado');
        } catch (error) {
            console.error('Error inicializando almacenamiento:', error);
            await this.createEmptyStorage();
        }
    }

    /**
     * Asegura que el directorio de datos exista
     */
    async ensureDataDirectory() {
        try {
            await fs.access(this.dataDir);
        } catch {
            await fs.mkdir(this.dataDir, { recursive: true });
        }
    }

    /**
     * Carga el índice de jobs
     */
    async loadJobsIndex() {
        try {
            const data = await fs.readFile(this.indexFile, 'utf8');
            const indexData = JSON.parse(data);

            // Reconstruir Maps desde el JSON
            this.jobsIndex.byId = new Map(Object.entries(indexData.byId || {}));
            this.jobsIndex.byCompany = new Map(Object.entries(indexData.byCompany || {}));
            this.jobsIndex.byLocation = new Map(Object.entries(indexData.byLocation || {}));
            this.jobsIndex.byDate = new Map(Object.entries(indexData.byDate || {}));
            this.jobsIndex.byScore = new Map(Object.entries(indexData.byScore || {}));
            this.jobsIndex.byKeywords = new Map(Object.entries(indexData.byKeywords || {}));

            this.stats.totalJobs = indexData.totalJobs || 0;
            this.stats.lastUpdate = indexData.lastUpdate || null;

            console.log(`Índice cargado: ${this.stats.totalJobs} jobs indexados`);
        } catch (error) {
            console.warn('No se pudo cargar el índice, creando vacío:', error.message);
            await this.createEmptyIndex();
        }
    }

    /**
     * Almacena un array de jobs
     * @param {Array} jobs - Jobs a almacenar
     * @returns {Object} Resultado del almacenamiento
     */
    async storeJobs(jobs) {
        console.log(`Almacenando ${jobs.length} jobs`);
        
        const startTime = Date.now();
        const result = {
            stored: 0,
            duplicates: 0,
            errors: [],
            processingTime: 0
        };

        try {
            // Agrupar jobs por fecha para mejor organización
            const jobsByDate = this.groupJobsByDate(jobs);
            
            for (const [date, dateJobs] of jobsByDate) {
                const dateResult = await this.storeJobsByDate(date, dateJobs);
                result.stored += dateResult.stored;
                result.duplicates += dateResult.duplicates;
                result.errors.push(...dateResult.errors);
            }

            // Actualizar índice
            await this.updateJobsIndex(jobs);

            // Actualizar estadísticas
            this.stats.totalJobs += result.stored;
            this.stats.lastUpdate = Date.now();
            this.stats.storageSize = await this.calculateStorageSize();

            result.processingTime = Date.now() - startTime;
            
            console.log(`Almacenamiento completado: ${result.stored} nuevos, ${result.duplicates} duplicados`);

            return result;

        } catch (error) {
            console.error('Error almacenando jobs:', error);
            result.errors.push(error.message);
            return result;
        }
    }

    /**
     * Agrupa jobs por fecha
     * @param {Array} jobs - Jobs a agrupar
     * @returns {Map} Jobs agrupados por fecha
     */
    groupJobsByDate(jobs) {
        const grouped = new Map();

        jobs.forEach(job => {
            const date = new Date(job.timestamp || job.extractedAt).toISOString().split('T')[0];
            
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            
            grouped.get(date).push(job);
        });

        return grouped;
    }

    /**
     * Almacena jobs de una fecha específica
     * @param {string} date - Fecha en formato YYYY-MM-DD
     * @param {Array} jobs - Jobs de esa fecha
     * @returns {Object} Resultado del almacenamiento
     */
    async storeJobsByDate(date, jobs) {
        const dateFile = path.join(this.dataDir, `jobs-${date}.json`);
        const result = { stored: 0, duplicates: 0, errors: [] };

        try {
            // Cargar jobs existentes de esa fecha
            let existingJobs = [];
            try {
                const data = await fs.readFile(dateFile, 'utf8');
                existingJobs = JSON.parse(data);
            } catch {
                // Archivo no existe, se creará
            }

            // Crear set de IDs existentes para detección de duplicados
            const existingIds = new Set(existingJobs.map(job => job.jobId));

            // Filtrar y agregar jobs nuevos
            const newJobs = jobs.filter(job => {
                if (existingIds.has(job.jobId)) {
                    result.duplicates++;
                    return false;
                }
                return true;
            });

            if (newJobs.length > 0) {
                // Combinar jobs existentes con nuevos
                const allJobs = [...existingJobs, ...newJobs];
                
                // Ordenar por timestamp (más nuevos primero)
                allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                // Guardar archivo
                await fs.writeFile(dateFile, JSON.stringify(allJobs, null, 2));
                result.stored = newJobs.length;
                
                console.log(`Guardados ${newJobs.length} jobs para fecha ${date}`);
            }

        } catch (error) {
            console.error(`Error almacenando jobs para fecha ${date}:`, error);
            result.errors.push(error.message);
        }

        return result;
    }

    /**
     * Actualiza el índice de jobs
     * @param {Array} jobs - Jobs a indexar
     */
    async updateJobsIndex(jobs) {
        for (const job of jobs) {
            // Índice por ID
            this.jobsIndex.byId.set(job.jobId, {
                title: job.title,
                company: job.company,
                location: job.location,
                timestamp: job.timestamp,
                score: job.score?.total || 0,
                file: this.getJobFileName(job)
            });

            // Índice por compañía
            if (!this.jobsIndex.byCompany.has(job.company)) {
                this.jobsIndex.byCompany.set(job.company, []);
            }
            this.jobsIndex.byCompany.get(job.company).push(job.jobId);

            // Índice por ubicación
            if (!this.jobsIndex.byLocation.has(job.location)) {
                this.jobsIndex.byLocation.set(job.location, []);
            }
            this.jobsIndex.byLocation.get(job.location).push(job.jobId);

            // Índice por fecha
            const date = new Date(job.timestamp || job.extractedAt).toISOString().split('T')[0];
            if (!this.jobsIndex.byDate.has(date)) {
                this.jobsIndex.byDate.set(date, []);
            }
            this.jobsIndex.byDate.get(date).push(job.jobId);

            // Índice por score
            const scoreCategory = this.getScoreCategory(job.score?.total || 0);
            if (!this.jobsIndex.byScore.has(scoreCategory)) {
                this.jobsIndex.byScore.set(scoreCategory, []);
            }
            this.jobsIndex.byScore.get(scoreCategory).push(job.jobId);

            // Índice por palabras clave
            const keywords = this.extractKeywords(job);
            keywords.forEach(keyword => {
                if (!this.jobsIndex.byKeywords.has(keyword)) {
                    this.jobsIndex.byKeywords.set(keyword, []);
                }
                this.jobsIndex.byKeywords.get(keyword).push(job.jobId);
            });
        }

        // Guardar índice si hay suficientes cambios
        if (jobs.length >= this.config.indexUpdateThreshold) {
            await this.saveJobsIndex();
        }
    }

    /**
     * Extrae palabras clave de un job
     * @param {Object} job - Job del que extraer keywords
     * @returns {Array} Array de keywords
     */
    extractKeywords(job) {
        const text = `${job.title} ${job.company} ${job.location}`.toLowerCase();
        const keywords = [];

        // Extraer palabras significativas (más de 3 caracteres)
        const words = text.match(/\b\w{3,}\b/g) || [];
        
        // Contar frecuencia y tomar las más comunes
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });

        // Retornar palabras que aparecen al menos 2 veces o son términos importantes
        Object.entries(wordCount).forEach(([word, count]) => {
            if (count >= 2 || this.isImportantKeyword(word)) {
                keywords.push(word);
            }
        });

        return keywords.slice(0, 10); // Limitar a 10 keywords
    }

    /**
     * Determina si una palabra es keyword importante
     * @param {string} word - Palabra a evaluar
     * @returns {boolean} True si es importante
     */
    isImportantKeyword(word) {
        const importantWords = [
            'senior', 'junior', 'engineer', 'developer', 'manager', 'director',
            'remote', 'javascript', 'python', 'react', 'node', 'aws', 'fullstack'
        ];
        
        return importantWords.includes(word);
    }

    /**
     * Obtiene categoría de score
     * @param {number} score - Score numérico
     * @returns {string} Categoría
     */
    getScoreCategory(score) {
        if (score >= 90) return 'excellent';
        if (score >= 70) return 'good';
        if (score >= 50) return 'average';
        return 'poor';
    }

    /**
     * Obtiene nombre de archivo para un job
     * @param {Object} job - Job
     * @returns {string} Nombre del archivo
     */
    getJobFileName(job) {
        const date = new Date(job.timestamp || job.extractedAt).toISOString().split('T')[0];
        return `jobs-${date}.json`;
    }

    /**
     * Guarda el índice de jobs
     */
    async saveJobsIndex() {
        try {
            const indexData = {
                byId: Object.fromEntries(this.jobsIndex.byId),
                byCompany: Object.fromEntries(this.jobsIndex.byCompany),
                byLocation: Object.fromEntries(this.jobsIndex.byLocation),
                byDate: Object.fromEntries(this.jobsIndex.byDate),
                byScore: Object.fromEntries(this.jobsIndex.byScore),
                byKeywords: Object.fromEntries(this.jobsIndex.byKeywords),
                totalJobs: this.stats.totalJobs,
                lastUpdate: this.stats.lastUpdate
            };

            await fs.writeFile(this.indexFile, JSON.stringify(indexData, null, 2));
            
            this.stats.indexSize = (await fs.stat(this.indexFile)).size;
            console.log('Índice de jobs guardado');
        } catch (error) {
            console.error('Error guardando índice:', error);
        }
    }

    /**
     * Busca jobs por diferentes criterios
     * @param {Object} criteria - Criterios de búsqueda
     * @returns {Array} Jobs encontrados
     */
    async searchJobs(criteria) {
        const results = [];
        
        try {
            // Búsqueda por ID
            if (criteria.jobId) {
                const job = await this.getJobById(criteria.jobId);
                if (job) results.push(job);
            }

            // Búsqueda por compañía
            if (criteria.company) {
                const companyJobs = await this.getJobsByCompany(criteria.company);
                results.push(...companyJobs);
            }

            // Búsqueda por ubicación
            if (criteria.location) {
                const locationJobs = await this.getJobsByLocation(criteria.location);
                results.push(...locationJobs);
            }

            // Búsqueda por rango de fechas
            if (criteria.dateFrom || criteria.dateTo) {
                const dateJobs = await this.getJobsByDateRange(criteria.dateFrom, criteria.dateTo);
                results.push(...dateJobs);
            }

            // Búsqueda por score
            if (criteria.minScore) {
                const scoreJobs = await this.getJobsByMinScore(criteria.minScore);
                results.push(...scoreJobs);
            }

            // Búsqueda por palabras clave
            if (criteria.keywords) {
                const keywordJobs = await this.getJobsByKeywords(criteria.keywords);
                results.push(...keywordJobs);
            }

            // Eliminar duplicados y ordenar
            const uniqueResults = this.removeDuplicates(results);
            return this.sortJobs(uniqueResults, criteria.sortBy);

        } catch (error) {
            console.error('Error en búsqueda de jobs:', error);
            return [];
        }
    }

    /**
     * Obtiene job por ID
     * @param {string} jobId - ID del job
     * @returns {Object|null} Job encontrado
     */
    async getJobById(jobId) {
        const indexEntry = this.jobsIndex.byId.get(jobId);
        if (!indexEntry) return null;

        try {
            const data = await fs.readFile(path.join(this.dataDir, indexEntry.file), 'utf8');
            const jobs = JSON.parse(data);
            return jobs.find(job => job.jobId === jobId) || null;
        } catch (error) {
            console.error(`Error obteniendo job ${jobId}:`, error);
            return null;
        }
    }

    /**
     * Obtiene jobs por compañía
     * @param {string} company - Nombre de la compañía
     * @returns {Array} Jobs de la compañía
     */
    async getJobsByCompany(company) {
        const jobIds = this.jobsIndex.byCompany.get(company) || [];
        const jobs = [];

        for (const jobId of jobIds) {
            const job = await this.getJobById(jobId);
            if (job) jobs.push(job);
        }

        return jobs;
    }

    /**
     * Obtiene jobs por ubicación
     * @param {string} location - Ubicación
     * @returns {Array} Jobs de la ubicación
     */
    async getJobsByLocation(location) {
        const jobIds = this.jobsIndex.byLocation.get(location) || [];
        const jobs = [];

        for (const jobId of jobIds) {
            const job = await this.getJobById(jobId);
            if (job) jobs.push(job);
        }

        return jobs;
    }

    /**
     * Obtiene jobs por rango de fechas
     * @param {string} dateFrom - Fecha inicial (YYYY-MM-DD)
     * @param {string} dateTo - Fecha final (YYYY-MM-DD)
     * @returns {Array} Jobs en el rango
     */
    async getJobsByDateRange(dateFrom, dateTo) {
        const jobs = [];
        const dates = this.jobsIndex.byDate.keys();

        for (const date of dates) {
            if ((!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)) {
                const dateJobs = await this.getJobsByDate(date);
                jobs.push(...dateJobs);
            }
        }

        return jobs;
    }

    /**
     * Obtiene jobs de una fecha específica
     * @param {string} date - Fecha (YYYY-MM-DD)
     * @returns {Array} Jobs de esa fecha
     */
    async getJobsByDate(date) {
        const dateFile = path.join(this.dataDir, `jobs-${date}.json`);
        
        try {
            const data = await fs.readFile(dateFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * Obtiene jobs por score mínimo
     * @param {number} minScore - Score mínimo
     * @returns {Array} Jobs con score >= minScore
     */
    async getJobsByMinScore(minScore) {
        const jobs = [];
        const categories = ['excellent', 'good', 'average'];
        
        for (const category of categories) {
            const jobIds = this.jobsIndex.byScore.get(category) || [];
            
            for (const jobId of jobIds) {
                const job = await this.getJobById(jobId);
                if (job && job.score?.total >= minScore) {
                    jobs.push(job);
                }
            }
        }

        return jobs;
    }

    /**
     * Obtiene jobs por palabras clave
     * @param {Array} keywords - Palabras clave a buscar
     * @returns {Array} Jobs con esas keywords
     */
    async getJobsByKeywords(keywords) {
        const jobIds = new Set();
        
        keywords.forEach(keyword => {
            const ids = this.jobsIndex.byKeywords.get(keyword.toLowerCase()) || [];
            ids.forEach(id => jobIds.add(id));
        });

        const jobs = [];
        for (const jobId of jobIds) {
            const job = await this.getJobById(jobId);
            if (job) jobs.push(job);
        }

        return jobs;
    }

    /**
     * Elimina duplicados de un array de jobs
     * @param {Array} jobs - Jobs a deduplicar
     * @returns {Array} Jobs sin duplicados
     */
    removeDuplicates(jobs) {
        const seen = new Set();
        return jobs.filter(job => {
            if (seen.has(job.jobId)) return false;
            seen.add(job.jobId);
            return true;
        });
    }

    /**
     * Ordena jobs
     * @param {Array} jobs - Jobs a ordenar
     * @param {string} sortBy - Criterio de ordenamiento
     * @returns {Array} Jobs ordenados
     */
    sortJobs(jobs, sortBy = 'timestamp') {
        return jobs.sort((a, b) => {
            switch (sortBy) {
                case 'timestamp':
                    return (b.timestamp || 0) - (a.timestamp || 0);
                case 'score':
                    return (b.score?.total || 0) - (a.score?.total || 0);
                case 'title':
                    return (a.title || '').localeCompare(b.title || '');
                case 'company':
                    return (a.company || '').localeCompare(b.company || '');
                default:
                    return 0;
            }
        });
    }

    /**
     * Calcula tamaño total del almacenamiento
     * @returns {number} Tamaño en bytes
     */
    async calculateStorageSize() {
        try {
            const files = await fs.readdir(this.dataDir);
            let totalSize = 0;

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.dataDir, file);
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;
                }
            }

            return totalSize;
        } catch (error) {
            console.error('Error calculando tamaño de almacenamiento:', error);
            return 0;
        }
    }

    /**
     * Obtiene estadísticas del almacenamiento
     * @returns {Object} Estadísticas actuales
     */
    async getStorageStats() {
        const storageSize = await this.calculateStorageSize();
        
        return {
            ...this.stats,
            storageSize,
            storageSizeFormatted: this.formatBytes(storageSize),
            indexSizeFormatted: this.formatBytes(this.stats.indexSize),
            filesCount: await this.getFilesCount(),
            averageJobsPerFile: this.stats.totalJobs > 0 ? 
                Math.round(this.stats.totalJobs / await this.getFilesCount()) : 0
        };
    }

    /**
     * Obtiene cantidad de archivos de jobs
     * @returns {number} Cantidad de archivos
     */
    async getFilesCount() {
        try {
            const files = await fs.readdir(this.dataDir);
            return files.filter(file => file.startsWith('jobs-') && file.endsWith('.json')).length;
        } catch {
            return 0;
        }
    }

    /**
     * Formatea bytes a formato legible
     * @param {number} bytes - Bytes a formatear
     * @returns {string} Bytes formateados
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Crea almacenamiento vacío
     */
    async createEmptyStorage() {
        await this.createEmptyIndex();
        console.log('Almacenamiento vacío creado');
    }

    /**
     * Crea índice vacío
     */
    async createEmptyIndex() {
        const emptyIndex = {
            byId: {},
            byCompany: {},
            byLocation: {},
            byDate: {},
            byScore: {},
            byKeywords: {},
            totalJobs: 0,
            lastUpdate: null
        };

        await fs.writeFile(this.indexFile, JSON.stringify(emptyIndex, null, 2));
    }

    /**
     * Limpia jobs antiguos
     * @param {number} maxAge - Edad máxima en días
     */
    async cleanupOldJobs(maxAge = 90) {
        console.log(`Limpiando jobs más antiguos que ${maxAge} días`);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAge);
        const cutoffString = cutoffDate.toISOString().split('T')[0];

        let deletedCount = 0;

        try {
            const files = await fs.readdir(this.dataDir);
            
            for (const file of files) {
                if (file.startsWith('jobs-') && file.endsWith('.json')) {
                    const fileDate = file.replace('jobs-', '').replace('.json', '');
                    
                    if (fileDate < cutoffString) {
                        const filePath = path.join(this.dataDir, file);
                        await fs.unlink(filePath);
                        deletedCount++;
                        
                        console.log(`Eliminado archivo antiguo: ${file}`);
                    }
                }
            }

            // Actualizar índice
            await this.rebuildIndex();

            console.log(`Limpieza completada: ${deletedCount} archivos eliminados`);

        } catch (error) {
            console.error('Error en limpieza de jobs antiguos:', error);
        }
    }

    /**
     * Reconstruye el índice desde cero
     */
    async rebuildIndex() {
        console.log('Reconstruyendo índice...');
        
        // Limpiar índice actual
        this.jobsIndex = {
            byId: new Map(),
            byCompany: new Map(),
            byLocation: new Map(),
            byDate: new Map(),
            byScore: new Map(),
            byKeywords: new Map()
        };

        try {
            const files = await fs.readdir(this.dataDir);
            
            for (const file of files) {
                if (file.startsWith('jobs-') && file.endsWith('.json')) {
                    const filePath = path.join(this.dataDir, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const jobs = JSON.parse(data);
                    
                    await this.updateJobsIndex(jobs);
                }
            }

            await this.saveJobsIndex();
            console.log('Índice reconstruido exitosamente');

        } catch (error) {
            console.error('Error reconstruyendo índice:', error);
        }
    }
}

module.exports = JobStorage;
