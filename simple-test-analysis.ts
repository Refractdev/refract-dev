import { runAnalysis } from './src/lib/analyze';

// Simple test with clearly bad code
const files = new Map<string, string>();

files.set('/test/BadComponent.tsx', `
import React, { useState, useEffect } from 'react';

export const BadComponent: React.FC<{ 
  data: any; 
  items: any[]; 
}> = ({ data, items }) => {
  const [state, setState] = useState<any>(null);
  const [count, setCount] = useState(0);
  
  console.log('Component rendered');
  console.error('Error log');
  
  useEffect(() => {
    const unusedVariable = 'never used';
    // Missing dependency array
  }, []); 
  
  const handleItemClick = (item: any) => {
    const processItem = (i: any) => {
      if (i.value > 0) {
        return i.value * 2;
      }
      return 0;
    };
  };
  
  const processItems = (inputItems: any[]) => {
    const result = [];
    for (let i = 0; i < inputItems.length; i++) {
      const item = inputItems[i];
      if (item.value > 0) {
        result.push(item.value * 2);
      } else {
        result.push(0);
      }
    }
    return result;
  };
  
  const handleChange = (e: any) => {
    const value = e.target.value;
    setTempValue(value);
    const calculated = value.length * 2;
  };
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (error) {
    return <div className="error">Error: {error}</div>;
  }
  
  console.log('Rendering with state:', state);
  
  return (
    <div>
      <h1>Bad Component</h1>
      {items.map((item: any) => {
        const mapIndex = items.indexOf(item);
        return (
          <div key={item.id}>
            <span>{item.name}</span>
            <button onClick={() => handleItemClick(item)}>
              Click me
            </button>
          </div>
        );
      })}
    </div>
  );
};
`);

console.log('Analyzing test files...');

runAnalysis(files, (filePath) => {
  console.log('Processing:', filePath);
}).then((result) => {
  console.log('\n=== ANALYSIS RESULTS ===');
  console.log('Total issues found:', result.summary.total);
  console.log('High:', result.summary.high, 'Medium:', result.summary.medium, 'Low:', result.summary.low);
  
  console.log('\n=== ISSUES BY CATEGORY ===');
  const categories: Record<string, number> = {};
  for (const issue of result.issues) {
    categories[issue.category] = (categories[issue.category] || 0) + 1;
  }
  
  for (const [category, count] of Object.entries(categories).sort(([,a], [,b]) => b - a)) {
    console.log(`${category}: ${count}`);
  }
  
  console.log('\n=== ALL ISSUES ===');
  for (let i = 0; i < result.issues.length; i++) {
    const issue = result.issues[i];
    console.log(`${i+1}. [${issue.category}] ${issue.problem}`);
    console.log(`   File: ${issue.filePath}`);
    console.log(`   Lines: ${issue.lineStart}-${issue.lineEnd}`);
    console.log(`   Impact: ${issue.impact}`);
    console.log('');
  }
}).catch((error) => {
  console.error('Analysis failed:', error);
});