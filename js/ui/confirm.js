// Reemplazos accesibles de confirm() y prompt() nativos
// Devuelven Promesas en lugar de bloquear el thread

import { esc } from '../utils.js';
import { openModal, closeModal } from './modal.js';

/**
 * Diálogo de confirmación. Devuelve Promise<boolean>.
 * @param {string} message
 * @param {object} opts { title, confirmText, cancelText, danger }
 */
export function confirmDialog(message, opts = {}) {
  const {
    title = 'Confirmar',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    danger = false,
  } = opts;

  return new Promise(resolve => {
    const html = `
      <p class="dialog-message">${esc(message).replace(/\n/g, '<br>')}</p>
      <div class="form-actions">
        <button type="button" class="btn" data-action="cancel">${esc(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${esc(confirmText)}</button>
      </div>
    `;
    const overlay = openModal(title, html, 460);

    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(result);
    };

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => settle(false));
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => settle(true));

    // Si el usuario cierra con Escape o backdrop, devolvemos false
    const observer = new MutationObserver(() => {
      if (!document.getElementById('modal-overlay')) {
        observer.disconnect();
        settle(false);
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

/**
 * Diálogo de prompt. Devuelve Promise<string|null>.
 * @param {string} message
 * @param {object} opts { title, defaultValue, placeholder, confirmText, cancelText }
 */
export function promptDialog(message, opts = {}) {
  const {
    title = 'Entrada',
    defaultValue = '',
    placeholder = '',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
  } = opts;

  return new Promise(resolve => {
    const html = `
      <label class="label" for="prompt-input">${esc(message)}</label>
      <input id="prompt-input" type="text" value="${esc(defaultValue)}" placeholder="${esc(placeholder)}" />
      <div class="form-actions">
        <button type="button" class="btn" data-action="cancel">${esc(cancelText)}</button>
        <button type="button" class="btn btn-primary" data-action="confirm">${esc(confirmText)}</button>
      </div>
    `;
    const overlay = openModal(title, html, 460);
    const input = overlay.querySelector('#prompt-input');

    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(result);
    };

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => settle(null));
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => settle(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); settle(input.value); }
    });

    setTimeout(() => { input.focus(); input.select(); }, 50);

    const observer = new MutationObserver(() => {
      if (!document.getElementById('modal-overlay')) {
        observer.disconnect();
        settle(null);
      }
    });
    observer.observe(document.body, { childList: true });
  });
}
