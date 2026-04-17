import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as fbOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- ТОХИРГОО ---
const cfg = {
    apiKey: "AIzaSyAIG54jlntVl7b5Y4MHR2IxDNHA7Xp3KeE",
    authDomain: "talst-act.firebaseapp.com",
    projectId: "talst-act",
    storageBucket: "talst-act.firebasestorage.app",
    messagingSenderId: "306368853099",
    appId: "1:306368853099:web:c94fa0ae7f9a02a3f72d2e"
};

const EJS_SVC = 'service_op473um';
const EJS_TPL = 'template_k05csyl';
emailjs.init('Bck-y_wlCHwjWp7pA');

const CHAIN = [
    { name: 'Координатор', email: 'unumunkh@talstgroup.mn' },
    { name: 'Инженер', email: 'mimirim2828@gmail.com' },
    { name: 'Захирал', email: 'barsbat@talstgroup.mn' },
    { name: 'Нягтлан', email: 'zorigoo@talstgroup.mn' },
];

const ROLES = {
    'unumunkh@talstgroup.mn': 'Координатор',
    'zolzaya@talstgroup.mn': 'Инженер', // Энд mimirim2828@gmail.com байх ёстой бол солиорой
    'barsbat@talstgroup.mn': 'Захирал',
    'zorigoo@talstgroup.mn': 'Нягтлан',
};

const ROLE_COLORS = {
    'Координатор': '#e74c3c', 'Инженер': '#3498db',
    'Захирал': '#8e44ad', 'Нягтлан': '#27ae60', 'Гүйцэтгэгч': '#e67e22',
};

const RSTEP = { 'Координатор': 0, 'Инженер': 1, 'Захирал': 2, 'Нягтлан': 3 };
const SN = ['Координатор', 'Инженер', 'Захирал', 'Нягтлан'];
const SE = ['unumunkh@talstgroup.mn', 'zolzaya@talstgroup.mn', 'barsbat@talstgroup.mn', 'zorigoo@talstgroup.mn'];

// --- FIREBASE INIT ---
const fapp = initializeApp(cfg);
const auth = getAuth(fapp);
const db = getFirestore(fapp);

let cu = null, role = 'Гүйцэтгэгч', acts = [], prev = 2, ctab = 0, unsub = null;
let pdfDataList = [];
const e = id => document.getElementById(id);

// --- ТУСЛАХ ФУНКЦҮҮД ---
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function ts() { return new Date().toLocaleString('mn-MN') }
function gh() { return 'sha256:' + Math.random().toString(36).substr(2, 8) + '...' + Math.random().toString(36).substr(2, 4) }
function pct(a) { return a.status === 'done' ? 100 : Math.round((a.step || 0) / 4 * 100) }
function bc(a) {
    if (a.status === 'done') return 'bd';
    if (a.status === 'rejected') return 'br';
    const s = a.step || 0;
    return ['bw', 'bp', 'b1', 'b2', 'b3'][s] || 'bp';
}
function bt(a) { return a.status === 'done' ? '✓ Батлагдсан' : a.status === 'rejected' ? '✕ Буцаагдсан' : SN[a.step || 0] + ' хүлээж байна' }
function fmtN(n) { return parseInt(n || 0).toLocaleString('mn-MN') }

// --- ГАДААД ДУУДАХ ФУНКЦҮҮД (Window object) ---
window.fmtAmt = () => { const v = e('fa').value; e('amtFmt').textContent = v && !isNaN(v) ? '₮ ' + parseInt(v).toLocaleString() : ''; };

window.addPdfs = async (input) => {
    const files = Array.from(input.files); if (!files.length) return;
    e('compInfo').textContent = 'PDF боловсруулж байна...';
    for (const f of files) {
        if (f.type !== 'application/pdf') { toast('Зөвхөн PDF файл сонгоно уу: ' + f.name, 'err'); continue; }
        pdfDataList.push(await readPdfAsBase64(f));
    }
    renderPdfList();
    const total = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    e('compInfo').textContent = `${pdfDataList.length} PDF · нийт ~${total}KB`;
    input.value = '';
};

window.rmPdf = (i) => {
    pdfDataList.splice(i, 1); renderPdfList();
    const total = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    e('compInfo').textContent = pdfDataList.length ? `${pdfDataList.length} PDF · ~${total}KB` : '';
};

window.signInGoogle = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (err) { toast('Нэвтрэхэд алдаа гарлаа', 'err') }
};

window.doSignOut = async () => { if (confirm('Гарах уу?')) { if (unsub) unsub(); await fbOut(auth) } };
window.go = go; window.bk = bk; window.opd = opd;
window.submitAct = submitAct; window.approve = approve; window.reject = reject;

// --- ҮНДСЭН ЛОГИК ---
function readPdfAsBase64(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = ev => resolve({ name: file.name, base64: ev.target.result, sizeKb: Math.round(file.size / 1024) });
        reader.readAsDataURL(file);
    });
}

function renderPdfList() {
    e('pdfList').innerHTML = pdfDataList.map((d, i) => `
    <div class="pdf-item">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmPdf(${i})">✕</div>
    </div>`).join('');
}

function toast(m, t = 'ok') {
    const el = e('toast'); el.textContent = m;
    el.className = 'toast ' + (t === 'ok' ? 'tok' : 'terr');
    el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 4000);
}

function sendMail(toEmail, toName, act, fromName) {
    return emailjs.send(EJS_SVC, EJS_TPL, {
        to_email: toEmail, to_name: toName, company: act.company, contract: act.contract,
        work: act.work, amount: fmtN(act.amount), from_name: fromName, email: toEmail, name: fromName,
    }).then(r => console.log('✅', r)).catch(err => { console.error('❌', err); throw err; });
}

onAuthStateChanged(auth, u => {
    if (u) {
        cu = u; role = ROLES[u.email] || 'Гүйцэтгэгч';
        e('loginPage').style.display = 'none'; e('appPage').style.display = 'block';
        const ini = (u.displayName || u.email).split(' ').map(n => n[0]).join('').toUpperCase().substr(0, 2);
        e('uav').textContent = ini; e('uav').style.background = ROLE_COLORS[role] || '#888';
        const SHORT_NAMES = { 'unumunkh@talstgroup.mn': 'Б.Өнөмөнх', 'zolzaya@talstgroup.mn': 'А.Золзаяа', 'barsbat@talstgroup.mn': 'Д.Барсат', 'zorigoo@talstgroup.mn': 'Ө.Зоригоо', 'bayarmaa@talstgroup.mn': 'Д.Баярмаа' };
        e('uname').textContent = SHORT_NAMES[u.email] || u.displayName || u.email;
        e('urole').textContent = role;
        e('aplbl').textContent = role + ' горимд батлах актууд';
        listen();
    } else {
        cu = null; e('loginPage').style.display = 'flex'; e('appPage').style.display = 'none';
        if (unsub) { unsub(); unsub = null; }
    }
});

function listen() {
    const q = query(collection(db, 'acts'), orderBy('createdAt', 'desc'));
    unsub = onSnapshot(q, snap => {
        acts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (ctab === 1) rA(); if (ctab === 2) rL(); if (ctab === 3) rD();
        if (e('pd').style.display !== 'none') {
            const idx = parseInt(e('dc').dataset.idx || '-1');
            if (idx >= 0) e('dc').innerHTML = detH(idx);
        }
    });
}

function go(n) {
    [0, 1, 2, 3].forEach(i => { e('p' + i).style.display = 'none'; e('tb' + i).classList.remove('on') });
    e('pd').style.display = 'none';
    e('p' + n).style.display = 'block'; e('tb' + n).classList.add('on'); ctab = n;
    if (n === 1) rA(); if (n === 2) rL(); if (n === 3) rD();
}

function bk() {
    e('pd').style.display = 'none';
    e('p' + prev).style.display = 'block'; e('tb' + prev).classList.add('on'); ctab = prev;
}

function opd(idx, from) {
    prev = from;
    [0, 1, 2, 3].forEach(i => { e('p' + i).style.display = 'none'; e('tb' + i).classList.remove('on') });
    e('pd').style.display = 'block'; e('dc').dataset.idx = idx; e('dc').innerHTML = detH(idx);
}

async function submitAct() {
    const c = e('fc').value.trim(), g = e('fg').value.trim(), w = e('fw').value.trim(), a = e('fa').value.trim();
    if (!c || !g || !w || !a) { toast('Компани, гэрээ, ажил, дүн заавал!', 'err'); return; }
    const totalKb = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    if (totalKb > 2048) { toast(`PDF нийт ${totalKb}KB — 2MB-аас бага байх ёстой.`, 'err'); return; }
    const btn = e('sbtn'); btn.disabled = true; btn.textContent = 'Илгээж байна...';
    e('progWrap').style.display = 'block'; e('progText').style.display = 'block';
    e('progBar').style.width = '20%'; e('progText').textContent = 'Мэдээлэл бэлдэж байна...';
    const aid = 'АКТ-' + new Date().getFullYear() + '-' + String(Date.now()).substr(-4);
    try {
        e('progBar').style.width = '60%'; e('progText').textContent = 'Firestore-д хадгалж байна...';
        const actData = {
            actId: aid, date: new Date().toLocaleDateString('mn-MN'),
            company: c, contract: g, work: w, dateFrom: e('fd1').value, dateTo: e('fd2').value, amount: a,
            pdfs: pdfDataList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb })),
            pdfCount: pdfDataList.length, step: 0, status: 'pending',
            submittedBy: cu.email, submittedByName: cu.displayName || cu.email,
            createdAt: serverTimestamp(),
            evs: [{
                type: 'submit', who: cu.displayName || cu.email, whoEmail: cu.email,
                title: 'Акт илгээсэн',
                detail: c + ' · ' + g + ' · ₮' + fmtN(a) + (pdfDataList.length ? ` · ${pdfDataList.length} PDF (~${totalKb}KB)` : ' · Баримтгүй'),
                time: ts(), hash: gh()
            }]
        };
        await addDoc(collection(db, 'acts'), actData);
        e('progBar').style.width = '85%'; e('progText').textContent = 'Email илгээж байна...';
        await sendMail(CHAIN[0].email, CHAIN[0].name, actData, cu.displayName || cu.email);
        e('progBar').style.width = '100%';
        toast('✅ Акт илгээгдлээ! Координаторт email очлоо.');
        ['fc', 'fg', 'fw', 'fd1', 'fd2', 'fa'].forEach(id => e(id).value = '');
        pdfDataList = []; e('pdfList').innerHTML = ''; e('compInfo').textContent = ''; e('amtFmt').textContent = '';
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); console.error(err); }
    btn.disabled = false; btn.textContent = 'Акт илгээх';
    setTimeout(() => { e('progWrap').style.display = 'none'; e('progText').style.display = 'none'; e('progBar').style.width = '0%'; }, 1500);
}

async function approve(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a || a.status !== 'pending') { toast('Батлах боломжгүй!', 'err'); return; }
    if (RSTEP[role] !== a.step) { toast('Та энэ актыг батлах эрхгүй!', 'err'); return; }
    const newEvs = [...(a.evs || []), {
        type: 'approve', who: cu.displayName || cu.email, whoEmail: cu.email,
        title: role + ' батлав ✓', detail: cu.email + ' · Google нэвтрэлтээр баталгаажсан', time: ts(), hash: gh()
    }];
    const ns = (a.step || 0) + 1; const done = ns >= 4;
    const upd = { step: ns, evs: newEvs };
    if (done) {
        upd.status = 'done';
        upd.evs = [...newEvs, {
            type: 'done', who: 'Систем', title: '🎉 Бүрэн батлагдсан',
            detail: 'Нягтланд мэдэгдэл очлоо · Гүйлгээ хийх боломжтой', time: ts(), hash: gh()
        }];
    }
    try {
        await updateDoc(doc(db, 'acts', docId), upd);
        if (done) { await sendMail(CHAIN[3].email, CHAIN[3].name, a, cu.displayName || cu.email); toast('🎉 Бүрэн батлагдлаа! Нягтланд email очлоо.'); }
        else { await sendMail(CHAIN[ns].email, CHAIN[ns].name, a, cu.displayName || cu.email); toast('✅ ' + SN[ns] + ' уруу илгээгдлээ.'); }
        rA();
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); }
}

async function reject(docId) {
    const a = acts.find(x => x.id === docId); if (!a) return;
    const reason = prompt('Буцаасан шалтгаан:') || 'Тодруулгатай байна';
    const newEvs = [...(a.evs || []), {
        type: 'reject', who: cu.displayName || cu.email, whoEmail: cu.email,
        title: role + ' буцаав ✕', detail: 'Шалтгаан: ' + reason, time: ts(), hash: gh()
    }];
    try {
        await updateDoc(doc(db, 'acts', docId), { status: 'rejected', evs: newEvs, rejectedAt: serverTimestamp() });
        toast('❌ Акт буцаагдлаа.'); bk();
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); }
}

// --- RENDERING (HTML GENERATION) ---
function evH(ev, isLast) {
    const dc = ev.type === 'approve' || ev.type === 'done' || ev.type === 'submit' ? 'dd' : ev.type === 'reject' ? 'dj' : 'da';
    const ic = ev.type === 'approve' || ev.type === 'done' || ev.type === 'submit' ? '✓' : ev.type === 'reject' ? '✕' : '→';
    const lk = ev.type === 'submit' || ev.type === 'approve' || ev.type === 'done' ? '🔒' : '🔓';
    return `<div class="tli">
    <div class="tll"><div class="dot ${dc}">${ic}</div>${!isLast ? '<div class="dline ld"></div>' : ''}</div>
    <div class="tlr"><div class="tlcard">
      <div class="tlch">
        <div><div class="tlwho">${esc(ev.who)} · ${esc(ev.whoEmail || '')}</div><div class="tltitle">${esc(ev.title)}</div></div>
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:12px">${lk}</span><div class="tltime">${ev.time || ''}</div></div>
      </div>
      <div class="tlcb">
        <div class="tldtl">${esc(ev.detail)}</div>
        <div class="hashrow"><span style="font-size:10px">🔐</span><div class="hashval">${ev.hash || ''} · ${ev.time || ''}</div></div>
      </div>
    </div></div>
  </div>`;
}

function wevH(i, isLast) {
    return `<div class="tli">
    <div class="tll"><div class="dot dw" style="font-size:10px">${i + 1}</div>${!isLast ? '<div class="dline lw"></div>' : ''}</div>
    <div class="tlr"><div class="tlcard tlwait">
      <div class="tlch"><div><div class="tlwho">${SE[i]}</div><div class="tltitle">${SN[i]} хүлээгдэж байна...</div></div></div>
    </div></div>
  </div>`;
}

function detH(idx) {
    const a = acts[idx]; if (!a) return '';
    const p = pct(a); const step = a.step || 0;
    const canA = a.status === 'pending' && role !== 'Гүйцэтгэгч' && RSTEP[role] === step;
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : a.dateFrom || a.dateTo || '—';
    let pdfsHtml = '';
    if (a.pdfs && a.pdfs.length) {
        pdfsHtml = '<div class="det-pdfs">' + a.pdfs.map(pdf => `
      <div class="det-pdf-item">
        <span style="font-size:18px">📄</span>
        <span class="det-pdf-name">${esc(pdf.name)}</span>
        <span class="det-pdf-size">${pdf.sizeKb}KB</span>
        <a class="det-pdf-open" href="${pdf.base64}" download="${esc(pdf.name)}" onclick="event.stopPropagation()">Татах</a>
      </div>`).join('') + '</div>';
    }
    let tl = (a.evs || []).map(ev => evH(ev, false)).join('');
    if (a.status === 'pending') for (let i = step; i < 4; i++) tl += wevH(i, i === 3);
    return `<div class="card">
    <div class="ch">
      <div><div class="cid">${esc(a.actId)} · ${esc(a.date)}</div><div class="ctitle">${esc(a.work)}</div></div>
      <span class="badge ${bc(a)}">${bt(a)}</span>
    </div>
    <div class="cb">
      <div class="row"><span class="rl">Компани</span><span class="rv">${esc(a.company)}</span></div>
      <div class="row"><span class="rl">Гэрээний дугаар</span><span class="rv">${esc(a.contract)}</span></div>
      <div class="row"><span class="rl">Ажлын хугацаа</span><span class="rv">${esc(dr)}</span></div>
      <div class="row"><span class="rl">Дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>
      <div class="row"><span class="rl">Илгээсэн</span><span class="rv">${esc(a.submittedByName || a.submittedBy || '—')}</span></div>
      ${a.pdfCount ? `<div class="row"><span class="rl">Баримт бичгүүд</span><span class="rv">${a.pdfCount} PDF файл</span></div>` : ''}
    </div>
    ${pdfsHtml}
    <div class="pbwrap"><div class="pb" style="width:${p}%"></div></div>
    <div class="plabel"><span>${p}% дууссан</span><span>${step}/4 батлалт</span></div>
    ${canA ? `<div class="abtns">
      <button class="bok" onclick="approve('${a.id}')">✓ Батлах</button>
      <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
    </div>` : ''}
    <div class="tl"><div class="tll-label">ЯВЦЫН ТҮҮХ · АУДИТ ЛОГ</div>${tl}</div>
  </div>`;
}

function liH(a, idx, from) {
    const p = pct(a); const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge ${bc(a)}">${bt(a)}</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:${p}%"></div></div>
      <span class="mpct">${p}%</span>
    </div>
  </div>`;
}

function liHDone(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const isDone = a.status === 'done';
    return `<div class="li done" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge ${isDone ? 'bd' : 'br'}">${isDone ? '✓ Батлагдсан' : '✕ Буцаагдсан'}</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:100%;background:${isDone ? '#1d9e75' : '#e74c3c'}"></div></div>
      <span class="mpct" style="color:${isDone ? '#1d9e75' : '#e74c3c'}">${isDone ? '100%' : '✕'}</span>
    </div>
  </div>`;
}

function liHRejected(a, idx, from, now, EIGHT_HOURS) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const rejTime = a.rejectedAt ? a.rejectedAt.toMillis?.() || a.rejectedAt : null;
    let timerHtml = '';
    if (rejTime) {
        const remaining = EIGHT_HOURS - (now - rejTime);
        if (remaining > 0) {
            const h = Math.floor(remaining / 3600000);
            const m = Math.floor((remaining % 3600000) / 60000);
            timerHtml = `<div class="reject-timer">🗑 ${h} цаг ${m} минутын дараа устна</div>`;
        }
    } else {
        timerHtml = '<div class="reject-timer">🗑 8 цагийн дараа устна</div>';
    }
    return `<div class="li rejected" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge br">✕ Буцаагдсан</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:100%;background:#e74c3c"></div></div>
      <span class="mpct" style="color:#e74c3c">✕</span>
    </div>
    ${timerHtml}
  </div>`;
}

function rA() {
    const el = e('al');
    if (!acts.length) { el.innerHTML = '<div class="empty">Акт байхгүй байна</div>'; return; }
    if (role === 'Гүйцэтгэгч') { el.innerHTML = '<div class="empty">Акт илгээх таб ашиглана уу</div>'; return; }
    const list = role === 'Нягтлан'
        ? acts.filter(a => a.status === 'done')
        : acts.filter(a => a.status === 'pending' && (a.step || 0) === RSTEP[role]);
    el.innerHTML = list.length ? list.map(a => liH(a, acts.indexOf(a), 1)).join('') : '<div class="empty">Таны батлах акт байхгүй байна</div>';
}

function rL() {
    const el = e('ll');
    const now = Date.now();
    const EIGHT_HOURS = 8 * 60 * 60 * 1000;
    const inProgress = acts.filter(a => a.status === 'pending' && (a.step || 0) >= 1);
    const done = acts.filter(a => a.status === 'done');
    const rejected = acts.filter(a => {
        if (a.status !== 'rejected') return false;
        const rejTime = a.rejectedAt ? a.rejectedAt.toMillis?.() || a.rejectedAt : null;
        if (rejTime && now - rejTime > EIGHT_HOURS) return false;
        return true;
    });
    if (!inProgress.length && !done.length && !rejected.length) {
        el.innerHTML = '<div class="empty">Одоогоор акт байхгүй байна</div>'; return;
    }
    let html = '';
    if (inProgress.length) {
        html += '<div class="in-progress-label">ЯВЦАД</div>';
        html += inProgress.map(a => liH(a, acts.indexOf(a), 2)).join('');
    }
    if (done.length) {
        html += '<div class="done-section-label">✓ ДУУССАН</div>';
        html += done.map(a => liHDone(a, acts.indexOf(a), 2)).join('');
    }
    if (rejected.length) {
        html += '<div class="rejected-section-label">✕ БУЦААГДСАН</div>';
        html += rejected.map(a => liHRejected(a, acts.indexOf(a), 2, now, EIGHT_HOURS)).join('');
    }
    el.innerHTML = html;
}

function fmtM(n) { return '₮' + parseInt(n || 0).toLocaleString('mn-MN'); }

let dbBarChart = null;
function rD() {
    const total = acts.length;
    const pending = acts.filter(a => a.status === 'pending');
    const done = acts.filter(a => a.status === 'done');
    const rejected = acts.filter(a => a.status === 'rejected');
    e('s0').textContent = total;
    e('s0sub').textContent = total + 'ш бүртгэгдсэн';
    e('s1').textContent = pending.length;
    e('s1sub').textContent = pending.length + 'ш батлуулж байна';
    e('s2').textContent = done.length;
    e('s2sub').textContent = done.length + 'ш бүрэн батлагдсан';
    const steps = [0, 1, 2, 3].map(i => pending.filter(a => (a.step || 0) === i).length);
    const maxS = Math.max(...steps, done.length, 1);
    [0, 1, 2, 3].forEach(i => {
        e('dBar' + i).style.width = Math.round(steps[i] / maxS * 100) + '%';
        e('dV' + i).textContent = steps[i];
    });
    e('dBarDone').style.width = Math.round(done.length / maxS * 100) + '%';
    e('dVDone').textContent = done.length;
    const totalAmt = acts.reduce((s, a) => s + parseInt(a.amount || 0), 0);
    const doneAmt = done.reduce((s, a) => s + parseInt(a.amount || 0), 0);
    e('dTotalAmt').textContent = fmtM(totalAmt);
    e('dDoneAmt').textContent = fmtM(doneAmt);
    if (typeof Chart === 'undefined') return;

    function parseActDate(dateStr) {
        if (!dateStr) return null;
        const p = String(dateStr).replace(/[.\/]/g, '-').split('-');
        if (p.length === 3) return { y: parseInt(p[0]), m: parseInt(p[1]), d: parseInt(p[2]) };
        if (p.length === 2) return { y: 0, m: parseInt(p[0]), d: parseInt(p[1]) };
        return null;
    }
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push({
            label: (d.getMonth() + 1) + '/' + (d.getDate()),
            m: d.getMonth() + 1,
            d: d.getDate(),
            y: d.getFullYear(),
        });
    }
    function actsOfDay(day) {
        return acts.filter(a => {
            const pd = parseActDate(a.date);
            if (!pd) return false;
            return pd.m === day.m && pd.d === day.d;
        });
    }
    const dayAmts = days.map(day => {
        const da = actsOfDay(day);
        if (!da.length) return 0;
        const total = da.reduce((s, a) => s + parseInt(a.amount || 0), 0);
        return total || da.length * 1000000;
    });
    const dayCounts = days.map(day => actsOfDay(day).length);
    const dayColors = days.map(day => {
        const da = actsOfDay(day);
        if (!da.length) return '#ebebeb';
        if (da.some(a => a.status === 'done')) return '#1d9e75';
        if (da.some(a => a.status === 'rejected')) return '#e24b4a';
        return '#378add';
    });
    const maxAmt = Math.max(...dayAmts, 1);
    const minVisible = maxAmt * 0.08;
    const displayAmts = dayAmts.map(v => v > 0 ? Math.max(v, minVisible * 0.3) : 0);
    if (dbBarChart) { dbBarChart.destroy(); dbBarChart = null; }
    const ctx = e('dbBarChart'); if (!ctx) return;
    dbBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days.map(d => d.label), datasets: [{
                label: 'Дүн',
                data: displayAmts,
                backgroundColor: dayColors,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const day = days[ctx.dataIndex];
                            const da = actsOfDay(day);
                            if (!da.length) return 'Акт байхгүй';
                            const total = da.reduce((s, a) => s + parseInt(a.amount || 0), 0);
                            return da.length + 'ш · ₮' + parseInt(total).toLocaleString('mn-MN');
                        },
                        title: ctx => days[ctx[0].dataIndex].label + ' · ' + dayCounts[ctx[0].dataIndex] + 'ш акт'
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888', autoSkip: false, maxRotation: 0 } },
                y: { display: false, beginAtZero: true, min: 0 },
            },
        }
    });
}