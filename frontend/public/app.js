// All calls go to a relative /api path on the same origin as this page.
// nginx (which serves this file) forwards /api/* to the backend service, so the
// browser never needs the backend's address and no CORS setup is required.
// The frontend has no database driver, connection string or credentials.
const API = '/api';

const tableBody = document.getElementById('loans');
const errorBox = document.getElementById('error');
const form = document.getElementById('loan-form');
const formMessage = document.getElementById('form-message');

// Build cells with textContent (never innerHTML) so a borrower name like
// "<script>" is shown as text instead of being executed (no XSS).
function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function renderLoans(loans) {
  tableBody.replaceChildren(...loans.map((loan) => {
    const tr = document.createElement('tr');
    tr.append(
      cell(loan.id),
      cell(loan.borrower_name),
      cell(Number(loan.loan_amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })),
      cell(loan.property_city),
      cell(loan.status),
      cell(new Date(loan.created_at).toLocaleString()),
    );
    return tr;
  }));
}

async function loadLoans() {
  try {
    const res = await fetch(`${API}/loans`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    renderLoans(data.loans);
    document.getElementById('count').textContent = `(${data.count})`;
    document.getElementById('pod').textContent = data.pod;
    errorBox.hidden = true;
  } catch (err) {
    errorBox.textContent = `Could not load loans: ${err.message}`;
    errorBox.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  try {
    const res = await fetch(`${API}/loans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API returned ${res.status}`);
    formMessage.textContent = `Added loan #${data.loan.id}`;
    form.reset();
    await loadLoans();
  } catch (err) {
    formMessage.textContent = `Could not add loan: ${err.message}`;
  }
});

loadLoans();
