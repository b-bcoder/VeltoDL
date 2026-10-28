import React from 'react'
import { createRoot } from 'react-dom/client'
import UI from '../../Interface/UI'
import '../../Interface/styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UI />
  </React.StrictMode>
)
