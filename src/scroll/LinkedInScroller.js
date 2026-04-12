class LinkedInScroller {
    constructor() {
        this.config = {
            maxScrollAttempts: 10,
            scrollDelay: 2000,
            scrollStep: 800,
            waitForNewContent: 3000,
            minNewJobsThreshold: 3,
            maxScrollHeight: 50000,
            scrollTimeout: 30000
        };

        this.stats = {
            scrollAttempts: 0,
            totalJobsFound: 0,
            newJobsPerScroll: [],
            scrollHeights: [],
            finalScrollHeight: 0
        };
    }

    /**
     * Realiza scroll progresivo en la página de búsqueda de LinkedIn
     * @param {Page} page - Página de Puppeteer
     * @param {Function} jobExtractor - Función para extraer jobs
     * @param {Object} options - Opciones de configuración
     * @returns {Object} Resultado del scroll
     */
    async performProgressiveScroll(page, jobExtractor, options = {}) {
        const config = { ...this.config, ...options };
        console.log('Iniciando scroll progresivo en LinkedIn');

        this.resetStats();
        const allJobs = [];
        let lastJobCount = 0;
        let consecutiveNoNewJobs = 0;

        try {
            // Esperar carga inicial
            await this.waitForInitialLoad(page);

            for (let attempt = 0; attempt < config.maxScrollAttempts; attempt++) {
                console.log(`Intento de scroll ${attempt + 1}/${config.maxScrollAttempts}`);

                // Extraer jobs actuales
                const currentJobs = await jobExtractor(page);
                const newJobsCount = currentJobs.length - lastJobCount;

                if (newJobsCount > 0) {
                    // Filtrar jobs nuevos
                    const newJobs = currentJobs.slice(lastJobCount);
                    allJobs.push(...newJobs);
                    lastJobCount = currentJobs.length;

                    console.log(`Encontrados ${newJobsCount} jobs nuevos en este scroll`);
                    this.stats.newJobsPerScroll.push(newJobsCount);
                    consecutiveNoNewJobs = 0;
                } else {
                    consecutiveNoNewJobs++;
                    console.log(`No se encontraron jobs nuevos (${consecutiveNoNewJobs} consecutivos)`);
                }

                // Actualizar estadísticas
                this.stats.scrollAttempts = attempt + 1;
                this.stats.totalJobsFound = allJobs.length;

                // Verificar condiciones de parada
                if (await this.shouldStopScrolling(page, consecutiveNoNewJobs, config)) {
                    console.log('Condición de parada detectada, finalizando scroll');
                    break;
                }

                // Realizar scroll
                if (attempt < config.maxScrollAttempts - 1) {
                    await this.performScroll(page, config);
                    await this.waitForNewContent(page, config);
                }
            }

            // Obtener altura final
            this.stats.finalScrollHeight = await page.evaluate(() => document.body.scrollHeight);

            console.log(`Scroll completado: ${allJobs.length} jobs totales encontrados`);

            return {
                jobs: allJobs,
                stats: this.stats,
                success: true
            };

        } catch (error) {
            console.error('Error durante scroll progresivo:', error);
            return {
                jobs: allJobs,
                stats: this.stats,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Espera a que la página cargue inicialmente
     * @param {Page} page - Página de Puppeteer
     */
    async waitForInitialLoad(page) {
        console.log('Esperando carga inicial de la página...');
        
        try {
            // Esperar a que aparezcan los job cards
            await page.waitForSelector('.job-card-container', { timeout: 10000 });
            
            // Esperar un poco más para que se carguen todos los elementos
            await page.waitForTimeout(2000);
            
            console.log('Carga inicial completada');
        } catch (error) {
            console.warn('No se encontraron job cards iniciales, continuando...');
        }
    }

    /**
     * Realiza un scroll en la página
     * @param {Page} page - Página de Puppeteer
     * @param {Object} config - Configuración de scroll
     */
    async performScroll(page, config) {
        try {
            const scrollHeight = await page.evaluate((step) => {
                const currentScroll = window.pageYOffset;
                const newScroll = currentScroll + step;
                window.scrollTo(0, newScroll);
                return {
                    before: currentScroll,
                    after: newScroll,
                    documentHeight: document.body.scrollHeight
                };
            }, config.scrollStep);

            this.stats.scrollHeights.push(scrollHeight.after);
            
            console.log(`Scroll realizado: ${scrollHeight.before} -> ${scrollHeight.after} (Altura documento: ${scrollHeight.documentHeight})`);

            // Esperar a que se estabilice el scroll
            await page.waitForTimeout(config.scrollDelay);

        } catch (error) {
            console.error('Error durante scroll:', error);
        }
    }

    /**
     * Espera a que aparezca nuevo contenido
     * @param {Page} page - Página de Puppeteer
     * @param {Object} config - Configuración
     */
    async waitForNewContent(page, config) {
        console.log('Esperando nuevo contenido...');
        
        try {
            // Esperar a que aparezcan indicadores de carga
            const loadingSelectors = [
                '.scaffold-layout__list-container .scaffold-finite-scroll__loading',
                '.jobs-search-results-list .artdeco-loading',
                '.artdeco-spinner'
            ];

            for (const selector of loadingSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 1000 });
                    console.log(`Indicador de carga encontrado: ${selector}`);
                    
                    // Esperar a que desaparezca
                    await page.waitForFunction(
                        sel => !document.querySelector(sel),
                        { timeout: config.waitForNewContent },
                        selector
                    );
                    
                    console.log('Contenido cargado');
                    break;
                } catch {
                    // Continuar con el siguiente selector
                    continue;
                }
            }

            // Espero adicional para estabilización
            await page.waitForTimeout(1000);

        } catch (error) {
            console.warn('Error esperando nuevo contenido:', error);
        }
    }

    /**
     * Determina si se debe detener el scroll
     * @param {Page} page - Página de Puppeteer
     * @param {number} consecutiveNoNewJobs - Jobs consecutivos sin nuevos
     * @param {Object} config - Configuración
     * @returns {boolean} True si se debe detener
     */
    async shouldStopScrolling(page, consecutiveNoNewJobs, config) {
        // Condición 1: Demasiados intentos sin nuevos jobs
        if (consecutiveNoNewJobs >= 3) {
            console.log('Deteniendo scroll: demasiados intentos sin nuevos jobs');
            return true;
        }

        // Condición 2: Alcanzado límite de altura
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight >= config.maxScrollHeight) {
            console.log(`Deteniendo scroll: altura máxima alcanzada (${currentHeight}px)`);
            return true;
        }

        // Condición 3: Fin de la página detectado
        const hasReachedEnd = await this.hasReachedPageEnd(page);
        if (hasReachedEnd) {
            console.log('Deteniendo scroll: fin de la página detectado');
            return true;
        }

        return false;
    }

    /**
     * Verifica si se ha alcanzado el final de la página
     * @param {Page} page - Página de Puppeteer
     * @returns {boolean} True si se alcanzó el final
     */
    async hasReachedPageEnd(page) {
        try {
            const result = await page.evaluate(() => {
                const scrollPosition = window.pageYOffset + window.innerHeight;
                const documentHeight = document.body.scrollHeight;
                
                // Verificar si estamos cerca del final
                const isNearEnd = scrollPosition >= documentHeight - 100;
                
                // Verificar si hay mensajes de "no más resultados"
                const noMoreResults = document.querySelector('[data-test-id="no-results"]') ||
                                    document.querySelector('.jobs-search-no-results-banner') ||
                                    document.querySelector('.artdeco-empty-state');
                
                return isNearEnd || !!noMoreResults;
            });

            return result;
        } catch (error) {
            console.warn('Error verificando fin de página:', error);
            return false;
        }
    }

    /**
     * Realiza scroll inteligente basado en la densidad de jobs
     * @param {Page} page - Página de Puppeteer
     * @param {Function} jobExtractor - Función extractor
     * @param {Object} options - Opciones
     */
    async performIntelligentScroll(page, jobExtractor, options = {}) {
        console.log('Iniciando scroll inteligente...');
        
        const config = { ...this.config, ...options };
        const allJobs = [];
        let scrollPosition = 0;
        let lastJobCount = 0;
        
        try {
            // Análisis inicial de densidad
            const initialDensity = await this.analyzeJobDensity(page, jobExtractor);
            console.log(`Densidad inicial de jobs: ${initialDensity.jobsPerHeight} jobs/pixel`);

            for (let attempt = 0; attempt < config.maxScrollAttempts; attempt++) {
                // Calcular próximo scroll basado en densidad
                const nextScrollDistance = this.calculateOptimalScrollDistance(
                    initialDensity,
                    attempt,
                    config
                );

                // Realizar scroll
                await this.scrollToPosition(page, scrollPosition + nextScrollDistance);
                scrollPosition += nextScrollDistance;

                // Extraer jobs
                const currentJobs = await jobExtractor(page);
                const newJobs = currentJobs.slice(lastJobCount);
                
                if (newJobs.length > 0) {
                    allJobs.push(...newJobs);
                    lastJobCount = currentJobs.length;
                    console.log(`Scroll ${attempt + 1}: ${newJobs.length} jobs nuevos`);
                }

                // Actualizar densidad
                const currentDensity = await this.analyzeJobDensity(page, jobExtractor);
                if (currentDensity.jobsPerHeight < initialDensity.jobsPerHeight * 0.3) {
                    console.log('Densidad de jobs muy baja, finalizando scroll');
                    break;
                }

                await page.waitForTimeout(config.scrollDelay);
            }

            return {
                jobs: allJobs,
                stats: this.stats,
                success: true
            };

        } catch (error) {
            console.error('Error en scroll inteligente:', error);
            return {
                jobs: allJobs,
                stats: this.stats,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Analiza la densidad de jobs en la página
     * @param {Page} page - Página de Puppeteer
     * @param {Function} jobExtractor - Función extractor
     * @returns {Object} Análisis de densidad
     */
    async analyzeJobDensity(page, jobExtractor) {
        try {
            const jobs = await jobExtractor(page);
            const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
            
            return {
                jobCount: jobs.length,
                scrollHeight,
                jobsPerHeight: scrollHeight > 0 ? jobs.length / scrollHeight : 0
            };
        } catch (error) {
            console.error('Error analizando densidad:', error);
            return { jobCount: 0, scrollHeight: 0, jobsPerHeight: 0 };
        }
    }

    /**
     * Calcula distancia óptima de scroll
     * @param {Object} density - Análisis de densidad
     * @param {number} attempt - Número de intento
     * @param {Object} config - Configuración
     * @returns {number} Distancia de scroll
     */
    calculateOptimalScrollDistance(density, attempt, config) {
        // Basado en la densidad, ajustamos la distancia
        const baseDistance = config.scrollStep;
        
        if (density.jobsPerHeight > 0.01) {
            // Alta densidad: scroll más pequeño para no perder jobs
            return baseDistance * 0.7;
        } else if (density.jobsPerHeight < 0.005) {
            // Baja densidad: scroll más grande
            return baseDistance * 1.5;
        }
        
        return baseDistance;
    }

    /**
     * Realiza scroll a una posición específica
     * @param {Page} page - Página de Puppeteer
     * @param {number} position - Posición de scroll
     */
    async scrollToPosition(page, position) {
        await page.evaluate((pos) => {
            window.scrollTo({
                top: pos,
                behavior: 'smooth'
            });
        }, position);
        
        await page.waitForTimeout(1000);
    }

    /**
     * Reinicia estadísticas del scroller
     */
    resetStats() {
        this.stats = {
            scrollAttempts: 0,
            totalJobsFound: 0,
            newJobsPerScroll: [],
            scrollHeights: [],
            finalScrollHeight: 0
        };
    }

    /**
     * Obtiene estadísticas del scroll
     * @returns {Object} Estadísticas actuales
     */
    getScrollStats() {
        const avgNewJobsPerScroll = this.stats.newJobsPerScroll.length > 0 ?
            this.stats.newJobsPerScroll.reduce((a, b) => a + b, 0) / this.stats.newJobsPerScroll.length : 0;

        return {
            ...this.stats,
            avgNewJobsPerScroll: Math.round(avgNewJobsPerScroll * 100) / 100,
            scrollEfficiency: this.stats.scrollAttempts > 0 ? 
                (this.stats.totalJobsFound / this.stats.scrollAttempts).toFixed(2) : 0
        };
    }
}

module.exports = LinkedInScroller;
