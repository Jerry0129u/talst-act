import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, signOut as fbOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- CAPACITOR DETECT ---
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
console.log('✅ App loaded. isNative:', isNative);

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
    { name: 'Инженер', email: 'unursaikhan@talstgroup.mn' },
    { name: 'Захирал', email: 'enkhtuul@talstgroup.mn' },
    { name: 'Нягтлан', email: 'naranzul@talstgroup.mn' },
];

const ROLES = {
    'unumunkh@talstgroup.mn': 'Координатор',
    'unursaikhan@talstgroup.mn': 'Инженер',
    'enkhtuul@talstgroup.mn': 'Захирал',
    'naranzul@talstgroup.mn': 'Нягтлан',
};

const ROLE_COLORS = {
    'Координатор': '#e74c3c', 'Инженер': '#3498db',
    'Захирал': '#8e44ad', 'Нягтлан': '#27ae60', 'Гүйцэтгэгч': '#e67e22',
};

const RSTEP = { 'Координатор': 0, 'Инженер': 1, 'Захирал': 2, 'Нягтлан': 3 };
const SN = ['Координатор', 'Инженер', 'Захирал', 'Нягтлан'];
const SE = ['unumunkh@talstgroup.mn', 'unursaikhan@talstgroup.mn', 'enkhtuul@talstgroup.mn', 'naranzul@talstgroup.mn'];

const EIGHT_HOURS = 8 * 60 * 60 * 1000;

// --- FIREBASE INIT ---
const fapp = initializeApp(cfg);
const auth = getAuth(fapp);
const db = getFirestore(fapp);

let cu = null, role = 'Гүйцэтгэгч', acts = [], prev = 2, ctab = 0, unsub = null;
let pdfDataList = [];
let cachedFont = null;
let autoDeleteInterval = null;

// Modal state
let currentPartialActId = null;
let currentRemainingActId = null;
let remainingPdfList = [];

const e = id => document.getElementById(id);

// --- ТУСЛАХ ФУНКЦҮҮД ---
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function ts() { return new Date().toLocaleString('mn-MN') }
function gh() { return 'sha256:' + Math.random().toString(36).substr(2, 8) + '...' + Math.random().toString(36).substr(2, 4) }

// Прогресс хувь — partial болон remaining-ийг бас тооцно
function pct(a) {
    if (a.status === 'done') return 100;
    if (a.status === 'partial_done') return a.approvedPercent || 100;
    if (a.status === 'partial') return Math.round(((a.step || 0) / 4 * 100));
    if (a.status === 'remaining') return 0;
    return Math.round((a.step || 0) / 4 * 100);
}

// Badge класс
function bc(a) {
    if (a.status === 'done') return 'bd';
    if (a.status === 'partial_done') return 'bpartial-done';
    if (a.status === 'rejected') return 'br';
    if (a.status === 'partial') return 'bpartial';
    if (a.status === 'remaining') return 'bremaining';
    const s = a.step || 0;
    return ['bw', 'bp', 'b1', 'b2', 'b3'][s] || 'bp';
}

// Badge текст
function bt(a) {
    if (a.status === 'done') {
        if (a.completedViaRemaining) return '✓ 100% дууссан (Нэгдсэн)';
        return '✓ Батлагдсан';
    }
    if (a.status === 'partial_done') return '⚠ Хэсэгчлэн дууссан (' + (a.approvedPercent || 0) + '%)';
    if (a.status === 'rejected') return '✕ Буцаагдсан';
    if (a.status === 'partial') return '⚠ Хэсэгчлэн (' + (a.approvedPercent || 0) + '%) · ' + SN[a.step || 0];
    if (a.status === 'remaining') return '⏳ Үлдэгдэл гүйцээх';
    return SN[a.step || 0] + ' хүлээж байна';
}

function fmtN(n) { return parseInt(n || 0).toLocaleString('mn-MN') }

function todayYMD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${dd}`;
}

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

// ★ REMAINING MODAL — PDF upload
window.addRemainingPdfs = async (input) => {
    const files = Array.from(input.files); if (!files.length) return;
    for (const f of files) {
        if (f.type !== 'application/pdf') { toast('Зөвхөн PDF файл: ' + f.name, 'err'); continue; }
        remainingPdfList.push(await readPdfAsBase64(f));
    }
    renderRemainingPdfList();
    input.value = '';
};

window.rmRemainingPdf = (i) => {
    remainingPdfList.splice(i, 1);
    renderRemainingPdfList();
};

function renderRemainingPdfList() {
    e('rmPdfList').innerHTML = remainingPdfList.map((d, i) => `
    <div class="pdf-item">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmRemainingPdf(${i})">✕</div>
    </div>`).join('');
}

// ★★★ GOOGLE SIGN-IN ★★★
window.signInGoogle = async () => {
    try {
        if (isNative) {
            const FirebaseAuthentication = window.Capacitor?.Plugins?.FirebaseAuthentication;
            if (!FirebaseAuthentication) throw new Error('FirebaseAuthentication plugin олдсонгүй');
            const result = await FirebaseAuthentication.signInWithGoogle();
            const idToken = result?.credential?.idToken;
            const accessToken = result?.credential?.accessToken;
            if (idToken) {
                const credential = GoogleAuthProvider.credential(idToken, accessToken);
                const fbResult = await signInWithCredential(auth, credential);
                if (fbResult.user) {
                    setTimeout(() => {
                        if (e('loginPage')?.style.display !== 'none') location.reload();
                    }, 1000);
                }
            } else {
                toast('Google-аас хариу ирсэнгүй', 'err');
            }
        } else {
            await signInWithPopup(auth, new GoogleAuthProvider());
        }
    } catch (err) {
        console.error('SIGN-IN ERROR:', err);
        toast('Алдаа: ' + (err?.message || 'Тодорхойгүй'), 'err');
    }
};

window.doSignOut = async () => {
    if (!confirm('Гарах уу?')) return;
    if (unsub) unsub();
    if (autoDeleteInterval) { clearInterval(autoDeleteInterval); autoDeleteInterval = null; }
    try {
        if (isNative && window.Capacitor?.Plugins?.FirebaseAuthentication) {
            await window.Capacitor.Plugins.FirebaseAuthentication.signOut();
        }
        await fbOut(auth);
    } catch (err) { console.error('Sign-out error:', err); }
};

window.go = go; window.bk = bk; window.opd = opd;
window.submitAct = submitAct; window.approve = approve; window.reject = reject;
window.downloadFinalPdf = downloadFinalPdf;

// ★ ШИНЭ FUNCTIONS — partial approval & remaining
window.openPartialModal = openPartialModal;
window.closePartialModal = closePartialModal;
window.updatePartialPreview = updatePartialPreview;
window.confirmPartialApprove = confirmPartialApprove;
window.openRemainingModal = openRemainingModal;
window.closeRemainingModal = closeRemainingModal;
window.confirmSubmitRemaining = confirmSubmitRemaining;

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
        const SHORT_NAMES = {
            'unumunkh@talstgroup.mn': 'Б.Өнөмөнх',
            'unursaikhan@talstgroup.mn': 'Инженер',
            'enkhtuul@talstgroup.mn': 'Захирал',
            'naranzul@talstgroup.mn': 'Нягтлан'
        };
        e('uname').textContent = SHORT_NAMES[u.email] || u.displayName || u.email;
        e('urole').textContent = role;
        e('aplbl').textContent = role + ' горимд батлах актууд';
        listen();
        startAutoDeleteRejected();
    } else {
        cu = null; e('loginPage').style.display = 'flex'; e('appPage').style.display = 'none';
        if (unsub) { unsub(); unsub = null; }
        if (autoDeleteInterval) { clearInterval(autoDeleteInterval); autoDeleteInterval = null; }
    }
});

function listen() {
    const q = query(collection(db, 'acts'), orderBy('createdAt', 'desc'));
    unsub = onSnapshot(q, snap => {
        acts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cleanupExpiredRejected();
        if (ctab === 0) rA0(); // Илгээх таб дээр remaining харуулах
        if (ctab === 1) rA();
        if (ctab === 2) rL();
        if (ctab === 3) rD();
        if (e('pd').style.display !== 'none') {
            const idx = parseInt(e('dc').dataset.idx || '-1');
            if (idx >= 0) e('dc').innerHTML = detH(idx);
        }
    });
}

async function cleanupExpiredRejected() {
    const now = Date.now();
    const expired = acts.filter(a => {
        if (a.status !== 'rejected') return false;
        const rejTime = a.rejectedAt ? (a.rejectedAt.toMillis?.() || a.rejectedAt) : null;
        if (!rejTime) return true;
        return (now - rejTime) > EIGHT_HOURS;
    });
    if (!expired.length) return;
    for (const a of expired) {
        try {
            await deleteDoc(doc(db, 'acts', a.id));
            console.log('🗑 Устгасан:', a.actId);
        } catch (err) { console.error('Устгах алдаа:', err); }
    }
}

function startAutoDeleteRejected() {
    if (autoDeleteInterval) clearInterval(autoDeleteInterval);
    autoDeleteInterval = setInterval(cleanupExpiredRejected, 5 * 60 * 1000);
}

function go(n) {
    [0, 1, 2, 3].forEach(i => { e('p' + i).style.display = 'none'; e('tb' + i).classList.remove('on') });
    e('pd').style.display = 'none';
    e('p' + n).style.display = 'block'; e('tb' + n).classList.add('on'); ctab = n;
    if (n === 0) rA0();
    if (n === 1) rA();
    if (n === 2) rL();
    if (n === 3) rD();
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

// ★★★ rA0: Илгээх таб дээр гүйцэтгэгчид remaining acts харуулах ★★★
function rA0() {
    if (role !== 'Гүйцэтгэгч') return;
    const myRemaining = acts.filter(a =>
        a.status === 'remaining' &&
        a.submittedBy === cu.email
    );
    let existing = e('p0RemainingSection');
    if (existing) existing.remove();
    if (myRemaining.length) {
        const html = `
            <div id="p0RemainingSection" style="margin-top:14px">
                <div class="remaining-section-label">⏳ Үлдэгдэл гүйцээх (${myRemaining.length})</div>
                ${myRemaining.map(a => liHRemainingForExecutor(a, acts.indexOf(a))).join('')}
            </div>`;
        e('p0').insertAdjacentHTML('beforeend', html);
    }
}

function liHRemainingForExecutor(a, idx) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li remaining" onclick="opd(${idx},0)">
        <div class="li-top">
            <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
            <span class="badge bremaining">⏳ Үлдэгдэл</span>
        </div>
        <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
        ${a.partialReason ? `<div class="remaining-reason">${esc(a.partialReason)}</div>` : ''}
        <button class="bcomplete" onclick="event.stopPropagation(); openRemainingModal('${a.id}')">+ Гүйцээх ажил илгээх</button>
    </div>`;
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
            actId: aid, date: todayYMD(),
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

// ★★★ APPROVE — бүтэн болон хэсэгчлэн актыг батлах ★★★
async function approve(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a || (a.status !== 'pending' && a.status !== 'partial')) { toast('Батлах боломжгүй!', 'err'); return; }
    if (RSTEP[role] !== a.step) { toast('Та энэ актыг батлах эрхгүй!', 'err'); return; }

    const isPartialAct = a.status === 'partial' || a.approvedPercent;
    const isRemainingAct = !!a.parentDocId; // үлдэгдэл актыг гүйцээж илгээсэн

    const newEvs = [...(a.evs || []), {
        type: 'approve', who: cu.displayName || cu.email, whoEmail: cu.email,
        title: role + ' батлав ✓',
        detail: cu.email + ' · Google нэвтрэлтээр баталгаажсан'
            + (isPartialAct ? ` · Хэсэгчилсэн дүн ₮${fmtN(a.approvedAmount || a.amount)} (${a.approvedPercent}%)` : '')
            + (isRemainingAct ? ` · Үлдэгдэл ₮${fmtN(a.amount)} (${100 - (a.parentApprovedPercent || 0)}%)` : ''),
        time: ts(), hash: gh()
    }];
    const ns = (a.step || 0) + 1;
    const finishedAllSteps = ns >= 4;
    const upd = { step: ns, evs: newEvs };
    let finalEvs = newEvs;

    if (finishedAllSteps) {
        if (isPartialAct) {
            // Хэсэгчлэн акт нь бүх шатыг давсан → "partial_done" status
            upd.status = 'partial_done';
            finalEvs = [...newEvs, {
                type: 'partial_done', who: 'Систем',
                title: `⚠ Хэсэгчлэн дууссан (${a.approvedPercent}%)`,
                detail: `${a.approvedPercent}% (₮${fmtN(a.approvedAmount)}) бүрэн батлагдсан · Үлдэгдэл (${100 - a.approvedPercent}%) гүйцээгдэхийг хүлээж байна`,
                time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;
        } else if (isRemainingAct) {
            // Үлдэгдэл акт бүх шатыг давсан → Эх актыг ХАЙГАД "done" болгох
            upd.status = 'done';
            finalEvs = [...newEvs, {
                type: 'done', who: 'Систем',
                title: '🎉 Үлдэгдэл бүрэн батлагдсан',
                detail: `Үлдэгдэл ажил гүйцээгдэж бүрэн батлагдлаа · Эх акт ${a.parentActId} 100% болж дууссан`,
                time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;

            // Эх актыг "done" болгох
            const parentAct = acts.find(x => x.id === a.parentDocId);
            if (parentAct && parentAct.status === 'partial_done') {
                const parentEvs = [...(parentAct.evs || []), {
                    type: 'merged_done', who: 'Систем',
                    title: '🎉 100% бүрэн дууссан (Хэсэгчлэн + Үлдэгдэл)',
                    detail: `Үлдэгдэл акт ${a.actId} (₮${fmtN(a.amount)}) гүйцээгдэн бүрэн батлагдлаа · Нийт дүн ₮${fmtN(parentAct.amount)} 100% батлагдсан`,
                    time: ts(), hash: gh()
                }];
                try {
                    await updateDoc(doc(db, 'acts', a.parentDocId), {
                        status: 'done',
                        completedViaRemaining: true,
                        remainingActId: a.actId,
                        evs: parentEvs
                    });
                } catch (e) { console.error('Parent update error:', e); }
            }
        } else {
            // Энгийн 100% акт
            upd.status = 'done';
            finalEvs = [...newEvs, {
                type: 'done', who: 'Систем', title: '🎉 Бүрэн батлагдсан',
                detail: 'Нягтланд мэдэгдэл очлоо · Гүйлгээ хийх боломжтой', time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;
        }
    }

    try {
        await updateDoc(doc(db, 'acts', docId), upd);
        if (finishedAllSteps) {
            await sendMail(CHAIN[3].email, CHAIN[3].name, a, cu.displayName || cu.email);

            if (isPartialAct) {
                toast(`⚠ Хэсэгчлэн дууслаа (${a.approvedPercent}%)! Үлдэгдэл хүлээгдэж байна.`);
            } else if (isRemainingAct) {
                toast('🎉 Үлдэгдэл батлагдан акт 100% болж дууслаа!');
                try {
                    // Эх актыг бүтэн PDF үүсгэх
                    const parentAct = acts.find(x => x.id === a.parentDocId);
                    if (parentAct) {
                        // Үлдэгдэл актын events-г "Үлдэгдэл цикл" гэж нэрлэх
                        const remainingEvents = (a.evs || []).map(ev => ({
                            ...ev,
                            title: '⏳ ' + (ev.title || ''),
                            detail: '[Үлдэгдэл цикл] ' + (ev.detail || '')
                        }));

                        // Эх актын events + үлдэгдэл актын events + одоогийн approve events
                        const mergedEvents = [
                            ...(parentAct.evs || []),
                            {
                                type: 'cycle_separator', who: 'Систем',
                                title: '═══════ ҮЛДЭГДЭЛ ЦИКЛ ЭХЭЛЛЭЭ ═══════',
                                detail: `Үлдэгдэл акт: ${a.actId} · ₮${fmtN(a.amount)}`,
                                time: ts(), hash: gh()
                            },
                            ...remainingEvents
                        ];

                        const mergedAct = {
                            ...parentAct,
                            status: 'done',
                            completedViaRemaining: true,
                            remainingActId: a.actId,
                            // Бүх PDF хослуулах (эх + үлдэгдэл)
                            pdfs: [...(parentAct.pdfs || []), ...(a.pdfs || [])],
                            pdfCount: (parentAct.pdfCount || 0) + (a.pdfCount || 0),
                            evs: mergedEvents
                        };
                        await generateFinalPdf(mergedAct);
                        toast('✅ 100% НЭГДСЭН PDF бэлэн!');
                    }
                } catch (pdfErr) {
                    console.error('Merged PDF алдаа:', pdfErr);
                }
            } else {
                toast('🎉 Бүрэн батлагдлаа! Final PDF бэлдэж байна...');
                try {
                    const actWithFinal = { ...a, ...upd, evs: finalEvs };
                    await generateFinalPdf(actWithFinal);
                    toast('✅ Final PDF бэлэн!');
                } catch (pdfErr) {
                    console.error('Final PDF алдаа:', pdfErr);
                    toast('⚠️ PDF алдаа: ' + pdfErr.message, 'err');
                }
            }
        } else {
            await sendMail(CHAIN[ns].email, CHAIN[ns].name, a, cu.displayName || cu.email);
            toast('✅ ' + SN[ns] + ' уруу илгээгдлээ.');
        }
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

// ════════════════════════════════════════════════════════════
// ★★★ ХЭСЭГЧЛЭН БАТЛАХ MODAL — PARTIAL APPROVAL ★★★
// ════════════════════════════════════════════════════════════

function openPartialModal(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (role !== 'Координатор') { toast('Зөвхөн Координатор хэсэгчлэн батлах эрхтэй', 'err'); return; }
    if (a.status !== 'pending' || (a.step || 0) !== 0) { toast('Зөвхөн анхны шалгалтын үед хэсэгчлэн батлах боломжтой', 'err'); return; }

    currentPartialActId = docId;
    e('pmActId').textContent = a.actId;
    e('pmOriginalAmt').textContent = '₮' + fmtN(a.amount);
    e('pmSlider').value = 85;
    e('pmReason').value = '';
    updatePartialPreview();
    e('partialModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closePartialModal() {
    e('partialModal').classList.remove('open');
    document.body.style.overflow = '';
    currentPartialActId = null;
}

function updatePartialPreview() {
    const a = acts.find(x => x.id === currentPartialActId);
    if (!a) return;
    const pct = parseInt(e('pmSlider').value);
    const total = parseInt(a.amount);
    const approved = Math.round(total * pct / 100);
    const remaining = total - approved;

    e('pmPercentVal').textContent = pct + '%';
    e('pmApprovedAmt').textContent = '₮' + fmtN(approved);
    e('pmApprovedPct').textContent = pct + '% батлагдана';
    e('pmRemainingAmt').textContent = '₮' + fmtN(remaining);
    e('pmRemainingPct').textContent = (100 - pct) + '% гүйцэтгэгчид буцна';
    e('pmInfoApproved').textContent = '₮' + fmtN(approved);
    e('pmInfoRemaining').textContent = '₮' + fmtN(remaining);

    // Slider track цэнхэр
    const slider = e('pmSlider');
    slider.style.background = `linear-gradient(to right, #f59e0b 0%, #f59e0b ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`;
}

async function confirmPartialApprove() {
    const a = acts.find(x => x.id === currentPartialActId);
    if (!a) return;
    const pct = parseInt(e('pmSlider').value);
    const reason = e('pmReason').value.trim();

    if (!reason) {
        toast('Шалтгаан заавал бичих ёстой!', 'err');
        e('pmReason').focus();
        return;
    }
    if (pct < 1 || pct > 99) {
        toast('Хувь 1-99 хооронд байх ёстой', 'err');
        return;
    }

    const total = parseInt(a.amount);
    const approvedAmount = Math.round(total * pct / 100);
    const remainingAmount = total - approvedAmount;

    const btn = e('pmConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Боловсруулж байна...';

    try {
        // 1) Анхны актыг "partial" status болгох + дараагийн алхам руу шилжүүлэх
        const newEvs = [...(a.evs || []), {
            type: 'partial', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: 'Координатор хэсэгчлэн батлав ⚠',
            detail: `${pct}% батлагдсан · ₮${fmtN(approvedAmount)} → Инженер уруу · ₮${fmtN(remainingAmount)} гүйцэтгэгчид буцсан · Шалтгаан: ${reason}`,
            time: ts(), hash: gh()
        }];

        const partialUpd = {
            status: 'partial',
            step: 1, // Инженер руу шилжих
            approvedPercent: pct,
            approvedAmount: approvedAmount,
            partialReason: reason,
            evs: newEvs
        };
        await updateDoc(doc(db, 'acts', currentPartialActId), partialUpd);

        // 2) Үлдэгдлийн ШИНЭ act үүсгэх (status = 'remaining')
        const remainingActId = a.actId + '-Б';
        const remainingActData = {
            actId: remainingActId,
            date: todayYMD(),
            company: a.company,
            contract: a.contract,
            work: a.work + ' (Үлдэгдэл ' + (100 - pct) + '%)',
            dateFrom: a.dateFrom || '',
            dateTo: a.dateTo || '',
            amount: String(remainingAmount),
            originalAmount: String(total),
            parentActId: a.actId,
            parentDocId: currentPartialActId,
            parentApprovedPercent: pct,
            remainingPercent: 100 - pct,
            partialReason: reason,
            pdfs: [],
            pdfCount: 0,
            step: 0,
            status: 'remaining',
            submittedBy: a.submittedBy,
            submittedByName: a.submittedByName,
            createdAt: serverTimestamp(),
            evs: [{
                type: 'remaining_created', who: cu.displayName || cu.email, whoEmail: cu.email,
                title: '⏳ Үлдэгдэл үүсгэв (' + (100 - pct) + '%)',
                detail: `Эх акт: ${a.actId} · Үлдэгдэл дүн: ₮${fmtN(remainingAmount)} (${100 - pct}%) · Шалтгаан: ${reason}`,
                time: ts(), hash: gh()
            }]
        };
        await addDoc(collection(db, 'acts'), remainingActData);

        // 3) Email-ууд
        // Инженерт мэдэгдэх
        try {
            await sendMail(CHAIN[1].email, CHAIN[1].name,
                { ...a, amount: String(approvedAmount) },
                cu.displayName || cu.email);
        } catch (e) { console.error('Engineer email:', e); }

        // Гүйцэтгэгчид мэдэгдэх (хэрэв talstgroup.mn биш бол)
        try {
            await sendMail(a.submittedBy, a.submittedByName || 'Гүйцэтгэгч',
                { ...a, amount: String(remainingAmount), work: a.work + ' (Үлдэгдэл)' },
                cu.displayName || cu.email);
        } catch (e) { console.error('Executor email:', e); }

        toast('✅ Хэсэгчлэн батлагдлаа! ' + pct + '% Инженер уруу, ' + (100 - pct) + '% гүйцэтгэгчид буцлаа.');
        closePartialModal();
        bk();
    } catch (err) {
        console.error('Partial approve error:', err);
        toast('Алдаа: ' + err.message, 'err');
    }
    btn.disabled = false;
    btn.textContent = '✓ Хэсэгчлэн батлах';
}

// ════════════════════════════════════════════════════════════
// ★★★ ҮЛДЭГДЭЛ ГҮЙЦЭЭХ MODAL — REMAINING SUBMIT ★★★
// ════════════════════════════════════════════════════════════

function openRemainingModal(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (a.status !== 'remaining') { toast('Энэ акт үлдэгдэл бус', 'err'); return; }
    if (a.submittedBy !== cu.email) { toast('Зөвхөн өөрийн актыг гүйцээх боломжтой', 'err'); return; }

    currentRemainingActId = docId;
    remainingPdfList = [];
    e('rmActId').textContent = a.actId;
    e('rmAmount').textContent = '₮' + fmtN(a.amount);
    e('rmPrevReason').textContent = a.partialReason || '—';
    e('rmCompletionNote').value = '';
    e('rmPdfList').innerHTML = '';
    e('remainingModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeRemainingModal() {
    e('remainingModal').classList.remove('open');
    document.body.style.overflow = '';
    currentRemainingActId = null;
    remainingPdfList = [];
}

async function confirmSubmitRemaining() {
    const a = acts.find(x => x.id === currentRemainingActId);
    if (!a) return;
    const note = e('rmCompletionNote').value.trim();
    if (!note) {
        toast('Гүйцээсэн ажлын тайлбар заавал бичнэ үү', 'err');
        e('rmCompletionNote').focus();
        return;
    }

    const totalKb = remainingPdfList.reduce((s, x) => s + x.sizeKb, 0);
    if (totalKb > 2048) { toast(`PDF ${totalKb}KB — 2MB-аас бага байх ёстой`, 'err'); return; }

    const btn = e('rmConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байна...';

    try {
        // Үлдэгдэл актыг pending болгож, Координатор руу илгээх
        const newEvs = [...(a.evs || []), {
            type: 'submit', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: '📤 Гүйцээсэн ажил илгээв',
            detail: note + (remainingPdfList.length ? ` · ${remainingPdfList.length} PDF (~${totalKb}KB)` : ' · Баримтгүй'),
            time: ts(), hash: gh()
        }];

        const upd = {
            status: 'pending',
            step: 0,
            pdfs: remainingPdfList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb })),
            pdfCount: remainingPdfList.length,
            completionNote: note,
            submittedAt: serverTimestamp(),
            evs: newEvs
        };
        await updateDoc(doc(db, 'acts', currentRemainingActId), upd);

        // Координаторт email
        try {
            await sendMail(CHAIN[0].email, CHAIN[0].name, a, cu.displayName || cu.email);
        } catch (e) { console.error('Mail error:', e); }

        toast('✅ Гүйцээсэн ажил Координаторт илгээгдлээ!');
        closeRemainingModal();
    } catch (err) {
        console.error('Submit remaining error:', err);
        toast('Алдаа: ' + err.message, 'err');
    }
    btn.disabled = false;
    btn.textContent = '📤 Илгээх';
}

// ════════════════════════════════════════════════════════════
// FINAL PDF generation
// ════════════════════════════════════════════════════════════

async function loadCyrillicFont() {
    if (cachedFont) return cachedFont;
    const ttfUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
    const res = await fetch(ttfUrl);
    if (!res.ok) throw new Error('Font татах алдаа: ' + res.status);
    cachedFont = await res.arrayBuffer();
    return cachedFont;
}

async function generateFinalPdf(act) {
    const { PDFDocument, rgb } = PDFLib;
    const finalDoc = await PDFDocument.create();
    finalDoc.registerFontkit(fontkit);
    toast('Font татаж байна...');
    const fontBytes = await loadCyrillicFont();
    const font = await finalDoc.embedFont(fontBytes, { subset: true });

    let page = finalDoc.addPage([595, 842]);
    let y = 800;
    const margin = 50;
    const lineH = 16;
    const pageWidth = 595;

    function drawText(text, x, yPos, options = {}) {
        const { size = 11, color = rgb(0, 0, 0) } = options;
        page.drawText(String(text || ''), { x, y: yPos, size, font, color });
    }
    function checkNewPage(needed = 30) {
        if (y < needed + margin) { page = finalDoc.addPage([595, 842]); y = 800; }
    }
    function drawLine(yPos, color = rgb(0.7, 0.7, 0.7)) {
        page.drawLine({ start: { x: margin, y: yPos }, end: { x: pageWidth - margin, y: yPos }, thickness: 0.5, color });
    }

    // ═══════════════════════════════════════════════════════════
    // HEADER — Минимал, орчин үеийн дизайн
    // ═══════════════════════════════════════════════════════════

    // Title (зөвхөн TALST · ACT)
    drawText('TALST · ACT', margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    y -= 4;
    page.drawLine({
        start: { x: margin, y: y - 2 },
        end: { x: margin + 50, y: y - 2 },
        thickness: 1.5,
        color: rgb(0.06, 0.73, 0.51) // emerald
    });
    y -= 24;

    // Том акт дугаар
    drawText(act.actId, margin, y, { size: 26, color: rgb(0.06, 0.09, 0.16) });
    y -= 22;

    // Date · Company (subtitle)
    const subtitleParts = [act.date];
    if (act.company) subtitleParts.push(act.company);
    drawText(subtitleParts.join('  ·  '), margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    y -= 14;

    // Status badge (хэсэгчлэн эсвэл бүрэн)
    const isPartial = act.approvedPercent && act.approvedPercent < 100;
    const isMerged = act.completedViaRemaining;
    const statusText = isPartial
        ? `ХЭСЭГЧЛЭН ${act.approvedPercent}%`
        : isMerged
            ? '100% БҮРЭН (НЭГДСЭН)'
            : 'БҮРЭН БАТЛАГДСАН';
    const statusColor = isPartial
        ? rgb(0.96, 0.62, 0.04)
        : rgb(0.06, 0.73, 0.51);

    // Жижиг хайрцаг (badge маягтай)
    const badgeWidth = statusText.length * 5.5 + 16;
    page.drawRectangle({
        x: margin,
        y: y - 4,
        width: badgeWidth,
        height: 18,
        color: isPartial ? rgb(1, 0.95, 0.85) : rgb(0.86, 0.96, 0.91),
        borderColor: statusColor,
        borderWidth: 0.8,
    });
    drawText(statusText, margin + 8, y + 1, { size: 9, color: statusColor });
    y -= 28;

    // Линий тусгаарлагч
    drawLine(y, rgb(0.9, 0.92, 0.94));
    y -= 18;

    // ═══════════════════════════════════════════════════════════
    // META — 2 баганатай grid layout
    // ═══════════════════════════════════════════════════════════

    function drawMetaRow(label, value, valueColor = rgb(0.06, 0.09, 0.16), valueSize = 10.5) {
        checkNewPage();
        drawText(label, margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
        drawText(String(value || '—'), margin + 130, y, { size: valueSize, color: valueColor });
        y -= 17;
    }

    function drawMetaSeparator() {
        page.drawLine({
            start: { x: margin, y: y + 6 },
            end: { x: pageWidth - margin, y: y + 6 },
            thickness: 0.3,
            color: rgb(0.92, 0.94, 0.96)
        });
        y -= 6;
    }

    // Баганаар зохион байгуулсан мэдээлэл
    drawMetaRow('Гэрээний дугаар', act.contract);
    drawMetaRow('Ажлын хугацаа', (act.dateFrom || '—') + ' — ' + (act.dateTo || '—'));
    drawMetaRow('Илгээсэн', act.submittedByName || act.submittedBy);

    drawMetaSeparator();
    y -= 4;

    // Дүн — онцолсон байдалтай
    if (isMerged) {
        // 100% НЭГДСЭН — Анхны + Батлагдсан + Үлдэгдэл бүгдийг харуулах
        const approvedPart = parseInt(act.approvedAmount || 0);
        const remainingPart = parseInt(act.amount) - approvedPart;
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.amount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Эхний цикл (${act.approvedPercent}%)`, '₮ ' + fmtN(approvedPart), rgb(0.06, 0.4, 0.27), 11);
        drawMetaRow(`Үлдэгдэл цикл (${100 - act.approvedPercent}%)`, '₮ ' + fmtN(remainingPart), rgb(0.06, 0.4, 0.27), 11);
        drawMetaSeparator();
        drawMetaRow('Нийт батлагдсан', '₮ ' + fmtN(act.amount), rgb(0.06, 0.4, 0.27), 14);
    } else if (isPartial) {
        // Хэсэгчилсэн дүн — задралт харуулах
        const remainingPart = parseInt(act.amount) - parseInt(act.approvedAmount);
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.amount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Батлагдсан дүн (${act.approvedPercent}%)`, '₮ ' + fmtN(act.approvedAmount), rgb(0.06, 0.4, 0.27), 13);
        drawMetaRow(`Үлдэгдэл (${100 - act.approvedPercent}%)`, '₮ ' + fmtN(remainingPart), rgb(0.85, 0.55, 0.04), 11);
    } else if (act.parentApprovedPercent && act.originalAmount) {
        // ҮЛДЭГДЭЛ АКТ — Анхны нийт + Батлагдсан + Үлдэгдэл
        const approvedPart = parseInt(act.originalAmount) - parseInt(act.amount);
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.originalAmount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Өмнө батлагдсан (${act.parentApprovedPercent}%)`, '₮ ' + fmtN(approvedPart), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Үлдэгдэл дүн (${act.remainingPercent || (100 - act.parentApprovedPercent)}%)`, '₮ ' + fmtN(act.amount), rgb(0.06, 0.4, 0.27), 13);
    } else {
        drawMetaRow('Батлагдсан дүн', '₮ ' + fmtN(act.approvedAmount || act.amount), rgb(0.06, 0.4, 0.27), 13);
    }

    drawMetaSeparator();
    y -= 4;

    // Ажлын тайлбар
    if (act.work) {
        drawText('Ажил', margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
        y -= 12;
        // Урт текстийг хуваах
        const workWords = String(act.work).split(' ');
        let workLine = '';
        const maxWorkChars = 70;
        for (const w of workWords) {
            if ((workLine + ' ' + w).length > maxWorkChars) {
                checkNewPage();
                drawText(workLine, margin, y, { size: 11, color: rgb(0.06, 0.09, 0.16) });
                y -= 14;
                workLine = w;
            } else workLine = workLine ? workLine + ' ' + w : w;
        }
        if (workLine) {
            checkNewPage();
            drawText(workLine, margin, y, { size: 11, color: rgb(0.06, 0.09, 0.16) });
            y -= 14;
        }
        y -= 4;
    }

    if (act.pdfCount) {
        drawMetaRow('Хавсралт', act.pdfCount + ' PDF файл', rgb(0.42, 0.45, 0.5));
    }

    // Холбогдсон акт (хэсэгчилсэн / үлдэгдэлийн хувьд)
    if (act.parentActId) {
        drawMetaRow('Эх акт', act.parentActId, rgb(0.42, 0.45, 0.5));
    }

    // Хэсэгчилсэн шалтгаан
    if (act.partialReason) {
        y -= 6;
        // Шалтгааны хайрцаг
        page.drawRectangle({
            x: margin,
            y: y - 30,
            width: pageWidth - margin * 2,
            height: 38,
            color: rgb(1, 0.97, 0.91),
            borderColor: rgb(0.96, 0.62, 0.04),
            borderWidth: 0.6,
            borderOpacity: 0.4,
        });
        // Зүүн талын тэмдэг
        page.drawRectangle({
            x: margin,
            y: y - 30,
            width: 3,
            height: 38,
            color: rgb(0.96, 0.62, 0.04),
        });
        drawText('ХЭСЭГЧЛЭН БАТЛАХ ШАЛТГААН', margin + 12, y - 4, { size: 8, color: rgb(0.58, 0.31, 0.04) });
        drawText(String(act.partialReason).substring(0, 80), margin + 12, y - 18, { size: 10, color: rgb(0.47, 0.21, 0.05) });
        y -= 44;
    }

    y -= 20;
    drawLine(y, rgb(0.9, 0.92, 0.94));
    y -= 22;

    // Title for events section
    drawText('ЯВЦЫН ТҮҮХ', margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    drawText('АУДИТ ЛОГ', pageWidth - margin - 60, y, { size: 9, color: rgb(0.65, 0.7, 0.75) });
    y -= 22;

    const events = act.evs || [];
    events.forEach((ev, i) => {
        // Цикл тусгаарлагч (нэгдсэн PDF дээр)
        if (ev.type === 'cycle_separator') {
            checkNewPage(50);
            y -= 8;
            page.drawLine({
                start: { x: margin, y: y + 4 },
                end: { x: pageWidth - margin, y: y + 4 },
                thickness: 1.5,
                color: rgb(0.96, 0.62, 0.04)
            });
            y -= 12;
            drawText('⏳ ҮЛДЭГДЭЛ ЦИКЛ', margin, y, { size: 11, color: rgb(0.85, 0.45, 0.04) });
            y -= 14;
            drawText(String(ev.detail || ''), margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
            y -= 10;
            page.drawLine({
                start: { x: margin, y: y + 4 },
                end: { x: pageWidth - margin, y: y + 4 },
                thickness: 0.5,
                color: rgb(0.96, 0.62, 0.04),
                opacity: 0.4
            });
            y -= 16;
            return;
        }

        checkNewPage(70);
        const isApprove = ev.type === 'approve' || ev.type === 'done' || ev.type === 'submit';
        const isReject = ev.type === 'reject';
        const isPartial = ev.type === 'partial' || ev.type === 'remaining_created';
        const dotColor = isApprove ? rgb(0.11, 0.62, 0.46)
            : isReject ? rgb(0.88, 0.29, 0.29)
                : isPartial ? rgb(0.96, 0.62, 0.04)
                    : rgb(0.5, 0.5, 0.5);
        const icon = isApprove ? '✓' : isReject ? '✕' : isPartial ? '⚠' : '→';
        page.drawCircle({ x: margin + 6, y: y + 4, size: 7, color: dotColor });
        drawText(icon, margin + 3, y + 1, { size: 10, color: rgb(1, 1, 1) });
        drawText(`${i + 1}. ${ev.title || ''}`, margin + 22, y, { size: 12, color: dotColor });
        y -= lineH;
        drawText(`Хэн: ${ev.who || '—'} (${ev.whoEmail || '—'})`, margin + 22, y, { size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= lineH - 2;
        drawText(`Хугацаа: ${ev.time || '—'}`, margin + 22, y, { size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= lineH - 2;
        const detail = String(ev.detail || '');
        const maxCharsPerLine = 75;
        if (detail) {
            const words = detail.split(' ');
            let line = '';
            for (const w of words) {
                if ((line + ' ' + w).length > maxCharsPerLine) {
                    checkNewPage();
                    drawText('  ' + line, margin + 22, y, { size: 9, color: rgb(0.25, 0.25, 0.25) });
                    y -= lineH - 3; line = w;
                } else line = line ? line + ' ' + w : w;
            }
            if (line) {
                checkNewPage();
                drawText('  ' + line, margin + 22, y, { size: 9, color: rgb(0.25, 0.25, 0.25) });
                y -= lineH - 3;
            }
        }
        if (ev.hash) {
            checkNewPage();
            drawText(`  🔐 ${ev.hash}`, margin + 22, y, { size: 8, color: rgb(0.55, 0.55, 0.55) });
            y -= lineH - 2;
        }
        y -= 10;
    });

    checkNewPage(50);
    y -= 10; drawLine(y); y -= 15;
    drawText(`Үүсгэсэн: ${new Date().toLocaleString('mn-MN')}`, margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;
    drawText('Talst Act System · Blockchain-style Audit Trail', margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;
    drawText(`Нийт ${events.length} арга хэмжээ · ${act.pdfCount || 0} хавсралт`, margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });

    if (act.pdfs && act.pdfs.length) {
        for (const pdf of act.pdfs) {
            try {
                const base64Data = (pdf.base64 || '').split(',')[1] || pdf.base64;
                if (!base64Data) continue;
                const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                const attachedDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
                const copiedPages = await finalDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
                copiedPages.forEach(p => finalDoc.addPage(p));
            } catch (err) {
                console.error('PDF алдаа:', pdf.name, err);
            }
        }
    }

    const finalBytes = await finalDoc.save();
    const fileName = `${act.actId}_FINAL.pdf`;

    if (isNative) {
        try {
            const Filesystem = window.Capacitor?.Plugins?.Filesystem;
            const Share = window.Capacitor?.Plugins?.Share;
            if (!Filesystem) throw new Error('Filesystem plugin олдсонгүй');
            let binary = '';
            const bytes = new Uint8Array(finalBytes);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);
            const result = await Filesystem.writeFile({
                path: fileName, data: base64, directory: 'DOCUMENTS', recursive: true
            });
            if (Share) {
                try {
                    await Share.share({
                        title: 'Батлагдсан акт',
                        text: `${act.actId} — Бүрэн батлагдсан акт`,
                        url: result.uri,
                        dialogTitle: 'Актыг хуваалцах'
                    });
                } catch (shareErr) { console.log('Share cancelled'); }
            }
        } catch (err) {
            console.error('Native save error:', err);
            toast('PDF хадгалахад алдаа: ' + err.message, 'err');
        }
    } else {
        const blob = new Blob([finalBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

async function downloadFinalPdf(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) { toast('Акт олдсонгүй', 'err'); return; }
    if (a.status !== 'done') { toast('Зөвхөн бүрэн батлагдсан актыг татах боломжтой', 'err'); return; }
    try {
        toast('PDF бэлдэж байна...');
        await generateFinalPdf(a);
        toast('✅ Татагдлаа!');
    } catch (err) {
        console.error(err);
        toast('Алдаа: ' + err.message, 'err');
    }
}

function evH(ev, isLast) {
    // Тусгай cycle separator event
    if (ev.type === 'cycle_separator') {
        return `<div class="cycle-sep">
            <div class="cycle-sep-line"></div>
            <div class="cycle-sep-text">${esc(ev.title)}</div>
            <div class="cycle-sep-detail">${esc(ev.detail)}</div>
            <div class="cycle-sep-line"></div>
        </div>`;
    }

    let dc, ic, lk;
    if (ev.type === 'partial' || ev.type === 'remaining_created') {
        dc = 'dpartial'; ic = '⚠'; lk = '🔓';
    } else if (ev.type === 'approve' || ev.type === 'done' || ev.type === 'submit') {
        dc = 'dd'; ic = '✓'; lk = '🔒';
    } else if (ev.type === 'reject') {
        dc = 'dj'; ic = '✕'; lk = '🔓';
    } else {
        dc = 'da'; ic = '→'; lk = '🔓';
    }
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

    // Бүрэн батлах boломжтой эсэх (pending эсвэл partial хоёулаа)
    const canApprove = (a.status === 'pending' || a.status === 'partial') && role !== 'Гүйцэтгэгч' && RSTEP[role] === step;
    // Хэсэгчлэн батлах боломжтой эсэх (зөвхөн Координатор + анх pending)
    const canPartial = a.status === 'pending' && role === 'Координатор' && step === 0;
    // Үлдэгдэл гүйцээх боломжтой эсэх (гүйцэтгэгч өөрөө)
    const canComplete = a.status === 'remaining' && a.submittedBy === cu?.email;

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
    if (a.status === 'pending' || a.status === 'partial') for (let i = step; i < 4; i++) tl += wevH(i, i === 3);

    const finalBtn = a.status === 'done' ? `
      <div class="abtns" style="margin-top:10px">
        <button class="bok" onclick="downloadFinalPdf('${a.id}')" style="background:#1d9e75">
          📥 Бүрэн PDF татах
        </button>
      </div>` : '';

    // Партиал шалтгаан харуулах
    const partialReasonHtml = (a.status === 'partial' || a.status === 'remaining' || a.partialReason) && a.partialReason ? `
      <div class="partial-reason-card">
        <div class="partial-reason-label">⚠ Хэсэгчлэн батлах шалтгаан</div>
        <div class="partial-reason-text">${esc(a.partialReason)}</div>
      </div>` : '';

    // Төлөв badge
    const statusBadge = `<span class="badge ${bc(a)}">${bt(a)}</span>`;

    // Action buttons
    let actionBtns = '';
    if (canApprove && canPartial) {
        actionBtns = `<div class="abtns">
            <button class="bok" onclick="approve('${a.id}')">✓ Бүтэн батлах</button>
            <button class="bpartial-btn" onclick="openPartialModal('${a.id}')">⚠ Хэсэгчлэн</button>
            <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
        </div>`;
    } else if (canApprove) {
        actionBtns = `<div class="abtns">
            <button class="bok" onclick="approve('${a.id}')">✓ Батлах</button>
            <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
        </div>`;
    } else if (canComplete) {
        actionBtns = `<div class="abtns">
            <button class="bcomplete" onclick="openRemainingModal('${a.id}')">+ Гүйцээх ажил илгээх</button>
        </div>`;
    }

    // Үлдсэн дүн харуулах (хэсэгчлэн / үлдэгдэл актын хувьд)
    let amountDisplay;
    if (a.originalAmount && a.parentApprovedPercent) {
        // ҮЛДЭГДЭЛ АКТ — Анхны дүн + Батлагдсан + Үлдэгдэл бүгдийг харуулах
        const approvedPart = parseInt(a.originalAmount) - parseInt(a.amount);
        amountDisplay = `<div class="row"><span class="rl">Анхны нийт дүн</span><span class="rv amt">₮ ${fmtN(a.originalAmount)}</span></div>
           <div class="row"><span class="rl">Батлагдсан (${a.parentApprovedPercent}%)</span><span class="rv" style="color:#059669;font-weight:700">₮ ${fmtN(approvedPart)}</span></div>
           <div class="row"><span class="rl">Үлдэгдэл (${a.remainingPercent || (100 - a.parentApprovedPercent)}%)</span><span class="rv" style="color:#d97706;font-weight:700">₮ ${fmtN(a.amount)}</span></div>`;
    } else if (a.approvedAmount && a.approvedAmount !== a.amount) {
        // ХЭСЭГЧИЛСЭН АКТ — Анхны + Батлагдсан
        const remainingPart = parseInt(a.amount) - parseInt(a.approvedAmount);
        amountDisplay = `<div class="row"><span class="rl">Анхны дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>
           <div class="row"><span class="rl">Батлагдсан дүн (${a.approvedPercent}%)</span><span class="rv" style="color:#059669;font-weight:700">₮ ${fmtN(a.approvedAmount)}</span></div>
           <div class="row"><span class="rl">Үлдэгдэл (${100 - a.approvedPercent}%)</span><span class="rv" style="color:#d97706;font-weight:600">₮ ${fmtN(remainingPart)}</span></div>`;
    } else {
        // ЭНГИЙН АКТ
        amountDisplay = `<div class="row"><span class="rl">Дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>`;
    }

    return `<div class="card">
    <div class="ch">
      <div><div class="cid">${esc(a.actId)} · ${esc(a.date)}</div><div class="ctitle">${esc(a.work)}</div></div>
      ${statusBadge}
    </div>
    <div class="cb">
      <div class="row"><span class="rl">Компани</span><span class="rv">${esc(a.company)}</span></div>
      <div class="row"><span class="rl">Гэрээний дугаар</span><span class="rv">${esc(a.contract)}</span></div>
      <div class="row"><span class="rl">Ажлын хугацаа</span><span class="rv">${esc(dr)}</span></div>
      ${amountDisplay}
      <div class="row"><span class="rl">Илгээсэн</span><span class="rv">${esc(a.submittedByName || a.submittedBy || '—')}</span></div>
      ${a.parentActId ? `<div class="row"><span class="rl">Эх акт</span><span class="rv">${esc(a.parentActId)}</span></div>` : ''}
      ${a.pdfCount ? `<div class="row"><span class="rl">Баримт бичгүүд</span><span class="rv">${a.pdfCount} PDF файл</span></div>` : ''}
    </div>
    ${partialReasonHtml}
    ${pdfsHtml}
    <div class="pbwrap"><div class="pb" style="width:${p}%"></div></div>
    <div class="plabel"><span>${p}% дууссан</span><span>${step}/4 батлалт</span></div>
    ${actionBtns}
    ${finalBtn}
    <div class="tl"><div class="tll-label">ЯВЦЫН ТҮҮХ · АУДИТ ЛОГ</div>${tl}</div>
  </div>`;
}

function liH(a, idx, from) {
    const p = pct(a); const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const cls = a.status === 'partial' ? 'li partial' : 'li';
    return `<div class="${cls}" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge ${bc(a)}">${bt(a)}</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.approvedAmount || a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:${p}%"></div></div>
      <span class="mpct">${p}%</span>
    </div>
  </div>`;
}

function liHDone(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const isDone = a.status === 'done';
    const isMerged = a.completedViaRemaining;
    return `<div class="li done${isMerged ? ' merged' : ''}" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge ${isDone ? 'bd' : 'br'}">${isMerged ? '✓ 100% (Нэгдсэн)' : (isDone ? '✓ Батлагдсан' : '✕ Буцаагдсан')}</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}${isMerged ? ' · <span style="color:#059669;font-weight:600">Хэсэгчлэн+Үлдэгдэл нэгдсэн</span>' : ''}</div>
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
    } else timerHtml = '<div class="reject-timer">🗑 Удахгүй устна</div>';
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

function liHRemaining(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li remaining" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge bremaining">⏳ Үлдэгдэл</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    ${a.partialReason ? `<div class="remaining-reason">${esc(a.partialReason)}</div>` : ''}
  </div>`;
}

function rA() {
    const el = e('al');
    if (!acts.length) { el.innerHTML = '<div class="empty">Акт байхгүй байна</div>'; return; }
    if (role === 'Гүйцэтгэгч') { el.innerHTML = '<div class="empty">Акт илгээх таб ашиглана уу</div>'; return; }

    let list;
    if (role === 'Нягтлан') {
        list = acts.filter(a => a.status === 'done' || a.status === 'partial_done');
    } else if (role === 'Координатор') {
        // Координатор: pending + remaining нь дахин илгээгдсэн (re-pending)
        list = acts.filter(a =>
            (a.status === 'pending' && (a.step || 0) === 0)
        );
    } else {
        // Инженер, Захирал — pending болон partial хоёуланг харах (өөрийн step дээр)
        list = acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === RSTEP[role]
        );
    }
    el.innerHTML = list.length ? list.map(a => liH(a, acts.indexOf(a), 1)).join('') : '<div class="empty">Таны батлах акт байхгүй байна</div>';
}

// ════════════════════════════════════════════════════════
// АКТУУД ТАБ — Хайлт, Filter, Pagination
// ════════════════════════════════════════════════════════

let listFilter = 'all';   // all, in_progress, partial, partial_done, remaining, done, rejected
let listSearch = '';      // хайлтын утга
let listLimit = 10;       // pagination хязгаар

window.setListFilter = (f) => {
    listFilter = f;
    listLimit = 10;
    rL();
};
window.setListSearch = (val) => {
    listSearch = (val || '').toLowerCase().trim();
    listLimit = 10;
    rL();
};
window.clearListSearch = () => {
    listSearch = '';
    listLimit = 10;
    const inp = e('listSearchInput');
    if (inp) inp.value = '';
    rL();
};
window.showMoreActs = () => {
    listLimit += 10;
    rL();
};

function rL() {
    const el = e('ll');
    const now = Date.now();

    // Бүх категорийг тоолох
    const allLists = {
        in_progress: acts.filter(a => (a.status === 'pending' && (a.step || 0) >= 1) || a.status === 'partial'),
        remaining: acts.filter(a => a.status === 'remaining'),
        partial_done: acts.filter(a => a.status === 'partial_done'),
        done: acts.filter(a => a.status === 'done'),
        rejected: acts.filter(a => {
            if (a.status !== 'rejected') return false;
            const rejTime = a.rejectedAt ? a.rejectedAt.toMillis?.() || a.rejectedAt : null;
            if (rejTime && now - rejTime > EIGHT_HOURS) return false;
            return true;
        }),
    };

    const counts = {
        all: allLists.in_progress.length + allLists.remaining.length + allLists.partial_done.length + allLists.done.length + allLists.rejected.length,
        in_progress: allLists.in_progress.length,
        remaining: allLists.remaining.length,
        partial_done: allLists.partial_done.length,
        done: allLists.done.length,
        rejected: allLists.rejected.length,
    };

    // ─── HEADER (хайлт + filter chips) ───
    const headerHtml = `
        <div class="list-header">
            <div class="list-search-wrap">
                <span class="list-search-icon">🔍</span>
                <input type="text" id="listSearchInput" class="list-search-input"
                    placeholder="Гэрээ, акт, компани, ажлаар хайх..."
                    value="${esc(listSearch)}"
                    oninput="setListSearch(this.value)">
                ${listSearch ? '<button class="list-search-clear" onclick="clearListSearch()">✕</button>' : ''}
            </div>
            <div class="list-filter-chips">
                <button class="filter-chip ${listFilter === 'all' ? 'active' : ''}" onclick="setListFilter('all')">
                    Бүгд <span class="chip-count">${counts.all}</span>
                </button>
                ${counts.in_progress > 0 ? `<button class="filter-chip ${listFilter === 'in_progress' ? 'active' : ''}" onclick="setListFilter('in_progress')">
                    Явцад <span class="chip-count">${counts.in_progress}</span>
                </button>` : ''}
                ${counts.remaining > 0 ? `<button class="filter-chip filter-chip-orange ${listFilter === 'remaining' ? 'active' : ''}" onclick="setListFilter('remaining')">
                    ⏳ Үлдэгдэл <span class="chip-count">${counts.remaining}</span>
                </button>` : ''}
                ${counts.partial_done > 0 ? `<button class="filter-chip filter-chip-amber ${listFilter === 'partial_done' ? 'active' : ''}" onclick="setListFilter('partial_done')">
                    ⚠ Хэсэгчлэн <span class="chip-count">${counts.partial_done}</span>
                </button>` : ''}
                ${counts.done > 0 ? `<button class="filter-chip filter-chip-green ${listFilter === 'done' ? 'active' : ''}" onclick="setListFilter('done')">
                    ✓ Дууссан <span class="chip-count">${counts.done}</span>
                </button>` : ''}
                ${counts.rejected > 0 ? `<button class="filter-chip filter-chip-red ${listFilter === 'rejected' ? 'active' : ''}" onclick="setListFilter('rejected')">
                    ✕ Буцаагдсан <span class="chip-count">${counts.rejected}</span>
                </button>` : ''}
            </div>
        </div>
    `;

    if (counts.all === 0) {
        el.innerHTML = headerHtml + '<div class="empty">Одоогоор акт байхгүй байна</div>';
        return;
    }

    // ─── ШҮҮЛТ ───
    function matchSearch(a) {
        if (!listSearch) return true;
        const q = listSearch;
        return (a.actId || '').toLowerCase().includes(q)
            || (a.contract || '').toLowerCase().includes(q)
            || (a.company || '').toLowerCase().includes(q)
            || (a.work || '').toLowerCase().includes(q)
            || (a.submittedByName || '').toLowerCase().includes(q)
            || (a.submittedBy || '').toLowerCase().includes(q);
    }

    let groups = [];
    if (listFilter === 'all') {
        if (allLists.in_progress.length) groups.push({ key: 'in_progress', label: 'ЯВЦАД', cls: 'in-progress-label', items: allLists.in_progress, render: liH });
        if (allLists.remaining.length) groups.push({ key: 'remaining', label: '⏳ ҮЛДЭГДЭЛ ГҮЙЦЭЭХ', cls: 'remaining-section-label', items: allLists.remaining, render: liHRemaining });
        if (allLists.partial_done.length) groups.push({ key: 'partial_done', label: '⚠ ХЭСЭГЧЛЭН ДУУССАН', cls: 'partial-done-section-label', items: allLists.partial_done, render: liHPartialDone });
        if (allLists.done.length) groups.push({ key: 'done', label: '✓ БҮРЭН ДУУССАН', cls: 'done-section-label', items: allLists.done, render: liHDone });
        if (allLists.rejected.length) groups.push({ key: 'rejected', label: '✕ БУЦААГДСАН', cls: 'rejected-section-label', items: allLists.rejected, render: (a, idx, from) => liHRejected(a, idx, from, now, EIGHT_HOURS) });
    } else {
        const labels = {
            'in_progress': { label: 'ЯВЦАД', cls: 'in-progress-label', render: liH },
            'remaining': { label: '⏳ ҮЛДЭГДЭЛ ГҮЙЦЭЭХ', cls: 'remaining-section-label', render: liHRemaining },
            'partial_done': { label: '⚠ ХЭСЭГЧЛЭН ДУУССАН', cls: 'partial-done-section-label', render: liHPartialDone },
            'done': { label: '✓ БҮРЭН ДУУССАН', cls: 'done-section-label', render: liHDone },
            'rejected': { label: '✕ БУЦААГДСАН', cls: 'rejected-section-label', render: (a, idx, from) => liHRejected(a, idx, from, now, EIGHT_HOURS) },
        };
        const conf = labels[listFilter];
        if (conf && allLists[listFilter] && allLists[listFilter].length) {
            groups.push({ key: listFilter, label: conf.label, cls: conf.cls, items: allLists[listFilter], render: conf.render });
        }
    }

    // Хайлт хийгээд, нийт хүчинтэй акт-уудыг тоолох
    let totalMatched = 0;
    groups = groups.map(g => {
        const filtered = g.items.filter(matchSearch);
        totalMatched += filtered.length;
        return { ...g, items: filtered };
    }).filter(g => g.items.length > 0);

    // Pagination — нийт limit-р тооцоолох
    let shown = 0;
    let html = headerHtml;

    if (totalMatched === 0) {
        html += `<div class="empty">
            ${listSearch ? `🔍 "<strong>${esc(listSearch)}</strong>" хайлтад тохирох акт олдсонгүй` : 'Энэ ангилалд акт байхгүй байна'}
        </div>`;
    } else {
        // Хайлтын тоо мэдэгдэл
        if (listSearch) {
            html += `<div class="search-result-hint">🔍 "<strong>${esc(listSearch)}</strong>" — ${totalMatched}ш олдов</div>`;
        }

        for (const g of groups) {
            if (shown >= listLimit) break;
            html += `<div class="${g.cls}">${g.label} <span class="section-count">(${g.items.length})</span></div>`;
            for (const a of g.items) {
                if (shown >= listLimit) break;
                html += g.render(a, acts.indexOf(a), 2);
                shown++;
            }
        }

        // Pagination товч
        if (totalMatched > listLimit) {
            const remaining = totalMatched - listLimit;
            html += `<button class="show-more-btn" onclick="showMoreActs()">
                ▼ Дараагийн ${Math.min(remaining, 10)} акт харах <span style="opacity:0.7">(${remaining} үлдсэн)</span>
            </button>`;
        }
    }

    el.innerHTML = html;
}

function liHPartialDone(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    return `<div class="li partial-done" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge bpartial-done">⚠ ${a.approvedPercent}% батлагдсан</span>
    </div>
    <div class="li-sub">${esc(a.company)} · <strong style="color:#d97706">₮${fmtN(a.approvedAmount)}</strong> / ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    <div style="display:flex;align-items:center;gap:7px">
      <div class="mbwrap"><div class="mb" style="width:${a.approvedPercent}%;background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div></div>
      <span class="mpct" style="color:#d97706;font-weight:700">${a.approvedPercent}%</span>
    </div>
    <div class="partial-done-hint">⏳ Үлдэгдэл ${100 - a.approvedPercent}% (₮${fmtN(parseInt(a.amount) - parseInt(a.approvedAmount))}) гүйцээгдэхийг хүлээж байна</div>
  </div>`;
}

function fmtM(n) { return '₮' + parseInt(n || 0).toLocaleString('mn-MN'); }

let dbBarChart = null;
function rD() {
    const total = acts.length;
    const pending = acts.filter(a => a.status === 'pending');
    const partial = acts.filter(a => a.status === 'partial');
    const remainingActs = acts.filter(a => a.status === 'remaining');
    const done = acts.filter(a => a.status === 'done');

    e('s0').textContent = total;
    e('s0sub').textContent = total + 'ш бүртгэгдсэн';
    e('s1').textContent = pending.length + partial.length;
    e('s1sub').textContent = (pending.length + partial.length) + 'ш батлуулж байна';
    e('s2').textContent = done.length;
    e('s2sub').textContent = done.length + 'ш бүрэн батлагдсан';

    // Шатуудаар хувих
    const allActiveActs = [...pending, ...partial];
    const steps = [0, 1, 2, 3].map(i => allActiveActs.filter(a => (a.step || 0) === i).length);
    const partialCount = partial.length;
    const maxS = Math.max(...steps, done.length, partialCount, remainingActs.length, 1);

    [0, 1, 2, 3].forEach(i => {
        if (e('dBar' + i)) {
            e('dBar' + i).style.width = Math.round(steps[i] / maxS * 100) + '%';
            e('dV' + i).textContent = steps[i];
        }
    });
    if (e('dBarDone')) {
        e('dBarDone').style.width = Math.round(done.length / maxS * 100) + '%';
        e('dVDone').textContent = done.length;
    }
    if (e('dBarPartial')) {
        e('dBarPartial').style.width = Math.round(partialCount / maxS * 100) + '%';
        e('dVPartial').textContent = partialCount;
    }

    const totalAmt = acts.reduce((s, a) => s + parseInt(a.amount || 0), 0);
    const doneAmt = done.reduce((s, a) => s + parseInt(a.approvedAmount || a.amount || 0), 0);
    e('dTotalAmt').textContent = fmtM(totalAmt);
    e('dDoneAmt').textContent = fmtM(doneAmt);

    if (typeof Chart === 'undefined') return;

    function parseActDate(dateStr) {
        if (!dateStr) return null;
        if (typeof dateStr === 'object' && dateStr.seconds !== undefined) {
            const dt = new Date(dateStr.seconds * 1000);
            return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
        }
        const s = String(dateStr).trim();
        const p = s.replace(/[.\/\-]/g, '-').split('-').filter(Boolean);
        if (p.length === 3) {
            const a = parseInt(p[0]), b = parseInt(p[1]), c = parseInt(p[2]);
            if (a > 1900) return { y: a, m: b, d: c };
            if (c > 1900) return { y: c, m: a, d: b };
            if (c < 100) return { y: 2000 + c, m: a, d: b };
        }
        return null;
    }

    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push({ label: (d.getMonth() + 1) + '/' + (d.getDate()), m: d.getMonth() + 1, d: d.getDate(), y: d.getFullYear() });
    }
    function actsOfDay(day) {
        return acts.filter(a => {
            const pd = parseActDate(a.date);
            if (!pd) return false;
            return pd.y === day.y && pd.m === day.m && pd.d === day.d;
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
        if (da.some(a => a.status === 'partial')) return '#f59e0b';
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
        data: { labels: days.map(d => d.label), datasets: [{ label: 'Дүн', data: displayAmts, backgroundColor: dayColors, borderRadius: 6, borderSkipped: false }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const day = days[ctx.dataIndex]; const da = actsOfDay(day);
                            if (!da.length) return 'Акт байхгүй';
                            const total = da.reduce((s, a) => s + parseInt(a.amount || 0), 0);
                            return da.length + 'ш · ₮' + parseInt(total).toLocaleString('mn-MN');
                        },
                        title: ctx => days[ctx[0].dataIndex].label + ' · ' + dayCounts[ctx[0].dataIndex] + 'ш акт'
                    }
                }
            },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888', autoSkip: false, maxRotation: 0 } }, y: { display: false, beginAtZero: true, min: 0 } },
        }
    });
}