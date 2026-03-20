const DEFAULT_PLUGIN_DIR = '/plugins';

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createPluginHost({ chat, desktopShell, ui, live2d, storage }) {
  const pluginRegistry = new Map();
  const capabilityRegistry = new Map();

  function registerManifest(manifest, module) {
    if (!manifest || !manifest.id) return;
    const plugin = {
      id: String(manifest.id),
      name: manifest.name || manifest.id,
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      permissions: ensureArray(manifest.permissions),
      capabilities: ensureArray(manifest.capabilities),
      module,
    };
    pluginRegistry.set(plugin.id, plugin);
    for (const cap of plugin.capabilities) {
      if (!cap?.name || !cap.entry) continue;
      capabilityRegistry.set(String(cap.name), { ...cap, pluginId: plugin.id });
    }
  }

  async function loadPluginFromDir(id) {
    const base = `${DEFAULT_PLUGIN_DIR}/${id}`;
    const manifestUrl = `${base}/manifest.json`;
    const manifestResp = await fetch(manifestUrl);
    if (!manifestResp.ok) throw new Error(`plugin manifest not found: ${id}`);
    const manifest = await manifestResp.json();
    const module = await import(`${base}/index.js`);
    registerManifest(manifest, module);
    return manifest;
  }

  async function loadBuiltins() {
    await loadPluginFromDir('builtin.screenshot');
    await loadPluginFromDir('builtin.echo');
  }

  function getToolCatalog() {
    const tools = [];
    for (const cap of capabilityRegistry.values()) {
      tools.push({
        name: cap.name,
        description: cap.description || '',
        argsSchema: cap.argsSchema || {},
        resultSchema: cap.resultSchema || {},
        permissions: cap.permissions || [],
      });
    }
    return tools;
  }

  function getToolCatalogDigest() {
    const tools = getToolCatalog().map((t) => `${t.name}:${(t.description || '').slice(0, 24)}`);
    return tools.sort().join('|');
  }

  async function callTool(action) {
    if (!action || action.type !== 'call') {
      return { ok: false, error: 'invalid_action' };
    }
    const toolName = String(action.tool || '').trim();
    const cap = capabilityRegistry.get(toolName);
    if (!cap) return { ok: false, error: 'tool_not_found' };

    const plugin = pluginRegistry.get(cap.pluginId);
    if (!plugin) return { ok: false, error: 'plugin_not_found' };

    const [modulePath, exportName] = String(cap.entry || '').split('#');
    const handler = plugin.module?.[exportName || 'default'];
    if (typeof handler !== 'function') {
      return { ok: false, error: 'handler_not_found' };
    }

    const ctx = {
      api,
      actionId: action.id || '',
    };

    const args = deepClone(action.args || {});
    return handler(args, ctx);
  }

  const api = {
    chat,
    desktop: desktopShell,
    media: {
      playMusic: () => Promise.resolve(),
      stopMusic: () => Promise.resolve(),
    },
    storage: storage || {
      get: () => null,
      set: () => {},
    },
    ui: {
      toast: (msg) => ui?.setStatus?.(msg),
      log: (msg) => console.info('[plugin]', msg),
    },
    live2d: {
      triggerExpression: live2d?.triggerExpression,
      triggerMotion: live2d?.triggerMotion,
    },
    utils: {
      dataUrlToAttachment: (dataUrl) => ({ type: 'base64', data: String(dataUrl || '').split(',')[1] || '', mediaType: String(dataUrl || '').split(';')[0]?.replace('data:', '') || 'image/png', preview: dataUrl }),
    },
  };

  return {
    loadBuiltins,
    getToolCatalog,
    getToolCatalogDigest,
    callTool,
    api,
  };
}

export function stringifyToolCatalog(tools = []) {
  const items = ensureArray(tools).map((tool) => {
    const args = safeJsonParse(JSON.stringify(tool.argsSchema || {}), {});
    return {
      name: tool.name,
      description: tool.description || '',
      argsSchema: args,
    };
  });
  return JSON.stringify({ tools: items });
}
