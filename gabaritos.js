const LS_KEY = 'omr_saved_keys';

function load() {
  return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function buildGrid(nQ, answers) {
  const COL_SIZE = 25;
  let html = '<div class="saved-card-grid">';
  for (let colStart = 1; colStart <= nQ; colStart += COL_SIZE) {
    html += '<div class="saved-ak-col">';
    const colEnd = Math.min(colStart + COL_SIZE - 1, nQ);
    for (let q = colStart; q <= colEnd; q++) {
      html += `<div class="saved-ak-row">
        <span class="saved-q-num">${q}</span>
        <span class="saved-q-ans">${answers[q] || '—'}</span>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function deleteKey(id) {
  const saved = load().filter(k => k.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(saved));
  render();
}

function render() {
  const saved = load();
  const list = document.getElementById('gabaritos-list');
  const subtitle = document.getElementById('page-subtitle');
  subtitle.textContent = saved.length
    ? `${saved.length} gabarito${saved.length > 1 ? 's' : ''} salvo${saved.length > 1 ? 's' : ''}`
    : '';

  if (!saved.length) {
    list.innerHTML = `<div class="empty-state">
      <p>Nenhum gabarito salvo ainda.</p>
      <a href="index.html" class="nav-link">← Gerar um gabarito</a>
    </div>`;
    return;
  }

  list.innerHTML = saved.map(entry => `
    <div class="saved-card">
      <div class="saved-card-header">
        <div class="saved-card-info">
          <div class="saved-card-name">${escapeHTML(entry.name)}</div>
          <div class="saved-card-meta">${entry.nQ} questões &nbsp;·&nbsp; salvo em ${formatDate(entry.savedAt)}</div>
        </div>
        <div class="saved-card-actions">
          <button class="btn-correct-card" onclick="openScanner(${entry.id})">Corrigir</button>
          <button class="btn-delete-card" onclick="deleteKey(${entry.id})">Excluir</button>
        </div>
      </div>
      ${buildGrid(entry.nQ, entry.answers)}
    </div>
  `).join('');
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

render();
