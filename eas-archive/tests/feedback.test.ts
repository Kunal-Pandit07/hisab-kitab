process.env.TZ = 'UTC';
import { DEFAULT_FEEDBACK, FeedbackSettings, shouldPlaySound, shouldVibrate, SoundEvent } from '../src/domain/feedback';
import { createSoundService, SoundBackend } from '../src/audio/soundService';
import { runWithFeedback } from '../src/feedback/runWithFeedback';
import { freshDb } from './helpers';
import { createAccount } from '../src/db/repositories/accounts';
import { listTransactions, saveTransaction, TxnError } from '../src/db/repositories/transactions';

const S = (o: Partial<FeedbackSettings> = {}): FeedbackSettings => ({ ...DEFAULT_FEEDBACK, ...o });

describe('settings decide sound and vibration', () => {
  test('master off silences everything', () => {
    for (const e of ['expense', 'goal', 'tap', 'startup'] as SoundEvent[]) expect(shouldPlaySound(S({ soundMaster: false, soundButtons: true, soundStartup: true }), e)).toBe(false);
  });
  test('each group toggle controls only its own events', () => {
    expect(shouldPlaySound(S({ soundTransactions: false }), 'income')).toBe(false);
    expect(shouldPlaySound(S({ soundTransactions: false }), 'goal')).toBe(true);
    expect(shouldPlaySound(S({ soundSuccess: false }), 'backup')).toBe(false);
    expect(shouldPlaySound(S(), 'tap')).toBe(false);             // buttons are opt-in
    expect(shouldPlaySound(S({ soundButtons: true }), 'tap')).toBe(true);
    expect(shouldPlaySound(S(), 'startup')).toBe(false);         // startup is opt-in
    expect(shouldPlaySound(S({ soundStartup: true }), 'startup')).toBe(true);
  });
  test('vibration is independent of sound and never fires for taps/startup', () => {
    expect(shouldVibrate(S({ soundMaster: false }), 'expense')).toBe(true);
    expect(shouldVibrate(S({ vibration: false }), 'expense')).toBe(false);
    expect(shouldVibrate(S(), 'tap')).toBe(false); expect(shouldVibrate(S(), 'startup')).toBe(false);
  });
});

describe('sound service', () => {
  const make = (settings = S(), failures: { create?: boolean; replay?: 'throw' | 'reject' } = {}) => {
    let t = 1000; const created: SoundEvent[] = []; let replays = 0; let disposed = 0;
    const backend: SoundBackend = { create: (e) => {
      if (failures.create) throw new Error('no audio device');
      created.push(e);
      return { replay: () => { replays++; if (failures.replay === 'throw') throw new Error('boom'); if (failures.replay === 'reject') return Promise.reject(new Error('async boom')); }, dispose: () => { disposed++; } };
    } };
    const svc = createSoundService(backend, () => settings, { now: () => t });
    return { svc, created, tick: (ms: number) => { t += ms; }, replays: () => replays, disposed: () => disposed };
  };
  test('plays when allowed, skips when disabled', () => {
    const a = make(); expect(a.svc.play('expense')).toBe(true); expect(a.created).toEqual(['expense']);
    const b = make(S({ soundMaster: false })); expect(b.svc.play('expense')).toBe(false); expect(b.created).toEqual([]);
  });
  test('rapid repeats are dropped, later ones restart the same player', () => {
    const a = make(); a.svc.play('income'); expect(a.svc.play('income')).toBe(false);
    a.tick(400); expect(a.svc.play('income')).toBe(true);
    expect(a.created).toEqual(['income']); expect(a.replays()).toBe(2);
  });
  test('preview can force a sound past the toggles', () => {
    const a = make(S({ soundMaster: false })); expect(a.svc.play('income', { force: true })).toBe(true);
  });
  test('audio failures never throw', () => {
    expect(() => make(S(), { create: true }).svc.play('expense')).not.toThrow();
    expect(() => make(S(), { replay: 'throw' }).svc.play('expense')).not.toThrow();
    expect(make(S(), { create: true }).svc.play('expense')).toBe(false);
  });
  test('async playback rejection is swallowed', async () => {
    const a = make(S(), { replay: 'reject' }); expect(a.svc.play('expense')).toBe(true);
    await new Promise((r) => setTimeout(r, 5)); // would surface as unhandled rejection if not caught
  });
  test('dispose releases players', () => { const a = make(); a.svc.play('expense'); a.svc.dispose(); expect(a.disposed()).toBe(1); });
});

describe('feedback fires only after a committed write', () => {
  const base = { description: '' };
  async function setup() { const db = await freshDb(); const cash = await createAccount(db, { name: 'Cash', type: 'cash', openingBalancePaise: 1000 }); return { db, cash }; }

  test('successful save: feedback fires once, after the row exists', async () => {
    const { db, cash } = await setup();
    const seen: number[] = [];
    const fire = () => { seen.push(db.raw.prepare('SELECT COUNT(*) c FROM transactions').get().c); };
    const id = await runWithFeedback(() => saveTransaction(db, { ...base, type: 'income', amountPaise: 500, accountId: cash, occurredAt: '2026-10-10T10:00:00.000Z' }), 'income', fire);
    expect(id).toBeTruthy(); expect(seen).toEqual([1]);
  });
  test('failed save (overdraft/validation): no feedback, error propagates, nothing stored', async () => {
    const { db, cash } = await setup(); const bank = await createAccount(db, { name: 'Bank', type: 'bank', openingBalancePaise: 0 });
    const fire = jest.fn();
    await expect(runWithFeedback(() => saveTransaction(db, { ...base, type: 'transfer', amountPaise: 5000, accountId: cash, toAccountId: bank, occurredAt: '2026-10-10T10:00:00.000Z' }), 'transfer', fire)).rejects.toBeInstanceOf(TxnError);
    await expect(runWithFeedback(() => saveTransaction(db, { ...base, type: 'expense', amountPaise: 0, accountId: cash, occurredAt: '2026-10-10T10:00:00.000Z' }), 'expense', fire)).rejects.toBeInstanceOf(TxnError);
    expect(fire).not.toHaveBeenCalled(); expect(await listTransactions(db)).toEqual([]);
  });
  test('audio failure after commit leaves the saved transaction intact', async () => {
    const { db, cash } = await setup();
    const id = await runWithFeedback(() => saveTransaction(db, { ...base, type: 'expense', amountPaise: 300, accountId: cash, occurredAt: '2026-10-10T10:00:00.000Z' }), 'expense', () => { throw new Error('speaker exploded'); });
    expect(id).toBeTruthy(); expect((await listTransactions(db)).length).toBe(1);
  });
  test('event chooser can skip feedback (e.g. edits)', async () => {
    const fire = jest.fn();
    await runWithFeedback(async () => ({ justCompleted: false }), (r) => (r.justCompleted ? 'goal' : null), fire);
    await runWithFeedback(async () => ({ justCompleted: true }), (r) => (r.justCompleted ? 'goal' : null), fire);
    expect(fire.mock.calls).toEqual([['goal']]);
  });
});
