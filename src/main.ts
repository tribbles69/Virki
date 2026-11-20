import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <img src="icon.svg" width="96" height="96" alt="" />
  <h1>VIRKI</h1>
  <p>Your village is being surveyed. Building starts soon.</p>
  <div class="status" id="status">v${__APP_VERSION__}</div>
`;

const status = document.querySelector<HTMLDivElement>('#status')!;
const setStatus = (extra: string) => {
  status.textContent = `v${__APP_VERSION__} · ${extra}`;
};

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then(() => setStatus(navigator.onLine ? 'ready to play offline' : 'offline'))
      .catch(() => setStatus('offline mode unavailable'));
  });
} else {
  setStatus('dev build');
}
