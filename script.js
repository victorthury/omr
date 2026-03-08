const LABELS = "ABCDEFGHIJ";
const N_ALTS = 5;
const MAX_PER_COLUMN = 25;
const TICK_COUNT = 48; // number of timing marks across top/bottom

let answerKey = {}; // { [qNum]: letter | null }

function clamp(val, min, max) {
  return Math.min(Math.max(parseInt(val) || min, min), max);
}

function generateSheet() {
  const title =
    document.getElementById("input-title").value.trim() || "GABARITO";
  const nQ = clamp(document.getElementById("input-questions").value, 1, 200);

  const sheet = document.getElementById("omr-sheet");
  sheet.innerHTML = buildSheetHTML(title, nQ);
  sheet.classList.toggle('two-block', nQ > 100);

  const wrapper = document.getElementById("preview-wrapper");
  wrapper.classList.add("visible");
  requestAnimationFrame(scalePreview);
  wrapper.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("btn-print").disabled = false;
  renderAnswerKeyEditor(nQ);
}

function buildSheetHTML(title, nQ) {
  return `
    ${buildRegistrationMarks()}
    ${buildTimingStrip("top")}
    ${buildTimingStrip("bottom")}
    <div class="sheet-inner">
      ${buildHeader(title)}
      ${buildInstructions()}
      ${buildQuestionGrid(nQ)}
    </div>
  `;
}

function buildRegistrationMarks() {
  return `
    <div class="reg-mark tl"></div>
    <div class="reg-mark tr"></div>
    <div class="reg-mark bl"></div>
    <div class="reg-mark br"></div>
  `;
}

function buildTimingStrip(pos) {
  let ticks = "";
  for (let i = 0; i < TICK_COUNT; i++) {
    ticks += '<div class="tick"></div>';
  }
  return `<div class="timing-strip ${pos}">${ticks}</div>`;
}

function buildHeader(title) {
  return `
    <div class="sheet-header">
      <div class="sheet-title">${escapeHTML(title)}</div>
      <div class="header-fields">
        <div class="header-field">
          <span class="field-label">Nome do Aluno</span>
          <div class="field-line"></div>
        </div>
        <div class="header-field">
          <span class="field-label">Data</span>
          <div class="field-line"></div>
        </div>
        <div class="header-field">
          <span class="field-label">Turma / Código</span>
          <div class="field-line"></div>
        </div>
      </div>
    </div>
  `;
}

function buildInstructions() {
  const alts = LABELS.slice(0, N_ALTS).split("").join(", ");
  return `
    <div class="instructions">
      <strong>INSTRUÇÕES:</strong> Use caneta esferográfica azul ou preta. Preencha completamente o círculo
      correspondente à alternativa escolhida (${alts}). Não rasure. Uma única marcação por questão.
    </div>
  `;
}

function buildQuestionGrid(nQ) {
  if (nQ > 100) {
    return (
      buildQuestionBlock(1, 100) +
      '<div class="grid-separator"></div>' +
      buildQuestionBlock(101, nQ)
    );
  }
  return buildQuestionBlock(1, nQ);
}

function buildQuestionBlock(startQ, endQ) {
  const numCols = 4;
  const perCol = 25;

  let cols = "";
  let q = startQ;
  for (let c = 0; c < numCols; c++) {
    const colCount = Math.min(perCol, Math.max(0, endQ - q + 1));
    if (colCount > 0) {
      cols += `<div class="q-column">
        ${buildColHeader()}
        ${buildColRows(q, colCount)}
      </div>`;
      q += colCount;
    } else {
      cols += `<div class="q-column"></div>`;
    }
  }
  return `<div class="question-grid">${cols}</div>`;
}

function buildColHeader() {
  const labels = LABELS.slice(0, N_ALTS)
    .split("")
    .map((l) => `<div class="alt-label">${l}</div>`)
    .join("");
  return `
    <div class="col-header">
      <div class="q-num-spacer" style="width:26px"></div>
      <div class="alt-labels">${labels}</div>
    </div>
  `;
}

function buildColRows(startQ, count) {
  let rows = "";
  for (let i = 0; i < count; i++) {
    const qNum = startQ + i;
    let bubbles = "";
    for (let a = 0; a < N_ALTS; a++) {
      bubbles += '<div class="bubble"></div>';
    }
    rows += `
      <div class="q-row">
        <div class="q-num">${qNum}</div>
        <div class="bubbles">${bubbles}</div>
      </div>`;
  }
  return rows;
}

function scalePreview() {
  const sheet = document.getElementById('omr-sheet');
  const wrapper = document.getElementById('preview-wrapper');
  if (!sheet || !wrapper.classList.contains('visible')) return;

  // Reset ALL inline overrides antes de medir
  sheet.style.transform = '';
  sheet.style.transformOrigin = '';
  sheet.style.marginBottom = '';
  sheet.style.marginLeft = '';

  const SHEET_W = 794;
  const style = getComputedStyle(wrapper);
  const padH = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const available = wrapper.clientWidth - padH;
  const scale = Math.min(1, available / SHEET_W);

  if (scale < 1) {
    // Travar na borda esquerda (margin: auto não funciona quando width > container)
    sheet.style.marginLeft = '0';
    // Calcular offset para centralizar visualmente o elemento escalado
    const offset = (available - SHEET_W * scale) / 2;
    sheet.style.transformOrigin = 'top left';
    sheet.style.transform = `translateX(${offset}px) scale(${scale})`;
    // Compensar altura "fantasma" do layout box não-afetado pelo transform
    sheet.style.marginBottom = `${sheet.offsetHeight * (scale - 1)}px`;
  }
  // scale >= 1: inline styles zerados → CSS margin: 0 auto centraliza normalmente
}

window.addEventListener('resize', scalePreview);

function renderAnswerKeyEditor(nQ) {
  const section = document.getElementById('answer-key-section');
  const grid = document.getElementById('answer-key-grid');
  section.style.display = '';

  Object.keys(answerKey).forEach(k => { if (+k > nQ) delete answerKey[k]; });

  const alts = LABELS.slice(0, N_ALTS).split('');
  const COL_SIZE = 25;
  let html = '';

  for (let colStart = 1; colStart <= nQ; colStart += COL_SIZE) {
    html += '<div class="ak-col">';
    const colEnd = Math.min(colStart + COL_SIZE - 1, nQ);
    for (let q = colStart; q <= colEnd; q++) {
      const btns = alts.map(l =>
        `<button class="ak-btn${answerKey[q] === l ? ' selected' : ''}"
                 onclick="setAnswer(${q},'${l}')">${l}</button>`
      ).join('');
      html += `<div class="ak-row" data-q="${q}"><span class="ak-q-num">${q}</span><div class="ak-btns">${btns}</div></div>`;
    }
    html += '</div>';
  }
  grid.innerHTML = html;
}

function setAnswer(q, letter) {
  answerKey[q] = answerKey[q] === letter ? null : letter;
  const row = document.querySelector(`#answer-key-grid .ak-row[data-q="${q}"]`);
  if (!row) return;
  row.querySelectorAll('.ak-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === answerKey[q]);
  });
}

function clearAnswerKey() {
  answerKey = {};
  document.querySelectorAll('#answer-key-grid .ak-btn').forEach(btn =>
    btn.classList.remove('selected')
  );
}

function saveAnswerKey() {
  const nQ = clamp(document.getElementById("input-questions").value, 1, 200);
  const name = document.getElementById("input-title").value.trim() || "GABARITO";

  for (let q = 1; q <= nQ; q++) {
    if (!answerKey[q]) {
      showSaveFeedback(`Questão ${q} não respondida. Complete o gabarito antes de salvar.`, 'error');
      return;
    }
  }

  const saved = JSON.parse(localStorage.getItem('omr_saved_keys') || '[]');
  saved.unshift({ id: Date.now(), name, nQ, answers: { ...answerKey }, savedAt: new Date().toISOString() });
  localStorage.setItem('omr_saved_keys', JSON.stringify(saved));
  showSaveFeedback('Gabarito salvo com sucesso!', 'success');
}

function showSaveFeedback(msg, type) {
  const el = document.getElementById('ak-save-feedback');
  el.textContent = msg;
  el.className = `ak-save-feedback ak-save-feedback--${type}`;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 3500);
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
