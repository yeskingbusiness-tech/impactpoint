// Headless sanity test: 4 bots fight to completion; verify stocks, KOs, results.
import { Simulation } from '../shared/sim.js';

const players = [
  { id: 'p1', name: 'Alpha', charId: 'blaze', isBot: true },
  { id: 'p2', name: 'Bravo', charId: 'volt', isBot: true },
  { id: 'p3', name: 'Colly', charId: 'titan', isBot: true },
  { id: 'p4', name: 'Delta', charId: 'rift', isBot: true },
];

for (const stage of ['battlefield', 'final', 'skyroost']) {
  const sim = new Simulation({
    rules: { stocks: 2, timeMinutes: 3, stage, maxPlayers: 4 },
    players,
  });
  let steps = 0;
  const maxSteps = 60 * 60 * 5; // 5 sim-minutes max
  let hits = 0, kos = 0, evTypes = {};
  while (!sim.finished && steps < maxSteps) {
    sim.step();
    steps++;
    for (const e of sim.events) {
      evTypes[e.t] = (evTypes[e.t] || 0) + 1;
      if (e.t === 'hit') hits++;
      if (e.t === 'ko') kos++;
    }
  }
  const snap = sim.snapshot();
  const stuck = snap.fighters.filter(f => !f.el && !f.rs && (Math.abs(f.x) > 5000 || Math.abs(f.y) > 5000));
  console.log(`--- ${stage}: finished=${sim.finished} steps=${steps} hits=${hits} kos=${kos} winner=${sim.winnerId}`);
  console.log(`    events: ${JSON.stringify(evTypes)}`);
  console.log(`    final: ${snap.fighters.map(f => `${f.n}[${f.c}] stk=${f.s} pct=${f.p} el=${f.el} pos=(${Math.round(f.x)},${Math.round(f.y)})`).join(' | ')}`);
  if (sim.ranked) console.log(`    ranked: ${sim.ranked.map(r => `${r.rank}:${r.name}${r.winner ? '*' : ''}`).join(' ')}`);
  if (stuck.length) console.log(`    !! STUCK FIGHTERS: ${stuck.map(f => f.n).join(',')}`);
  if (!sim.finished) {
    console.log('    !! DID NOT FINISH');
    process.exitCode = 1;
  }
  if (hits < 5) {
    console.log('    !! TOO FEW HITS — bots not fighting');
    process.exitCode = 1;
  }
}
console.log('SIM TEST DONE, exit=' + (process.exitCode || 0));
