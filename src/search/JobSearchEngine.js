class JobSearchEngine {
    constructor() {
        this.baseURL = 'https://www.linkedin.com/jobs/search';
        
        // Filtros predefinidos de LinkedIn
        this.filters = {
            timeFilter: {
                'past24h': 'f_TPR=r86400',      // Últimas 24 horas
                'pastWeek': 'f_TPR=r604800',    // Última semana
                'pastMonth': 'f_TPR=r2592000'   // Último mes
            },
            jobType: {
                'fulltime': 'f_JT=F',           // Tiempo completo
                'parttime': 'f_JT=P',           // Medio tiempo
                'contract': 'f_JT=C',          // Contrato
                'temporary': 'f_JT=T',          // Temporal
                'internship': 'f_JT=I'          // Prácticas
            },
            experienceLevel: {
                'internship': 'f_E=1',          // Prácticas
                'entry': 'f_E=2',               // Nivel de entrada
                'associate': 'f_E=3',           // Asociado
                'mid': 'f_E=4',                 // Semi-senior
                'senior': 'f_E=5',              // Senior
                'director': 'f_E=6',            // Director
                'executive': 'f_E=7'            // Ejecutivo
            },
            workplaceType: {
                'remote': 'f_WT=1',             // Remoto
                'onsite': 'f_WT=2',             // Presencial
                'hybrid': 'f_WT=3'              // Híbrido
            }
        };

        // Opciones de ordenamiento
        this.sortOptions = {
            'recent': 'sortBy=DD',             // Más reciente primero
            'relevant': 'sortBy=R'             // Más relevante
        };
    }

    /**
     * Construye URL de búsqueda híbrida
     * @param {Object} searchConfig - Configuración de búsqueda
     * @returns {string} URL completa de búsqueda
     */
    buildSearchURL(searchConfig) {
        const params = new URLSearchParams();
        
        // Método A: Componentes UI-driven
        if (searchConfig.keywords) {
            params.append('keywords', this.encodeKeywords(searchConfig.keywords));
        }
        
        if (searchConfig.location) {
            params.append('location', this.encodeLocation(searchConfig.location));
        }

        // Método B: Componentes paramétricos
        const filterParams = this.buildFilterParams(searchConfig.filters || {});
        filterParams.forEach(param => {
            const [key, value] = param.split('=');
            params.append(key, value);
        });

        // Ordenamiento
        if (searchConfig.sortBy) {
            const sortParam = this.sortOptions[searchConfig.sortBy] || this.sortOptions.recent;
            const [key, value] = sortParam.split('=');
            params.append(key, value);
        }

        // Parámetros adicionales
        params.append('geoId', searchConfig.geoId || '');
        params.append('trk', 'public_jobs_jobs-search-page_search-results');
        params.append('position', '1');
        params.append('pageNum', '0');

        // Construir URL final
        const queryString = params.toString();
        return queryString ? `${this.baseURL}?${queryString}` : this.baseURL;
    }

    /**
     * Construye parámetros de filtros
     * @param {Object} filters - Configuración de filtros
     * @returns {Array} Array de parámetros de filtro
     */
    buildFilterParams(filters) {
        const filterParams = [];

        // Filtro temporal (crítico para búsqueda incremental)
        if (filters.timeFilter && this.filters.timeFilter[filters.timeFilter]) {
            filterParams.push(this.filters.timeFilter[filters.timeFilter]);
        }

        // Filtros de tipo de trabajo
        if (filters.jobTypes && Array.isArray(filters.jobTypes)) {
            filters.jobTypes.forEach(type => {
                if (this.filters.jobType[type]) {
                    filterParams.push(this.filters.jobType[type]);
                }
            });
        }

        // Nivel de experiencia
        if (filters.experienceLevels && Array.isArray(filters.experienceLevels)) {
            filters.experienceLevels.forEach(level => {
                if (this.filters.experienceLevel[level]) {
                    filterParams.push(this.filters.experienceLevel[level]);
                }
            });
        }

        // Tipo de lugar de trabajo
        if (filters.workplaceTypes && Array.isArray(filters.workplaceTypes)) {
            filters.workplaceTypes.forEach(type => {
                if (this.filters.workplaceType[type]) {
                    filterParams.push(this.filters.workplaceType[type]);
                }
            });
        }

        return filterParams;
    }

    /**
     * Codifica palabras clave para URL
     * @param {string} keywords - Palabras clave de búsqueda
     * @returns {string} Palabras clave codificadas
     */
    encodeKeywords(keywords) {
        return encodeURIComponent(keywords.trim());
    }

    /**
     * Codifica ubicación para URL
     * @param {string} location - Ubicación de búsqueda
     * @returns {string} Ubicación codificada
     */
    encodeLocation(location) {
        return encodeURIComponent(location.trim());
    }

    /**
     * Valida configuración de búsqueda
     * @param {Object} searchConfig - Configuración a validar
     * @returns {Object} Resultado de validación
     */
    validateSearchConfig(searchConfig) {
        const errors = [];
        const warnings = [];

        // Validaciones requeridas
        if (!searchConfig.keywords && !searchConfig.location) {
            errors.push('Debe especificar palabras clave o ubicación');
        }

        // Validaciones de filtros
        if (searchConfig.filters) {
            if (searchConfig.filters.timeFilter && !this.filters.timeFilter[searchConfig.filters.timeFilter]) {
                warnings.push(`Filtro de tiempo no reconocido: ${searchConfig.filters.timeFilter}`);
            }

            if (searchConfig.filters.jobTypes) {
                const invalidTypes = searchConfig.filters.jobTypes.filter(type => !this.filters.jobType[type]);
                if (invalidTypes.length > 0) {
                    warnings.push(`Tipos de trabajo no reconocidos: ${invalidTypes.join(', ')}`);
                }
            }
        }

        // Validación de ordenamiento
        if (searchConfig.sortBy && !this.sortOptions[searchConfig.sortBy]) {
            warnings.push(`Ordenamiento no reconocido: ${searchConfig.sortBy}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Crea configuración de búsqueda por defecto
     * @param {Object} overrides - Parámetros a sobreescribir
     * @returns {Object} Configuración de búsqueda completa
     */
    createDefaultSearchConfig(overrides = {}) {
        return {
            keywords: '',
            location: '',
            sortBy: 'recent',
            filters: {
                timeFilter: 'past24h',
                jobTypes: ['fulltime'],
                experienceLevels: [],
                workplaceTypes: ['remote', 'hybrid', 'onsite']
            },
            geoId: '',
            ...overrides
        };
    }

    /**
     * Genera configuraciones de búsqueda múltiples para mayor cobertura
     * @param {Object} baseConfig - Configuración base
     * @returns {Array} Array de configuraciones de búsqueda
     */
    generateSearchVariations(baseConfig) {
        const variations = [];
        
        // Variación 1: Búsqueda principal
        variations.push(baseConfig);

        // Variación 2: Sin filtro de tiempo (para capturar jobs más antiguos que puedan ser nuevos)
        const noTimeFilter = {
            ...baseConfig,
            filters: {
                ...baseConfig.filters,
                timeFilter: null
            }
        };
        variations.push(noTimeFilter);

        // Variación 3: Diferente ordenamiento (relevancia vs recencia)
        if (baseConfig.sortBy === 'recent') {
            const relevantSort = {
                ...baseConfig,
                sortBy: 'relevant'
            };
            variations.push(relevantSort);
        }

        return variations;
    }

    /**
     * Extrae información de la URL de búsqueda actual
     * @param {string} url - URL actual de búsqueda
     * @returns {Object} Información extraída de la URL
     */
    parseSearchURL(url) {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            
            const config = {
                keywords: params.get('keywords') || '',
                location: params.get('location') || '',
                sortBy: params.get('sortBy') === 'R' ? 'relevant' : 'recent',
                filters: {}
            };

            // Extraer filtros
            Object.entries(this.filters).forEach(([filterType, filterValues]) => {
                Object.entries(filterValues).forEach(([key, param]) => {
                    if (params.has(param.split('=')[0])) {
                        if (!config.filters[filterType]) {
                            config.filters[filterType] = [];
                        }
                        config.filters[filterType].push(key);
                    }
                });
            });

            return config;
        } catch (error) {
            console.error('Error al parsear URL de búsqueda:', error);
            return null;
        }
    }

    /**
     * Obtiene el tiempo de filtro recomendado basado en la última ejecución
     * @param {number} lastRun - Timestamp de la última ejecución
     * @returns {string} Filtro de tiempo recomendado
     */
    getRecommendedTimeFilter(lastRun) {
        if (!lastRun) {
            return 'past24h'; // Primera ejecución
        }

        const hoursSinceLastRun = (Date.now() - lastRun) / (1000 * 60 * 60);
        
        if (hoursSinceLastRun <= 24) {
            return 'past24h';
        } else if (hoursSinceLastRun <= 168) { // 7 días
            return 'pastWeek';
        } else {
            return 'pastMonth';
        }
    }

    /**
     * Optimiza configuración de búsqueda para búsqueda incremental
     * @param {Object} baseConfig - Configuración base
     * @param {number} lastRun - Timestamp de última ejecución
     * @returns {Object} Configuración optimizada
     */
    optimizeForIncrementalSearch(baseConfig, lastRun) {
        const optimized = { ...baseConfig };
        
        // Usar filtro de tiempo recomendado
        if (!optimized.filters.timeFilter) {
            optimized.filters.timeFilter = this.getRecommendedTimeFilter(lastRun);
        }

        // Siempre ordenar por recencia para búsqueda incremental
        optimized.sortBy = 'recent';

        return optimized;
    }
}

module.exports = JobSearchEngine;
