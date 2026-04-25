// Toast notifications con cola — los toasts no se pisan entre sí

let queue = [];
let activeTimer = null;

export function showToast(msg, type = 'success', duration = 3000) {
  queue.push({ msg, type, duration });
  if (!activeTimer) processQueue();
}

function processQueue() {
  if (queue.length === 0) {
    activeTimer = null;
    return;
  }
  const { msg, type, duration } = queue.shift();

  // Quita el anterior si quedó por algún motivo
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = msg;
  document.body.appendChild(el);

  activeTimer = setTimeout(() => {
    el.remove();
    activeTimer = setTimeout(processQueue, 150);
  }, duration);
}
