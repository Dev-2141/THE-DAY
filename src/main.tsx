// Lets PixiJS run under the app's strict Content Security Policy (no eval).
import 'pixi.js/unsafe-eval';
// Bundled fonts, so the text works offline.
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource/italiana/400.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './ui/interface.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
