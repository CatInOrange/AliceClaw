export function rememberConversationEntry(state, role, text) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return;
  if (!['user', 'assistant'].includes(normalizedRole)) return;
  state.recentConversationEntries.push({ role: normalizedRole, text: normalizedText });
  if (state.recentConversationEntries.length > 24) {
    state.recentConversationEntries = state.recentConversationEntries.slice(-24);
  }
}

export function getRecentConversationContext(state, { limit = 6, maxChars = 900 } = {}) {
  const items = state.recentConversationEntries
    .filter((entry) => entry && entry.text)
    .slice(-Math.max(1, Number(limit) || 6));
  if (!items.length) return '';
  const lines = [];
  let used = 0;
  for (const entry of items) {
    const speaker = entry.role === 'user' ? '用户' : '桌宠';
    const compact = entry.text.replace(/\s+/g, ' ').trim();
    const remaining = Math.max(0, maxChars - used);
    if (!remaining) break;
    const clipped = compact.length > remaining ? `${compact.slice(0, Math.max(0, remaining - 1))}…` : compact;
    const line = `${speaker}: ${clipped}`;
    lines.push(line);
    used += line.length + 1;
    if (used >= maxChars) break;
  }
  return lines.length ? `最近对话（从旧到新）:\n${lines.join('\n')}` : '';
}
