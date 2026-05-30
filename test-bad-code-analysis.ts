import { runAnalysis } from './src/lib/analyze';
import { readFileSync } from 'fs';

// Create a map of bad code files for testing
const files = new Map<string, string>();

// Add the bad component
files.set('/tmp/test/BadComponent.tsx', `
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

export const BadComponent: React.FC<{ 
  data: any; 
  items: any[]; 
  onUpdate: (value: any) => void;
}> = ({ data, items, onUpdate }) => {
  const [state, setState] = useState<any>(null);
  const [count, setCount] = useState(0);
  
  console.log('Component rendered');
  console.error('Error log');
  
  useEffect(() => {
    const unusedVariable = 'never used';
    apiService.fetchData(data.id).then((response: any) => {
      setProcessedData(response.data);
      const interval = setInterval(() => {
        console.log('Interval running');
      }, 1000);
    }).catch((err: any) => {
      setError(err.message);
    });
  }, []); // Missing deps
  
  const handleItemClick = (item: any) => {
    const processItem = (i: any) => {
      if (i.value > 0) {
        return i.value * 2;
      }
      return 0;
    };
    onUpdate(item.id);
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
    const calculated = value.length * 2; // Dead state
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
        const mapIndex = items.indexOf(item); // Dead state
        return (
          <div key={item.id}>
            <span>{item.name}</span>
            <button onClick={() => handleItemClick(item)}>
              Click me
            </button>
          </div>
        );
      })}
      
      <AnotherComponent 
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
    </div>
  );
};

// Circular dependency - AnotherComponent imports BadComponent above
export const AnotherComponent: React.FC<{ 
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
      <h2>Another Component</h2>
      <p>Count: {count}</p>
      <button onClick={handleClick}>
        Update BadComponent
      </button>
      <BadComponent 
        data={localState} 
        items={items} 
        onUpdate={onUpdate2} 
      />
    </div>
  );
};
`);

// Add the utils file
files.set('/tmp/test/utils/helpers.ts', `
export const processData = (data: any): any => {
  const unused = Math.random();
  if (!data) {
    return null;
  }
  const temp = data.toString();
  const result = parseInt(data.value, 10) * 2;
  return result;
};

export const helperFunction = (input: any): any => {
  setTimeout(() => {
    console.log('Helper function timeout');
    const unusedTimeoutVar = 'not used';
  }, 1000);
  
  if (input && input.value > 0) {
    return input.value * 2;
  }
  return 0;
};

export const utilsFunction = (param1: any, param2: any, param3: any): any => {
  let a, b, c, d, e, f, g, h, i, j;
  const intermediate = processData(param1);
  const result = helperFunction(param2);
  const calculated = a + b + c + d + e + f + g + h + i + j;
  return utilsFunction(result, param3, intermediate);
};

export const helpers = {
  processData,
  helperFunction,
  utilsFunction
};

if (false) {
  console.log('This will never run');
}
`);

// Add the api service
files.set('/tmp/test/services/apiService.ts', `
import { BadComponent } from '../components/BadComponent';
import { AnotherComponent } from '../components/AnotherComponent';
import { helpers } from '../utils/helpers';

export const apiService = {
  fetchData: (id: any): Promise<any> => {
    const unused = Date.now();
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const tempVar = 'not used';
        if (Math.random() > 0.5) {
          resolve({ 
            data: { 
              id, 
              value: Math.floor(Math.random() * 100) 
            } 
          });
        } else {
          reject(new Error('API call failed'));
        }
      }, 100);
    });
  },
  
  processData: (data: any): Promise<any> => {
    const unusedCalculation = data?.length ?? 0;
    return new Promise((resolve) => {
      setTimeout(() => {
        const processed = helpers.processData(data);
        resolve({ processed });
      }, 50);
    });
  },
  
  getData: (params: any): any => {
    let a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p;
    if (params && params.value > 0) {
      return params.value * 2;
    }
    return null;
  }
};

export { BadComponent, AnotherComponent };
console.log('API service loaded');
`);

console.log(\`Analyzing \${files.size} files...\`);

runAnalysis(files, (filePath) => {
  console.log(\`Processing: \${filePath}\`);
}).then((result) => {
  console.log('\n=== ANALYSIS RESULTS ===');
  console.log(\`Total issues found: \${result.summary.total}\`);
  console.log(\`High: \${result.summary.high}, Medium: \${result.summary.medium}, Low: \${result.summary.low}\`);
  
  console.log('\n=== ISSUES BY CATEGORY ===');
  const categories: Record<string, number> = {};
  for (const issue of result.issues) {
    categories[issue.category] = (categories[issue.category] || 0) + 1;
  }
  
  for (const [category, count] of Object.entries(categories).sort(([,a], [,b]) => b - a)) {
    console.log(\`\${category}: \${count}\`);
  }
  
  console.log('\n=== SAMPLE ISSUES (first 15) ===');
  for (let i = 0; i < Math.min(15, result.issues.length); i++) {
    const issue = result.issues[i];
    console.log(\`\${i+1}. [\${issue.category}] \${issue.problem}\`);
    console.log(\`   File: \${issue.filePath}\`);
    console.log(\`   Lines: \${issue.lineStart}-\${issue.lineEnd}\`);
    console.log(\`   Impact: \${issue.impact}\`);
    if (issue.patch) {
      console.log(\`   Patch: \${issue.patch.before.slice(0, 50)}... → \${issue.patch.after.slice(0, 50)}...\`);
    }
    console.log('');
  }
}).catch((error) => {
  console.error('Analysis failed:', error);
});