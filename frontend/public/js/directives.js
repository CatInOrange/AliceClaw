export function parseStageDirectiveContent(content) {
  const parts = String(content || '').split(':').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const head = (parts[0] || '').toLowerCase();
  if (['expression', 'exp', 'expr'].includes(head) && parts[1]) {
    return { type: 'expression', name: parts.slice(1).join(':').trim() };
  }
  if (['motion', 'act'].includes(head) && parts[1]) {
    // Supported forms:
    // - [motion:Group:Index]
    // - If Group is empty: [motion:Index]
    if (parts.length === 2) {
      const maybeIndex = Number(parts[1]);
      if (Number.isFinite(maybeIndex)) return { type: 'motion', group: '', index: maybeIndex };
      return { type: 'motion', group: parts[1], index: 0 };
    }
    return { type: 'motion', group: parts[1], index: Number(parts[2] || 0) || 0 };
  }
  return null;
}

export function splitStreamSegments(text, options = {}) {
  const source = String(text || '');
  const segments = [];
  let start = 0;
  let i = 0;
  const hardBreaks = '。！？!?\n.；;';
  const softBreaks = '，,：:';
  const allowSoftBreak = options.allowSoftBreak !== false;
  const softBreakThreshold = Math.max(1, Number(options.softBreakThreshold || 20));
  // Minimum characters required for a segment to be submitted to TTS.
  // Segments shorter than this will be merged with the next segment.
  const minSegmentChars = Math.max(1, Number(options.minSegmentChars || 1));
  while (i < source.length) {
    const ch = source[i];
    const bufferLength = source.slice(start, i + 1).trim().length;
    const shouldBreakHard = hardBreaks.includes(ch);
    const shouldBreakSoft = allowSoftBreak && softBreaks.includes(ch) && bufferLength <= softBreakThreshold;
    if (shouldBreakHard || shouldBreakSoft) {
      let end = i + 1;
      const sameBreakSet = shouldBreakHard ? hardBreaks : softBreaks;
      while (end < source.length && sameBreakSet.includes(source[end])) end += 1;
      const chunk = source.slice(start, end).trim();
      // Only add segment if it meets minimum length requirement
      if (chunk && chunk.length >= minSegmentChars) {
        segments.push(chunk);
        start = end;
      }
      // If chunk is too short, keep it in the buffer (don't update start)
      i = end;
      continue;
    }
    i += 1;
  }
  return { segments, remainder: source.slice(start) };
}

export function createSpeechStreamState() {
  return {
    displayText: '',
    visibleBuffer: '',
    inDirective: false,
    directiveBuffer: '',
    pendingDirectives: [],
  };
}

export function consumeSpeechStreamChunk(state, chunk, options = {}) {
  const source = String(chunk || '');
  const units = [];
  const flushVisible = () => {
    const { segments, remainder } = splitStreamSegments(state.visibleBuffer, options);
    for (const segment of segments) units.push({ text: segment, directives: state.pendingDirectives.splice(0) });

    // If we only have whitespace left but already collected directives (e.g. "你好。 [expr:Shy]"),
    // emit a directive-only unit so the UI can still trigger actions.
    if (!segments.length && String(remainder || '').trim() === '' && state.pendingDirectives.length) {
      units.push({ text: '', directives: state.pendingDirectives.splice(0) });
      state.visibleBuffer = '';
      return;
    }

    state.visibleBuffer = remainder;
  };
  for (const ch of source) {
    if (state.inDirective) {
      if (ch === ']') {
        // Directive boundary: flush the visible buffer as a complete unit so that
        // directives apply to the *next* spoken segment (TTS sync behavior).
        const boundaryText = String(state.visibleBuffer || '').trim();
        if (boundaryText) {
          units.push({ text: boundaryText, directives: state.pendingDirectives.splice(0) });
          state.visibleBuffer = '';
        }

        const directive = parseStageDirectiveContent(state.directiveBuffer);
        if (directive) state.pendingDirectives.push(directive);
        else {
          const literal = `[${state.directiveBuffer}]`;
          state.displayText += literal;
          state.visibleBuffer += literal;
        }
        state.inDirective = false;
        state.directiveBuffer = '';
        flushVisible();
        continue;
      }
      state.directiveBuffer += ch;
      continue;
    }
    if (ch === '[') {
      state.inDirective = true;
      state.directiveBuffer = '';
      continue;
    }
    state.displayText += ch;
    state.visibleBuffer += ch;
    if ('。！？!?\n.，,：:；;'.includes(ch)) flushVisible();
  }
  return { units, visibleText: state.displayText };
}

export function finalizeSpeechStreamState(state, options = {}) {
  const units = [];
  const { segments, remainder } = splitStreamSegments(state.visibleBuffer, options);
  for (const segment of segments) units.push({ text: segment, directives: state.pendingDirectives.splice(0) });
  const trailingText = remainder.trim();
  if (trailingText) units.push({ text: trailingText, directives: state.pendingDirectives.splice(0) });
  state.visibleBuffer = '';
  if (state.inDirective && state.directiveBuffer) {
    const literal = `[${state.directiveBuffer}`;
    state.displayText += literal;
  }
  state.inDirective = false;
  state.directiveBuffer = '';
  return { units, visibleText: state.displayText };
}
