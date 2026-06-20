import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { saveProjectFiles, loadProjectFiles } from '../lib/fileStore';

export interface FilesContextValue {
  fileMap: Map<string, string>;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  setFileMap: (map: Map<string, string>) => void;
  clearFileMap: () => void;
  loadFilesForProject: (projectId: string) => Promise<void>;
  hydrateProjectFiles: (projectId: string, map: Map<string, string>) => Promise<void>;
}

const FilesContext = createContext<FilesContextValue | null>(null);

export const FilesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fileMap, setFileMapState] = useState<Map<string, string>>(new Map());
  const [projectId, setProjectIdState] = useState<string | null>(null);

  const projectIdRef = useRef<string | null>(null);
  const fileMapRef = useRef<Map<string, string>>(new Map());
  const fileMapProjectIdRef = useRef<string | null>(null);

  const applyFileMap = useCallback((map: Map<string, string>, ownerId: string | null) => {
    const next = new Map(map);
    fileMapRef.current = next;
    fileMapProjectIdRef.current = ownerId;
    setFileMapState(next);
  }, []);

  const setProjectId = useCallback((id: string | null) => {
    projectIdRef.current = id;
    setProjectIdState(id);
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ projectId: string; map: Map<string, string> } | null>(null)

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingSaveRef.current
    if (!pending) return
    pendingSaveRef.current = null
    await saveProjectFiles(pending.projectId, pending.map)
  }, [])

  const scheduleSave = useCallback((projectId: string, map: Map<string, string>) => {
    pendingSaveRef.current = { projectId, map }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const pending = pendingSaveRef.current
      if (!pending) return
      pendingSaveRef.current = null
      void saveProjectFiles(pending.projectId, pending.map).catch((err) => {
        console.error('[FilesContext] setFileMap save failed:', err)
      })
    }, 500)
  }, [])

  const setFileMap = useCallback((map: Map<string, string>) => {
    const activeId = projectIdRef.current
    applyFileMap(map, activeId)
    if (activeId) scheduleSave(activeId, map)
  }, [applyFileMap, scheduleSave])

  const clearFileMap = useCallback(() => {
    applyFileMap(new Map(), projectIdRef.current);
  }, [applyFileMap]);

  const hydrateProjectFiles = useCallback(async (projId: string, map: Map<string, string>) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingSaveRef.current = null
    projectIdRef.current = projId
    setProjectIdState(projId)
    applyFileMap(map, projId)
    await saveProjectFiles(projId, map)
  }, [applyFileMap])

  const loadFilesForProject = useCallback(async (projId: string) => {
    projectIdRef.current = projId;
    setProjectIdState(projId);
    try {
      const loaded = await loadProjectFiles(projId);
      if (loaded && loaded.size > 0) {
        applyFileMap(loaded, projId);
        return;
      }

      if (fileMapProjectIdRef.current === projId && fileMapRef.current.size > 0) {
        return;
      }

      applyFileMap(new Map(), projId);
    } catch (err) {
      console.error('loadFilesForProject failed:', err);
      if (fileMapProjectIdRef.current === projId && fileMapRef.current.size > 0) {
        return;
      }
      applyFileMap(new Map(), projId);
    }
  }, [applyFileMap]);

  return (
    <FilesContext.Provider value={{
      fileMap,
      projectId,
      setProjectId,
      setFileMap,
      clearFileMap,
      loadFilesForProject,
      hydrateProjectFiles,
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
