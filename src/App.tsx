import React from 'react';
import { AppShell } from './pages/AppShell';
import { FilesProvider } from './context/FilesContext';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';
import { ToastProvider } from './components/Toast';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <FilesProvider>
            <AppShell />
          </FilesProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};
