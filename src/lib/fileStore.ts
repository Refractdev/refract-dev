const DB_NAME = 'refract-files';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

/**
 * Opens or creates the IndexedDB "refract-files" with version 1
 * and object store "projects" using implicit keyPath.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error || new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Serializes the Map to an object and saves it in the IndexedDB under the projectId key.
 */
export async function saveProjectFiles(projectId: string, fileMap: Map<string, string>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const record: Record<string, string> = {};
    for (const [key, value] of fileMap.entries()) {
      record[key] = value;
    }

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record, projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to save project files'));
    });
  } catch (error) {
    console.error('[IndexedDB] saveProjectFiles failed:', error);
  }
}

/**
 * Reads from IndexedDB and reconstructs the Map. Returns null if it doesn't exist.
 */
const HARDCODED_FILES: Record<string, string> = {
  'package.json': `{
  "name": "refract-test-project",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "jsx": "react-jsx",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}`,
  'src/App.tsx': `import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dashboard } from './pages/Dashboard';

// Unused imports to trigger unusedImports:
import { Activity } from 'lucide-react';
import { getProject } from './non-existent';

interface AppProps {
  userId: string;
  userEmail: string;
  userRole: string;
  userConfig: string;
}

export const App: React.FC<AppProps> = ({ userId, userEmail, userRole, userConfig }) => {
  // 8 useStates to trigger stateExplosion:
  const [name, setName] = useState('');
  const [age, setAge] = useState(0);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [theme, setTheme] = useState('dark');

  return (
    <div>
      <Dashboard
        userId={userId}
        userEmail={userEmail}
        userRole={userRole}
        userConfig={userConfig}
      />
    </div>
  );
};`,
  'src/pages/Dashboard.tsx': `import React, { useState, useEffect } from 'react';
import { ProductCard } from '../components/ProductCard';

interface DashboardProps {
  userId: string;
  userEmail: string;
  userRole: string;
  userConfig: string;
}

export function formatCurrency(value: number, currency: string) {
  const parts = String(value).split('.');
  const replaced = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  return currency + ' ' + replaced + (parts[1] ? '.' + parts[1].substring(0, 2) : '');
}

export const Dashboard: React.FC<DashboardProps> = ({ userId, userEmail, userRole, userConfig }) => {
  // Use any in 6 places:
  const [data1, setData1] = useState<any>(null);
  const [data2, setData2] = useState<any>(null);
  const [data3, setData3] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  
  const processData = (val: any): any => {
    return val;
  };

  // 3 fetch calls in useEffect without cleanup:
  useEffect(() => {
    fetch('https://api.example.com/dashboard/stats')
      .then(res => res.json())
      .then(d => setData1(d));
  }, []);

  useEffect(() => {
    fetch('https://api.example.com/dashboard/recent')
      .then(res => res.json())
      .then(d => setData2(d));
  }, []);

  useEffect(() => {
    fetch('https://api.example.com/dashboard/alerts')
      .then(res => res.json())
      .then(d => setData3(d));
  }, []);

  // Extra logic to exceed 120 lines of logic:
  const a1 = 1; const a2 = 2; const a3 = 3; const a4 = 4; const a5 = 5;
  const b1 = 1; const b2 = 2; const b3 = 3; const b4 = 4; const b5 = 5;
  const c1 = 1; const c2 = 2; const c3 = 3; const c4 = 4; const c5 = 5;
  const d1 = 1; const d2 = 2; const d3 = 3; const d4 = 4; const d5 = 5;
  const e1 = 1; const e2 = 2; const e3 = 3; const e4 = 4; const e5 = 5;
  const f1 = 1; const f2 = 2; const f3 = 3; const f4 = 4; const f5 = 5;
  const g1 = 1; const g2 = 2; const g3 = 3; const g4 = 4; const g5 = 5;
  const h1 = 1; const h2 = 2; const h3 = 3; const h4 = 4; const h5 = 5;
  const i1 = 1; const i2 = 2; const i3 = 3; const i4 = 4; const i5 = 5;
  const j1 = 1; const j2 = 2; const j3 = 3; const j4 = 4; const j5 = 5;
  const k1 = 1; const k2 = 2; const k3 = 3; const k4 = 4; const k5 = 5;
  const l1 = 1; const l2 = 2; const l3 = 3; const l4 = 4; const l5 = 5;
  const m1 = 1; const m2 = 2; const m3 = 3; const m4 = 4; const m5 = 5;
  const n1 = 1; const n2 = 2; const n3 = 3; const n4 = 4; const n5 = 5;
  const o1 = 1; const o2 = 2; const o3 = 3; const o4 = 4; const o5 = 5;
  const p1 = 1; const p2 = 2; const p3 = 3; const p4 = 4; const p5 = 5;
  const q1 = 1; const q2 = 2; const q3 = 3; const q4 = 4; const q5 = 5;
  const r1 = 1; const r2 = 2; const r3 = 3; const r4 = 4; const r5 = 5;
  const s1 = 1; const s2 = 2; const s3 = 3; const s4 = 4; const s5 = 5;
  const t1 = 1; const t2 = 2; const t3 = 3; const t4 = 4; const t5 = 5;
  const u1 = 1; const u2 = 2; const u3 = 3; const u4 = 4; const u5 = 5;
  const v1 = 1; const v2 = 2; const v3 = 3; const v4 = 4; const v5 = 5;
  const w1 = 1; const w2 = 2; const w3 = 3; const w4 = 4; const w5 = 5;
  const x1 = 1; const x2 = 2; const x3 = 3; const x4 = 4; const x5 = 5;
  const y1 = 1; const y2 = 2; const y3 = 3; const y4 = 4; const y5 = 5;
  const z1 = 1; const z2 = 2; const z3 = 3; const z4 = 4; const z5 = 5;
  const aa1 = 1; const aa2 = 2; const aa3 = 3; const aa4 = 4; const aa5 = 5;
  const ab1 = 1; const ab2 = 2; const ab3 = 3; const ab4 = 4; const ab5 = 5;
  const ac1 = 1; const ac2 = 2; const ac3 = 3; const ac4 = 4; const ac5 = 5;
  const ad1 = 1; const ad2 = 2; const ad3 = 3; const ad4 = 4; const ad5 = 5;
  
  // Extra JSX to exceed 120 lines of JSX:
  return (
    <div className="dashboard-container" style={{ padding: 20 }}>
      <h1>Dashboard View</h1>
      <div>
        <p>UserId: {userId}</p>
        <p>Email: {userEmail}</p>
        <p>Role: {userRole}</p>
        <p>Config: {userConfig}</p>
      </div>
      <div>Item 1</div>
      <div>Item 2</div>
      <div>Item 3</div>
      <div>Item 4</div>
      <div>Item 5</div>
      <div>Item 6</div>
      <div>Item 7</div>
      <div>Item 8</div>
      <div>Item 9</div>
      <div>Item 10</div>
      <div>Item 11</div>
      <div>Item 12</div>
      <div>Item 13</div>
      <div>Item 14</div>
      <div>Item 15</div>
      <div>Item 16</div>
      <div>Item 17</div>
      <div>Item 18</div>
      <div>Item 19</div>
      <div>Item 20</div>
      <div>Item 21</div>
      <div>Item 22</div>
      <div>Item 23</div>
      <div>Item 24</div>
      <div>Item 25</div>
      <div>Item 26</div>
      <div>Item 27</div>
      <div>Item 28</div>
      <div>Item 29</div>
      <div>Item 30</div>
      <div>Item 31</div>
      <div>Item 32</div>
      <div>Item 33</div>
      <div>Item 34</div>
      <div>Item 35</div>
      <div>Item 36</div>
      <div>Item 37</div>
      <div>Item 38</div>
      <div>Item 39</div>
      <div>Item 40</div>
      <div>Item 41</div>
      <div>Item 42</div>
      <div>Item 43</div>
      <div>Item 44</div>
      <div>Item 45</div>
      <div>Item 46</div>
      <div>Item 47</div>
      <div>Item 48</div>
      <div>Item 49</div>
      <div>Item 50</div>
      <div>Item 51</div>
      <div>Item 52</div>
      <div>Item 53</div>
      <div>Item 54</div>
      <div>Item 55</div>
      <div>Item 56</div>
      <div>Item 57</div>
      <div>Item 58</div>
      <div>Item 59</div>
      <div>Item 60</div>
      <div>Item 61</div>
      <div>Item 62</div>
      <div>Item 63</div>
      <div>Item 64</div>
      <div>Item 65</div>
      <div>Item 66</div>
      <div>Item 67</div>
      <div>Item 68</div>
      <div>Item 69</div>
      <div>Item 70</div>
      <div>Item 71</div>
      <div>Item 72</div>
      <div>Item 73</div>
      <div>Item 74</div>
      <div>Item 75</div>
      <div>Item 76</div>
      <div>Item 77</div>
      <div>Item 78</div>
      <div>Item 79</div>
      <div>Item 80</div>
      <div>Item 81</div>
      <div>Item 82</div>
      <div>Item 83</div>
      <div>Item 84</div>
      <div>Item 85</div>
      <div>Item 86</div>
      <div>Item 87</div>
      <div>Item 88</div>
      <div>Item 89</div>
      <div>Item 90</div>
      <div>Item 91</div>
      <div>Item 92</div>
      <div>Item 93</div>
      <div>Item 94</div>
      <div>Item 95</div>
      <div>Item 96</div>
      <div>Item 97</div>
      <div>Item 98</div>
      <div>Item 99</div>
      <div>Item 100</div>
      <div>Item 101</div>
      <div>Item 102</div>
      <div>Item 103</div>
      <div>Item 104</div>
      <div>Item 105</div>
      <div>Item 106</div>
      <div>Item 107</div>
      <div>Item 108</div>
      <div>Item 109</div>
      <div>Item 110</div>
      <ProductCard
        username={userId}
        theme={userEmail}
        rating={userRole}
        price={userConfig}
      />
    </div>
  );
};`,
  'src/pages/Checkout.tsx': `import React, { useState, useEffect } from 'react';

export function formatCurrency(value: number, currency: string) {
  const parts = String(value).split('.');
  const replaced = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  return currency + ' ' + replaced + (parts[1] ? '.' + parts[1].substring(0, 2) : '');
}

export const Checkout: React.FC = () => {
  // Dead state (variable declared as useState but never used):
  const [deadState, setDeadState] = useState('initial');

  // fetch and type any:
  const [apiData, setApiData] = useState<any>(null);

  // useEffect without dependency array:
  useEffect(() => {
    fetch('https://api.example.com/checkout/config')
      .then(res => res.json())
      .then((data: any) => setApiData(data));
  }); // missing dependency array

  return (
    <div>
      <h1>Checkout</h1>
      {apiData && <div>{JSON.stringify(apiData)}</div>}
    </div>
  );
};`,
  'src/components/ProductCard.tsx': `import React from 'react';

export function formatCurrency(value: number, currency: string) {
  const parts = String(value).split('.');
  const replaced = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  return currency + ' ' + replaced + (parts[1] ? '.' + parts[1].substring(0, 2) : '');
}

interface ProductCardProps {
  username: string;
  theme: string;
  rating: string;
  price: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({ username, theme, rating, price }) => {
  return (
    <div style={{ border: '1px solid #ccc', padding: 10 }}>
      <h3>Product Card</h3>
      <SubCard username={username} theme={theme} rating={rating} price={price} />
    </div>
  );
};

const SubCard: React.FC<ProductCardProps> = ({ username, theme, rating, price }) => {
  return (
    <div>
      <p>User: {username}</p>
      <p>Theme: {theme}</p>
      <p>Rating: {rating}</p>
      <p>Price: {price}</p>
    </div>
  );
};`,
  'src/utils/helpers.ts': `// exported helper but never imported anywhere
export function unusedHelper(input: any): any {
  return input;
}

// duplicate logic formatCurrency
export function formatCurrency(value: number, currency: string) {
  const parts = String(value).split('.');
  const replaced = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
  return currency + ' ' + replaced + (parts[1] ? '.' + parts[1].substring(0, 2) : '');
}`,
};

export async function loadProjectFiles(projectId: string): Promise<Map<string, string> | null> {
  if (projectId === 'refract-test-project-id') {
    return new Map<string, string>(Object.entries(HARDCODED_FILES));
  }
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const record = await new Promise<Record<string, string> | undefined>((resolve, reject) => {
      const request = store.get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to load project files'));
    });

    if (!record) {
      return null;
    }

    return new Map<string, string>(Object.entries(record));
  } catch (error) {
    console.error('[IndexedDB] loadProjectFiles failed:', error);
    return null;
  }
}

/**
 * Removes the entry from IndexedDB when the project is deleted.
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to delete project files'));
    });
  } catch (error) {
    console.error('[IndexedDB] deleteProjectFiles failed:', error);
  }
}

/**
 * Clears all project files — for debug/reset.
 */
export async function clearAllProjectFiles(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to clear database'));
    });
  } catch (error) {
    console.error('[IndexedDB] clearAllProjectFiles failed:', error);
  }
}
