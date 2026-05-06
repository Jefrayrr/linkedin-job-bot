/**
 * Advanced Job Scorer - Sistema multi-dimensional inspirado en Career-Ops
 * Evalúa ofertas de empleo en 10 dimensiones con pesos específicos y gate-pass rules
 */

class AdvancedJobScorer {
  constructor(userCV, userProfile) {
    this.userCV = userCV;
    this.userProfile = userProfile;
    
    // Configuración de pesos basada en Career-Ops
    this.dimensions = {
      roleMatch: { weight: 0.25, gatePass: true, name: 'Role Match' },
      skillsAlignment: { weight: 0.20, gatePass: true, name: 'Skills Alignment' },
      seniority: { weight: 0.15, gatePass: false, name: 'Seniority Level' },
      compensation: { weight: 0.15, gatePass: false, name: 'Compensation Analysis' },
      geographic: { weight: 0.10, gatePass: false, name: 'Geographic Fit' },
      companyStage: { weight: 0.05, gatePass: false, name: 'Company Stage Fit' },
      productMarket: { weight: 0.03, gatePass: false, name: 'Product-Market Fit' },
      growthTrajectory: { weight: 0.03, gatePass: false, name: 'Growth Trajectory' },
      interviewLikelihood: { weight: 0.02, gatePass: false, name: 'Interview Likelihood' },
      timeline: { weight: 0.07, gatePass: false, name: 'Timeline Fit' }
    };
    
    // Umbrales de evaluación
    this.thresholds = {
      minimumScore: 3.0,
      gatePassScore: 4.0,
      excellentScore: 4.5
    };
  }

  /**
   * Método principal de evaluación
   */
  async scoreJob(jobDescription, jobMetadata = {}) {
    console.log('=== INICIANDO EVALUACIÓN MULTI-DIMENSIONAL ===');
    
    const scores = {};
    const analysis = {};
    
    try {
      // 1. Role Match - Gate Pass
      console.log('📋 Analizando Role Match...');
      const roleMatch = await this.analyzeRoleMatch(jobDescription, jobMetadata);
      scores.roleMatch = roleMatch.score;
      analysis.roleMatch = roleMatch.analysis;
      
      if (roleMatch.score < 0.20) { // 20% mínimo de match
        return { 
          rejected: true, 
          reason: 'Role mismatch - no hay alineación con el perfil',
          score: 0,
          grade: 'F'
        };
      }
      
      // 2. Skills Alignment - Gate Pass
      console.log('🔧 Analizando Skills Alignment...');
      const skillsAlignment = await this.analyzeSkillsAlignment(jobDescription);
      scores.skillsAlignment = skillsAlignment.score;
      analysis.skillsAlignment = skillsAlignment.analysis;
      
      if (skillsAlignment.score < 0.30) { // 30% mínimo de skills
        return { 
          rejected: true, 
          reason: 'Skills gap - faltan competencias clave',
          score: 0,
          grade: 'F'
        };
      }
      
      // 3. Seniority Level
      console.log('📊 Analizando Seniority Level...');
      const seniority = await this.analyzeSeniority(jobDescription);
      scores.seniority = seniority.score;
      analysis.seniority = seniority.analysis;
      
      // 4. Compensation Analysis
      console.log('💰 Analizando Compensation...');
      const compensation = await this.analyzeCompensation(jobDescription, jobMetadata);
      scores.compensation = compensation.score;
      analysis.compensation = compensation.analysis;
      
      // 5. Geographic Fit
      console.log('🌍 Analizando Geographic Fit...');
      const geographic = await this.analyzeGeographicFit(jobDescription, jobMetadata);
      scores.geographic = geographic.score;
      analysis.geographic = geographic.analysis;
      
      // 6. Company Stage Fit
      console.log('🏢 Analizando Company Stage Fit...');
      const companyStage = await this.analyzeCompanyStage(jobDescription, jobMetadata);
      scores.companyStage = companyStage.score;
      analysis.companyStage = companyStage.analysis;
      
      // 7. Product-Market Fit
      console.log('🎯 Analizando Product-Market Fit...');
      const productMarket = await this.analyzeProductMarketFit(jobDescription, jobMetadata);
      scores.productMarket = productMarket.score;
      analysis.productMarket = productMarket.analysis;
      
      // 8. Growth Trajectory
      console.log('📈 Analizando Growth Trajectory...');
      const growthTrajectory = await this.analyzeGrowthTrajectory(jobDescription, jobMetadata);
      scores.growthTrajectory = growthTrajectory.score;
      analysis.growthTrajectory = growthTrajectory.analysis;
      
      // 9. Interview Likelihood
      console.log('🎤 Analizando Interview Likelihood...');
      const interviewLikelihood = await this.analyzeInterviewLikelihood(jobDescription, jobMetadata);
      scores.interviewLikelihood = interviewLikelihood.score;
      analysis.interviewLikelihood = interviewLikelihood.analysis;
      
      // 10. Timeline/Urgency
      console.log('⏰ Analizando Timeline...');
      const timeline = await this.analyzeTimeline(jobDescription, jobMetadata);
      scores.timeline = timeline.score;
      analysis.timeline = timeline.analysis;
      
      // Calcular score final
      const finalScore = this.calculateFinalScore(scores);
      const grade = this.calculateGrade(finalScore);
      
      console.log('✅ Evaluación completada');
      console.log(`📊 Score Final: ${finalScore.toFixed(2)}/5.0 (${grade})`);
      
      return {
        score: finalScore,
        grade: grade,
        dimensions: scores,
        analysis: analysis,
        rejected: false,
        recommendations: this.generateRecommendations(scores, analysis)
      };
      
    } catch (error) {
      console.error('❌ Error en evaluación:', error);
      return {
        rejected: true,
        reason: `Error en evaluación: ${error.message}`,
        score: 0,
        grade: 'F'
      };
    }
  }

  /**
   * 1. Role Match Analysis - Gate Pass
   */
  async analyzeRoleMatch(jobDescription, jobMetadata) {
    const userSkills = this.extractUserSkills();
    const requiredSkills = this.extractRequiredSkills(jobDescription);
    
    // Análisis del rol principal - mucho más flexible
    const roleKeywords = [
      'desarrollador', 'developer', 'software', 'full stack',
      'frontend', 'backend', 'javascript', 'react', 'node.js',
      'programador', 'engineer', 'web developer', 'java',
      'sql', 'python', 'full-stack', 'fullstack', 'stack',
      'backend', 'front end', 'back end', 'software engineer',
      'application developer', 'system developer'
    ];
    
    const description = jobDescription.toLowerCase();
    const title = jobMetadata.title ? jobMetadata.title.toLowerCase() : '';
    const combinedText = description + ' ' + title;
    
    console.log(`🔍 DEBUG - Analizando Role Match para: "${title}"`);
    console.log(`📝 Texto combinado: "${combinedText.substring(0, 200)}..."`);
    
    // Calcular matches de diferentes categorías - usando el método flexible
    const roleMatch = this.calculateFlexibleKeywordMatch(combinedText, roleKeywords);
    console.log(`🎯 DEBUG - Role Match: ${roleMatch.toFixed(3)}`);
    
    // Análisis de habilidades específicas del rol - más amplio
    const jsKeywords = ['javascript', 'react', 'node.js', 'angular', 'html', 'css', 'api', 'rest', 'vue', 'typescript'];
    const backendKeywords = ['java', 'python', 'sql', 'mysql', 'node.js', 'backend', 'api', 'rest'];
    const frontendKeywords = ['javascript', 'react', 'angular', 'vue', 'html', 'css', 'frontend', 'ui', 'ux'];
    const generalKeywords = ['software', 'developer', 'programador', 'engineer', 'application'];
    
    const jsMatch = this.calculateFlexibleKeywordMatch(combinedText, jsKeywords);
    const backendMatch = this.calculateFlexibleKeywordMatch(combinedText, backendKeywords);
    const frontendMatch = this.calculateFlexibleKeywordMatch(combinedText, frontendKeywords);
    const generalMatch = this.calculateFlexibleKeywordMatch(combinedText, generalKeywords);
    
    // Experiencia relevante - mucho más flexible
    const hasRelevantExperience = this.userCV.experience.some(exp => {
      const expRole = exp.role.toLowerCase();
      const expSkills = exp.skills.map(s => s.toLowerCase());
      const expAchievements = exp.achievements.map(a => a.toLowerCase());
      
      return expRole.includes('desarrollador') ||
             expRole.includes('developer') ||
             expRole.includes('técnico') ||
             expRole.includes('software') ||
             expSkills.some(skill => [...jsKeywords, ...backendKeywords, ...frontendKeywords].includes(skill)) ||
             expAchievements.some(achievement => 
               [...jsKeywords, ...backendKeywords, ...frontendKeywords].some(keyword => achievement.includes(keyword))
             );
    });
    
    // Proyectos relevantes
    const hasRelevantProjects = this.userCV.projects && this.userCV.projects.some(proj => 
      proj.technologies && proj.technologies.some(tech => 
        [...jsKeywords, ...backendKeywords, ...frontendKeywords].includes(tech.toLowerCase())
      )
    );
    
    // Calcular score con múltiples factores
    const techMatch = Math.max(jsMatch, backendMatch, frontendMatch);
    const score = (roleMatch * 0.2) + (techMatch * 0.3) + (generalMatch * 0.2) + 
                  (hasRelevantExperience ? 0.2 : 0) + (hasRelevantProjects ? 0.1 : 0);
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        roleMatch: roleMatch,
        techMatch: techMatch,
        jsMatch: jsMatch,
        backendMatch: backendMatch,
        frontendMatch: frontendMatch,
        generalMatch: generalMatch,
        hasRelevantExperience,
        hasRelevantProjects,
        matchedKeywords: roleKeywords.filter(kw => combinedText.includes(kw))
      }
    };
  }

  /**
   * 2. Skills Alignment Analysis - Gate Pass
   */
  async analyzeSkillsAlignment(jobDescription) {
    const userSkills = this.extractUserSkills();
    const requiredSkills = this.extractRequiredSkills(jobDescription);
    
    if (!requiredSkills || requiredSkills.length === 0) return { score: 0.5, analysis: { reason: 'No se detectaron habilidades requeridas' } };
    
    // Función de normalización para nombres de skills
    const normalize = s => s.toLowerCase()
      .replace('.js', '')   // react.js → react
      .replace(/\d+$/, '')  // html5 → html, css3 → css
      .trim();
    
    // Habilidades del usuario (del CV) - normalizadas
    const userSkillSet = new Set([
      ...(userSkills.technical || []),
      ...(userSkills.soft || [])
    ].map(normalize).filter(Boolean));
    
    // Habilidades requeridas en la oferta - normalizadas
    const requiredSkillSet = new Set(requiredSkills.map(normalize).filter(Boolean));
    
    // Calcular overlap con nombres normalizados
    const overlap = [...userSkillSet].filter(skill => requiredSkillSet.has(skill));
    const overlapPercentage = requiredSkillSet.size > 0 ? overlap.length / requiredSkillSet.size : 0;
    
    // Bonus por habilidades clave - dinámico desde CV
    const userTechSkills = (userSkills.technical || []).map(normalize);
    const keySkills = userTechSkills.slice(0, 5); // Primeras 5 skills técnicas del CV
    const keySkillBonus = overlap.filter(skill => keySkills.includes(skill)).length * 0.1;
    
    const score = Math.min(overlapPercentage + keySkillBonus, 1.0);
    
    return {
      score: Math.max(score, 0),
      analysis: {
        userSkills: Array.from(userSkillSet),
        requiredSkills: requiredSkills,
        overlap: overlap,
        overlapPercentage: (overlapPercentage * 100).toFixed(1) + '%',
        keySkillBonus
      }
    };
  }

  /**
   * 3. Seniority Analysis
   */
  async analyzeSeniority(jobDescription) {
    const experience = this.userCV.experience;
    const totalExperience = this.calculateTotalExperience(experience);
    
    // Detectar nivel requerido
    const seniorityKeywords = {
      junior: ['junior', 'entry-level', 'trainee', 'practicante'],
      mid: ['mid-level', 'intermediate', '3-5 years'],
      senior: ['senior', '5+ years', 'lead', 'principal'],
      staff: ['staff', 'principal', '6+ years', 'senior+']
    };
    
    const description = jobDescription.toLowerCase();
    let requiredLevel = 'mid';
    
    for (const [level, keywords] of Object.entries(seniorityKeywords)) {
      if (keywords.some(kw => description.includes(kw))) {
        requiredLevel = level;
        break;
      }
    }
    
    // Calcular score basado en experiencia
    let score = 0.5; // Base para mid-level
    
    if (requiredLevel === 'junior' && totalExperience >= 5) score = 0.3;
    else if (requiredLevel === 'mid' && totalExperience >= 3 && totalExperience <= 7) score = 1.0;
    else if (requiredLevel === 'senior' && totalExperience >= 5) score = 0.9;
    else if (requiredLevel === 'staff' && totalExperience >= 7) score = 0.8;
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        requiredLevel,
        totalExperience,
        experienceMatches: this.getExperienceMatch(requiredLevel, totalExperience)
      }
    };
  }

  /**
   * 4. Compensation Analysis
   */
  async analyzeCompensation(jobDescription, jobMetadata) {
    const salaryRange = this.extractSalaryRange(jobDescription, jobMetadata);
    
    if (!salaryRange) {
      return { score: 0.5, analysis: { reason: 'No se detectó rango salarial' } };
    }
    
    const userPreferences = this.userProfile.preferences || {};
    const expectedSalary = userPreferences.salary || 5000000; // 5M COP por defecto
    
    // Calcular fit basado en rango - escala 0-1
    let score = 0.5; // Base neutral
    
    if (salaryRange.min >= expectedSalary * 0.8 && salaryRange.max <= expectedSalary * 1.5) {
      score = 1.0; // Rango ideal
    } else if (salaryRange.min >= expectedSalary * 0.6 && salaryRange.max <= expectedSalary * 2.0) {
      score = 0.8; // Buen rango
    } else if (salaryRange.min >= expectedSalary * 0.5 && salaryRange.max <= expectedSalary * 2.5) {
      score = 0.6; // Rango aceptable
    } else if (salaryRange.min < expectedSalary * 0.5) {
      score = 0.2; // Muy bajo
    } else if (salaryRange.max > expectedSalary * 3.0) {
      score = 0.4; // Puede ser demasiado alto (posible error)
    }
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        salaryRange,
        expectedSalary,
        marketAlignment: score >= 0.6
      }
    };
  }

  /**
   * 5. Geographic Fit Analysis
   */
  async analyzeGeographicFit(jobDescription, jobMetadata) {
    const userLocation = 'Bogotá, Colombia';
    const jobLocation = this.extractLocation(jobDescription, jobMetadata);
    
    if (!jobLocation) {
      return { score: 0.7, analysis: { reason: 'Ubicación no especificada' } };
    }
    
    // Análisis de preferencias
    const remoteKeywords = ['remote', 'remoto', 'teletrabajo', 'home office'];
    const isRemote = remoteKeywords.some(kw => 
      jobDescription.toLowerCase().includes(kw) ||
      (jobMetadata.location && jobMetadata.location.toLowerCase().includes(kw))
    );
    
    let score = 0.5;
    
    if (isRemote) {
      score = 0.9; // Remote es preferible
    } else if (jobLocation.toLowerCase().includes(userLocation.toLowerCase())) {
      score = 1.0; // Misma ubicación
    } else if (jobLocation.toLowerCase().includes('colombia')) {
      score = 0.8; // Mismo país
    } else {
      score = 0.3; // Internacional requiere reubicación
    }
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        userLocation,
        jobLocation,
        isRemote,
        locationType: isRemote ? 'Remote' : 'On-site'
      }
    };
  }

  /**
   * 6. Company Stage Fit Analysis
   */
  async analyzeCompanyStage(jobDescription, jobMetadata) {
    const companyKeywords = {
      startup: ['startup', 'scale-up', 'growing', 'fast-paced'],
      enterprise: ['enterprise', 'corporation', 'fortune', 'established'],
      midSize: ['mid-size', 'medium', 'established but growing']
    };
    
    const description = jobDescription.toLowerCase();
    let companyType = 'midSize';
    
    for (const [type, keywords] of Object.entries(companyKeywords)) {
      if (keywords.some(kw => description.includes(kw))) {
        companyType = type;
        break;
      }
    }
    
    // Preferencia basada en experiencia
    const hasStartupExp = this.userCV.experience.some(exp => 
      exp.company && exp.company.toLowerCase().includes('startup')
    );
    const hasEnterpriseExp = this.userCV.experience.some(exp => 
      exp.company && (
        exp.company.toLowerCase().includes('enterprise') ||
        exp.company.toLowerCase().includes('corporation') ||
        exp.company.toLowerCase().includes('company') ||
        exp.company.toLowerCase().includes('group') ||
        exp.company.toLowerCase().includes('international')
      )
    );
    
    let score = 0.7; // Base para mid-size
    if (companyType === 'startup' && hasStartupExp) score = 1.0;
    if (companyType === 'enterprise' && hasEnterpriseExp) score = 0.9;
    if (companyType === 'startup' && !hasStartupExp) score = 0.5;
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        companyType,
        hasRelevantExperience: companyType === 'startup' ? hasStartupExp : hasEnterpriseExp
      }
    };
  }

  /**
   * 7. Product-Market Fit Analysis
   */
  async analyzeProductMarketFit(jobDescription, jobMetadata) {
    const productKeywords = {
      web: ['web application', 'website', 'frontend', 'backend', 'full-stack'],
      mobile: ['mobile', 'ios', 'android', 'app'],
      data: ['data', 'analytics', 'database', 'bi'],
      enterprise: ['enterprise', 'business', 'corporate'],
      fintech: ['fintech', 'financial', 'banking', 'payments']
    };
    
    const description = jobDescription.toLowerCase();
    let productType = 'web';
    
    for (const [type, keywords] of Object.entries(productKeywords)) {
      if (keywords.some(kw => description.includes(kw))) {
        productType = type;
        break;
      }
    }
    
    // Experiencia relevante del usuario - corregida precedencia de operadores
    const hasWebExp = this.userCV.experience && this.userCV.experience.some(exp => 
      (exp.role && exp.role.toLowerCase().includes('desarrollador')) ||
      (exp.projects && exp.projects.some(proj => 
        proj && (proj.toLowerCase().includes('web') || proj.toLowerCase().includes('aplicación'))
      ))
    );
    
    // Verificar proyectos del CV
    const hasWebProjects = this.userCV.projects && this.userCV.projects.some(proj => 
      proj.technologies && proj.technologies.some(tech => 
        ['javascript', 'react', 'node.js', 'html', 'css'].includes(tech.toLowerCase())
      )
    );
    
    let score = 0.7; // Base
    if (productType === 'web' && (hasWebExp || hasWebProjects)) score = 1.0;
    if (productType === 'fintech') score = 0.8; // Creciente
    if (productType === 'mobile' && !hasWebExp && !hasWebProjects) score = 0.3;
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        productType,
        hasRelevantExperience: hasWebExp || hasWebProjects
      }
    };
  }

  /**
   * 8. Growth Trajectory Analysis
   */
  async analyzeGrowthTrajectory(jobDescription, jobMetadata) {
    const growthKeywords = {
      high: ['rapid growth', 'fast-paced', 'scale', 'opportunity', 'innovation'],
      medium: ['growth', 'development', 'advancement'],
      low: ['stable', 'maintain', 'support', 'established']
    };
    
    const description = jobDescription.toLowerCase();
    let growthPotential = 'medium';
    
    for (const [level, keywords] of Object.entries(growthKeywords)) {
      if (keywords.some(kw => description.includes(kw))) {
        growthPotential = level;
        break;
      }
    }
    
    // Preferencia de crecimiento basada en perfil
    let score = 0.6; // Base para medium growth
    
    if (growthPotential === 'high') score = 0.9;
    if (growthPotential === 'low') score = 0.4;
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        growthPotential,
        careerAlignment: score >= 0.6
      }
    };
  }

  /**
   * 9. Interview Likelihood Analysis
   */
  async analyzeInterviewLikelihood(jobDescription, jobMetadata) {
    const urgencyKeywords = ['urgent', 'immediate', 'asap', 'quick hire'];
    const processKeywords = ['multiple rounds', 'technical test', 'code challenge', 'take-home'];
    
    const description = jobDescription.toLowerCase();
    const isUrgent = urgencyKeywords.some(kw => description.includes(kw));
    const hasTechnicalProcess = processKeywords.some(kw => description.includes(kw));
    
    // Calcular probabilidad basada en factores
    let score = 0.7; // Base
    
    if (isUrgent) score += 0.2;
    if (hasTechnicalProcess) score += 0.1;
    if (description.includes('remote')) score += 0.1;
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        isUrgent,
        hasTechnicalProcess,
        processComplexity: hasTechnicalProcess ? 'High' : 'Medium'
      }
    };
  }

  /**
   * 10. Timeline Analysis
   */
  async analyzeTimeline(jobDescription, jobMetadata) {
    const timelineKeywords = {
      immediate: ['immediate', 'urgent', 'asap', 'quick'],
      normal: ['standard', 'normal', 'regular'],
      extended: ['extended', 'multiple rounds', 'thorough']
    };
    
    const description = jobDescription.toLowerCase();
    let timeline = 'normal';
    
    for (const [type, keywords] of Object.entries(timelineKeywords)) {
      if (keywords.some(kw => description.includes(kw))) {
        timeline = type;
        break;
      }
    }
    
    let score = 0.6; // Base para normal
    
    if (timeline === 'immediate') score = 0.8;
    if (timeline === 'extended') score = 0.4;
    
    return {
      score: Math.min(score, 1.0),
      analysis: {
        timeline,
        urgency: timeline === 'immediate' ? 'High' : 'Normal'
      }
    };
  }

  /**
   * Métodos de utilidad
   */
  calculateFinalScore(scores) {
    let totalScore = 0;
    
    // Todos los scores están en escala 0-1, los ponderamos y luego multiplicamos por 5
    for (const [dimension, config] of Object.entries(this.dimensions)) {
      if (scores[dimension] !== undefined && !isNaN(scores[dimension])) {
        totalScore += scores[dimension] * config.weight;
      }
    }
    
    // Convertir a escala 0-5 al final
    return totalScore * 5;
  }

  calculateGrade(score) {
    if (score >= 4.5) return 'A';
    if (score >= 4.0) return 'B';
    if (score >= 3.0) return 'C';
    if (score >= 2.0) return 'D';
    return 'F';
  }

  generateRecommendations(scores, analysis) {
    const recommendations = [];
    
    if (scores && scores.roleMatch < 0.7) {
      recommendations.push('Considera destacar tu experiencia en roles de desarrollo full-stack');
    }
    
    if (scores && scores.skillsAlignment < 0.6) {
      recommendations.push('Mejora tu perfil destacando las habilidades técnicas más demandadas');
    }
    
    if (scores && scores.compensation < 0.5) {
      recommendations.push('Investiga rangos salariales del mercado para tu nivel');
    }
    
    return recommendations;
  }

  /**
   * Extractores de información
   */
  extractUserSkills() {
    // Leer dinámicamente del CV real
    const cvSkills = this.userCV?.skills || {};
    
    // Normalizar y extraer skills técnicas
    const technical = cvSkills.technical ? 
      cvSkills.technical.map(skill => skill.toLowerCase().trim()) : [];
    
    // Normalizar y extraer skills blandas
    const soft = cvSkills.soft ? 
      cvSkills.soft.map(skill => skill.toLowerCase().trim()) : [];
    
    return {
      technical,
      soft
    };
  }

  extractRequiredSkills(jobDescription) {
    const skillKeywords = [
      'javascript', 'react', 'node.js', 'angular', 'html', 'css',
      'sql', 'mysql', 'git', 'python', 'java', 'c++',
      'api', 'rest', 'frontend', 'backend', 'full-stack'
    ];
    
    return skillKeywords.filter(skill => 
      jobDescription.toLowerCase().includes(skill.toLowerCase())
    );
  }

  calculateKeywordMatch(text, keywords) {
    const matches = keywords.filter(keyword => text.includes(keyword));
    return matches.length / keywords.length;
  }

  /**
   * Versión mejorada de calculateKeywordMatch que busca coincidencias parciales
   */
  calculateFlexibleKeywordMatch(text, keywords) {
    let matchCount = 0;
    
    for (const keyword of keywords) {
      // Buscar coincidencia exacta
      if (text.includes(keyword)) {
        matchCount++;
        continue;
      }
      
      // Buscar coincidencias parciales para palabras compuestas
      if (keyword.includes(' ')) {
        const words = keyword.split(' ');
        const partialMatches = words.filter(word => text.includes(word));
        if (partialMatches.length >= words.length * 0.5) { // 50% de las palabras
          matchCount++;
        }
      } else {
        // Para palabras simples, buscar variantes
        const variants = [
          keyword,
          keyword + ' ',
          ' ' + keyword,
          keyword + 's', // plural
          keyword.replace('er', 'ing'), // developer -> developing
          keyword.replace('ment', ''), // development -> develop
        ];
        
        if (variants.some(variant => text.includes(variant))) {
          matchCount++;
        }
      }
    }
    
    return matchCount / keywords.length;
  }

  calculateTotalExperience(experience) {
    return experience.reduce((total, exp) => {
      const duration = this.parseDuration(exp.duration);
      return total + duration;
    }, 0);
  }

  parseDuration(duration) {
    // Simplificado - asume años
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  getExperienceMatch(requiredLevel, totalExperience) {
    if (requiredLevel === 'junior' && totalExperience > 4) return 'Over-qualified';
    if (requiredLevel === 'junior' && totalExperience < 1) return 'Under-qualified';
    if (requiredLevel === 'senior' && totalExperience < 5) return 'Under-qualified';
    if (requiredLevel === 'staff' && totalExperience < 7) return 'Under-qualified';
    return 'Good match';
  }

  extractSalaryRange(jobDescription, jobMetadata) {
    // Buscar patrones de salario
    const salaryPatterns = [
      /\$?(\d+(?:,\d+)*)\s*-\s*\$?(\d+(?:,\d+)*)/i,
      /salary.*?(\d+(?:,\d+)*)\s*-\s*(\d+(?:,\d+)*)/i,
      /(\d+(?:,\d+)*)\s*-\s*(\d+(?:,\d+)*)\s*(?:million|k|thousand)/i
    ];
    
    for (const pattern of salaryPatterns) {
      const match = jobDescription.match(pattern);
      if (match) {
        return {
          min: this.parseSalary(match[1]),
          max: this.parseSalary(match[2])
        };
      }
    }
    
    return null;
  }

  parseSalary(salaryStr) {
    const clean = salaryStr.replace(/[,$]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  extractLocation(jobDescription, jobMetadata) {
    if (jobMetadata.location) return jobMetadata.location;
    
    const locationPatterns = [
      /(?:in|at|en)\s+([^,\n]+)/i,
      /([^,\n]+)\s+(?:remote|remoto)/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = jobDescription.match(pattern);
      if (match) return match[1].trim();
    }
    
    return null;
  }
}

module.exports = AdvancedJobScorer;
