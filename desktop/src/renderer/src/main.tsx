import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LAppAdapter } from '../WebSDK/src/lappadapter';
import { ensureBootOverlay, hideBootOverlay } from './boot-overlay-utils';
import i18n from './i18n';

function formatFatalError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.stack || error.message || fallback;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('onnxruntime')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

// Suppress specific console.error messages from @chatscope/chat-ui-kit-react
const originalConsoleError = console.error;
const errorMessagesToIgnore = ["Warning: Failed"];
console.error = (...args: any[]) => {
  if (typeof args[0] === 'string') {
    const shouldIgnore = errorMessagesToIgnore.some(msg => args[0].startsWith(msg));
    if (shouldIgnore) {
      return; // Suppress the warning
    }
  }
  // Call the original console.error for other messages
  originalConsoleError.apply(console, args);
};

if (typeof window !== 'undefined') {
  (window as any).getLAppAdapter = () => LAppAdapter.getInstance();

  window.addEventListener('error', (event) => {
      const detail = formatFatalError(
        event.error || event.message,
        i18n.t('boot.rendererErrorFallback'),
      );
      ensureBootOverlay(document, {
        status: 'error',
        message: i18n.t('boot.rendererCrashed', { detail }),
      });
    });

  window.addEventListener('unhandledrejection', (event) => {
      const detail = formatFatalError(
        event.reason,
        i18n.t('boot.rendererPromiseFallback'),
      );
      ensureBootOverlay(document, {
        status: 'error',
        message: i18n.t('boot.rendererCrashed', { detail }),
      });
    });

  // Dynamically load the Live2D Core script
  const loadLive2DCore = () => {
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './libs/live2dcubismcore.js'; // Path to the copied script
      script.onload = () => {
        console.log('Live2D Cubism Core loaded successfully.');
        resolve();
      };
      script.onerror = (error) => {
        console.error('Failed to load Live2D Cubism Core:', error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  };

  // Load the script and then render the app
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.background = '#020617';
  ensureBootOverlay(document, {
    status: 'loading',
    message: i18n.t('boot.loading'),
  });

  loadLive2DCore()
    .then(() => {
      createRoot(document.getElementById('root')!).render(
        <App />,
      );
      requestAnimationFrame(() => {
        hideBootOverlay(document);
      });
    })
    .catch((error) => {
      console.error('Application failed to start due to script loading error:', error);
      ensureBootOverlay(document, {
        status: 'error',
        message: i18n.t('boot.live2dLoadFailed'),
      });
    });
}
