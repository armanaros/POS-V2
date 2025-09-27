const express = require('express');
const router = express.Router();
const database = require('../config/database');
const fetch = require('node-fetch');

// Ensure table exists
const ensureTable = () => {
  const db = database.getConnection();
  db.run(`CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    amount REAL,
    note TEXT,
    createdAt TEXT,
    dateOnly TEXT
  )`);
};

ensureTable();

// Add dateOnly column if missing and backfill existing rows
(() => {
  try {
    const db = database.getConnection();
    db.all("PRAGMA table_info('operations')", (err, cols) => {
      if (err) return;
      const hasDateOnly = Array.isArray(cols) && cols.some(c => c.name === 'dateOnly');
      if (!hasDateOnly) {
        db.run('ALTER TABLE operations ADD COLUMN dateOnly TEXT', (aErr) => {
          if (aErr) return;
          // backfill dateOnly from createdAt for existing rows
          db.run("UPDATE operations SET dateOnly = substr(createdAt,1,10) WHERE createdAt IS NOT NULL AND (dateOnly IS NULL OR dateOnly = '')");
        });
      }
    });
  } catch (e) {
    // ignore
  }
})();

// Ensure goals table
const ensureGoalsTable = () => {
  const db = database.getConnection();
  db.run(`CREATE TABLE IF NOT EXISTS operation_goals (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    monthlyRevenue REAL DEFAULT 0,
    recoupTarget REAL DEFAULT 0,
    updatedAt TEXT
  )`);
  // ensure a single row exists
  db.get('SELECT COUNT(*) as cnt FROM operation_goals', (err, row) => {
    if (!err && row && row.cnt === 0) {
      db.run('INSERT INTO operation_goals (id, monthlyRevenue, recoupTarget, updatedAt) VALUES (1, 0, 0, ?)', [new Date().toISOString()]);
    }
  });
};

ensureGoalsTable();

router.get('/', (req, res) => {
  const db = database.getConnection();
  db.all('SELECT * FROM operations ORDER BY createdAt DESC LIMIT 1000', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Goals endpoints
router.get('/goals', (req, res) => {
  const db = database.getConnection();
  db.get('SELECT monthlyRevenue, recoupTarget, updatedAt FROM operation_goals WHERE id = 1', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { monthlyRevenue: 0, recoupTarget: 0 });
  });
});

router.put('/goals', (req, res) => {
  const { monthlyRevenue, recoupTarget } = req.body || {};
  const db = database.getConnection();
  const updatedAt = new Date().toISOString();
  db.run('UPDATE operation_goals SET monthlyRevenue = ?, recoupTarget = ?, updatedAt = ? WHERE id = 1', [monthlyRevenue || 0, recoupTarget || 0, updatedAt], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ monthlyRevenue: Number(monthlyRevenue) || 0, recoupTarget: Number(recoupTarget) || 0, updatedAt });
  });
});

router.post('/', (req, res) => {
  const { type, amount, note, date } = req.body || {};
  const db = database.getConnection();
  // If client passed a date (ISO or YYYY-MM-DD), prefer it. Otherwise use server time.
  const createdAt = date ? date : new Date().toISOString();
  // Compute dateOnly (YYYY-MM-DD) from createdAt (handles both ISO and YYYY-MM-DD inputs)
  let dateOnly = null;
  if (typeof createdAt === 'string') {
    dateOnly = createdAt.split('T')[0];
  } else {
    dateOnly = new Date(createdAt).toISOString().split('T')[0];
  }
  db.run('INSERT INTO operations (type, amount, note, createdAt, dateOnly) VALUES (?, ?, ?, ?, ?)', [type, amount, note || '', createdAt, dateOnly], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, type, amount, note, createdAt, dateOnly });
  });
});

router.delete('/:id', (req, res) => {
  const db = database.getConnection();
  db.run('DELETE FROM operations WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Update operation (partial)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { type, amount, note, date } = req.body || {};
  const db = database.getConnection();
  // compute dateOnly if date provided, otherwise keep existing
  const dateOnly = date ? (String(date).split('T')[0]) : null;
  // Build update parts
  const fields = [];
  const values = [];
  if (typeof type !== 'undefined') { fields.push('type = ?'); values.push(type); }
  if (typeof amount !== 'undefined') { fields.push('amount = ?'); values.push(amount); }
  if (typeof note !== 'undefined') { fields.push('note = ?'); values.push(note); }
  if (typeof date !== 'undefined') { fields.push('createdAt = ?'); values.push(date); fields.push('dateOnly = ?'); values.push(dateOnly); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  const sql = `UPDATE operations SET ${fields.join(', ')} WHERE id = ?`;
  values.push(id);
  db.run(sql, values, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM operations WHERE id = ?', [id], (gErr, row) => {
      if (gErr) return res.status(500).json({ error: gErr.message });
      res.json(row || {});
    });
  });
});

// AI suggestions endpoint (proxies to OpenAI if configured)
router.post('/ai-suggest', async (req, res) => {
  try {
    const { context } = req.body || {};
    const apiKey = process.env.OPENAI_API_KEY;

    // No API key -> return heuristic suggestions including staffing recommendations
    if (!apiKey) {
      const heuristics = [];
      if (context && context.net <= 0) heuristics.push('🚨 Cash flow issue: Net is not positive. Prioritize immediate revenue actions (promotions) and cut discretionary expenses.');
      if (context && context.expense > (context.income || 0) * 0.6) heuristics.push('⚠️ High expenses: Renegotiate supplier prices and reduce waste to improve margins.');
      heuristics.push('💡 Menu engineering: Highlight top 5 margin items and create profitable combos to increase average ticket.');
      heuristics.push('👥 Staffing optimization: Reduce scheduled staff during off-peak hours, cross-train employees to cover multiple roles, and add temporary staff only for peak windows to lower labor cost while preserving service.');
      heuristics.push('📈 Shift mix: Analyze busiest 3-hour windows and add a single experienced server or cook instead of multiple juniors to increase throughput with lower total labor cost.');
      return res.json({ suggestions: heuristics });
    }

    // If key exists, call OpenAI Chat Completions (simple proxy)
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const recent = (context && context.recent) ? context.recent : [];
    const goalsText = context && context.goals ? `Goals: monthlyRevenue=${context.goals.monthlyRevenue}, recoupTarget=${context.goals.recoupTarget}` : '';

    const prompt = `You are an expert restaurant operations advisor. Given the following summary and recent transactions, provide 8 concise, prioritized suggestions (one per line) to increase revenue, improve margin, and recoup investment quickly. Ensure at least one recommendation focuses specifically on staffing/rostering to improve efficiency and profitability (e.g., shift mix, cross-training, peak staffing adjustments, task consolidation).

Summary: ${JSON.stringify(context || {})}

Recent transactions:
${recent.slice(0,20).map(r => `${r.type} ${r.amount} ${r.note || ''}` ).join('\n')}

${goalsText}

Keep suggestions actionable, specific, and include quick wins that can be implemented within 30 days.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: text || 'OpenAI error' });
    }

    const body = await response.json();
    const msg = body?.choices?.[0]?.message?.content || '';
    const suggestions = msg.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 10);
    res.json({ suggestions });
  } catch (err) {
    console.error('AI suggest error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
