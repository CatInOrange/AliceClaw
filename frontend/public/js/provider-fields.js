export function createProviderFieldsController(containerEl) {
  let inputsByKey = new Map();

  function clear() {
    inputsByKey = new Map();
    if (containerEl) containerEl.innerHTML = '';
  }

  function render(fields = [], state = {}) {
    if (!containerEl) return;
    clear();
    for (const field of fields) {
      const key = String(field?.key || '').trim();
      if (!key) continue;
      const wrapper = document.createElement('div');
      wrapper.className = field.wide === false ? 'field' : 'field wide';
      wrapper.dataset.fieldKey = key;

      const labelEl = document.createElement('label');
      labelEl.textContent = field.label || key;

      const inputEl = document.createElement('input');
      inputEl.type = field.input || 'text';
      inputEl.placeholder = field.placeholder || '';
      inputEl.value = state[key] ?? field.value ?? field.defaultValue ?? '';
      inputEl.dataset.fieldKey = key;
      if (field.autocomplete) inputEl.autocomplete = field.autocomplete;

      wrapper.appendChild(labelEl);
      wrapper.appendChild(inputEl);
      containerEl.appendChild(wrapper);
      inputsByKey.set(key, inputEl);
    }
  }

  function readValues() {
    const values = {};
    for (const [key, inputEl] of inputsByKey.entries()) {
      values[key] = inputEl?.value?.trim?.() || '';
    }
    return values;
  }

  function writeValues(nextState = {}) {
    for (const [key, inputEl] of inputsByKey.entries()) {
      inputEl.value = nextState[key] ?? '';
    }
  }

  function getInputElements() {
    return [...inputsByKey.values()];
  }

  return { clear, render, readValues, writeValues, getInputElements };
}
