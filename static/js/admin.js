// admin.js — serialize the admin form and POST to the server

function serializeBoard() {
  const catTitleInputs = document.querySelectorAll('.cat-title-input');
  const categories = Array.from(catTitleInputs).map((titleInput, catIdx) => {
    const questions = [];
    for (let qIdx = 0; qIdx < 5; qIdx++) {
      const qInput = document.querySelector(`.q-input[data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      const aInput = document.querySelector(`.a-input[data-cat-index="${catIdx}"][data-q-index="${qIdx}"]`);
      const points = POINT_MULTIPLIER * (qIdx + 1);
      questions.push({
        id: `q-${catIdx}-${qIdx}`,
        points: points,
        question: qInput ? qInput.value.trim() : '',
        answer: aInput ? aInput.value.trim() : ''
      });
    }
    return {
      id: CATEGORIES_DATA[catIdx] ? CATEGORIES_DATA[catIdx].id : `cat-${catIdx}`,
      title: titleInput.value.trim(),
      questions: questions
    };
  });

  return {
    label: BOARD_LABEL,
    point_multiplier: POINT_MULTIPLIER,
    categories: categories
  };
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
  setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
}

async function saveBoard() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = serializeBoard();

  try {
    const res = await fetch(`/admin/${BOARD_ID}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') {
      showToast('Board saved successfully!');
    } else {
      showToast('Error saving board: ' + (data.message || 'Unknown error'), true);
    }
  } catch (err) {
    showToast('Network error: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save All Changes';
  }
}
