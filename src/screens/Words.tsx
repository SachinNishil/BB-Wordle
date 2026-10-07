import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { classify, type ParsedWord } from '../lib/bulk';
import { loadDictionary } from '../lib/dictionary';
import { repoStats, setterStats } from '../lib/stats';
import type { AddWordsResult, Slot } from '../lib/types';
import { useStore } from '../store';

type Filter = 'all' | 'mine' | 'theirs' | 'unplayed' | 'played';

export function WordsScreen() {
  const { roomKey, slot, players, words, history, refreshWords, ping, reportError, toast } = useStore();
  const [dict, setDict] = useState<Set<string> | null>(null);
  const [single, setSingle] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AddWordsResult | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [armed, setArmed] = useState<number | null>(null);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    void loadDictionary().then(setDict);
    void refreshWords();
  }, [refreshWords]);

  const existing = useMemo(() => new Set((words ?? []).map((w) => w.word)), [words]);
  const preview: ParsedWord[] = useMemo(() => (bulk.trim() ? classify(bulk, existing, dict) : []), [bulk, existing, dict]);
  const counts = useMemo(() => {
    const c = { new: 0, invalid: 0, duplicate: 0, repeated: 0, unknown: 0 };
    for (const p of preview) c[p.verdict]++;
    return c;
  }, [preview]);

  if (!slot || !roomKey) return null;
  const partnerSlot = (3 - slot) as Slot;
  const stats = repoStats(words ?? []);
  const setter = { 1: setterStats(history ?? [], words ?? [], 1), 2: setterStats(history ?? [], words ?? [], 2) };

  async function submit(list: string[], allowUnknown = false) {
    if (!list.length || !roomKey || !slot) return;
    setBusy(true);
    try {
      const r = await api.addWords(roomKey, slot, list, allowUnknown);
      setReport(r);
      if (r.added.length) {
        ping('words');
        await refreshWords();
      }
      return r;
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function addSingle(e: React.FormEvent) {
    e.preventDefault();
    const w = single.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(w)) return toast('Words need exactly 5 letters');
    const r = await submit([w]);
    if (r?.added.length) {
      toast(`${w} added`, 'win');
      setSingle('');
      setReport(null);
    } else if (r?.duplicates.length) {
      const by = r.duplicates[0].added_by;
      toast(`${w} is already in, added by ${by ? players[by].name : 'someone'}`);
      setReport(null);
    } else if (r?.unknown.length) {
      // keep the report so the "add anyway" option shows
    }
  }

  async function importBulk() {
    const r = await submit(preview.map((p) => p.raw));
    if (r) setBulk('');
  }

  async function remove(id: number) {
    if (armed !== id) {
      setArmed(id);
      setTimeout(() => setArmed((a) => (a === id ? null : a)), 3000);
      return;
    }
    try {
      await api.deleteWord(roomKey!, slot!, id);
      ping('words');
      await refreshWords();
    } catch (e) {
      reportError(e);
    }
    setArmed(null);
  }

  const q = query.trim().toUpperCase();
  const list = (words ?? []).filter((w) => {
    if (q && !w.word.includes(q)) return false;
    if (filter === 'mine') return w.added_by === slot;
    if (filter === 'theirs') return w.added_by === partnerSlot;
    if (filter === 'unplayed') return w.times_played === 0;
    if (filter === 'played') return w.times_played > 0;
    return true;
  });
  const fmt = (n: number | null) => (n == null ? '–' : n.toFixed(1));

  return (
    <div className="screen scroll">
      <TopBar title="Word repository" />

      <div className="stat-tiles">
        <div className="stat-tile"><b>{stats.total}</b><span>Total words</span></div>
        <div className="stat-tile p1"><b>{stats.bySlot[1]}</b><span>{players[1].name}</span></div>
        <div className="stat-tile p2"><b>{stats.bySlot[2]}</b><span>{players[2].name}</span></div>
        <div className="stat-tile"><b>{stats.played}</b><span>Played</span></div>
        <div className="stat-tile"><b>{stats.neverPlayed}</b><span>Never played</span></div>
      </div>

      <section className="card rivalry">
        <p className="eyebrow">Who picks harder words?</p>
        <div className="rivalry-grid">
          {([1, 2] as Slot[]).map((s) => (
            <div key={s} className={`rival p${s}`}>
              <Avatar player={players[s]} size={36} />
              <p className="rival-name">{players[s].name}'s words</p>
              {setter[s].played === 0 ? (
                <p className="rival-label">{setter[s].contributed} added · none played yet</p>
              ) : (
                <>
                  <p className="rival-num">{fmt(setter[s].avgAttempts)}</p>
                  <p className="rival-label">avg guesses · {setter[s].played} played</p>
                  <p className="rival-sub">{players[(3 - s) as Slot].name} needs {fmt(setter[s].avgAttemptsForPartner)}
                    {setter[s].partnerFails ? ` · stumped ${setter[s].partnerFails}×` : ''}</p>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="muted small">A failed round counts as 7 guesses.</p>
      </section>

      <section className="card add-card">
        <h3>Add words</h3>
        <form className="add-row" onSubmit={addSingle}>
          <input className="word-input" value={single} maxLength={5} autoCapitalize="characters" autoComplete="off" autoCorrect="off"
            spellCheck={false} placeholder="CRANE" aria-label="New word"
            onChange={(e) => setSingle(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} />
          <button className="btn primary" disabled={busy || single.length !== 5}><Icon name="plus" size={18} /> Add</button>
        </form>
        <button className="btn text small" onClick={() => setBulkOpen((x) => !x)}>
          {bulkOpen ? 'Hide bulk import' : 'Paste a list of words'}
        </button>
        {bulkOpen && (
          <div className="bulk">
            <textarea value={bulk} onChange={(e) => { setBulk(e.target.value); setReport(null); }} rows={6}
              placeholder={'CRANE\nHOUSE\nPLANT\nBRICK\nMOUSE'} aria-label="Paste words, one per line" spellCheck={false} />
            {preview.length > 0 && (
              <>
                <p className="bulk-summary">
                  <span className="pill good">{counts.new} new</span>
                  {counts.duplicate + counts.repeated > 0 && <span className="pill">{counts.duplicate + counts.repeated} duplicate</span>}
                  {counts.invalid > 0 && <span className="pill bad">{counts.invalid} not 5 letters</span>}
                  {counts.unknown > 0 && <span className="pill warn">{counts.unknown} not in dictionary</span>}
                </p>
                <div className="chips">
                  {preview.slice(0, 300).map((p, i) => (
                    <span key={i} className={`chip ${p.verdict}`} title={p.verdict}>{p.verdict === 'invalid' ? p.raw : p.word}</span>
                  ))}
                  {preview.length > 300 && <span className="chip">+{preview.length - 300} more</span>}
                </div>
                <button className="btn primary" onClick={importBulk} disabled={busy || counts.new === 0}>
                  {busy ? 'Importing…' : `Import ${counts.new} word${counts.new === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        )}
        {report && (report.added.length > 0 || report.unknown.length > 0 || report.invalid.length > 0 || report.duplicates.length > 0) && (
          <div className="report">
            {report.added.length > 0 && <p>✅ Added {report.added.length}: {report.added.slice(0, 12).join(', ')}{report.added.length > 12 ? '…' : ''}</p>}
            {report.duplicates.length > 0 && <p>↩️ Skipped {report.duplicates.length} already in the repository</p>}
            {report.invalid.length > 0 && <p>✋ Rejected {report.invalid.length} that aren't 5 letters</p>}
            {report.unknown.length > 0 && (
              <div className="report-unknown">
                <p>🤔 Not in the dictionary: {report.unknown.join(', ')}</p>
                <button className="btn ghost small" disabled={busy}
                  onClick={async () => {
                    const r = await submit(report.unknown, true);
                    if (r?.added.length) { toast(`Added ${r.added.length} anyway`, 'win'); setSingle(''); }
                  }}>
                  Add {report.unknown.length === 1 ? 'it' : 'them'} anyway
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h3>All words</h3>
          <button className="btn text small" onClick={() => setShowList((x) => !x)}>{showList ? 'Hide' : 'Show'}</button>
        </div>
        {!showList ? (
          <p className="empty-line">Hidden so you don't spoil the surprise. Tap Show to browse.</p>
        ) : (
          <>
            <div className="list-tools">
              <label className="search">
                <Icon name="search" size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search words" />
              </label>
              <div className="segmented" role="tablist">
                {([['all', 'All'], ['mine', 'Mine'], ['theirs', players[partnerSlot].name], ['unplayed', 'Unplayed'], ['played', 'Played']] as [Filter, string][]).map(([f, label]) => (
                  <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label}</button>
                ))}
              </div>
            </div>
            {words === null ? (
              <div className="skeleton" style={{ height: 120 }} />
            ) : list.length === 0 ? (
              <p className="empty-line">{words.length === 0 ? 'No words yet. Add a few above, around 100 each is a great start.' : 'Nothing matches.'}</p>
            ) : (
              <ul className="word-list">
                {list.map((w) => (
                  <li key={w.id} className="word-row">
                    <span className="word-text">{w.word}</span>
                    <span className={`by p${w.added_by}`}><Avatar player={players[w.added_by]} size={20} /> {players[w.added_by].name}</span>
                    <span className="word-meta">
                      {w.times_played > 0 ? `played ${w.times_played}×` : 'new'}
                      {!w.in_dictionary && ' · custom'}
                    </span>
                    {w.added_by === slot && (
                      <button className={`iconbtn tiny${armed === w.id ? ' armed' : ''}`} onClick={() => remove(w.id)}
                        aria-label={armed === w.id ? `Tap again to remove ${w.word}` : `Remove ${w.word}`}>
                        {armed === w.id ? 'Remove?' : <Icon name="trash" size={16} />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
