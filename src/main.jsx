import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './components/ui';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Without Firebase config the app runs in preview mode on sample data. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
            <App />
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  fontSize: 14, borderRadius: 12, padding: '10px 14px', color: '#0f172a',
                  boxShadow: '0 12px 32px -12px rgba(16,24,40,.25), 0 0 0 1px rgba(15,23,42,.06)',
                },
              }}
            />
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>,
);
