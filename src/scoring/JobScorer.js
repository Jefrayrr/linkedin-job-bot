class JobScorer {
    constructor() {
        // Configuración de scoring
        this.weights = {
            recency: 0.25,           // Peso de recencia
            keywords: 0.20,          // Peso de palabras clave
            company: 0.15,           // Peso de la compañía
            location: 0.10,          // Peso de la ubicación
            title: 0.10,             // Peso del título
            description: 0.10,       // Peso de la descripción
            applicants: 0.10         // Peso de número de solicitantes
        };

        // Palabras clave de alta prioridad
        this.priorityKeywords = {
            senior: ['senior', 'sr', 'lead', 'principal', 'head', 'chief'],
            junior: ['junior', 'jr', 'entry', 'trainee', 'intern'],
            remote: ['remote', 'work from home', 'wfh', 'teletrabajo'],
            tech: ['javascript', 'python', 'react', 'node', 'aws', 'docker', 'kubernetes'],
            salary: ['salary', 'salario', '$', 'usd', 'compensation']
        };

        // Compañías de alta reputación
        this.topCompanies = new Set([
            'google', 'microsoft', 'amazon', 'apple', 'facebook', 'meta',
            'netflix', 'spotify', 'uber', 'airbnb', 'linkedin', 'twitter'
        ]);

        // Ubicaciones preferidas
        this.preferredLocations = new Set([
            'remote', 'new york', 'san francisco', 'london', 'madrid',
            'barcelona', 'mexico city', 'buenos aires', 'são paulo'
        ]);

        // Estadísticas de scoring
        this.stats = {
            totalScored: 0,
            averageScore: 0,
            scoreDistribution: {
                excellent: 0,    // 90-100
                good: 0,         // 70-89
                average: 0,      // 50-69
                poor: 0          // <50
            }
        };
    }

    /**
     * Calcula score completo para un job
     * @param {Object} job - Datos del job
     * @param {Object} userPreferences - Preferencias del usuario
     * @returns {Object} Job con score y desglose
     */
    async scoreJob(job, userPreferences = {}) {
        console.log(`Calculando score para job: ${job.title}`);

        const scoreBreakdown = {
            recency: this.calculateRecencyScore(job),
            keywords: this.calculateKeywordsScore(job, userPreferences),
            company: this.calculateCompanyScore(job),
            location: this.calculateLocationScore(job, userPreferences),
            title: this.calculateTitleScore(job, userPreferences),
            description: this.calculateDescriptionScore(job, userPreferences),
            applicants: this.calculateApplicantsScore(job)
        };

        // Calcular score ponderado
        const totalScore = this.calculateWeightedScore(scoreBreakdown);

        // Determinar categoría
        const category = this.getScoreCategory(totalScore);

        // Actualizar estadísticas
        this.updateStats(totalScore);

        const scoredJob = {
            ...job,
            score: {
                total: Math.round(totalScore),
                category,
                breakdown: scoreBreakdown,
                calculatedAt: Date.now()
            }
        };

        console.log(`Score calculado: ${totalScore.toFixed(1)} (${category}) para ${job.title}`);

        return scoredJob;
    }

    /**
     * Calcula score de recencia
     * @param {Object} job - Datos del job
     * @returns {number} Score de recencia (0-100)
     */
    calculateRecencyScore(job) {
        if (!job.timestamp) return 0;

        const now = Date.now();
        const ageInHours = (now - job.timestamp) / (1000 * 60 * 60);

        // Score basado en edad
        if (ageInHours <= 1) return 100;        // Menos de 1 hora
        if (ageInHours <= 6) return 90;         // Menos de 6 horas
        if (ageInHours <= 24) return 80;        // Menos de 1 día
        if (ageInHours <= 72) return 60;        // Menos de 3 días
        if (ageInHours <= 168) return 40;       // Menos de 1 semana
        if (ageInHours <= 720) return 20;       // Menos de 1 mes
        return 10;                              // Más de 1 mes
    }

    /**
     * Calcula score basado en palabras clave
     * @param {Object} job - Datos del job
     * @param {Object} userPreferences - Preferencias del usuario
     * @returns {number} Score de palabras clave (0-100)
     */
    calculateKeywordsScore(job, userPreferences = {}) {
        const text = `${job.title} ${job.company} ${job.location}`.toLowerCase();
        let score = 0;

        // Palabras clave del usuario
        if (userPreferences.keywords) {
            const userKeywords = userPreferences.keywords.toLowerCase().split(' ');
            const matches = userKeywords.filter(keyword => text.includes(keyword));
            score += (matches.length / userKeywords.length) * 50;
        }

        // Palabras clave de prioridad
        Object.entries(this.priorityKeywords).forEach(([category, keywords]) => {
            const matches = keywords.filter(keyword => text.includes(keyword));
            
            if (category === 'senior' && matches.length > 0) {
                score += matches.length * 10;
            } else if (category === 'remote' && matches.length > 0) {
                score += matches.length * 15;
            } else if (category === 'tech' && matches.length > 0) {
                score += matches.length * 8;
            } else if (category === 'salary' && matches.length > 0) {
                score += matches.length * 12;
            }
        });

        return Math.min(score, 100);
    }

    /**
     * Calcula score de compañía
     * @param {Object} job - Datos del job
     * @returns {number} Score de compañía (0-100)
     */
    calculateCompanyScore(job) {
        if (!job.company) return 0;

        const companyName = job.company.toLowerCase();

        // Top companies
        if (this.topCompanies.has(companyName)) {
            return 90;
        }

        // Indicadores de buena compañía
        const goodIndicators = ['inc', 'llc', 'corp', 'technologies', 'solutions', 'systems'];
        const hasGoodIndicators = goodIndicators.some(indicator => companyName.includes(indicator));
        
        if (hasGoodIndicators) return 70;

        // Score basado en longitud (compañías conocidas suelen tener nombres más largos)
        const lengthScore = Math.min(job.company.length / 2, 50);

        return lengthScore + 20; // Base score
    }

    /**
     * Calcula score de ubicación
     * @param {Object} job - Datos del job
     * @param {Object} userPreferences - Preferencias del usuario
     * @returns {number} Score de ubicación (0-100)
     */
    calculateLocationScore(job, userPreferences = {}) {
        if (!job.location) return 0;

        const location = job.location.toLowerCase();
        let score = 0;

        // Remote siempre tiene score alto
        if (location.includes('remote')) {
            score += 80;
        }

        // Ubicaciones preferidas
        this.preferredLocations.forEach(prefLocation => {
            if (location.includes(prefLocation)) {
                score += 30;
            }
        });

        // Preferencias del usuario
        if (userPreferences.preferredLocations) {
            userPreferences.preferredLocations.forEach(prefLocation => {
                if (location.includes(prefLocation.toLowerCase())) {
                    score += 40;
                }
            });
        }

        // Penalizar ubicaciones no deseadas
        if (userPreferences.unwantedLocations) {
            userPreferences.unwantedLocations.forEach(unwantedLocation => {
                if (location.includes(unwantedLocation.toLowerCase())) {
                    score -= 50;
                }
            });
        }

        return Math.max(0, Math.min(score, 100));
    }

    /**
     * Calcula score del título
     * @param {Object} job - Datos del job
     * @param {Object} userPreferences - Preferencias del usuario
     * @returns {number} Score del título (0-100)
     */
    calculateTitleScore(job, userPreferences = {}) {
        if (!job.title) return 0;

        const title = job.title.toLowerCase();
        let score = 0;

        // Títulos de senioridad preferida
        if (userPreferences.seniorityLevel) {
            const seniorityKeywords = {
                junior: ['junior', 'jr', 'entry', 'trainee'],
                mid: ['mid', 'associate', 'intermediate'],
                senior: ['senior', 'sr', 'lead', 'principal', 'head']
            };

            const keywords = seniorityKeywords[userPreferences.seniorityLevel] || [];
            const matches = keywords.filter(keyword => title.includes(keyword));
            
            if (matches.length > 0) {
                score += 50;
            }
        }

        // Palabras clave técnicas en el título
        const techKeywords = ['developer', 'engineer', 'architect', 'manager', 'director'];
        const techMatches = techKeywords.filter(keyword => title.includes(keyword));
        score += techMatches.length * 15;

        // Evitar títulos spam
        const spamIndicators = ['urgent', 'immediate', 'hiring', 'multiple positions'];
        const spamMatches = spamIndicators.filter(indicator => title.includes(indicator));
        score -= spamMatches.length * 20;

        return Math.max(0, Math.min(score, 100));
    }

    /**
     * Calcula score de la descripción
     * @param {Object} job - Datos del job
     * @param {Object} userPreferences - Preferencias del usuario
     * @returns {number} Score de descripción (0-100)
     */
    calculateDescriptionScore(job, userPreferences = {}) {
        if (!job.description) return 0;

        const description = job.description.toLowerCase();
        let score = 0;

        // Longitud adecuada
        const wordCount = description.split(' ').length;
        if (wordCount > 50 && wordCount < 500) {
            score += 30; // Descripción detallada pero no excesiva
        }

        // Indicadores de buena descripción
        const goodIndicators = [
            'responsibilities', 'requirements', 'benefits', 'salary',
            'experience', 'skills', 'team', 'project', 'growth'
        ];

        const goodMatches = goodIndicators.filter(indicator => description.includes(indicator));
        score += goodMatches.length * 10;

        // Evitar descripciones genéricas
        const genericIndicators = ['apply now', 'click here', 'join our team'];
        const genericMatches = genericIndicators.filter(indicator => description.includes(indicator));
        score -= genericMatches.length * 15;

        return Math.max(0, Math.min(score, 100));
    }

    /**
     * Calcula score basado en número de solicitantes
     * @param {Object} job - Datos del job
     * @returns {number} Score de solicitantes (0-100)
     */
    calculateApplicantsScore(job) {
        if (!job.applicants) return 50; // Score neutral si no hay info

        const applicantsText = job.applicants.toLowerCase();
        
        // Extraer número de solicitantes
        const match = applicantsText.match(/(\d+)/);
        if (!match) return 50;

        const applicantCount = parseInt(match[1]);

        // Score inverso: menos solicitantes = más oportunidad
        if (applicantCount <= 10) return 90;
        if (applicantCount <= 25) return 80;
        if (applicantCount <= 50) return 60;
        if (applicantCount <= 100) return 40;
        if (applicantCount <= 200) return 20;
        return 10; // Mucha competencia
    }

    /**
     * Calcula score ponderado
     * @param {Object} breakdown - Desglose de scores
     * @returns {number} Score total ponderado
     */
    calculateWeightedScore(breakdown) {
        return Object.entries(this.weights).reduce((total, [component, weight]) => {
            return total + (breakdown[component] || 0) * weight;
        }, 0);
    }

    /**
     * Determina categoría de score
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
     * Actualiza estadísticas de scoring
     * @param {number} score - Nuevo score
     */
    updateStats(score) {
        this.stats.totalScored++;
        
        // Actualizar distribución
        const category = this.getScoreCategory(score);
        this.stats.scoreDistribution[category]++;

        // Actualizar promedio
        const totalScore = Object.entries(this.stats.scoreDistribution)
            .reduce((sum, [cat, count]) => {
                const avgScore = this.getCategoryAverage(cat);
                return sum + (avgScore * count);
            }, 0);
        
        this.stats.averageScore = totalScore / this.stats.totalScored;
    }

    /**
     * Obtiene score promedio por categoría
     * @param {string} category - Categoría
     * @returns {number} Score promedio
     */
    getCategoryAverage(category) {
        const averages = {
            excellent: 95,
            good: 80,
            average: 60,
            poor: 30
        };
        return averages[category] || 50;
    }

    /**
     * Ordena jobs por score
     * @param {Array} jobs - Jobs a ordenar
     * @param {string} sortBy - Criterio de ordenamiento
     * @returns {Array} Jobs ordenados
     */
    sortJobsByScore(jobs, sortBy = 'total') {
        return jobs.sort((a, b) => {
            const scoreA = a.score?.[sortBy] || 0;
            const scoreB = b.score?.[sortBy] || 0;
            return scoreB - scoreA; // Orden descendente
        });
    }

    /**
     * Filtra jobs por score mínimo
     * @param {Array} jobs - Jobs a filtrar
     * @param {number} minScore - Score mínimo
     * @returns {Array} Jobs filtrados
     */
    filterJobsByScore(jobs, minScore) {
        return jobs.filter(job => job.score?.total >= minScore);
    }

    /**
     * Obtiene estadísticas de scoring
     * @returns {Object} Estadísticas actuales
     */
    getScoringStats() {
        return {
            ...this.stats,
            weights: { ...this.weights },
            topCompaniesCount: this.topCompanies.size,
            preferredLocationsCount: this.preferredLocations.size
        };
    }

    /**
     * Actualiza pesos de scoring
     * @param {Object} newWeights - Nuevos pesos
     */
    updateWeights(newWeights) {
        // Validar que sumen 1
        const totalWeight = Object.values(newWeights).reduce((sum, weight) => sum + weight, 0);
        
        if (Math.abs(totalWeight - 1.0) > 0.01) {
            console.warn('Los pesos no suman 1.0, se normalizarán');
            
            // Normalizar pesos
            Object.keys(newWeights).forEach(key => {
                newWeights[key] = newWeights[key] / totalWeight;
            });
        }

        this.weights = { ...this.weights, ...newWeights };
        console.log('Pesos de scoring actualizados:', this.weights);
    }

    /**
     * Agrega compañía a top companies
     * @param {string} companyName - Nombre de la compañía
     */
    addTopCompany(companyName) {
        this.topCompanies.add(companyName.toLowerCase());
        console.log(`Compañía agregada a top companies: ${companyName}`);
    }

    /**
     * Agregar ubicación preferida
     * @param {string} location - Ubicación preferida
     */
    addPreferredLocation(location) {
        this.preferredLocations.add(location.toLowerCase());
        console.log(`Ubicación preferida agregada: ${location}`);
    }

    /**
     * Reinicia estadísticas
     */
    resetStats() {
        this.stats = {
            totalScored: 0,
            averageScore: 0,
            scoreDistribution: {
                excellent: 0,
                good: 0,
                average: 0,
                poor: 0
            }
        };
    }
}

module.exports = JobScorer;
