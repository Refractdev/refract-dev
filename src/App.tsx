import React from 'react';
import { AppShell } from './pages/AppShell';
import { FilesProvider } from './context/FilesContext';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';

/**
 * Root App component.
 * Wraps with AuthProvider, ThemeProvider, and FilesProvider.
 * App opens directly into the main shell (or auth page if not authenticated).
 */
export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <FilesProvider>
          <AppShell />
        </FilesProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};
