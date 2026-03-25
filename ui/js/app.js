const resource = window.location.hostname.replace('cfx-nui-', '');

// ── Custom autocomplete ────────────────────────────────────────

const BASE_TYPE_SUGGESTIONS = [
    { value: 'leo',      label: 'LEO — Policía' },
    { value: 'ems',      label: 'EMS — Médico' },
    { value: 'mechanic', label: 'Mecánico' },
    { value: 'taxi',     label: 'Taxi' },
    { value: 'judge',    label: 'Juez' },
    { value: 'lawyer',   label: 'Abogado' },
];

let dynamicTypeSuggestions = [...BASE_TYPE_SUGGESTIONS];

function updateTypeSuggestions(usedTypes) {
    const existing = new Set(BASE_TYPE_SUGGESTIONS.map(s => s.value));
    dynamicTypeSuggestions = [...BASE_TYPE_SUGGESTIONS];
    usedTypes.forEach(type => {
        if (type !== '__none__' && !existing.has(type)) {
            dynamicTypeSuggestions.push({ value: type, label: 'Custom' });
        }
    });
}

function initTypeAutocomplete() {
    const input    = document.getElementById('job-type');
    const dropdown = document.getElementById('job-type-dropdown');
    let activeIdx  = -1;

    function renderDropdown(filter) {
        const val = filter.toLowerCase();
        const matches = dynamicTypeSuggestions.filter(s =>
            s.value.includes(val) || s.label.toLowerCase().includes(val)
        );

        if (matches.length === 0) { dropdown.style.display = 'none'; return; }

        dropdown.innerHTML = '';
        activeIdx = -1;
        matches.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = 'custom-dropdown-item';
            div.innerHTML = `<strong>${s.value}</strong><span class="hint">${s.label}</span>`;
            div.addEventListener('mousedown', e => {
                e.preventDefault();
                input.value = s.value;
                dropdown.style.display = 'none';
            });
            dropdown.appendChild(div);
        });
        dropdown.style.display = 'block';
    }

    input.addEventListener('input', () => renderDropdown(input.value));
    input.addEventListener('focus', () => { if (input.value === '') renderDropdown(''); });
    input.addEventListener('blur',  () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));

    input.addEventListener('keydown', e => {
        const items = dropdown.querySelectorAll('.custom-dropdown-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
        } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            input.value = items[activeIdx].querySelector('strong').textContent;
            dropdown.style.display = 'none';
            return;
        } else {
            return;
        }
        items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
    });
}

document.addEventListener('DOMContentLoaded', initTypeAutocomplete);

let allJobs = {};
let selectedJob = null;
let editingJob = false; // true = editar, false = crear
let activeTypeFilters = new Set(); // vacío = todos
let pendingSelect = null; // job a seleccionar tras próximo refreshJobs

// ── NUI messaging ──────────────────────────────────────────────

window.addEventListener('message', ({ data }) => {
    switch (data.type) {
        case 'show':
            showApp();
            nuiFetch('getJobs', {});
            break;
        case 'hide':
            hideApp();
            break;
        case 'refreshJobs':
            allJobs = data.jobs || {};
            renderTypeFilters();
            if (pendingSelect && allJobs[pendingSelect]) {
                selectedJob = pendingSelect;
                pendingSelect = null;
            }
            renderJobList();
            if (selectedJob && allJobs[selectedJob]) {
                renderJobDetail(selectedJob);
            } else if (selectedJob && !allJobs[selectedJob]) {
                document.getElementById('job-detail').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">&#9965;</div>
                        <p>Selecciona un job para ver sus detalles</p>
                    </div>`;
                selectedJob = null;
            }
            break;
        case 'notify':
            showToast(data.message, data.success ? 'success' : 'error');
            break;
    }
});

function nuiFetch(endpoint, body) {
    return fetch(`https://${resource}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).catch(() => {});
}

// ── Visibility ─────────────────────────────────────────────────

function showApp() {
    document.getElementById('app').classList.add('visible');
}

function hideApp() {
    document.getElementById('app').classList.remove('visible');
    closeModal('modal-job');
    closeModal('modal-grade');
}

function close() {
    nuiFetch('close', {});
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-overlay.visible');
        if (modals.length > 0) {
            modals.forEach(m => m.classList.remove('visible'));
        } else {
            close();
        }
    }
});

document.getElementById('btn-close').addEventListener('click', close);

// ── Type filters ───────────────────────────────────────────────

function getUsedTypes() {
    const types = new Set();
    Object.values(allJobs).forEach(job => {
        if (job.type && job.type !== '') types.add(job.type);
        else types.add('__none__');
    });
    return types;
}

function updateFilterLabel() {
    const label = document.getElementById('type-filter-label');
    const btn   = document.getElementById('type-filter-btn');
    if (activeTypeFilters.size === 0) {
        label.textContent = 'Todos los tipos';
        btn.classList.remove('active');
    } else {
        const names = [...activeTypeFilters].map(t => t === '__none__' ? 'sin tipo' : t);
        label.textContent = names.join(', ');
        btn.classList.add('active');
    }
}

function renderTypeFilters() {
    const dropdown = document.getElementById('type-filter-dropdown');
    const types    = getUsedTypes();
    dropdown.innerHTML = '';

    types.forEach(type => {
        const div = document.createElement('div');
        div.className = 'type-filter-item' + (activeTypeFilters.has(type) ? ' selected' : '');
        div.innerHTML = `<span>${type === '__none__' ? '<em>sin tipo</em>' : `<strong>${type}</strong>`}</span><span class="check">&#10003;</span>`;
        div.addEventListener('click', () => {
            if (activeTypeFilters.has(type)) activeTypeFilters.delete(type);
            else activeTypeFilters.add(type);
            div.classList.toggle('selected', activeTypeFilters.has(type));
            updateFilterLabel();
            renderJobList(document.getElementById('search-input').value);
        });
        dropdown.appendChild(div);
    });

    updateFilterLabel();
    updateTypeSuggestions(types);
}

// Toggle dropdown
document.addEventListener('DOMContentLoaded', () => {
    const btn      = document.getElementById('type-filter-btn');
    const dropdown = document.getElementById('type-filter-dropdown');

    btn.addEventListener('click', () => {
        const open = dropdown.style.display === 'block';
        dropdown.style.display = open ? 'none' : 'block';
    });

    document.addEventListener('click', e => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
});

// ── Render job list ────────────────────────────────────────────

function renderJobList(filter = '') {
    const list = document.getElementById('job-list');
    list.innerHTML = '';

    const lower = filter.toLowerCase();
    const entries = Object.entries(allJobs).filter(([name, job]) => {
        const matchText = name.includes(lower) || (job.label || '').toLowerCase().includes(lower);
        const matchType = activeTypeFilters.size === 0 ||
            (activeTypeFilters.has('__none__') && (!job.type || job.type === '')) ||
            (job.type && activeTypeFilters.has(job.type));
        return matchText && matchType;
    });

    if (entries.length === 0) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">Sin resultados</div>';
        return;
    }

    entries.sort((a, b) => a[0].localeCompare(b[0]));

    entries.forEach(([name, job]) => {
        const div = document.createElement('div');
        div.className = 'job-item' + (name === selectedJob ? ' active' : '');
        div.dataset.name = name;

        const badgeText = job.type || '';
        const badgeClass = job.type === 'leo' ? 'leo' : job.type === 'ems' ? 'ems' : '';

        div.innerHTML = `
            <span class="job-item-name" title="${name}">${job.label || name}</span>
            ${badgeText ? `<span class="job-item-badge ${badgeClass}">${badgeText}</span>` : ''}
        `;

        div.addEventListener('click', () => {
            selectedJob = name;
            document.querySelectorAll('.job-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            renderJobDetail(name);
        });

        list.appendChild(div);
    });
}

document.getElementById('search-input').addEventListener('input', e => {
    renderJobList(e.target.value);
});

// ── Render job detail ──────────────────────────────────────────

function renderJobDetail(jobName) {
    const job = allJobs[jobName];
    if (!job) return;

    const gradeCount = Object.keys(job.grades || {}).length;
    const isDefault = jobName === 'unemployed';

    const detail = document.getElementById('job-detail');
    detail.innerHTML = `
        <div class="detail-header">
            <div>
                <div class="detail-title">${job.label || jobName}</div>
                <div class="detail-subtitle">${jobName}</div>
            </div>
            <div class="detail-actions">
                <button class="btn btn-accent" onclick="openEditJob('${jobName}')">Editar</button>
                ${!isDefault ? `<button class="btn btn-red" onclick="confirmDelete('${jobName}')">Eliminar</button>` : ''}
            </div>
        </div>

        <div class="info-grid">
            <div class="info-card">
                <div class="info-card-label">Tipo</div>
                <div class="info-card-value">${job.type || '—'}</div>
            </div>
            <div class="info-card">
                <div class="info-card-label">Default Duty</div>
                <div class="info-card-value" style="color:${job.defaultDuty ? 'var(--green)' : 'var(--red)'}">
                    ${job.defaultDuty ? 'Sí' : 'No'}
                </div>
            </div>
            <div class="info-card">
                <div class="info-card-label">Off-duty Pay</div>
                <div class="info-card-value" style="color:${job.offDutyPay ? 'var(--green)' : 'var(--red)'}">
                    ${job.offDutyPay ? 'Sí' : 'No'}
                </div>
            </div>
        </div>

        <div class="grades-section-header">
            <span class="grades-section-title">Grados (${gradeCount})</span>
            <button class="btn-small btn-green" onclick="openAddGrade('${jobName}')">+ Añadir grado</button>
        </div>

        <table class="grades-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Nombre</th>
                    <th>Pago</th>
                    <th>Flags</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="grades-body">
            </tbody>
        </table>
    `;

    renderGrades(jobName);
}

function renderGrades(jobName) {
    const job = allJobs[jobName];
    const tbody = document.getElementById('grades-body');
    if (!tbody || !job) return;

    tbody.innerHTML = '';
    const grades = Object.entries(job.grades || {}).sort((a, b) => Number(a[0]) - Number(b[0]));

    if (grades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">Sin grados</td></tr>`;
        return;
    }

    grades.forEach(([grade, data]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${grade}</strong></td>
            <td>${data.name || ''}</td>
            <td>$${data.payment || 0}</td>
            <td>
                ${data.isboss   ? '<span class="badge badge-boss">BOSS</span> ' : ''}
                ${data.bankAuth ? '<span class="badge badge-bank">BANCO</span>' : ''}
            </td>
            <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end;">
                <button class="btn-icon" title="Editar" onclick="openEditGrade('${jobName}', ${grade})">&#9998;</button>
                <button class="btn-icon danger" title="Eliminar" onclick="removeGrade('${jobName}', ${grade})">&#x2715;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Job modal ──────────────────────────────────────────────────

document.getElementById('btn-new-job').addEventListener('click', () => {
    editingJob = false;
    document.getElementById('modal-job-title').textContent = 'Crear Job';
    document.getElementById('job-name').value = '';
    document.getElementById('job-name').disabled = false;
    document.getElementById('job-label').value = '';
    document.getElementById('job-type').value = '';
    document.getElementById('job-default-duty').value = 'true';
    document.getElementById('job-off-duty-pay').value = 'false';
    openModal('modal-job');
});

function openEditJob(jobName) {
    const job = allJobs[jobName];
    if (!job) return;
    editingJob = true;
    document.getElementById('modal-job-title').textContent = 'Editar Job';
    document.getElementById('job-name').value = jobName;
    document.getElementById('job-name').disabled = true;
    document.getElementById('job-label').value = job.label || '';
    document.getElementById('job-type').value = job.type || '';
    document.getElementById('job-default-duty').value = String(job.defaultDuty ?? true);
    document.getElementById('job-off-duty-pay').value = String(job.offDutyPay ?? false);
    openModal('modal-job');
}

document.getElementById('btn-save-job').addEventListener('click', () => {
    const name     = document.getElementById('job-name').value.trim();
    const label    = document.getElementById('job-label').value.trim();
    const jobType  = document.getElementById('job-type').value;
    const defDuty  = document.getElementById('job-default-duty').value === 'true';
    const offPay   = document.getElementById('job-off-duty-pay').value === 'true';

    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    if (!label) { showToast('El label es obligatorio', 'error'); return; }

    if (editingJob) {
        nuiFetch('updateJob', { name, label, jobType, defaultDuty: defDuty, offDutyPay: offPay });
    } else {
        const jobName = name.toLowerCase().replace(/\s+/g, '_');
        pendingSelect = jobName;
        nuiFetch('createJob', { name, label, jobType, defaultDuty: defDuty, offDutyPay: offPay });
    }

    closeModal('modal-job');
});

// ── Grade modal ────────────────────────────────────────────────

let currentGradeJob = null;
let editingGradeNum = null;

function openAddGrade(jobName) {
    currentGradeJob = jobName;
    editingGradeNum = null;
    document.getElementById('modal-grade-title').textContent = 'Añadir Grado';
    document.getElementById('grade-num').value = '';
    document.getElementById('grade-num').disabled = false;
    document.getElementById('grade-name').value = '';
    document.getElementById('grade-payment').value = '';
    document.getElementById('grade-isboss').checked = false;
    document.getElementById('grade-bankauth').checked = false;
    openModal('modal-grade');
}

function openEditGrade(jobName, gradeNum) {
    const job = allJobs[jobName];
    if (!job) return;
    const grade = job.grades[gradeNum];
    if (!grade) return;

    currentGradeJob = jobName;
    editingGradeNum = gradeNum;
    document.getElementById('modal-grade-title').textContent = 'Editar Grado';
    document.getElementById('grade-num').value = gradeNum;
    document.getElementById('grade-num').disabled = true;
    document.getElementById('grade-name').value = grade.name || '';
    document.getElementById('grade-payment').value = grade.payment || 0;
    document.getElementById('grade-isboss').checked = !!grade.isboss;
    document.getElementById('grade-bankauth').checked = !!grade.bankAuth;
    openModal('modal-grade');
}

document.getElementById('btn-save-grade').addEventListener('click', () => {
    const gradeNum  = document.getElementById('grade-num').value;
    const gradeName = document.getElementById('grade-name').value.trim();
    const payment   = document.getElementById('grade-payment').value;
    const isboss    = document.getElementById('grade-isboss').checked;
    const bankAuth  = document.getElementById('grade-bankauth').checked;

    if (gradeNum === '' || gradeNum < 0) { showToast('Número de grado inválido', 'error'); return; }
    if (!gradeName) { showToast('El nombre del grado es obligatorio', 'error'); return; }

    nuiFetch('upsertGrade', {
        jobName: currentGradeJob,
        grade: Number(gradeNum),
        gradeName,
        payment: Number(payment) || 0,
        isboss,
        bankAuth
    });

    closeModal('modal-grade');
});

function removeGrade(jobName, gradeNum) {
    nuiFetch('removeGrade', { jobName, grade: gradeNum });
}

// ── Delete job ─────────────────────────────────────────────────

function confirmDelete(jobName) {
    document.getElementById('modal-confirm-text').textContent =
        `¿Seguro que quieres eliminar el job "${jobName}"? Esta acción es irreversible.`;

    const btn = document.getElementById('btn-confirm-delete');
    btn.onclick = () => {
        nuiFetch('deleteJob', { name: jobName });
        selectedJob = null;
        closeModal('modal-confirm');
        document.getElementById('job-detail').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#9965;</div>
                <p>Selecciona un job para ver sus detalles</p>
            </div>`;
    };

    openModal('modal-confirm');
}

// ── Modal helpers ──────────────────────────────────────────────

function openModal(id) {
    document.getElementById(id).classList.add('visible');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('visible');
}

// ── Toast ──────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast ' + type;
    toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
