/**
 * WebGL Context Loss Debug Logger
 * This script captures PIXI WebGL context loss events and sends them to the server
 */

(function() {
  'use strict';
  
  const LOG_ENDPOINT = '/api/debug/webgl';
  
  // Send log to server
  function sendLog(level, message, data) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      data: data,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function(e) {
      console.error('[DebugLogger] Failed to send log:', e);
    });
  }
  
  // Override WebGL context creation to detect context loss
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type) {
    const args = arguments[1];
    const context = originalGetContext.apply(this, arguments);
    
    if (type === 'webgl' || type === 'webgl2') {
      const canvas = this;
      
      sendLog('info', 'WebGL context created', {
        type: type,
        canvasId: canvas.id || 'unknown',
        canvasClass: canvas.className || 'unknown'
      });
      
      // Try to get WEBGL_lose_context extension
      const ext = context.getExtension('WEBGL_lose_context');
      if (ext) {
        sendLog('info', 'WEBGL_lose_context extension available', {});
        
        // Listen for context loss
        canvas.addEventListener('webglcontextlost', function(e) {
          e.preventDefault(); // Prevent default handling
          sendLog('warn', '⚠️ WebGL Context LOST!', {
            event: 'webglcontextlost',
            canvasId: canvas.id || 'unknown'
          });
        }, false);
        
        // Listen for context restoration
        canvas.addEventListener('webglcontextrestored', function(e) {
          sendLog('info', '✅ WebGL Context RESTORED', {
            event: 'webglcontextrestored',
            canvasId: canvas.id || 'unknown'
          });
        }, false);
        
        // Override loseContext to detect intentional losses
        const originalLoseContext = ext.loseContext.bind(ext);
        ext.loseContext = function() {
          sendLog('warn', '⚠️ loseContext() called', {});
          return originalLoseContext();
        };
        
        // Override restoreContext
        const originalRestoreContext = ext.restoreContext.bind(ext);
        ext.restoreContext = function() {
          sendLog('warn', '⚠️ restoreContext() called', {});
          return originalRestoreContext();
        };
      } else {
        sendLog('warn', 'WEBGL_lose_context extension NOT available', {});
      }
    }
    
    return context;
  };
  
  // Monitor PIXI if available
  if (typeof PIXI !== 'undefined') {
    sendLog('info', 'PIXI detected, version: ' + PIXI.VERSION, {});
    
    // Hook into PIXI's WebGL renderer if available
    const originalPIXIWebGLRenderer = PIXI.WebGLRenderer;
    if (originalPIXIWebGLRenderer) {
      PIXI.WebGLRenderer = function() {
        sendLog('info', 'PIXI.WebGLRenderer being created', {});
        const renderer = new originalPIXIWebGLRenderer.apply(this, arguments);
        
        // Hook into the context
        if (renderer.gl) {
          sendLog('info', 'PIXI.WebGLRenderer context obtained', {});
        }
        
        return renderer;
      };
    }
  } else {
    sendLog('info', 'PIXI not detected yet (may load later)', {});
  }
  
  // Send startup log
  sendLog('info', 'Debug logger initialized', {
    referrer: document.referrer,
    readyState: document.readyState
  });
  
  console.log('[DebugLogger] 🎀 WebGL Context Loss Debug Logger initialized');
  console.log('[DebugLogger] Logs are being sent to server automatically');
})();
