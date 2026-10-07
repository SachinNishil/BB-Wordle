import { Toasts } from './components/Toasts';
import { TauntLayer } from './components/TrashTalk';
import { isConfigured } from './lib/config';
import { useRoute } from './router';
import { GameScreen } from './screens/Game';
import { HistoryDetail, HistoryScreen } from './screens/History';
import { Home } from './screens/Home';
import { NotConfigured, WhoAreYou } from './screens/Onboarding';
import { SettingsScreen } from './screens/Settings';
import { StatsScreen } from './screens/Stats';
import { VersionsScreen } from './screens/Versions';
import { StoreProvider, useStore } from './store';

function Routes() {
  const { slot } = useStore();
  const { parts } = useRoute();
  if (!slot) return <WhoAreYou />;
  switch (parts[0]) {
    case 'game':
      return <GameScreen key={parts[1] ?? 'active'} id={parts[1]} />;
    case 'stats':
      return <StatsScreen />;
    case 'history':
      return parts[1] ? <HistoryDetail id={parts[1]} /> : <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'versions':
      return <VersionsScreen />;
    default:
      return <Home />;
  }
}

export function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <StoreProvider>
      <div className="app">
        <Routes />
      </div>
      <Toasts />
      <TauntLayer />
    </StoreProvider>
  );
}
