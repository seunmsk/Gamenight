import { sample, esc } from '../ui.js';
import { NAIJA, titleFor } from '../content.js';
import { prepQs, qBegin, qAnswer, qSkip, qTV, qPhone, qRenderPhone } from './quiz.js';

export default {
  id: 'naija', name: 'How Naija Are You?', color: '#16c2a3', glyph: '?',
  blurb: 'Rapid-fire Naija trivia. Fastest correct answer scores the most.',
  players: '1–16', min: 1, max: 16, solo: 'full',
  options: [
    { key: 'count', label: 'Questions', choices: [[10, '10'], [15, '15'], [20, '20']], def: 10 },
    { key: 'secs', label: 'Seconds per question', choices: [[15, '15s'], [20, '20s'], [30, '30s']], def: 20 }
  ],
  start(ctx, o) {
    const gs = {};
    const n = +o.count || 10;
    qBegin(ctx, gs, prepQs(sample(NAIJA, n)), +o.secs || 20, () => {
      const lines = ctx.humans().map(p => `${esc(p.name)}: ${gs.right[p.pid] || 0}/${n} right, <b>${esc(titleFor(Math.round(100 * (gs.right[p.pid] || 0) / n)))}</b>`);
      ctx.finish(gs.score, { title: ctx.solo ? titleFor(Math.round(100 * (gs.right.me || 0) / n)) : 'Naija rating', lines });
    });
    return gs;
  },
  act(ctx, gs, pid, a) {
    if (a.k === 'ans') return qAnswer(ctx, gs, pid, +a.i);
    if (a.k === 'skip' && ctx.isCtl(pid)) return qSkip(ctx, gs);
    return false;
  },
  tv: (ctx, gs) => qTV(ctx, gs),
  phone: (ctx, gs, pid) => qPhone(ctx, gs, pid),
  renderPhone: d => d.k === 'q' ? qRenderPhone(d) : '<div class="result"><h2>Get ready…</h2></div>'
};
