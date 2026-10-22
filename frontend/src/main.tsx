import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initHrlI18n } from './lib/hrl/hrl-i18n'
import { PAIRS } from './lib/hrl/dict'

// English is the main language; Polish through the switcher, ?lang=pl or the shared hrl_lang cookie.
initHrlI18n({ pairs: PAIRS, storageKey: 'synchub_lang' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
