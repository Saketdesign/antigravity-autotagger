import '@/components/glaze/styles.css';
import {createRoot} from 'react-dom/client';
import {GlazePortalProvider} from '@/lib/glaze/portal';
import {App} from '@/components/app/app';

createRoot(document.getElementById('root')!).render(
  <GlazePortalProvider>
    <App/>
  </GlazePortalProvider>,
);
