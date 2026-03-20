/**
 * Speech parsing + directive application helpers.
 */

/**
 * Apply parsed stage directives directly to Live2D.
 *
 * @param {any} live2d
 * @param {Array<any>} directives
 */
export function applyDirectivesDirectly(live2d, directives = []) {
  for (const directive of directives || []) {
    if (directive?.type === 'expression' && directive?.name) {
      live2d?.triggerExpression?.(directive.name);
    }
    if (directive?.type === 'motion' && directive?.group != null) {
      const group = String(directive.group || '');
      const index = Number(directive.index || 0) || 0;
      live2d?.triggerMotion?.(group, index, group ? `${group}[${index}]` : `[${index}]`);
    }
  }
}

/**
 * Parse a full speech text into displayable units using the existing stream-state utilities.
 *
 * @param {string} speechText
 * @param {{
 *   createSpeechStreamState: Function,
 *   consumeSpeechStreamChunk: Function,
 *   finalizeSpeechStreamState: Function,
 *   getSegmentationOptions: Function,
 * }} deps
 */
export function parseSpeechForDisplay(speechText, deps) {
  const {
    createSpeechStreamState,
    consumeSpeechStreamChunk,
    finalizeSpeechStreamState,
    getSegmentationOptions,
  } = deps;

  const speechState = createSpeechStreamState();
  consumeSpeechStreamChunk(speechState, speechText || '', getSegmentationOptions());
  const finalized = finalizeSpeechStreamState(speechState, getSegmentationOptions());

  let units = finalized.units || [];
  // 如果分段为空但有剩余内容，补一个unit
  if ((!units.length) && finalized.visibleText) {
    units = [{ text: finalized.visibleText, directives: [] }];
  }

  return {
    visibleText: finalized.visibleText || '',
    units,
  };
}
