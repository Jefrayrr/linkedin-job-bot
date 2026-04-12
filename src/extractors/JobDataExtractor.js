class JobDataExtractor {
    constructor() {
        // Selectores CSS para elementos de job en LinkedIn
        this.selectors = {
            jobCard: '.job-card-container',
            jobTitle: '.job-card-list__title',
            companyName: '.job-card-container__company-name',
            location: '.job-card-container__metadata-item',
            postedDate: '.job-card-container__footer-item',
            jobId: '[data-job-id]',
            jobLink: 'a.job-card-list__title-link'
        };

        // Patrones de tiempo para normalización
        this.timePatterns = {
            hours: /hace\s+(\d+)\s+hora[s]?/i,
            minutes: /hace\s+(\d+)\s+minuto[s]?/i,
            days: /hace\s+(\d+)\s+día[s]?/i,
            weeks: /hace\s+(\d+)\s+semana[s]?/i,
            months: /hace\s+(\d+)\s+mes[es]?/i,
            // Patrones en inglés
            hoursEn: /(\d+)\s+hour[s]?\s+ago/i,
            minutesEn: /(\d+)\s+minute[s]?\s+ago/i,
            daysEn: /(\d+)\s+day[s]?\s+ago/i,
            weeksEn: /(\d+)\s+week[s]?\s+ago/i,
            monthsEn: /(\d+)\s+month[s]?\s+ago/i
        };
    }

    /**
     * Extrae datos completos de un job card
     * @param {Element} jobCard - Elemento DOM del job card
     * @returns {Object|null} Datos extraídos del job
     */
    async extractJobData(jobCard) {
        try {
            const jobData = {
                jobId: this.extractJobId(jobCard),
                title: this.extractText(jobCard, this.selectors.jobTitle),
                company: this.extractText(jobCard, this.selectors.companyName),
                location: this.extractText(jobCard, this.selectors.location),
                postedDateText: this.extractText(jobCard, this.selectors.postedDate),
                link: this.extractLink(jobCard),
                timestamp: null,
                extractedAt: Date.now()
            };

            // Normalizar timestamp
            if (jobData.postedDateText) {
                jobData.timestamp = this.normalizeTimestamp(jobData.postedDateText);
            }

            // Validar datos mínimos
            if (!jobData.jobId || !jobData.title) {
                console.warn('Job card incompleto:', jobData);
                return null;
            }

            return jobData;
        } catch (error) {
            console.error('Error extrayendo datos del job:', error);
            return null;
        }
    }

    /**
     * Extrae todos los jobs visibles en la página
     * @param {Page} page - Página de Puppeteer
     * @returns {Array} Array de jobs extraídos
     */
    async extractAllJobs(page) {
        try {
            // Esperar a que carguen los job cards
            await page.waitForSelector(this.selectors.jobCard, { timeout: 5000 });

            const jobs = await page.evaluate((selectors) => {
                const jobCards = document.querySelectorAll(selectors.jobCard);
                const extractedJobs = [];

                jobCards.forEach(card => {
                    try {
                        const jobData = {
                            jobId: card.getAttribute('data-job-id') || 
                                   card.querySelector('a[href*="/jobs/view/"]')?.href?.match(/\/jobs\/view\/(\d+)/)?.[1],
                            title: card.querySelector(selectors.jobTitle)?.textContent?.trim() || '',
                            company: card.querySelector(selectors.companyName)?.textContent?.trim() || '',
                            location: card.querySelector(selectors.location)?.textContent?.trim() || '',
                            postedDateText: card.querySelector(selectors.postedDate)?.textContent?.trim() || '',
                            link: card.querySelector(selectors.jobLink)?.href || ''
                        };

                        if (jobData.jobId && jobData.title) {
                            extractedJobs.push(jobData);
                        }
                    } catch (error) {
                        console.warn('Error extrayendo job card:', error);
                    }
                });

                return extractedJobs;
            }, this.selectors);

            // Normalizar timestamps para todos los jobs
            const normalizedJobs = jobs.map(job => ({
                ...job,
                timestamp: this.normalizeTimestamp(job.postedDateText),
                extractedAt: Date.now()
            }));

            console.log(`Extraídos ${normalizedJobs.length} jobs de la página`);
            return normalizedJobs;
        } catch (error) {
            console.error('Error extrayendo todos los jobs:', error);
            return [];
        }
    }

    /**
     * Extrae el ID único del job
     * @param {Element} jobCard - Elemento del job card
     * @returns {string|null} ID del job
     */
    extractJobId(jobCard) {
        try {
            // Método 1: Atributo data-job-id
            const dataJobId = jobCard.getAttribute('data-job-id');
            if (dataJobId) return dataJobId;

            // Método 2: Extraer del href del link
            const link = jobCard.querySelector(this.selectors.jobLink);
            if (link && link.href) {
                const match = link.href.match(/\/jobs\/view\/(\d+)/);
                if (match) return match[1];
            }

            // Método 3: Extraer de otros atributos
            const id = jobCard.getAttribute('id');
            if (id && id.includes('job')) {
                const match = id.match(/(\d+)/);
                if (match) return match[1];
            }

            return null;
        } catch (error) {
            console.error('Error extrayendo job ID:', error);
            return null;
        }
    }

    /**
     * Extrae texto de un elemento usando selector
     * @param {Element} parent - Elemento padre
     * @param {string} selector - Selector CSS
     * @returns {string} Texto extraído
     */
    extractText(parent, selector) {
        try {
            const element = parent.querySelector(selector);
            return element ? element.textContent.trim() : '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Extrae el link del job
     * @param {Element} jobCard - Elemento del job card
     * @returns {string} URL del job
     */
    extractLink(jobCard) {
        try {
            const link = jobCard.querySelector(this.selectors.jobLink);
            return link ? link.href : '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Normaliza texto de tiempo a timestamp absoluto
     * @param {string} timeText - Texto de tiempo relativo
     * @returns {number|null} Timestamp en milisegundos
     */
    normalizeTimestamp(timeText) {
        if (!timeText) return null;

        const now = Date.now();

        // Patrones en español
        let match = timeText.match(this.timePatterns.hours);
        if (match) {
            return now - (parseInt(match[1]) * 60 * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.minutes);
        if (match) {
            return now - (parseInt(match[1]) * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.days);
        if (match) {
            return now - (parseInt(match[1]) * 24 * 60 * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.weeks);
        if (match) {
            return now - (parseInt(match[1]) * 7 * 24 * 60 * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.months);
        if (match) {
            return now - (parseInt(match[1]) * 30 * 24 * 60 * 60 * 1000);
        }

        // Patrones en inglés
        match = timeText.match(this.timePatterns.hoursEn);
        if (match) {
            return now - (parseInt(match[1]) * 60 * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.minutesEn);
        if (match) {
            return now - (parseInt(match[1]) * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.daysEn);
        if (match) {
            return now - (parseInt(match[1]) * 24 * 60 * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.weeksEn);
        if (match) {
            return now - (parseInt(match[1]) * 7 * 24 * 60 * 60 * 1000);
        }

        match = timeText.match(this.timePatterns.monthsEn);
        if (match) {
            return now - (parseInt(match[1]) * 30 * 24 * 60 * 60 * 1000);
        }

        // Patrones especiales
        if (timeText.toLowerCase().includes('just now') || timeText.toLowerCase().includes('ahora mismo')) {
            return now - (5 * 60 * 1000); // 5 minutos atrás
        }

        if (timeText.toLowerCase().includes('today') || timeText.toLowerCase().includes('hoy')) {
            return now - (12 * 60 * 60 * 1000); // 12 horas atrás
        }

        if (timeText.toLowerCase().includes('yesterday') || timeText.toLowerCase().includes('ayer')) {
            return now - (24 * 60 * 60 * 1000); // 24 horas atrás
        }

        // Si no se puede parsear, retornar null
        console.warn(`No se pudo normalizar timestamp: "${timeText}"`);
        return null;
    }

    /**
     * Valida y limpia datos extraídos
     * @param {Object} jobData - Datos del job a validar
     * @returns {Object|null} Datos validados o null si inválidos
     */
    validateJobData(jobData) {
        if (!jobData) return null;

        // Validaciones requeridas
        if (!jobData.jobId || !jobData.title) {
            return null;
        }

        // Limpiar datos
        const cleaned = {
            jobId: jobData.jobId.toString().trim(),
            title: jobData.title.trim(),
            company: jobData.company?.trim() || '',
            location: jobData.location?.trim() || '',
            postedDateText: jobData.postedDateText?.trim() || '',
            link: jobData.link?.trim() || '',
            timestamp: jobData.timestamp,
            extractedAt: jobData.extractedAt || Date.now()
        };

        // Validar timestamp
        if (!cleaned.timestamp || cleaned.timestamp <= 0) {
            console.warn(`Timestamp inválido para job ${cleaned.jobId}`);
            return null;
        }

        // Validar que el timestamp no sea futuro
        if (cleaned.timestamp > Date.now()) {
            console.warn(`Timestamp futuro para job ${cleaned.jobId}`);
            cleaned.timestamp = Date.now() - (5 * 60 * 1000); // 5 minutos atrás
        }

        return cleaned;
    }

    /**
     * Obtiene detalles adicionales de un job específico
     * @param {Page} page - Página de Puppeteer
     * @param {string} jobUrl - URL del job
     * @returns {Object|null} Detalles adicionales del job
     */
    async extractJobDetails(page, jobUrl) {
        try {
            await page.goto(jobUrl, { waitUntil: 'networkidle2' });

            const details = await page.evaluate(() => {
                // Selectores para página de detalles
                const description = document.querySelector('.description__text')?.textContent?.trim() || '';
                const criteriaList = document.querySelectorAll('.description__job-criteria-item');
                
                const criteria = {};
                criteriaList.forEach(item => {
                    const key = item.querySelector('h3')?.textContent?.trim() || '';
                    const value = item.querySelector('span')?.textContent?.trim() || '';
                    if (key && value) {
                        criteria[key.toLowerCase()] = value;
                    }
                });

                return {
                    description,
                    criteria,
                    applicants: document.querySelector('.jobs-apply-button__top-card-applicants')?.textContent?.trim() || ''
                };
            });

            return details;
        } catch (error) {
            console.error('Error extrayendo detalles del job:', error);
            return null;
        }
    }

    /**
     * Calcula un score de calidad para los datos extraídos
     * @param {Object} jobData - Datos del job
     * @returns {number} Score de calidad (0-100)
     */
    calculateDataQualityScore(jobData) {
        let score = 0;

        // Job ID y título (requeridos)
        if (jobData.jobId) score += 30;
        if (jobData.title) score += 20;

        // Datos deseados
        if (jobData.company) score += 15;
        if (jobData.location) score += 10;
        if (jobData.link) score += 10;

        // Timestamp (crítico para búsqueda incremental)
        if (jobData.timestamp) score += 15;

        return Math.min(score, 100);
    }
}

module.exports = JobDataExtractor;
