export function parseActionJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [text, fenced?.[1]].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }
  return null;
}

export function normalizeActions(payload) {
  const actions = Array.isArray(payload?.actions) ? payload.actions : [];
  return actions
    .filter((action) => action && typeof action === 'object')
    .map((action, index) => ({
      id: action.id || `act_${Date.now()}_${index}`,
      type: action.type || 'call',
      tool: action.tool || action.name || '',
      args: action.args || action.params || {},
      then: action.then || action.next || '',
    }));
}

export async function dispatchActions({ actions = [], pluginHost, onResult }) {
  const results = [];
  for (const action of actions) {
    if (action.type !== 'call') continue;
    const result = await pluginHost.callTool(action);
    results.push({ id: action.id, tool: action.tool, result });
    if (typeof onResult === 'function') {
      await onResult(action, result);
    }
  }
  return results;
}
