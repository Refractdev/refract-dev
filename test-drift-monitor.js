// Test to verify drift monitor functionality
const fs = require('fs');
const path = require('path');

console.log('Testing Drift Monitor functionality...');
console.log('='.repeat(50));

try {
  // Try to import the drift module
  const driftModule = require('./src/lib/drift');
  
  console.log('✓ Drift module imported successfully');
  
  // Check if key functions exist
  if (typeof driftModule.analyzeDrift === 'function') {
    console.log('✓ analyzeDrift function exists');
  } else {
    console.log('✗ analyzeDrift function missing');
  }
  
  if (typeof driftModule.fetchDriftReport === 'function') {
    console.log('✓ fetchDriftReport function exists');
  } else {
    console.log('✗ fetchDriftReport function missing');
  }
  
  // Check the DriftReport interface
  if (driftModule.DriftReport) {
    console.log('✓ DriftReport interface defined');
    
    // Check key properties
    const requiredProps = ['projectId', 'totalSnapshots', 'currentScore', 'trends', 'alerts'];
    const missingProps = requiredProps.filter(prop => !(prop in driftModule.DriftReport.prototype));
    
    if (missingProps.length === 0) {
      console.log('✓ DriftReport has all required properties');
    } else {
      console.log('✗ DriftReport missing properties:', missingProps);
    }
  } else {
    console.log('✗ DriftReport interface not found');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('DRIFT MONITOR COMPONENTS CHECK');
  console.log('='.repeat(50));
  
  // Check if drift components exist
  const componentsPath = './src/components/';
  const driftComponents = [
    'HealthTrendChart.tsx',
    'CategoryTrendChart.tsx', 
    'DriftAlertsPanel.tsx'
  ];
  
  let componentsFound = 0;
  for (const component of driftComponents) {
    try {
      fs.accessSync(componentsPath + component, fs.constants.F_OK);
      console.log(`✓ ${component} exists`);
      componentsFound++;
    } catch (err) {
      console.log(`✗ ${component} missing`);
    }
  }
  
  console.log(`\nDrift components: ${componentsFound}/${driftComponents.length} found`);
  
  // Check ProjectsPage for drift monitor integration
  const projectsPagePath = './src/pages/ProjectsPage.tsx';
  try {
    const projectsPageContent = fs.readFileSync(projectsPagePath, 'utf8');
    
    const hasHealthTrendChart = projectsPageContent.includes('HealthTrendChart');
    const hasDriftAlertsPanel = projectsPageContent.includes('DriftAlertsPanel');
    const hasFetchDriftReport = projectsPageContent.includes('fetchDriftReport');
    const hasDriftReportState = projectsPageContent.includes('driftReport');
    const hasDriftLoadingState = projectsPageContent.includes('driftLoading');
    const hasMonitorPanel = projectsPageContent.includes('MonitorPanel');
    
    console.log('\nProjectsPage drift integration:');
    console.log(`  ✓ HealthTrendChart imported: ${hasHealthTrendChart}`);
    console.log(`  ✓ DriftAlertsPanel imported: ${hasDriftAlertsPanel}`);
    console.log(`  ✓ fetchDriftReport imported: ${hasFetchDriftReport}`);
    console.log(`  ✓ driftReport state: ${hasDriftReportState}`);
    console.log(`  ✓ driftLoading state: ${hasDriftLoadingState}`);
    console.log(`  ✓ MonitorPanel component: ${hasMonitorPanel}`);
    
    const integrationScore = [hasHealthTrendChart, hasDriftAlertsPanel, hasFetchDriftReport, 
                             hasDriftReportState, hasDriftLoadingState, hasMonitorPanel]
                              .filter(Boolean).length;
                              
    console.log(`\nIntegration score: ${integrationScore}/6`);
    
    if (integrationScore >= 5) {
      console.log('✓ Drift monitor appears to be well integrated');
    } else if (integrationScore >= 3) {
      console.log('⚠ Drift monitor partially integrated');
    } else {
      console.log('✗ Drift monitor integration incomplete');
    }
    
  } catch (err) {
    console.log('✗ Could not read ProjectsPage.tsx:', err.message);
  }
  
} catch (err) {
  console.log('✗ Failed to import drift module:', err.message);
  
  // Fallback: check if the files exist
  console.log('\n=== FALLBACK: FILE EXISTENCE CHECK ===');
  
  const filesToCheck = [
    './src/lib/drift.ts',
    './src/lib/api.ts',
    './src/components/HealthTrendChart.tsx',
    './src/components/CategoryTrendChart.tsx',
    './src/components/DriftAlertsPanel.tsx',
    './src/pages/ProjectsPage.tsx'
  ];
  
  let filesFound = 0;
  for (const file of filesToCheck) {
    try {
      fs.accessSync(file, fs.constants.F_OK);
      console.log(`✓ ${file} exists`);
      filesFound++;
    } catch (fileErr) {
      console.log(`✗ ${file} missing`);
    }
  }
  
  console.log(`\nDrift-related files: ${filesFound}/${filesToCheck.length} found`);
  
  // Check key content in existing files
  if (fs.existsSync('./src/lib/drift.ts')) {
    const driftContent = fs.readFileSync('./src/lib/drift.ts', 'utf8');
    console.log('\nDrift.ts content check:');
    console.log(`  ✓ analyzeDrift function: ${driftContent.includes('export function analyzeDrift')}`);
    console.log(`  ✓ DriftReport interface: ${driftContent.includes('export interface DriftReport')}`);
    console.log(`  ✓ fetchDriftReport function: ${driftContent.includes('export async function fetchDriftReport')}`);
  }
  
  if (fs.existsSync('./src/lib/api.ts')) {
    const apiContent = fs.readFileSync('./src/lib/api.ts', 'utf8');
    console.log('\nAPI.ts content check:');
    console.log(`  ✓ fetchDriftReport function: ${apiContent.includes('export async function fetchDriftReport')}`);
    console.log(`  ✓ DriftReport type import: ${apiContent.includes('type DriftReport')}`);
  }
  
  if (fs.existsSync('./src/pages/ProjectsPage.tsx')) {
    const projectsContent = fs.readFileSync('./src/pages/ProjectsPage.tsx', 'utf8');
    console.log('\nProjectsPage.tsx content check:');
    console.log(`  ✓ HealthTrendChart import: ${projectsContent.includes('HealthTrendChart')}`);
    console.log(`  ✓ CategoryTrendChart import: ${projectsContent.includes('CategoryTrendChart')}`);
    console.log(`  ✓ DriftAlertsPanel import: ${projectsContent.includes('DriftAlertsPanel')}`);
    console.log(`  ✓ fetchDriftReport import: ${projectsContent.includes('fetchDriftReport')}`);
    console.log(`  ✓ driftReport state: ${projectsContent.includes('driftReport')}`);
    console.log(`  ✓ driftLoading state: ${projectsContent.includes('driftLoading')}`);
    console.log(`  ✓ MonitorPanel usage: ${projectsContent.includes('<MonitorPanel')}`);
  }
}

console.log('\n' + '='.repeat(50));
console.log('DRIFT MONITOR TEST COMPLETE');
console.log('='.repeat(50));