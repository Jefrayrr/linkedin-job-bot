class IncrementalJobFilter {
    constructor(stateManager) {
        this.stateManager = stateManager;
        
        // Configuración de corte inteligente
        this.cutoffConfig = {
            consecutiveOldJobs: 5,        // Jobs consecutivos viejos para activar corte
            maxJobsToProcess: 100,         // Límite máximo de jobs a procesar
            minNewJobsRatio: 0.1,         // Ratio mínimo de jobs nuevos para continuar
            maxScrollAttempts: 10,        // Máximo de intentos de scroll
            scrollDelay: 2000              // Delay entre scrolls (ms)
        };

        // Estadísticas del filtro
        this.stats = {
            totalJobs: 0,
            newJobs: 0,
            duplicateJobs: 0,
            oldJobs: 0,
            cutoffTriggered: false,
            processingTime: 0
        };
    }

    /**
     * Filtra jobs incrementalmente con corte inteligente
     * @param {Array} jobs - Array de jobs a filtrar
     * @param {Object} options - Opciones de filtrado
     * @returns {Object} Resultado del filtrado
     */
    async filterJobsIncremental(jobs, options = {}) {
        const startTime = Date.now();
        const config = { ...this.cutoffConfig, ...options };
        
        console.log(`Iniciando filtrado incremental de ${jobs.length} jobs`);
        
        const result = {
            newJobs: [],
            duplicateJobs: [],
            oldJobs: [],
            cutoffTriggered: false,
            processedCount: 0,
            stats: { ...this.stats }
        };

        let consecutiveOldJobs = 0;
        let processedJobs = 0;

        for (const job of jobs) {
            // Verificar límite máximo
            if (processedJobs >= config.maxJobsToProcess) {
                console.log(`Límite máximo de jobs alcanzado: ${config.maxJobsToProcess}`);
                break;
            }

            processedJobs++;
            result.processedCount++;

            // Evaluar job
            const jobResult = await this.evaluateJob(job);
            
            // Clasificar job
            if (jobResult.isNew) {
                result.newJobs.push(job);
                consecutiveOldJobs = 0; // Resetear contador
                console.log(`Job nuevo encontrado: ${job.title} (${job.company})`);
            } else if (jobResult.isDuplicate) {
                result.duplicateJobs.push(job);
                consecutiveOldJobs = 0;
                console.log(`Job duplicado: ${job.jobId}`);
            } else {
                result.oldJobs.push(job);
                consecutiveOldJobs++;
                console.log(`Job viejo: ${job.jobId} (${this.formatTimeAgo(job.timestamp)})`);
            }

            // Verificar corte inteligente
            if (consecutiveOldJobs >= config.consecutiveOldJobs) {
                console.log(`Corte inteligente activado: ${consecutiveOldJobs} jobs consecutivos viejos`);
                result.cutoffTriggered = true;
                break;
            }
        }

        // Actualizar estadísticas
        result.stats = this.updateStats(result, Date.now() - startTime);
        
        console.log(`Filtrado completado: ${result.newJobs.length} nuevos, ${result.duplicateJobs.length} duplicados, ${result.oldJobs.length} viejos`);
        
        return result;
    }

    /**
     * Evalúa un job individual
     * @param {Object} job - Job a evaluar
     * @returns {Object} Resultado de la evaluación
     */
    async evaluateJob(job) {
        const lastRun = this.stateManager.getLastRun();
        
        // Condición 1: Verificar si ya fue procesado
        const isProcessed = this.stateManager.isJobProcessed(job.jobId);
        if (isProcessed) {
            return {
                isNew: false,
                isDuplicate: true,
                isOld: false,
                reason: 'duplicate'
            };
        }

        // Condición 2: Verificar si es más reciente que la última ejecución
        const isNewer = lastRun ? job.timestamp > lastRun : true;
        if (!isNewer) {
            return {
                isNew: false,
                isDuplicate: false,
                isOld: true,
                reason: 'old_timestamp',
                timestamp: job.timestamp,
                lastRun: lastRun
            };
        }

        // Job nuevo
        return {
            isNew: true,
            isDuplicate: false,
            isOld: false,
            reason: 'new'
        };
    }

    /**
     * Marca jobs como procesados en el estado
     * @param {Array} jobs - Jobs a marcar
     */
    async markJobsAsProcessed(jobs) {
        const jobIds = jobs.map(job => job.jobId);
        await this.stateManager.markMultipleJobsAsProcessedWithSave(jobIds);
    }

    /**
     * Calcula ratio de jobs nuevos
     * @param {number} newCount - Cantidad de jobs nuevos
     * @param {number} totalCount - Total de jobs procesados
     * @returns {number} Ratio de jobs nuevos
     */
    calculateNewJobsRatio(newCount, totalCount) {
        if (totalCount === 0) return 0;
        return newCount / totalCount;
    }

    /**
     * Determina si se debe continuar procesando
     * @param {Object} currentStats - Estadísticas actuales
     * @param {Object} config - Configuración
     * @returns {boolean} True si se debe continuar
     */
    shouldContinueProcessing(currentStats, config) {
        // Verificar ratio de jobs nuevos
        const newJobsRatio = this.calculateNewJobsRatio(
            currentStats.newJobs,
            currentStats.processedCount
        );

        if (newJobsRatio < config.minNewJobsRatio && currentStats.processedCount > 10) {
            console.log(`Ratio de jobs nuevos muy bajo: ${(newJobsRatio * 100).toFixed(1)}%`);
            return false;
        }

        return true;
    }

    /**
     * Actualiza estadísticas del filtro
     * @param {Object} result - Resultado del filtrado
     * @param {number} processingTime - Tiempo de procesamiento
     * @returns {Object} Estadísticas actualizadas
     */
    updateStats(result, processingTime) {
        return {
            totalJobs: result.processedCount,
            newJobs: result.newJobs.length,
            duplicateJobs: result.duplicateJobs.length,
            oldJobs: result.oldJobs.length,
            cutoffTriggered: result.cutoffTriggered,
            processingTime,
            newJobsRatio: this.calculateNewJobsRatio(result.newJobs.length, result.processedCount),
            efficiency: result.newJobs.length > 0 ? 
                (result.newJobs.length / processingTime * 1000).toFixed(2) : 0 // jobs por segundo
        };
    }

    /**
     * Predice si un job será nuevo basado en patrones
     * @param {Object} job - Job a predecir
     * @returns {Object} Predicción
     */
    predictJobStatus(job) {
        const lastRun = this.stateManager.getLastRun();
        const age = Date.now() - job.timestamp;
        const ageHours = age / (1000 * 60 * 60);

        const prediction = {
            likelyNew: false,
            confidence: 0,
            reasons: []
        };

        // Si no hay última ejecución, probablemente sea nuevo
        if (!lastRun) {
            prediction.likelyNew = true;
            prediction.confidence = 0.8;
            prediction.reasons.push('first_run');
            return prediction;
        }

        // Basado en la edad
        if (ageHours < 24) {
            prediction.likelyNew = true;
            prediction.confidence += 0.6;
            prediction.reasons.push('very_recent');
        } else if (ageHours < 72) {
            prediction.likelyNew = true;
            prediction.confidence += 0.3;
            prediction.reasons.push('recent');
        }

        // Basado en si ya fue procesado
        if (this.stateManager.isJobProcessed(job.jobId)) {
            prediction.likelyNew = false;
            prediction.confidence = 0.9;
            prediction.reasons = ['already_processed'];
        }

        return prediction;
    }

    /**
     * Optimiza el orden de procesamiento de jobs
     * @param {Array} jobs - Jobs a ordenar
     * @returns {Array} Jobs ordenados por probabilidad de ser nuevos
     */
    optimizeProcessingOrder(jobs) {
        return jobs
            .map(job => ({
                ...job,
                prediction: this.predictJobStatus(job)
            }))
            .sort((a, b) => {
                // Priorizar jobs con mayor probabilidad de ser nuevos
                if (a.prediction.likelyNew && !b.prediction.likelyNew) return -1;
                if (!a.prediction.likelyNew && b.prediction.likelyNew) return 1;
                
                // Si ambos tienen misma probabilidad, ordenar por timestamp (más nuevos primero)
                return b.timestamp - a.timestamp;
            });
    }

    /**
     * Analiza patrones en los resultados para ajustar configuración
     * @param {Object} result - Resultado del filtrado
     * @returns {Object} Recomendaciones de configuración
     */
    analyzePatterns(result) {
        const recommendations = {
            adjustCutoffThreshold: false,
            newThreshold: null,
            adjustMaxJobs: false,
            newMaxJobs: null
        };

        // Si muchos jobs nuevos fueron encontrados al final, reducir umbral de corte
        const totalProcessed = result.processedCount;
        const newJobsCount = result.newJobs.length;
        const newJobsRatio = newJobsCount / totalProcessed;

        if (newJobsRatio > 0.3 && result.cutoffTriggered) {
            recommendations.adjustCutoffThreshold = true;
            recommendations.newThreshold = this.cutoffConfig.consecutiveOldJobs + 2;
        }

        // Si se procesaron muchos jobs pero pocos nuevos, aumentar umbral de corte
        if (newJobsRatio < 0.05 && totalProcessed > 50) {
            recommendations.adjustCutoffThreshold = true;
            recommendations.newThreshold = Math.max(3, this.cutoffConfig.consecutiveOldJobs - 1);
        }

        // Si siempre se alcanza el límite máximo, aumentarlo
        if (result.processedCount >= this.cutoffConfig.maxJobsToProcess && !result.cutoffTriggered) {
            recommendations.adjustMaxJobs = true;
            recommendations.newMaxJobs = this.cutoffConfig.maxJobsToProcess * 1.5;
        }

        return recommendations;
    }

    /**
     * Formatea tiempo relativo para logging
     * @param {number} timestamp - Timestamp en milisegundos
     * @returns {string} Tiempo formateado
     */
    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `hace ${days} día${days > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
        } else {
            const minutes = Math.floor(diff / (1000 * 60));
            return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
        }
    }

    /**
     * Obtiene estadísticas detalladas del filtro
     * @returns {Object} Estadísticas actuales
     */
    getFilterStats() {
        return {
            ...this.stats,
            cutoffConfig: { ...this.cutoffConfig },
            processedJobsCount: this.stateManager.getProcessedJobsCount(),
            lastRun: this.stateManager.getLastRun()
        };
    }

    /**
     * Reinicia estadísticas del filtro
     */
    resetStats() {
        this.stats = {
            totalJobs: 0,
            newJobs: 0,
            duplicateJobs: 0,
            oldJobs: 0,
            cutoffTriggered: false,
            processingTime: 0
        };
    }
}

module.exports = IncrementalJobFilter;
