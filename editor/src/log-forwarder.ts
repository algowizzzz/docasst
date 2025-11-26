// Browser log forwarding - enabled for all environments
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function sendToServer(level: string, args: any[]) {
  try {
    // Only send logs that contain our debug markers or errors
    const logString = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return '[Object]';
        }
      }
      return String(arg);
    }).join(' ');
    
    // Filter: only send logs with our markers or errors/warnings
    const shouldSend = 
      level === 'error' || 
      level === 'warn' ||
      logString.includes('[Template]') ||
      logString.includes('[WorkspacePage]') ||
      logString.includes('[Editor]') ||
      logString.includes('✅') ||
      logString.includes('❌') ||
      logString.includes('ERROR') ||
      logString.includes('WARN');
    
    if (!shouldSend) {
      return; // Skip non-debug logs to reduce noise
    }
    
    fetch('/__logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        level,
        args: args.map(arg => {
          // Serialize objects safely
          if (typeof arg === 'object' && arg !== null) {
            try {
              return JSON.parse(JSON.stringify(arg, (key, value) => {
                // Handle circular references and functions
                if (typeof value === 'function') return '[Function]';
                if (value instanceof Error) return value.toString();
                return value;
              }));
            } catch {
              return String(arg);
            }
          }
          return arg;
        }),
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => {
      // Silently fail - don't log errors about logging
      // originalError('[Log forwarder] Failed to send log:', err);
    });
  } catch (err) {
    // Silently fail
  }
}

console.log = (...args: any[]) => {
  originalLog(...args);
  sendToServer('log', args);
};

console.warn = (...args: any[]) => {
  originalWarn(...args);
  sendToServer('warn', args);
};

console.error = (...args: any[]) => {
  originalError(...args);
  sendToServer('error', args);
};

