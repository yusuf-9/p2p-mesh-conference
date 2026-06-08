import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';

function Router({ children }) {
  const [basename, setBasename] = useState('');

  useEffect(() => {
    if (window.location.pathname.includes('/stats/')) {
      setBasename('/stats');
    }
  }, []);

  return <BrowserRouter basename={basename}>{children}</BrowserRouter>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
