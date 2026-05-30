import { runAnalysis } from './src/lib/analyze';

// Create a map with our test bad code
const files = new Map<string, string>();

files.set('/test/TestBadComponent.tsx', `
import React, { useState, useEffect } from 'react';

// Simulate API service import (API-IN-COMPONENT)
const apiService = {
  fetchData: (id: any) => Promise.resolve({ data: { id, value: Math.random() * 100 } }),
  processData: (data: any) => Promise.resolve({ processed: data.value * 2 })
};

// Bad component with many violations
export const TestBadComponent: React.FC<{ 
  data: any; 
  items: any[]; 
  onUpdate: (value: any) => void;
}> = ({ data, items, onUpdate }) => {
  // STATE-EXPLOSION - too many useState hooks
  const [state, setState] = useState<any>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [processedData, setProcessedData] = useState<any>(null);
  const [tempValue, setTempValue] = useState('');
  
  // CONSOLE-LOG violations
  console.log('Component rendered with data:', data);
  console.error('This is an error log');
  console.warn('This is a warning');
  
  // EFFECT-NO-DEPS - missing dependencies
  useEffect(() => {
    // DEAD-STATE - variables declared but never used
    const unusedVariable = 'this is never used';
    const anotherUnused = Math.random();
    
    // API-IN-COMPONENT - calling API directly in component
    apiService.fetchData(data.id).then((response: any) => {
      setProcessedData(response.data);
      
      // MEMORY-LEAK potential - not cleaning up
      const interval = setInterval(() => {
        console.log('Interval running'); // CONSOLE-LOG
      }, 1000);
      
      // Missing cleanup - will cause memory leak
    }).catch((err: any) => {
      setError(err.message);
    });
    
    // Missing dependency array - should include [data] 
  }, []); // EFFECT-NO-DEPS violation
  
  // PROP-DRILLING violation - deeply nested props passing
  const handleItemClick = (item: any) => {
    // GENERIC-NAMING - vague function name
    const processItem = (i: any) => {
      // DUPLICATE-LOGIC - same logic as below
      if (i.value > 0) {
        return i.value * 2;
      }
      return 0;
    };
    
    // Pass props deeply through multiple levels
    onUpdate(item.id); // PROP-DRILLING
    
    // More dead state
    const anotherUnused = Math.random();
  };
  
  // Another duplicate logic block - DUPLICATE-LOGIC violation
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
  
  // Another ANY-TYPE violation with unsafe casting
  const handleChange = (e: any) => {
    const value = e.target.value; // UNSAFE-CAST
    setTempValue(value);
    
    // DEAD-STATE - calculated but never used
    const calculated = value.length * 2;
  };
  
  // Rendering with issues
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (error) {
    return <div className="error">Error: {error}</div>;
  }
  
  // More console logs in render - CONSOLE-LOG
  console.log('Rendering component with state:', state);
  
  return (
    <div>
      <h1>Test Bad Component</h1>
      {/* GENERIC-NAMING - non-descriptive variable names in JSX */}
      {items.map((item: any) => {
        // Dead state in map callback
        const mapIndex = items.indexOf(item);
        return (
          <div key={item.id}> // Potential runtime error if item.id doesn't exist
            <span>{item.name}</span> // UNSAFE-CAST if item.name doesn't exist
            <button onClick={() => handleItemClick(item)}>
              Click me
            </button>
          </div>
        );
      })}
      
      {/* Prop drilling - passing data down many levels */}
      <AnotherTestComponent 
        data={processedData} 
        onUpdate={handleItemClick} 
        items={filteredItems}
        tempValue={tempValue}
        onUpdate2={handleChange}
        unusedProp1="prop1"
        unusedProp2="prop2"
        unusedProp3="prop3"
        unusedProp4="prop4"
        unusedProp5="prop5"
      />
      
      {/* More dead state and unused variables */}
      {(() => {
        const unusedFunction = () => {
          return 'never called';
        };
        return null;
      })()}
    </div>
  );
};

// Another component that creates circular dependency concept
export const AnotherTestComponent: React.FC<{ 
  data: any; 
  onUpdate: (value: any) => void;
  items: any[];
  tempValue: string;
  onUpdate2: (e: any) => void;
  unusedProp1: string;
  unusedProp2: string;
  unusedProp3: string;
  unusedProp4: string;
  unusedProp5: string;
}> = ({ data, onUpdate, items, tempValue, onUpdate2, unusedProp1, unusedProp2, unusedProp3, unusedProp4, unusedProp5 }) => {
  const [localState, setLocalState] = useState<any>(null);
  
  useEffect(() => {
    if (data) {
      apiService.processData(data).then(result => {
        setLocalState(result);
      });
    }
  }, []); // Missing deps
  
  console.log('AnotherComponent rendered');
  console.error('Error in AnotherComponent');
  
  const [count, setCount] = useState(0);
  const [flag, setFlag] = useState(false);
  const [text, setText] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [obj, setObj] = useState<any>({});
  
  const handleClick = () => {
    onUpdate(Math.random());
    onUpdate2({ target: { value: 'test' } });
  };
  
  const processData = (input: any) => {
    if (input && input.value > 0) {
      return input.value * 2;
    }
    return 0;
  };
  
  return (
    <div>
      <h2>Another Test Component</h2>
      <p>Count: {count}</p>
      <button onClick={handleClick}>
        Update BadComponent
      </button>
      <TestBadComponent 
        data={localState} 
        items={items} 
        onUpdate={onUpdate2} 
      />
    </div>
  );
};
`);

console.log('Starting analysis of bad test code...');
console.log('Testing Refract analysis capabilities...\n');

runAnalysis(files, (filePath) => {
  console.log(`Processing file: ${filePath}`);
}).then((result) => {
  console.log('\n' + '='.repeat(50));
  console.log('ANALYSIS RESULTS');
  console.log('='.repeat(50));
  console.log(`Total issues found: ${result.summary.total}`);
  console.log(`High severity: ${result.summary.high}`);
  console.log(`Medium severity: ${result.summary.medium}`);
  console.log(`Low severity: ${result.summary.low}`);
  
  console.log('\nIssues by category:');
  const categories: Record<string, number> = {};
  for (const issue of result.issues) {
    categories[issue.category] = (categories[issue.category] || 0) + 1;
  }
  
  // Sort by count descending
  const sortedCategories = Object.entries(categories)
    .sort(([,a], [,b]) => b - a);
    
  for (const [category, count] of sortedCategories) {
    console.log(`  ${category}: ${count}`);
  }
  
  console.log('\nDetailed issues:');
  for (let i = 0; i < Math.min(20, result.issues.length); i++) {
    const issue = result.issues[i];
    console.log(`${i+1}. [${issue.category}] ${issue.problem}`);
    console.log(`   File: ${issue.filePath}`);
    console.log(`   Lines: ${issue.lineStart}-${issue.lineEnd}`);
    console.log(`   Impact: ${issue.impact}`);
    if (issue.effort) {
      console.log(`   Effort: ${issue.effort}`);
    }
    console.log('');
  }
  
  if (result.issues.length > 20) {
    console.log(`... and ${result.issues.length - 20} more issues`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(50));
}).catch((error) => {
  console.error('Analysis failed:', error);
  console.error(error.stack);
});