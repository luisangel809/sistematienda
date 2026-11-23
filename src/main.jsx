import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import CatalogoPublico from './components/CatalogoPublico.jsx'

const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
const page = pathname === '/catalogo' ? <CatalogoPublico /> : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
