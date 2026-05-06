/**
 * Test del Sistema de Scoring Multi-Dimensional
 * Prueba el AdvancedJobScorer con datos de ejemplo reales
 */

const AdvancedJobScorer = require('./scoring/AdvancedJobScorer');
const fs = require('fs');
const path = require('path');

// Cargar perfil de usuario
const userProfile = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../data/userProfile.json'), 'utf8'
));

// Datos de ejemplo de ofertas de trabajo
const sampleJobs = [
  {
    jobId: 'job-1',
    title: 'Senior Full Stack Developer - React & Node.js',
    company: 'TechCorp Solutions',
    location: 'Bogotá, Colombia (Remote)',
    description: `
      Buscamos un Senior Full Stack Developer con experiencia en React.js y Node.js.
      Requisitos: 5+ años de experiencia en desarrollo web, JavaScript avanzado,
      React, Node.js, SQL, Git. Salario competitivo entre 8-12 millones COP.
      Trabajo remoto para equipo de producto en crecimiento rápido.
      Buscamos alguien que lidere proyectos técnicos y mentorice al equipo.
      Oportunidad de crecimiento en empresa de tecnología en expansión.
    `,
    metadata: {
      location: 'Bogotá, Colombia',
      salary: { min: 8000000, max: 12000000 },
      remote: true,
      companyType: 'mid-size'
    }
  },
  {
    jobId: 'job-2', 
    title: 'Junior Frontend Developer',
    company: 'StartupXYZ',
    location: 'Medellín, Colombia',
    description: `
      Buscamos Junior Frontend Developer para nuestro equipo de desarrollo.
      Requisitos: 1-2 años de experiencia, HTML, CSS, JavaScript básico,
      React.js es un plus. Salario de 3-4 millones COP.
      Trabajo presencial en Medellín. Empresa startup en etapa temprana.
      Oportunidad de aprender y crecer con la empresa.
      Buscamos personas proactivas con ganas de aprender.
    `,
    metadata: {
      location: 'Medellín, Colombia',
      salary: { min: 3000000, max: 4000000 },
      remote: false,
      companyType: 'startup'
    }
  },
  {
    jobId: 'job-3',
    title: 'JavaScript Developer - Fintech',
    company: 'FinTech Innovations',
    location: 'Remote (Colombia)',
    description: `
      Buscamos JavaScript Developer para proyecto fintech importante.
      Requisitos: 3+ años de experiencia, JavaScript avanzado,
      React, Node.js, APIs REST, experiencia con sistemas financieros.
      Salario 6-10 millones COP. Trabajo 100% remoto.
      Empresa estable en sector financiero tecnológico.
      Buscamos alguien con experiencia en transacciones seguras.
      Oportunidad de crecimiento en sector fintech en auge.
    `,
    metadata: {
      location: 'Remote',
      salary: { min: 6000000, max: 10000000 },
      remote: true,
      companyType: 'enterprise'
    }
  },
  {
    jobId: 'job-4',
    title: 'Data Scientist - Python Specialist',
    company: 'AI Analytics Corp',
    location: 'Santiago, Chile',
    description: `
      Buscamos Data Scientist con especialización en Python.
      Requisitos: 4+ años de experiencia en data science, Python,
      Machine Learning, TensorFlow, pandas, numpy.
      Salario en USD 40,000-60,000 anual. Reubicación requerida.
      Empresa líder en análisis de datos e inteligencia artificial.
      Buscamos alguien con experiencia en modelos predictivos.
      Oportunidad internacional con gran crecimiento profesional.
    `,
    metadata: {
      location: 'Santiago, Chile',
      salary: { min: 40000, max: 60000 },
      remote: false,
      companyType: 'enterprise'
    }
  },
  {
    jobId: 'job-5',
    title: 'Full Stack Developer - E-commerce Platform',
    company: 'E-commerce Solutions',
    location: 'Remote (Latam)',
    description: `
      Buscamos Full Stack Developer para plataforma e-commerce.
      Requisitos: 3-5 años experiencia, JavaScript, React, Node.js,
      SQL, MongoDB, experiencia con tiendas online.
      Salario 5-8 millones COP. Trabajo remoto para Latinoamérica.
      Empresa en crecimiento rápido, buscando escalar operaciones.
      Oportunidad de liderar desarrollo de nuevas funcionalidades.
      Ambiente dinámico con equipo técnico talentoso.
    `,
    metadata: {
      location: 'Remote',
      salary: { min: 5000000, max: 8000000 },
      remote: true,
      companyType: 'startup'
    }
  }
];

async function runScoringTest() {
  console.log('=== INICIANDO TEST DEL SISTEMA DE SCORING ===');
  console.log(`👤 Perfil: ${userProfile.personalInfo.name}`);
  console.log(`📧 Email: ${userProfile.personalInfo.email}`);
  console.log(`📍 Ubicación: ${userProfile.personalInfo.location}`);
  console.log('');

  // Inicializar el scorer
  const scorer = new AdvancedJobScorer(userProfile, userProfile.preferences);
  
  console.log('📋 Evaluando ofertas de ejemplo...\n');
  
  const results = [];
  
  for (const job of sampleJobs) {
    console.log(`🔍 Evaluando: ${job.title} - ${job.company}`);
    console.log(`📍 ${job.location}`);
    
    try {
      const scoringResult = await scorer.scoreJob(job.description, job.metadata);
      
      if (scoringResult.rejected) {
        console.log(`❌ RECHAZADO: ${scoringResult.reason}`);
        console.log('');
        continue;
      }
      
      const result = {
        ...job,
        score: scoringResult.score,
        grade: scoringResult.grade,
        dimensions: scoringResult.dimensions,
        analysis: scoringResult.analysis,
        recommendations: scoringResult.recommendations
      };
      
      results.push(result);
      
      // Mostrar resultados detallados
      console.log(`✅ APROBADO - Score: ${scoringResult.score.toFixed(2)}/5.0 (${scoringResult.grade})`);
      
      // Mostrar scores por dimensión
      console.log('📊 Scores por dimensión:');
      for (const [dimension, score] of Object.entries(scoringResult.dimensions)) {
        const config = scorer.dimensions[dimension];
        console.log(`   ${config.name.padEnd(20)}: ${score.toFixed(2)} (${(score * 100).toFixed(0)}%)`);
      }
      
      // Mostrar recomendaciones
      if (scoringResult.recommendations.length > 0) {
        console.log('💡 Recomendaciones:');
        scoringResult.recommendations.forEach(rec => {
          console.log(`   • ${rec}`);
        });
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`❌ Error evaluando job: ${error.message}`);
      console.log('');
    }
  }
  
  // Resumen final
  console.log('=== RESUMEN DE RESULTADOS ===');
  console.log(`📊 Total evaluados: ${sampleJobs.length}`);
  console.log(`✅ Aprobados: ${results.length}`);
  console.log(`📈 Score promedio: ${results.length > 0 ? (results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(2) : 'N/A'}`);
  
  // Ranking por score
  const ranked = results.sort((a, b) => b.score - a.score);
  console.log('\n🏆 RANKING POR SCORE:');
  ranked.forEach((job, index) => {
    console.log(`${index + 1}. ${job.title} - ${job.company}`);
    console.log(`   Score: ${job.score.toFixed(2)}/5.0 (${job.grade}) - ${job.location}`);
    console.log(`   ${job.description.split('.')[0].trim()}.`);
    console.log('');
  });
  
  // Estadísticas por grade
  const gradeStats = {};
  results.forEach(job => {
    gradeStats[job.grade] = (gradeStats[job.grade] || 0) + 1;
  });
  
  console.log('📊 DISTRIBUCIÓN POR GRADO:');
  Object.entries(gradeStats).forEach(([grade, count]) => {
    console.log(`   ${grade}: ${count} jobs`);
  });
  
  console.log('\n=== TEST COMPLETADO ===');
  
  // Guardar resultados para análisis posterior
  const testResults = {
    timestamp: new Date().toISOString(),
    userProfile: userProfile.personalInfo,
    totalJobs: sampleJobs.length,
    approvedJobs: results.length,
    averageScore: results.length > 0 ? (results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(2) : 0,
    results: results,
    gradeDistribution: gradeStats
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../data/scoring-test-results.json'),
    JSON.stringify(testResults, null, 2)
  );
  
  console.log('💾 Resultados guardados en: data/scoring-test-results.json');
  
  return results;
}

// Ejecutar el test
if (require.main === module) {
  runScoringTest().catch(console.error);
}

module.exports = { runScoringTest, sampleJobs };
