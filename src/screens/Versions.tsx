import { TopBar } from '../components/TopBar';
import { BUILD_ID } from '../lib/config';
import { APP_VERSION, VERSIONS } from '../lib/versions';

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function VersionsScreen() {
  return (
    <div className="screen scroll">
      <TopBar title="Version history" />
      <p className="muted small center-text">
        This phone is on v{APP_VERSION}. New versions install themselves a few moments after they go live.
      </p>
      <ol className="versions">
        {VERSIONS.map((r) => (
          <li key={r.version} className="card version">
            <div className="version-head">
              <h3>v{r.version}</h3>
              {r.version === APP_VERSION && <span className="pill good">This phone</span>}
              <span className="version-date">{fmt(r.date)}</span>
            </div>
            <ul>
              {r.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </li>
        ))}
      </ol>
      <p className="muted small center-text build-id">Build {BUILD_ID}</p>
    </div>
  );
}
