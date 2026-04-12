class JobDeduplicator {
    constructor(stateManager) {
        this.stateManager = stateManager;
        
        // Configuración de deduplicación
        this.config = {
            similarityThreshold: 0.8,        // Umbral de similitud para títulos
            companyWeight: 0.3,              // Peso de la compañía en similitud
            titleWeight: 0.5,                // Peso del título en similitud
            locationWeight: 0.2,             // Peso de la ubicación en similitud
            maxCacheSize: 10000,             // Tamaño máximo del caché
            cleanupThreshold: 0.8            // Umbral para limpieza de caché
        };

        // Caché en memoria para jobs procesados
        this.jobCache = new Map();
        this.similarityCache = new Map();
        
        // Estadísticas
        this.stats = {
            totalProcessed: 0,
            duplicatesFound: 0,
            similarityMatches: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Deduplica un array de jobs
     * @param {Array} jobs - Jobs a deduplicar
     * @returns {Object} Resultado de deduplicación
     */
    async deduplicateJobs(jobs) {
        console.log(`Iniciando deduplicación de ${jobs.length} jobs`);
        
        const startTime = Date.now();
        const result = {
            uniqueJobs: [],
            duplicateJobs: [],
            similarJobs: [],
            stats: { ...this.stats }
        };

        const processedJobIds = new Set();
        const seenJobSignatures = new Set();

        for (const job of jobs) {
            this.stats.totalProcessed++;

            // Verificar duplicación exacta por ID
            if (this.isExactDuplicate(job.jobId)) {
                result.duplicateJobs.push({
                    ...job,
                    duplicateReason: 'exact_id',
                    originalJobId: job.jobId
                });
                this.stats.duplicatesFound++;
                continue;
            }

            // Verificar duplicación por firma
            const jobSignature = this.generateJobSignature(job);
            if (seenJobSignatures.has(jobSignature)) {
                result.duplicateJobs.push({
                    ...job,
                    duplicateReason: 'signature',
                    signature: jobSignature
                });
                this.stats.duplicatesFound++;
                continue;
            }

            // Verificar similitud con jobs existentes
            const similarJob = await this.findSimilarJob(job);
            if (similarJob) {
                result.similarJobs.push({
                    ...job,
                    duplicateReason: 'similarity',
                    similarJobId: similarJob.jobId,
                    similarityScore: similarJob.similarityScore
                });
                this.stats.similarityMatches++;
                continue;
            }

            // Job único
            result.uniqueJobs.push(job);
            processedJobIds.add(job.jobId);
            seenJobSignatures.add(jobSignature);
            
            // Agregar al caché
            this.addToJobCache(job);
        }

        // Actualizar estadísticas
        result.stats = {
            ...this.stats,
            processingTime: Date.now() - startTime,
            deduplicationRate: (this.stats.duplicatesFound / this.stats.totalProcessed * 100).toFixed(2)
        };

        console.log(`Deduplicación completada: ${result.uniqueJobs.length} únicos, ${result.duplicateJobs.length} duplicados, ${result.similarJobs.length} similares`);

        return result;
    }

    /**
     * Verifica si un job es duplicado exacto
     * @param {string} jobId - ID del job
     * @returns {boolean} True si es duplicado
     */
    isExactDuplicate(jobId) {
        // Verificar en el estado persistente
        const inState = this.stateManager.isJobProcessed(jobId);
        
        // Verificar en el caché
        const inCache = this.jobCache.has(jobId);
        
        return inState || inCache;
    }

    /**
     * Genera una firma única para un job
     * @param {Object} job - Datos del job
     * @returns {string} Firma del job
     */
    generateJobSignature(job) {
        // Normalizar datos
        const normalizedTitle = this.normalizeText(job.title);
        const normalizedCompany = this.normalizeText(job.company);
        const normalizedLocation = this.normalizeText(job.location);

        // Crear firma combinada
        const signature = [
            normalizedTitle.toLowerCase(),
            normalizedCompany.toLowerCase(),
            normalizedLocation.toLowerCase()
        ].join('|');

        // Generar hash simple
        return this.simpleHash(signature);
    }

    /**
     * Normaliza texto para comparación
     * @param {string} text - Texto a normalizar
     * @returns {string} Texto normalizado
     */
    normalizeText(text) {
        if (!text) return '';
        
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remover caracteres especiales
            .replace(/\s+/g, ' ')    // Normalizar espacios
            .trim();
    }

    /**
     * Genera hash simple de una cadena
     * @param {string} str - Cadena a hashear
     * @returns {string} Hash
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convertir a 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Busca jobs similares
     * @param {Object} job - Job a comparar
     * @returns {Object|null} Job similar encontrado
     */
    async findSimilarJob(job) {
        const cacheKey = this.generateSimilarityCacheKey(job);
        
        // Verificar caché de similitud
        if (this.similarityCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.similarityCache.get(cacheKey);
        }

        this.stats.cacheMisses++;

        // Buscar en jobs procesados recientes
        const recentJobs = this.getRecentJobs(100); // Últimos 100 jobs
        
        for (const existingJob of recentJobs) {
            const similarity = this.calculateJobSimilarity(job, existingJob);
            
            if (similarity >= this.config.similarityThreshold) {
                const result = {
                    ...existingJob,
                    similarityScore: similarity
                };
                
                // Cachear resultado
                this.similarityCache.set(cacheKey, result);
                
                return result;
            }
        }

        // No se encontraron jobs similares
        this.similarityCache.set(cacheKey, null);
        return null;
    }

    /**
     * Calcula similitud entre dos jobs
     * @param {Object} job1 - Primer job
     * @param {Object} job2 - Segundo job
     * @returns {number} Score de similitud (0-1)
     */
    calculateJobSimilarity(job1, job2) {
        const titleSimilarity = this.calculateTextSimilarity(job1.title, job2.title);
        const companySimilarity = this.calculateTextSimilarity(job1.company, job2.company);
        const locationSimilarity = this.calculateTextSimilarity(job1.location, job2.location);

        // Ponderar similitudes
        const weightedSimilarity = (
            titleSimilarity * this.config.titleWeight +
            companySimilarity * this.config.companyWeight +
            locationSimilarity * this.config.locationWeight
        );

        return Math.min(weightedSimilarity, 1.0);
    }

    /**
     * Calcula similitud entre dos textos
     * @param {string} text1 - Primer texto
     * @param {string} text2 - Segundo texto
     * @returns {number} Score de similitud (0-1)
     */
    calculateTextSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;

        const words1 = this.normalizeText(text1).split(' ');
        const words2 = this.normalizeText(text2).split(' ');

        // Calcular intersección
        const intersection = words1.filter(word => words2.includes(word));
        const union = [...new Set([...words1, ...words2])];

        // Coeficiente de Jaccard
        const jaccardSimilarity = intersection.length / union.length;

        // Bonus por palabras exactas en orden
        const orderedSimilarity = this.calculateOrderedSimilarity(words1, words2);

        // Combinar similitudes
        return (jaccardSimilarity * 0.7 + orderedSimilarity * 0.3);
    }

    /**
     * Calcula similitud manteniendo el orden de palabras
     * @param {Array} words1 - Array de palabras 1
     * @param {Array} words2 - Array de palabras 2
     * @returns {number} Score de similitud ordenada (0-1)
     */
    calculateOrderedSimilarity(words1, words2) {
        let matches = 0;
        const minLength = Math.min(words1.length, words2.length);

        for (let i = 0; i < minLength; i++) {
            if (words1[i] === words2[i]) {
                matches++;
            }
        }

        return minLength > 0 ? matches / minLength : 0;
    }

    /**
     * Genera clave para caché de similitud
     * @param {Object} job - Job para generar clave
     * @returns {string} Clave de caché
     */
    generateSimilarityCacheKey(job) {
        const normalizedTitle = this.normalizeText(job.title);
        const normalizedCompany = this.normalizeText(job.company);
        
        return `${normalizedTitle.substring(0, 20)}_${normalizedCompany.substring(0, 15)}`;
    }

    /**
     * Obtiene jobs recientes del caché
     * @param {number} limit - Límite de jobs a obtener
     * @returns {Array} Jobs recientes
     */
    getRecentJobs(limit) {
        const jobs = Array.from(this.jobCache.values());
        
        // Ordenar por timestamp de extracción (más recientes primero)
        jobs.sort((a, b) => b.extractedAt - a.extractedAt);
        
        return jobs.slice(0, limit);
    }

    /**
     * Agrega job al caché
     * @param {Object} job - Job a agregar
     */
    addToJobCache(job) {
        this.jobCache.set(job.jobId, job);
        
        // Limpiar caché si es necesario
        if (this.jobCache.size > this.config.maxCacheSize) {
            this.cleanupCache();
        }
    }

    /**
     * Limpia el caché de jobs
     */
    cleanupCache() {
        if (this.jobCache.size <= this.config.maxCacheSize * this.config.cleanupThreshold) {
            return;
        }

        console.log('Limpiando caché de jobs...');

        // Convertir a array y ordenar por antigüedad
        const jobs = Array.from(this.jobCache.entries());
        jobs.sort((a, b) => a[1].extractedAt - b[1].extractedAt);

        // Mantener los más recientes
        const keepCount = Math.floor(this.config.maxCacheSize * (1 - this.config.cleanupThreshold));
        const toKeep = jobs.slice(-keepCount);

        // Reconstruir caché
        this.jobCache.clear();
        toKeep.forEach(([jobId, job]) => {
            this.jobCache.set(jobId, job);
        });

        // Limpiar caché de similitud
        if (this.similarityCache.size > 1000) {
            this.similarityCache.clear();
        }

        console.log(`Caché limpiado: ${this.jobCache.size} jobs mantenidos`);
    }

    /**
     * Agrupa jobs similares
     * @param {Array} jobs - Jobs a agrupar
     * @returns {Array} Grupos de jobs similares
     */
    groupSimilarJobs(jobs) {
        const groups = [];
        const processed = new Set();

        for (const job of jobs) {
            if (processed.has(job.jobId)) continue;

            const similarJobs = [job];
            processed.add(job.jobId);

            // Buscar jobs similares
            for (const otherJob of jobs) {
                if (processed.has(otherJob.jobId)) continue;

                const similarity = this.calculateJobSimilarity(job, otherJob);
                if (similarity >= this.config.similarityThreshold) {
                    similarJobs.push(otherJob);
                    processed.add(otherJob.jobId);
                }
            }

            groups.push({
                representative: job,
                similarJobs: similarJobs.slice(1),
                groupSize: similarJobs.length
            });
        }

        return groups;
    }

    /**
     * Obtiene estadísticas de deduplicación
     * @returns {Object} Estadísticas actuales
     */
    getDeduplicationStats() {
        const cacheHitRate = this.stats.cacheHits + this.stats.cacheMisses > 0 ?
            (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2) : 0;

        return {
            ...this.stats,
            cacheHitRate: parseFloat(cacheHitRate),
            cacheSize: this.jobCache.size,
            similarityCacheSize: this.similarityCache.size,
            deduplicationRate: this.stats.totalProcessed > 0 ?
                (this.stats.duplicatesFound / this.stats.totalProcessed * 100).toFixed(2) : 0
        };
    }

    /**
     * Reinicia estadísticas
     */
    resetStats() {
        this.stats = {
            totalProcessed: 0,
            duplicatesFound: 0,
            similarityMatches: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Limpia todos los cachés
     */
    clearCaches() {
        this.jobCache.clear();
        this.similarityCache.clear();
        console.log('Todos los cachés han sido limpiados');
    }

    /**
     * Exporta estado para persistencia
     * @returns {Object} Estado exportable
     */
    exportState() {
        return {
            config: { ...this.config },
            stats: { ...this.stats },
            jobCacheSize: this.jobCache.size,
            similarityCacheSize: this.similarityCache.size
        };
    }
}

module.exports = JobDeduplicator;
