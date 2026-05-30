import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { saveProjectFiles, loadProjectFiles } from '../lib/fileStore';

export interface FilesContextValue {
  fileMap: Map<string, string>;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  setFileMap: (map: Map<string, string>) => void;
  clearFileMap: () => void;
  loadFilesForProject: (projectId: string) => Promise<void>;
}

const FilesContext = createContext<FilesContextValue | null>(null);

export const FilesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fileMap, setFileMapState] = useState<Map<string, string>>(new Map());
  const [projectId, setProjectIdState] = useState<string | null>(null);
  
  // Use a ref to store projectId synchronously to avoid stale closures in event handlers
  const projectIdRef = useRef<string | null>(null);

  const setProjectId = useCallback((id: string | null) => {
    projectIdRef.current = id;
    setProjectIdState(id);
  }, []);

  const setFileMap = useCallback((map: Map<string, string>) => {
    setFileMapState(new Map(map));
    const activeId = projectIdRef.current;
    if (activeId) {
      saveProjectFiles(activeId, map);
    }
  }, []);

  const clearFileMap = useCallback(() => {
    setFileMapState(new Map());
  }, []);

  const loadFilesForProject = useCallback(async (projId: string) => {
    projectIdRef.current = projId;
    setProjectIdState(projId);
    try {
      const loaded = await loadProjectFiles(projId);
      if (loaded) {
        setFileMapState(loaded);
      } else {
        setFileMapState(new Map());
      }
    } catch (err) {
      console.error('loadFilesForProject failed:', err);
      setFileMapState(new Map());
    }
  }, []);

  return (
    <FilesContext.Provider value={{
      fileMap,
      projectId,
      setProjectId,
      setFileMap,
      clearFileMap,
      loadFilesForProject
    }}>
      {children}
    </FilesContext.Provider>
  );
};

export function useFiles(): FilesContextValue {
  const ctx = useContext(FilesContext);
  if (!ctx) throw new Error('useFiles must be used within FilesProvider');
  return ctx;
}

