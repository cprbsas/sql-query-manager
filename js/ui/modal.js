// Modal accesible con focus trap, Escape y aria-modal

import { esc } from '../utils.js';

let lastFocusedBeforeOpen = null;
let trapHandler = null;
let escHandler = null;

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal(title, content, maxWidth = 600) {
  closeModal();
  lastFocusedBeforeOpen = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modal-title');

  // Cierra modal solo si clic directo sobre la overlay (fuera del .modal)
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.innerHTML = `
    <div class="modal" style="max-width:${maxWidth}px">
      <div class="modal-header">
        <span class="modal-title" id="modal-title">// ${esc(title)}</span>
        <button class="modal-close" type="button" aria-label="Cerrar" data-close-modal>✕</button>
      </div>
      <div class="modal-body" id="modal-content">${content}</div>
    </div>
  `;
  overlay.querySelector('[data-close-modal]').addEventListener('click', closeModal);

  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  // Focus inicial: el primer focusable, o el botón cerrar
  setTimeout(() => {
    const focusables = overlay.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusables.length > 1) focusables[1].focus(); // omite el cerrar para no quedarse ahí
    else if (focusables.length > 0) focusables[0].focus();
  }, 30);

  // Focus trap
  trapHandler = e => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', trapHandler);

  // Escape para cerrar
  escHandler = e => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);

  return overlay;
}

export function closeModal() {
  const el = document.getElementById('modal-overlay');
  if (el) {
    if (trapHandler) el.removeEventListener('keydown', trapHandler);
    el.remove();
  }
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  document.body.classList.remove('modal-open');
  // Restaura foco previo
  if (lastFocusedBeforeOpen && typeof lastFocusedBeforeOpen.focus === 'function') {
    try { lastFocusedBeforeOpen.focus(); } catch {}
  }
  lastFocusedBeforeOpen = null;
}
