const status = document.querySelector('#offline-status');
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: '../' })
    .then(async (registration) => {
      const showUpdate = () => { status.textContent = 'An update is ready. Close all game windows and reopen to update.'; };
      const observe = (worker) => {
        if (!worker) return;
        const state = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        };
        worker.addEventListener('statechange', state);
        state();
      };
      registration.addEventListener('updatefound', () => observe(registration.installing));
      observe(registration.installing);
      await navigator.serviceWorker.ready;
      if (registration.waiting) showUpdate();
      else status.textContent = 'Ready for offline play on this device.';
    })
    .catch(() => { status.textContent = 'Offline download did not finish. Reopen while online to try again.'; });
} else {
  status.textContent = 'Offline saving is unavailable in this browser. Play while online.';
}
