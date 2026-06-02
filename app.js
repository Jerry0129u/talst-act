import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, onAuthStateChanged, signOut as fbOut, setPersistence, browserLocalPersistence, indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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
    { name: 'Координатор',        email: 'zolzaya@talstgroup.mn' },
    { name: 'Б.Инженер',          email: 'dalaitseren@talstgroup.mn' },
    { name: 'Инженер',            email: 'barsbat@talstgroup.mn' },
    { name: 'Захирал',            email: 'zorigoo@talstgroup.mn' },
    { name: 'Нягтлан',            email: 'bayarmaa@talstgroup.mn' },
];

const ROLES = {
    'zolzaya@talstgroup.mn':     'Координатор',
    'dalaitseren@talstgroup.mn': 'Б.Инженер',
    'barsbat@talstgroup.mn':     'Инженер',
    'zorigoo@talstgroup.mn':     'Захирал',
    'bayarmaa@talstgroup.mn':    'Нягтлан',
    'ulziisaikhan@talstgroup.mn':'CEO',
    'narankhuu@talstgroup.mn':   'CFO',
};

const VIEWER_ROLES = ['CEO', 'CFO'];
function isViewer(r) { return VIEWER_ROLES.includes(r); }

const ROLE_COLORS = {
    'Координатор':       '#e74c3c',
    'Б.Инженер': '#00c3af',
    'Инженер':           '#3498db',
    'Захирал':           '#8e44ad',
    'Нягтлан':           '#27ae60',
    'Гүйцэтгэгч':        '#e67e22',
    'CEO':               '#0f172a',
    'CFO':               '#FF66CC',
};
const ROLE_AVATAR_BG = {
    'Координатор':       'linear-gradient(135deg, #ef4444, #dc2626)',
    'Б.Инженер':         'linear-gradient(135deg, #f59e0b, #d97706)',
    'Инженер':           'linear-gradient(135deg, #3b82f6, #2563eb)',
    'Захирал':           'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    'Нягтлан':           'linear-gradient(135deg, #10b981, #059669)',
    'Гүйцэтгэгч':        'linear-gradient(135deg, #f59e0b, #d97706)',
    'CEO':               'linear-gradient(135deg, #1e293b, #0f172a)',
    'CFO':               'linear-gradient(135deg, #334155, #1e293b)',
};

const RSTEP = { 'Координатор': 0, 'Б.Инженер': 1, 'Инженер': 2, 'Захирал': 3, 'Нягтлан': 4 };
const SN = ['Координатор', 'Б.Инженер', 'Инженер', 'Захирал', 'Нягтлан'];
const SE = [
    'zolzaya@talstgroup.mn',
    'dalaitseren@talstgroup.mn',
    'barsbat@talstgroup.mn',
    'zorigoo@talstgroup.mn',
    'bayarmaa@talstgroup.mn',
];
const EIGHT_HOURS = 48 * 60 * 60 * 1000; // 48 цаг

// ★★★ Е-баримтын тогтмол — 10% хасалт ★★★
const EBR_DEDUCT_PERCENT = 10;

// --- FIREBASE INIT ---
const fapp = initializeApp(cfg);
const auth = getAuth(fapp);
const db = getFirestore(fapp);

// ★ Persistence — нэвтрэлтийг localStorage/indexedDB-д хадгална (sessionStorage биш)
// Энэ нь iOS Safari болон in-app browser дээр "Unable to save initial state" алдааг засна
(async () => {
    try {
        await setPersistence(auth, indexedDBLocalPersistence);
    } catch (e1) {
        try {
            await setPersistence(auth, browserLocalPersistence);
        } catch (e2) {
            console.warn('Persistence тохируулж чадсангүй:', e2);
        }
    }
})();

let cu = null, role = 'Гүйцэтгэгч', acts = [], prev = 2, ctab = 0, unsub = null;
let pdfDataList = [];
let ebrPdfList = [];
let cachedFont = null;
let autoDeleteInterval = null;
let rejectedCountdownInterval = null;

// Modal state
let currentPartialActId = null;
let currentRemainingActId = null;
let currentNotaryActId = null;
let remainingPdfList = [];
// ★ Буцаагдсан акт засаж дахин илгээх state
let currentResubmitActId = null;
let resubmitPdfList = [];
let resubmitEbrList = [];

// ★ Гэрээний state
let contracts = [];
let unsubContracts = null;
let contractCheckTimer = null;

// Е-баримтын төлөв
let pendingNotaryStatus = null;

const e = id => document.getElementById(id);

// --- ТУСЛАХ ФУНКЦҮҮД ---
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function ts() { return new Date().toLocaleString('mn-MN') }
function gh() { return 'sha256:' + Math.random().toString(36).substr(2, 8) + '...' + Math.random().toString(36).substr(2, 4) }

function pct(a) {
    if (a.status === 'done') return 100;
    if (a.status === 'partial_done') return a.approvedPercent || 100;
    if (a.status === 'partial') return Math.round(((a.step || 0) / 4 * 100));
    if (a.status === 'remaining') return 0;
    return Math.round((a.step || 0) / 4 * 100);
}

function bc(a) {
    if (a.status === 'done') return 'bd';
    if (a.status === 'partial_done') return 'bpartial-done';
    if (a.status === 'rejected') return 'br';
    if (a.status === 'partial') return 'bpartial';
    if (a.status === 'remaining') return 'bremaining';
    const s = a.step || 0;
    return ['bw', 'bp', 'b1', 'b2', 'b3'][s] || 'bp';
}

function bt(a) {
    if (a.status === 'done') {
        if (a.completedViaRemaining) return '✓ 100% дууссан';
        return '✓ Батлагдсан';
    }
    if (a.status === 'partial_done') return '⚠ Хэсэгчлэн (' + (a.approvedPercent || 0) + '%)';
    if (a.status === 'rejected') return '✕ Буцаагдсан';
    if (a.status === 'partial') return '⚠ ' + (a.approvedPercent || 0) + '% · ' + SN[a.step || 0];
    if (a.status === 'remaining') return '⏳ Үлдэгдэл';
    return SN[a.step || 0];
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

// === АЖЛЫН PDF ===
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

// ★★★ НОТАРИАТЫН PDF ★★★
window.addEbrPdfs = async (input) => {
    const files = Array.from(input.files); if (!files.length) return;
    e('notaryInfo').textContent = 'Е-баримтын PDF боловсруулж байна...';
    for (const f of files) {
        if (f.type !== 'application/pdf') { toast('Зөвхөн PDF файл сонгоно уу: ' + f.name, 'err'); continue; }
        ebrPdfList.push(await readPdfAsBase64(f));
    }
    renderEbrPdfList();
    const total = ebrPdfList.reduce((s, x) => s + x.sizeKb, 0);
    e('notaryInfo').textContent = `${ebrPdfList.length} е-баримтын PDF · ~${total}KB`;
    input.value = '';
};

window.addNotaryPdfs = window.addEbrPdfs;

window.rmEbrPdf = (i) => {
    ebrPdfList.splice(i, 1); renderEbrPdfList();
    const total = ebrPdfList.reduce((s, x) => s + x.sizeKb, 0);
    e('notaryInfo').textContent = ebrPdfList.length ? `${ebrPdfList.length} е-баримтын PDF · ~${total}KB` : '';
};
window.rmNotaryPdf = window.rmEbrPdf;

function renderEbrPdfList() {
    e('notaryList').innerHTML = ebrPdfList.map((d, i) => `
    <div class="pdf-item pdf-item-notary">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmEbrPdf(${i})">✕</div>
    </div>`).join('');
}

// === REMAINING PDF ===
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

// === GOOGLE SIGN-IN ===
// Жинхэнэ гар утасны browser эсэхийг таних (desktop биш)
function isMobileBrowser() {
    const ua = (navigator.userAgent || '').toLowerCase();
    return /android|iphone|ipod|ipad|mobile|fban|fbav|instagram|line|micromessenger/.test(ua);
}

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
            return;
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        // Гар утасны browser дээр redirect найдвартай.
        // Desktop/laptop (localhost ч мөн адил) дээр popup ашиглана — redirect руу УНАХГҮЙ.
        if (isMobileBrowser()) {
            await signInWithRedirect(auth, provider);
            return;
        }

        // Desktop: зөвхөн popup. Хэрэглэгч цонхыг хаасан бол дахин оролдоно гэдгийг л хэлнэ.
        try {
            await signInWithPopup(auth, provider);
        } catch (popupErr) {
            console.error('Popup алдаа:', popupErr?.code, popupErr?.message);
            if (popupErr?.code === 'auth/popup-closed-by-user'
                || popupErr?.code === 'auth/cancelled-popup-request') {
                toast('Нэвтрэх цонх хаагдсан. Дахин оролдоно уу.', 'err');
            } else if (popupErr?.code === 'auth/popup-blocked') {
                toast('Browser popup-ийг хаасан байна. Popup зөвшөөрөөд дахин оролдоно уу.', 'err');
            } else {
                throw popupErr;
            }
        }
    } catch (err) {
        console.error('SIGN-IN ERROR:', err);
        if (err?.code === 'auth/unauthorized-domain') {
            toast('Энэ домэйн зөвшөөрөгдөөгүй. Firebase Console → Authentication → Settings → Authorized domains дээр нэмнэ үү.', 'err');
        } else {
            toast('Алдаа: ' + (err?.message || 'Тодорхойгүй'), 'err');
        }
    }
};

window.doSignOut = async () => {
    if (!confirm('Гарах уу?')) return;
    if (unsub) unsub();
    if (unsubContracts) unsubContracts();
    if (autoDeleteInterval) { clearInterval(autoDeleteInterval); autoDeleteInterval = null; }
    if (rejectedCountdownInterval) { clearInterval(rejectedCountdownInterval); rejectedCountdownInterval = null; }
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

window.openPartialModal = openPartialModal;
window.closePartialModal = closePartialModal;
window.updatePartialPreview = updatePartialPreview;
window.confirmPartialApprove = confirmPartialApprove;
window.openRemainingModal = openRemainingModal;
window.closeRemainingModal = closeRemainingModal;
window.confirmSubmitRemaining = confirmSubmitRemaining;
window.openResubmitModal = openResubmitModal;
window.closeResubmitModal = closeResubmitModal;
window.confirmResubmit = confirmResubmit;
window.addResubmitPdfs = addResubmitPdfs;
window.rmResubmitPdf = rmResubmitPdf;
window.addResubmitEbr = addResubmitEbr;
window.rmResubmitEbr = rmResubmitEbr;
window.submitComment = submitComment;

// ★ Гэрээний функцууд
window.submitContract = submitContract;
window.fmtContractAmt = fmtContractAmt;
window.checkContractBalance = checkContractBalance;
window.openContract = openContract;
window.closeContractDetail = closeContractDetail;

// ★★★ НОТАРИАТЫН MODAL функцууд ★★★
window.openEbrModal = openEbrModal;
window.closeEbrModal = closeEbrModal;
window.chooseEbrPaid = chooseEbrPaid;
window.chooseEbrUnpaid = chooseEbrUnpaid;

window.openNotaryModal = openEbrModal;
window.closeNotaryModal = closeEbrModal;
window.chooseNotaryPaid = chooseEbrPaid;
window.chooseNotaryUnpaid = chooseEbrUnpaid;

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

// ════════════════════════════════════════════════════════════
// EMAIL SENDING
// ════════════════════════════════════════════════════════════
function sendMail(toEmail, toName, act, fromName, opts = {}) {
    const params = {
        to_email: toEmail,
        to_name: toName,
        company: act.company || '',
        contract: act.contract || '',
        work: act.work || '',
        amount: fmtN(act.amount),
        from_name: fromName,
        email: toEmail,
        name: fromName,
        subject: opts.subject || `Шинэ акт: ${act.actId || ''}`,
        message: opts.message || `${fromName} танд акт илгээлээ. Батлуулна уу.`,
        notification_type: opts.type || 'approval_request',
        act_id: act.actId || '',
        reason: opts.reason || '',
        approved_percent: opts.approvedPercent || '',
        approved_amount: opts.approvedAmount || '',
        remaining_amount: opts.remainingAmount || '',
    };
    return emailjs.send(EJS_SVC, EJS_TPL, params)
        .then(r => console.log('✅ Email sent:', r))
        .catch(err => { console.error('❌ Email error:', err); throw err; });
}

async function sendRejectionMail(act, reason, rejectorName, rejectorRole) {
    const subject = `❌ Акт буцаагдлаа: ${act.actId}`;
    const message = `Акт буцаагдлаа.\n\n`
        + `АКТ: ${act.actId}\n`
        + `Компани: ${act.company}\n`
        + `Гэрээ: ${act.contract}\n`
        + `Ажил: ${act.work}\n`
        + `Дүн: ₮${fmtN(act.amount)}\n\n`
        + `Буцаасан: ${rejectorName} (${rejectorRole})\n`
        + `ШАЛТГААН: ${reason}\n\n`
        + `Гүйцэтгэгч шалтгааныг нягталж дахин илгээнэ үү.`;

    // ★ Хүлээн авагчид: гүйцэтгэгч + бүх дотоод хүн (Координатор, Инженер, Захирал, Нягтлан)
    const recipients = [];
    // Гүйцэтгэгч
    if (act.submittedBy) {
        recipients.push({ email: act.submittedBy, name: act.submittedByName || 'Гүйцэтгэгч' });
    }
    // Бүх дотоод баталгч (CHAIN — Координатор, Инженер, Захирал, Нягтлан)
    CHAIN.forEach(role => {
        recipients.push({ email: role.email, name: role.name });
    });

    // Давхардсан имэйл устгах
    const seen = new Set();
    const unique = recipients.filter(r => {
        if (!r.email || seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
    });

    // ★ Тус бүрд ДАРААЛАН илгээх (EmailJS rate limit-ээс сэргийлж хооронд нь хүлээнэ)
    let sentCount = 0;
    for (const r of unique) {
        try {
            await sendMail(r.email, r.name, act, rejectorName, {
                subject, message, type: 'rejection', reason: reason,
            });
            sentCount++;
            // Дараагийн имэйл хүртэл 600ms хүлээх (rate limit-ээс сэргийлнэ)
            await new Promise(res => setTimeout(res, 600));
        } catch (err) {
            console.error('Буцаалт имэйл алдаа (' + r.email + '):', err);
        }
    }
    console.log(`✉️ Буцаалтын имэйл ${sentCount}/${unique.length} хүнд илгээгдлээ`);
    return sentCount;
}

function sendPartialMail(act, approvedPct, approvedAmt, remainingAmt, reason, coordinatorName) {
    if (!act.submittedBy) return Promise.resolve();
    const subject = `⚠ Таны акт хэсэгчлэн батлагдлаа: ${act.actId} (${approvedPct}%)`;
    const message = `Хүндэт ${act.submittedByName || 'гүйцэтгэгч'},\n\n`
        + `Таны илгээсэн акт ХЭСЭГЧЛЭН батлагдлаа.\n\n`
        + `АКТ: ${act.actId}\n`
        + `Компани: ${act.company}\n`
        + `Гэрээ: ${act.contract}\n`
        + `Ажил: ${act.work}\n`
        + `Анхны нийт дүн: ₮${fmtN(act.amount)}\n\n`
        + `═══════════════════════════════════\n`
        + `✓ БАТЛАГДСАН: ${approvedPct}% (₮${fmtN(approvedAmt)})\n`
        + `⏳ ҮЛДЭГДЭЛ: ${100 - approvedPct}% (₮${fmtN(remainingAmt)})\n`
        + `═══════════════════════════════════\n\n`
        + `ХЭСЭГЧЛЭН БАТЛАСАН ШАЛТГААН:\n${reason}\n\n`
        + `Координатор: ${coordinatorName}\n\n`
        + `Үлдэгдэл ажлаа гүйцээгээд шинэ актаар дахин илгээнэ үү.`;
    return sendMail(act.submittedBy, act.submittedByName || 'Гүйцэтгэгч', act, coordinatorName, {
        subject, message, type: 'partial_approval', reason: reason,
        approvedPercent: approvedPct + '%',
        approvedAmount: '₮' + fmtN(approvedAmt),
        remainingAmount: '₮' + fmtN(remainingAmt),
    });
}

const ROLE_AVATAR_ICONS = {
    'Координатор': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M3 21v-2a7 7 0 0 1 14 0v2"></path></svg>',
    'Б.Инженер': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    'Инженер': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    'Захирал': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 11l-3 3-3-3"></path><path d="M19 14V6"></path></svg>',
    'Нягтлан': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',
    'Гүйцэтгэгч': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>',
    'CEO': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"></path></svg>',
    'CFO': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
};

// ★ Redirect-ээс буцаж ирэхэд үр дүнг шалгах (signInWithRedirect-ийн дараа)
getRedirectResult(auth)
    .then(result => {
        if (result && result.user) {
            console.log('✅ Redirect нэвтрэлт амжилттай:', result.user.email);
        }
    })
    .catch(err => {
        console.error('Redirect result error:', err);
        if (err?.code === 'auth/unauthorized-domain') {
            toast('Энэ домэйн Firebase дээр зөвшөөрөгдөөгүй байна.', 'err');
        } else if (err?.code) {
            toast('Нэвтрэх алдаа: ' + err.code, 'err');
        }
    });

onAuthStateChanged(auth, u => {
    if (u) {
        cu = u; role = ROLES[u.email] || 'Гүйцэтгэгч';
        e('loginPage').style.display = 'none'; e('appPage').style.display = 'block';
        e('uav').innerHTML = ROLE_AVATAR_ICONS[role] || ROLE_AVATAR_ICONS['Гүйцэтгэгч'];
        e('uav').style.background = ROLE_AVATAR_BG[role] || 'linear-gradient(135deg, #6b7280, #4b5563)';
        e('uav').style.color = '#fff';
        const SHORT_NAMES = {
            'unumunkh@talstgroup.mn': 'Б.Өнөмөнх',
            'dalaitseren@talstgroup.mn': 'З.Далайцэрэн',
            'unursaikhan@talstgroup.mn': 'Инженер',
            'enkhtuul@talstgroup.mn': 'Захирал',
            'naranzul@talstgroup.mn': 'Нягтлан',
            'ulziisaikhan@talstgroup.mn': 'CEO',
            'narankhuu@talstgroup.mn': 'CFO',
        };
        e('uname').textContent = SHORT_NAMES[u.email] || u.displayName || u.email;
        e('urole').textContent = role;
        e('aplbl').textContent = role + ' горимд батлах актууд';

        applyViewerMode();
        listen();
        startAutoDeleteRejected();
        startRejectedCountdownRefresh();
    } else {
        cu = null; e('loginPage').style.display = 'flex'; e('appPage').style.display = 'none';
        if (unsub) { unsub(); unsub = null; }
        if (unsubContracts) { unsubContracts(); unsubContracts = null; }
        if (autoDeleteInterval) { clearInterval(autoDeleteInterval); autoDeleteInterval = null; }
        if (rejectedCountdownInterval) { clearInterval(rejectedCountdownInterval); rejectedCountdownInterval = null; }
    }
});

function listen() {
    // ★ Гэрээнүүдийг сонсох
    const qc = query(collection(db, 'contracts'), orderBy('createdAt', 'desc'));
    unsubContracts = onSnapshot(qc, snap => {
        contracts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (ctab === 4) rContracts();
        if (ctab === 3) renderContractBalances();
    });

    const q = query(collection(db, 'acts'), orderBy('createdAt', 'desc'));
    unsub = onSnapshot(q, snap => {
        acts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cleanupExpiredRejected();
        if (ctab === 0) rA0();
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
        const rejTime = a.rejectedAt ? (typeof a.rejectedAt.toMillis === 'function' ? a.rejectedAt.toMillis() : a.rejectedAt) : null;
        if (!rejTime) return false; // ★ rejectedAt хараахан тавигдаагүй бол УСТГАХГҮЙ (шинэ буцаалт)
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

function startRejectedCountdownRefresh() {
    if (rejectedCountdownInterval) clearInterval(rejectedCountdownInterval);
    rejectedCountdownInterval = setInterval(() => {
        if (ctab === 2) {
            if (listFilter === 'rejected') renderListBody();
            else if (!listFilter) renderListBody();
        }
    }, 30 * 1000);
}

function go(n) {
    if (isViewer(role) && (n === 0 || n === 1)) n = 2;
    [0, 1, 2, 3, 4].forEach(i => { const p = e('p' + i); const t = e('tb' + i); if (p) p.style.display = 'none'; if (t) t.classList.remove('on'); });
    e('pd').style.display = 'none';
    e('p' + n).style.display = 'block'; e('tb' + n).classList.add('on'); ctab = n;
    if (n === 0) rA0();
    if (n === 1) rA();
    if (n === 2) rL();
    if (n === 3) rD();
    if (n === 4) rContracts();
}

function bk() {
    e('pd').style.display = 'none';
    e('p' + prev).style.display = 'block'; e('tb' + prev).classList.add('on'); ctab = prev;
}

function opd(idx, from) {
    prev = from;
    [0, 1, 2, 3, 4].forEach(i => { const p = e('p' + i); const t = e('tb' + i); if (p) p.style.display = 'none'; if (t) t.classList.remove('on'); });
    e('pd').style.display = 'block'; e('dc').dataset.idx = idx; e('dc').innerHTML = detH(idx);
}

function applyViewerMode() {
    if (isViewer(role)) {
        const tab0 = e('tb0'); const tab1 = e('tb1'); const tab4 = e('tb4');
        if (tab0) tab0.style.display = 'none';
        if (tab1) tab1.style.display = 'none';
        if (tab4) tab4.style.display = 'none';
        go(2);
    } else {
        const tab0 = e('tb0'); const tab1 = e('tb1'); const tab4 = e('tb4');
        if (tab0) tab0.style.display = '';
        if (tab1) tab1.style.display = '';
        if (tab4) tab4.style.display = '';
    }
}

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

// ★★★ SUBMIT — е-баримтын PDF хадгална ★★★
async function submitAct() {
    const c = e('fc').value.trim(), g = e('fg').value.trim(), w = e('fw').value.trim(), a = e('fa').value.trim();
    if (!c || !g || !w || !a) { toast('Компани, гэрээ, ажил, дүн заавал!', 'err'); return; }
    const totalKb = pdfDataList.reduce((s, x) => s + x.sizeKb, 0);
    const notaryKb = ebrPdfList.reduce((s, x) => s + x.sizeKb, 0);
    const grandTotalKb = totalKb + notaryKb;
    if (grandTotalKb > 4096) { toast(`PDF нийт ${grandTotalKb}KB — 4MB-аас бага байх ёстой.`, 'err'); return; }

    // ★ Гэрээний үлдэгдэл шалгах (бүртгэлтэй бол)
    const matchedContract = findContract(g);
    if (matchedContract) {
        const balance = parseInt(matchedContract.totalAmount || 0) - parseInt(matchedContract.usedAmount || 0);
        if (balance <= 0) {
            toast(`⚠ "${g}" гэрээний дүн бүрэн ашиглагдсан байна (үлдэгдэл ₮${fmtN(balance)})`, 'err');
            return;
        }
        if (parseInt(a) > balance) {
            if (!confirm(`Анхааруулга: Илгээх дүн (₮${fmtN(a)}) гэрээний үлдэгдэл (₮${fmtN(balance)})-ээс их байна. Үргэлжлүүлэх үү?`)) return;
        }
    }

    const btn = e('sbtn'); btn.disabled = true; btn.textContent = 'Илгээж байна...';
    e('progWrap').style.display = 'block'; e('progText').style.display = 'block';
    e('progBar').style.width = '20%'; e('progText').textContent = 'Мэдээлэл бэлдэж байна...';
    const aid = 'АКТ-' + new Date().getFullYear() + '-' + String(Date.now()).substr(-4);
    try {
        e('progBar').style.width = '60%'; e('progText').textContent = 'Firestore-д хадгалж байна...';
        const hasNotary = ebrPdfList.length > 0;
        const actData = {
            actId: aid, date: todayYMD(),
            company: c, contract: g, work: w, dateFrom: e('fd1').value, dateTo: e('fd2').value, amount: a,
            pdfs: pdfDataList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb })),
            pdfCount: pdfDataList.length,
            ebrPdfs: ebrPdfList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb })),
            ebrPdfCount: ebrPdfList.length,
            hasEbrAttachment: hasNotary,
            ebrStatus: null,
            ebrDeductedAmount: null,
            originalAmountBeforeEbr: null,
            step: 0, status: 'pending',
            submittedBy: cu.email, submittedByName: cu.displayName || cu.email,
            createdAt: serverTimestamp(),
            evs: [{
                type: 'submit', who: cu.displayName || cu.email, whoEmail: cu.email,
                title: 'Акт илгээсэн',
                detail: c + ' · ' + g + ' · ₮' + fmtN(a)
                    + (pdfDataList.length ? ` · ${pdfDataList.length} ажлын PDF (~${totalKb}KB)` : ' · Ажлын баримтгүй')
                    + (hasNotary ? ` · ${ebrPdfList.length} е-баримтын PDF (~${notaryKb}KB)` : ' · 📄 Е-баримт ХАВСРААГҮЙ'),
                time: ts(), hash: gh()
            }]
        };
        await addDoc(collection(db, 'acts'), actData);
        e('progBar').style.width = '85%'; e('progText').textContent = 'Email илгээж байна...';
        await sendMail(CHAIN[0].email, CHAIN[0].name, actData, cu.displayName || cu.email);
        e('progBar').style.width = '100%';
        toast('✅ Акт илгээгдлээ! Координаторт email очлоо.');
        ['fc', 'fg', 'fw', 'fd1', 'fd2', 'fa'].forEach(id => e(id).value = '');
        pdfDataList = []; ebrPdfList = [];
        e('pdfList').innerHTML = ''; e('compInfo').textContent = '';
        e('notaryList').innerHTML = ''; e('notaryInfo').textContent = '';
        e('amtFmt').textContent = '';
        const ci = e('contractInfo'); if (ci) ci.style.display = 'none';
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); console.error(err); }
    btn.disabled = false; btn.textContent = 'Акт илгээх';
    setTimeout(() => { e('progWrap').style.display = 'none'; e('progText').style.display = 'none'; e('progBar').style.width = '0%'; }, 1500);
}

// ════════════════════════════════════════════════════════════
// ★★★ ГЭРЭЭ ★★★
// ════════════════════════════════════════════════════════════

function fmtContractAmt() {
    const v = e('cfAmount').value;
    e('cfAmtFmt').textContent = v && !isNaN(v) ? '₮ ' + parseInt(v).toLocaleString() : '';
}

async function submitContract() {
    if (role !== 'Координатор') { toast('Зөвхөн Координатор гэрээ бүртгэх эрхтэй', 'err'); return; }
    const company = e('cfCompany').value.trim();
    const no = e('cfNo').value.trim();
    const amount = e('cfAmount').value.trim();
    if (!company || !no || !amount) { toast('Бүх талбарыг бөглөнө үү', 'err'); return; }
    if (isNaN(amount) || parseInt(amount) <= 0) { toast('Дүн зөв оруулна уу', 'err'); return; }

    if (contracts.some(c => (c.contractNo || '').toLowerCase() === no.toLowerCase())) {
        toast('Энэ гэрээний дугаар аль хэдийн бүртгэлтэй байна', 'err');
        return;
    }

    const btn = e('cfBtn'); btn.disabled = true; btn.textContent = 'Бүртгэж байна...';
    try {
        await addDoc(collection(db, 'contracts'), {
            contractNo: no,
            company: company,
            totalAmount: String(amount),
            usedAmount: '0',
            createdBy: cu.email,
            createdByName: cu.displayName || cu.email,
            createdAt: serverTimestamp()
        });
        toast('✅ Гэрээ бүртгэгдлээ!');
        e('cfCompany').value = '';
        e('cfNo').value = '';
        e('cfAmount').value = '';
        e('cfAmtFmt').textContent = '';
    } catch (err) {
        toast('Алдаа: ' + err.message, 'err');
    }
    btn.disabled = false; btn.textContent = 'Гэрээ бүртгэх';
}

function findContract(no) {
    if (!no) return null;
    const n = no.toLowerCase().trim();
    return contracts.find(c => (c.contractNo || '').toLowerCase().trim() === n) || null;
}

function checkContractBalance() {
    if (contractCheckTimer) clearTimeout(contractCheckTimer);
    contractCheckTimer = setTimeout(() => {
        const no = e('fg').value.trim();
        const box = e('contractInfo');
        if (!box) return;
        if (!no) { box.style.display = 'none'; return; }

        const c = findContract(no);
        if (!c) {
            box.style.display = 'block';
            box.className = 'contract-info-box ci-unknown';
            box.innerHTML = `ℹ️ Энэ гэрээ бүртгэлд алга. Илгээж болно — гэрээний үлдэгдэл хянагдахгүй.`;
            return;
        }

        const total = parseInt(c.totalAmount || 0);
        const used = parseInt(c.usedAmount || 0);
        const balance = total - used;
        const pctUsed = total > 0 ? Math.round(used / total * 100) : 0;

        let cls = 'ci-ok';
        if (balance <= 0) cls = 'ci-empty';
        else if (pctUsed >= 80) cls = 'ci-warn';

        box.style.display = 'block';
        box.className = 'contract-info-box ' + cls;
        box.innerHTML = `
            <div class="ci-company">${esc(c.company)}</div>
            <div class="ci-row"><span>Гэрээний нийт</span><strong>₮${fmtN(total)}</strong></div>
            <div class="ci-row"><span>Батлагдсан (ашигласан)</span><strong>₮${fmtN(used)}</strong></div>
            <div class="ci-bar"><div class="ci-bar-fill" style="width:${Math.min(pctUsed, 100)}%"></div></div>
            <div class="ci-row ci-balance"><span>Үлдэгдэл</span><strong>₮${fmtN(balance)}</strong></div>
            ${balance <= 0 ? '<div class="ci-alert">⚠ Гэрээний дүн дууссан байна!</div>' : ''}
        `;
    }, 250);
}

function rContracts() {
    const formCard = e('contractFormCard');
    if (formCard) formCard.style.display = (role === 'Координатор') ? 'block' : 'none';

    const el = e('contractList');
    if (!el) return;
    if (!contracts.length) {
        el.innerHTML = '<div class="empty">Бүртгэлтэй гэрээ байхгүй байна</div>';
        return;
    }
    el.innerHTML = contracts.map(c => {
        const total = parseInt(c.totalAmount || 0);
        const used = parseInt(c.usedAmount || 0);
        const balance = total - used;
        const pctUsed = total > 0 ? Math.round(used / total * 100) : 0;
        let barColor = '#00d9a3';
        if (pctUsed >= 100) barColor = '#ff5757';
        else if (pctUsed >= 80) barColor = '#ffb547';
        // Энэ гэрээтэй холбоотой батлагдсан актын тоо
        const linkedCount = acts.filter(a =>
            (a.status === 'done' || a.status === 'partial_done') &&
            (a.contract || '').toLowerCase().trim() === (c.contractNo || '').toLowerCase().trim()
        ).length;
        return `<div class="contract-card" onclick="openContract('${c.id}')" style="cursor:pointer">
            <div class="cc-top">
                <div>
                    <div class="cc-no">${esc(c.contractNo)}</div>
                    <div class="cc-company">${esc(c.company)}</div>
                </div>
                <div class="cc-balance ${balance <= 0 ? 'cc-empty' : ''}">
                    <div class="cc-balance-label">Үлдэгдэл</div>
                    <div class="cc-balance-val">₮${fmtN(balance)}</div>
                </div>
            </div>
            <div class="cc-bar"><div class="cc-bar-fill" style="width:${Math.min(pctUsed, 100)}%;background:${barColor};color:${barColor}"></div></div>
            <div class="cc-meta">
                <span>Нийт: ₮${fmtN(total)}</span>
                <span>Ашигласан: ₮${fmtN(used)} (${pctUsed}%)</span>
            </div>
            <div class="cc-meta" style="margin-top:6px">
                <span style="color:var(--brand,#635bff)">📋 ${linkedCount} батлагдсан акт · дэлгэрэнгүй харах →</span>
            </div>
        </div>`;
    }).join('');
}

// ════════════════════════════════════════════════════════════
// ★ ГЭРЭЭ ДЭЛГЭРЭНГҮЙ — ямар акт хэзээ батлагдсан
// ════════════════════════════════════════════════════════════
function openContract(contractId) {
    const c = contracts.find(x => x.id === contractId);
    if (!c) { toast('Гэрээ олдсонгүй', 'err'); return; }

    const total = parseInt(c.totalAmount || 0);
    const used = parseInt(c.usedAmount || 0);
    const balance = total - used;
    const pctUsed = total > 0 ? Math.round(used / total * 100) : 0;

    const cNo = (c.contractNo || '').toLowerCase().trim();
    const linked = acts.filter(a => (a.contract || '').toLowerCase().trim() === cNo);
    const approved = linked.filter(a => a.status === 'done' || a.status === 'partial_done');

    let barColor = '#00d9a3';
    if (pctUsed >= 100) barColor = '#ff5757';
    else if (pctUsed >= 80) barColor = '#ffb547';

    const approvedRows = approved.length ? approved.map(a => {
        const deducted = (a.status === 'partial_done')
            ? parseInt(a.approvedAmount || a.amount || 0)
            : parseInt(a.amount || 0);
        const evs = a.evs || [];
        const lastApprove = [...evs].reverse().find(ev =>
            ev.type === 'done' || ev.type === 'merged_done' || ev.type === 'partial_done'
            || (ev.type === 'approve' && (ev.title || '').includes('Нягтлан')));
        const approveTime = lastApprove ? lastApprove.time : (evs.length ? evs[evs.length - 1].time : '—');
        const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : (a.dateFrom || a.dateTo || '—');
        const statusLabel = a.status === 'partial_done'
            ? `Хэсэгчлэн ${a.approvedPercent || 0}%`
            : (a.completedViaRemaining ? '100% нэгдсэн' : 'Бүрэн батлагдсан');

        return `<div class="cdt-act-row">
            <div class="cdt-act-head">
                <span class="cdt-act-id">${esc(a.actId)}</span>
                <span class="cdt-act-amt">−₮${fmtN(deducted)}</span>
            </div>
            <div class="cdt-act-work">${esc(a.work || '')}</div>
            <div class="cdt-act-grid">
                <div class="cdt-cell"><span class="cdt-k">Компани</span><span class="cdt-v">${esc(a.company || '—')}</span></div>
                <div class="cdt-cell"><span class="cdt-k">Ажлын хугацаа</span><span class="cdt-v">${esc(dr)}</span></div>
                <div class="cdt-cell"><span class="cdt-k">Төлөв</span><span class="cdt-v cdt-ok">${statusLabel}</span></div>
                <div class="cdt-cell"><span class="cdt-k">Батлагдсан</span><span class="cdt-v">${esc(approveTime)}</span></div>
            </div>
        </div>`;
    }).join('') : '<div class="cdt-empty">Батлагдсан акт байхгүй байна</div>';

    const pendingLinked = linked.filter(a =>
        a.status === 'pending' || a.status === 'partial' || a.status === 'remaining');
    const pendingRows = pendingLinked.length ? `
        <div class="cdt-section-label">Явцад яваа · хараахан хасагдаагүй</div>
        ${pendingLinked.map(a => `<div class="cdt-act-row cdt-pending">
            <div class="cdt-act-head">
                <span class="cdt-act-id">${esc(a.actId)}</span>
                <span class="cdt-act-amt cdt-muted">₮${fmtN(a.amount)}</span>
            </div>
            <div class="cdt-act-work">${esc(a.work || '')}</div>
            <div class="cdt-act-grid">
                <div class="cdt-cell"><span class="cdt-k">Төлөв</span><span class="cdt-v">${bt(a)}</span></div>
            </div>
        </div>`).join('')}` : '';

    const html = `
        <div class="cdt-wrap">
            <button class="cdt-back" onclick="closeContractDetail()">← Гэрээ рүү буцах</button>

            <div class="cdt-summary">
                <div class="cdt-sum-head">
                    <div>
                        <div class="cdt-sum-no">${esc(c.contractNo)}</div>
                        <div class="cdt-sum-company">${esc(c.company)}</div>
                    </div>
                    <span class="cdt-sum-badge ${balance <= 0 ? 'cdt-badge-red' : 'cdt-badge-green'}">${pctUsed}% ашигласан</span>
                </div>
                <div class="cdt-sum-rows">
                    <div class="cdt-sum-row"><span>Гэрээний нийт</span><strong>₮${fmtN(total)}</strong></div>
                    <div class="cdt-sum-row"><span>Ашигласан</span><strong class="cdt-ok">₮${fmtN(used)}</strong></div>
                    <div class="cdt-sum-row cdt-sum-balance"><span>Үлдэгдэл</span><strong style="color:${balance <= 0 ? '#dc2626' : '#059669'}">₮${fmtN(balance)}</strong></div>
                </div>
                <div class="cdt-sum-bar"><div class="cdt-sum-fill" style="width:${Math.min(pctUsed, 100)}%;background:${barColor}"></div></div>
                <div class="cdt-sum-by">Бүртгэсэн: ${esc(c.createdByName || c.createdBy || '—')}</div>
            </div>

            <div class="cdt-section-label">Батлагдсан актууд (${approved.length})</div>
            ${approvedRows}
            ${pendingRows}
        </div>
    `;

    const formCard = e('contractFormCard');
    const listEl = e('contractList');
    const secLbl = document.querySelector('#p4 .seclbl');
    if (formCard) formCard.style.display = 'none';
    if (secLbl) secLbl.style.display = 'none';
    if (listEl) {
        listEl.classList.add('cdt-detail-mode'); // grid-ийг унтраана
        listEl.innerHTML = html;
    }
}

function closeContractDetail() {
    const listEl = e('contractList');
    if (listEl) listEl.classList.remove('cdt-detail-mode');
    rContracts();
    const secLbl = document.querySelector('#p4 .seclbl');
    if (secLbl) secLbl.style.display = '';
}

function renderContractBalances() {
    const el = e('dContractList');
    if (!el) return;
    if (!contracts.length) {
        el.innerHTML = '<div class="empty" style="padding:24px">Бүртгэлтэй гэрээ байхгүй</div>';
        return;
    }
    el.innerHTML = contracts.map(c => {
        const total = parseInt(c.totalAmount || 0);
        const used = parseInt(c.usedAmount || 0);
        const balance = total - used;
        const pctUsed = total > 0 ? Math.round(used / total * 100) : 0;
        let barColor = '#00d9a3';
        if (pctUsed >= 100) barColor = '#ff5757';
        else if (pctUsed >= 80) barColor = '#ffb547';
        return `<div class="dc-contract-row">
            <div class="dc-contract-head">
                <span class="dc-contract-no">${esc(c.contractNo)} · ${esc(c.company)}</span>
                <span class="dc-contract-bal" style="color:${balance <= 0 ? '#ff5757' : '#6ee7b7'}">₮${fmtN(balance)}</span>
            </div>
            <div class="dc-contract-bar"><div class="dc-contract-fill" style="width:${Math.min(pctUsed, 100)}%;background:${barColor}"></div></div>
            <div class="dc-contract-meta">
                <span>Нийт ₮${fmtN(total)}</span>
                <span>${pctUsed}% ашигласан</span>
            </div>
        </div>`;
    }).join('');
}

// Акт бүрэн батлагдах үед гэрээний usedAmount дээр батлагдсан дүнг нэмнэ
async function applyContractDeduction(a, isPartialAct, isRemainingAct) {
    try {
        console.log('[ГЭРЭЭ ХАСАЛТ] Эхэллээ. Актын гэрээний дугаар:', JSON.stringify(a.contract));
        const c = findContract(a.contract);
        if (!c) {
            console.warn('[ГЭРЭЭ ХАСАЛТ] Гэрээ ОЛДСОНГҮЙ. Актын дугаар "' + a.contract + '" нь бүртгэлтэй гэрээтэй таарахгүй байна. Бүртгэлтэй гэрээнүүд:', contracts.map(x => x.contractNo));
            return;
        }
        console.log('[ГЭРЭЭ ХАСАЛТ] Гэрээ олдлоо:', c.contractNo);

        let approvedNow;
        if (isPartialAct) {
            approvedNow = parseInt(a.approvedAmount || a.amount || 0);
        } else {
            approvedNow = parseInt(a.amount || 0);
        }
        if (!approvedNow || approvedNow <= 0) {
            console.warn('[ГЭРЭЭ ХАСАЛТ] Хасах дүн 0 байна, алгасав.');
            return;
        }

        const prevUsed = parseInt(c.usedAmount || 0);
        const newUsed = prevUsed + approvedNow;

        await updateDoc(doc(db, 'contracts', c.id), {
            usedAmount: String(newUsed),
            lastActId: a.actId,
            lastUpdatedAt: serverTimestamp()
        });
        console.log('[ГЭРЭЭ ХАСАЛТ] ✅ Амжилттай. ' + prevUsed + ' → ' + newUsed + ' (₮' + approvedNow + ' нэмэгдсэн)');
    } catch (err) {
        console.error('[ГЭРЭЭ ХАСАЛТ] Алдаа:', err);
    }
}

// ════════════════════════════════════════════════════════════
// ★★★ Е-БАРИМТЫН MODAL — Нягтлангийн шийдэл (сүүлийн алхам) ★★★
// ════════════════════════════════════════════════════════════

async function autoMarkEbrHandledForRemaining(docId, a, parentAct) {
    try {
        const newEvs = [...(a.evs || []), {
            type: 'ebr_check', who: 'Систем', whoEmail: 'system',
            title: `📄 Е-баримт: ӨМНӨ НЬ ХАСАГДСАН — Дахин хасахгүй`,
            detail: `Анхны актын (${parentAct.actId}) хэсэгчилсэн дүнгийн шалгалт дээр е-баримт төлөгдөөгүй гэж тогтоосон. `
                + `Гэрээний бүтэн дүнгээс ${EBR_DEDUCT_PERCENT}% (₮${fmtN(parentAct.ebrDeductedAmount || 0)}) аль хэдийн хасагдсан. `
                + `Үлдэгдэл актын дүн ₮${fmtN(a.amount)} хэвээр үлдэв — "Батлах" товчийг дарж эцэслэнэ үү.`,
            time: ts(), hash: gh()
        }];

        await updateDoc(doc(db, 'acts', docId), {
            ebrStatus: 'paid',
            ebrAutoHandled: true,
            ebrCheckedAt: serverTimestamp(),
            ebrCheckedBy: 'system',
            evs: newEvs
        });

        toast(`ℹ️ Е-баримт: Хэсэгчилсэн дээр аль хэдийн хасагдсан — дахин хасахгүй. "Батлах" товчийг дарна уу.`);
    } catch (err) {
        console.error('Auto ebr handle error:', err);
        toast('Алдаа: ' + err.message, 'err');
    }
}

function openEbrModal(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (role !== 'Нягтлан') { toast('Зөвхөн Нягтлан е-баримт шалгах эрхтэй', 'err'); return; }
    if ((a.step || 0) !== 4) { toast('Зөвхөн Нягтлангийн алхамд боломжтой', 'err'); return; }
    if (a.status !== 'pending' && a.status !== 'partial') { toast('Энэ актыг шалгах боломжгүй', 'err'); return; }
    if (a.ebrStatus) { toast('Е-баримт аль хэдийн шалгагдсан', 'err'); return; }

    if (a.parentDocId) {const needsNotaryCheck = (a.status === 'pending' || a.status === 'partial');
        const parentAct = acts.find(x => x.id === a.parentDocId);
        if (parentAct && parentAct.ebrStatus === 'unpaid_applied_partial') {
            autoMarkEbrHandledForRemaining(docId, a, parentAct);
            return;
        }
    }

    currentNotaryActId = docId;
    const currentAmt = parseInt(a.amount);
    const contractTotal = parseInt(a.originalAmount || a.amount);
    const deduction = Math.round(contractTotal * EBR_DEDUCT_PERCENT / 100);
    const afterDeduction = currentAmt - deduction;

    e('nmActId').textContent = a.actId;
    e('nmOriginalAmt').textContent = '₮' + fmtN(currentAmt);
    e('nmPaidAmt').textContent = '₮' + fmtN(currentAmt);
    e('nmUnpaidAmt').textContent = '₮' + fmtN(afterDeduction);
    e('nmDeductAmt').textContent = '₮' + fmtN(deduction);

    const isPartialAct = !!(a.originalAmount && a.approvedPercent);
    const contractHintEl = e('nmContractHint');
    if (contractHintEl) {
        if (isPartialAct) {
            contractHintEl.innerHTML = `<strong>Анхаар:</strong> Энэ нь хэсэгчилсэн (${a.approvedPercent}%) акт. `
                + `10% хасалт нь <strong>гэрээний бүтэн дүн ₮${fmtN(contractTotal)}-аас</strong> тооцогдоно `
                + `(-₮${fmtN(deduction)}), хэсэгчилсэн дүнгээс БИШ. Үлдэгдэл ажил ирэхэд дахин хасахгүй.`;
            contractHintEl.style.display = 'block';
        } else {
            contractHintEl.style.display = 'none';
        }
    }

    const notaryList = e('nmNotaryList');
    const titleEl = e('nmFilesTitle');
    const subEl = e('nmFilesSub');

    if (a.ebrPdfs && a.ebrPdfs.length) {
        titleEl.textContent = 'Хавсаргасан е-баримт';
        subEl.textContent = `${a.ebrPdfs.length} файл · ${a.ebrPdfs.reduce((s, p) => s + (p.sizeKb || 0), 0)}KB`;
        notaryList.innerHTML = a.ebrPdfs.map((pdf, i) => `
            <div class="nm-notary-item">
                <div class="nm-notary-item-head">
                    <span class="nm-notary-icon">📄</span>
                    <span class="nm-notary-name">${esc(pdf.name)}</span>
                    <span class="nm-notary-size">${pdf.sizeKb}KB</span>
                </div>
                <iframe src="${pdf.base64}#toolbar=0&navpanes=0&view=FitH"
                        class="nm-notary-preview"
                        title="${esc(pdf.name)}"></iframe>
            </div>
        `).join('');
    } else {
        titleEl.textContent = '⚠ Е-баримт хавсраагүй';
        subEl.textContent = 'Гүйцэтгэгч баримт оруулаагүй';
        notaryList.innerHTML = `
            <div class="nm-no-notary">
                <div class="nm-no-notary-icon">📭</div>
                <div class="nm-no-notary-text">
                    Энэ актад е-баримт хавсаргаагүй байна.
                    Та өөрийн нөөц мэдээллээс шалгаж, төлсөн эсэхийг сонгоно уу.
                </div>
            </div>`;
    }

    e('notaryModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeEbrModal() {
    e('notaryModal').classList.remove('open');
    document.body.style.overflow = '';
    currentNotaryActId = null;
    pendingNotaryStatus = null;
}

async function chooseEbrPaid() {
    const a = acts.find(x => x.id === currentNotaryActId);
    if (!a) { toast('Акт олдсонгүй', 'err'); return; }

    const btn = e('nmPaidBtn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    const savedId = currentNotaryActId;

    try {
        const newEvs = [...(a.evs || []), {
            type: 'ebr_check', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: '📄 Е-баримт шалгасан: ТӨЛСӨН',
            detail: `Нягтлан е-баримтын төлбөр төлөгдсөнийг баталгаажуулав. Дүн хэвээр ₮${fmtN(a.amount)} үлдэв.`
                + (a.hasEbrAttachment ? ` Хавсарсан баримт: ${a.ebrPdfCount} PDF` : ' Баримт хавсраагүй (Нягтлан гараар шалгасан)'),
            time: ts(), hash: gh()
        }];

        await updateDoc(doc(db, 'acts', savedId), {
            ebrStatus: 'paid',
            ebrCheckedAt: serverTimestamp(),
            ebrCheckedBy: cu.email,
            evs: newEvs
        });

        // Local-д тэмдэглэнэ
        const localAct = acts.find(x => x.id === savedId);
        if (localAct) localAct.ebrStatus = 'paid';

        closeEbrModal();
        toast('✅ Е-баримт төлсөн — Батлаж байна...');
    } catch (err) {
        console.error('Е-баримт paid error:', err);
        toast('Алдаа: ' + (err.message || err), 'err');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        return;
    }

    // ★ Тусдаа try — батлах үе шатанд алдаа гарсан ч е-баримт нь хадгалагдсан
    try {
        await approve(savedId, true);
    } catch (err2) {
        console.error('Батлах алдаа (е-баримт төлсөн дараа):', err2);
        toast('Е-баримт хадгалагдсан. Батлахад алдаа гарлаа — "Батлах" товч дахин дарна уу.', 'err');
    }
}

async function chooseEbrUnpaid() {
    const a = acts.find(x => x.id === currentNotaryActId);
    if (!a) return;

    const btn = e('nmUnpaidBtn');
    btn.disabled = true;
    btn.style.opacity = '0.6';

    try {
        const currentAmt = parseInt(a.amount);
        const contractTotal = parseInt(a.originalAmount || a.amount);
        const deduction = Math.round(contractTotal * EBR_DEDUCT_PERCENT / 100);
        const newAmount = currentAmt - deduction;
        const isPartialAct = !!(a.originalAmount && a.approvedPercent);

        const newEvs = [...(a.evs || []), {
            type: 'ebr_check', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: `📄 Е-баримт шалгасан: ТӨЛӨӨГҮЙ — ${EBR_DEDUCT_PERCENT}% хасагдав`,
            detail: isPartialAct
                ? `Нягтлан е-баримтын төлбөр төлөгдөөгүйг тогтоов. `
                + `Гэрээний бүтэн дүн: ₮${fmtN(contractTotal)} → Хасагдах ${EBR_DEDUCT_PERCENT}% (бүтэн дүнгээс): -₮${fmtN(deduction)}. `
                + `Энэ хэсэгчилсэн актын дүн ₮${fmtN(currentAmt)} → Эцсийн дүн: ₮${fmtN(newAmount)}. `
                + `Үлдэгдэл ажил ирэхэд дахин хасахгүй. "Батлах" товчийг дарж эцэслэнэ үү.`
                : `Нягтлан е-баримтын төлбөр төлөгдөөгүйг тогтоов. `
                + `Анхны дүн: ₮${fmtN(currentAmt)} → Хасагдах ${EBR_DEDUCT_PERCENT}%: -₮${fmtN(deduction)} → `
                + `Эцсийн дүн: ₮${fmtN(newAmount)}. Одоо "Батлах" товчийг дарж эцэслэнэ үү.`,
            time: ts(), hash: gh()
        }];

        await updateDoc(doc(db, 'acts', currentNotaryActId), {
            ebrStatus: 'unpaid',
            ebrCheckedAt: serverTimestamp(),
            ebrCheckedBy: cu.email,
            originalAmountBeforeEbr: String(currentAmt),
            ebrContractTotal: String(contractTotal),
            ebrDeductedAmount: String(deduction),
            amount: String(newAmount),
            evs: newEvs
        });

        if (isPartialAct && a.parentDocId) {
            try {
                await updateDoc(doc(db, 'acts', a.parentDocId), {
                    ebrStatus: 'unpaid_applied_partial',
                    ebrDeductedAmount: String(deduction),
                    ebrContractTotal: String(contractTotal),
                });
            } catch (e) { console.error('Parent ebr mark:', e); }
        }

        if (a.submittedBy) {
            try {
                const subject = `📄 Таны актын е-баримтын төлбөр төлөгдөөгүй: ${a.actId}`;
                const breakdown = isPartialAct
                    ? `Гэрээний бүтэн дүн: ₮${fmtN(contractTotal)}\n`
                    + `Хасагдах ${EBR_DEDUCT_PERCENT}% (бүтэн дүнгээс): -₮${fmtN(deduction)}\n`
                    + `Энэ хэсэгчилсэн актын дүн: ₮${fmtN(currentAmt)}\n`
                    + `Эцсийн дүн: ₮${fmtN(newAmount)}\n\n`
                    + `Үлдэгдэл ажил ирэхэд ДАХИН ХАСАХГҮЙ (нэг гэрээнд нэг удаа).`
                    : `Анхны дүн: ₮${fmtN(currentAmt)}\n`
                    + `Хасагдах (${EBR_DEDUCT_PERCENT}%): -₮${fmtN(deduction)}\n`
                    + `Эцсийн дүн: ₮${fmtN(newAmount)}`;
                const message = `Хүндэт ${a.submittedByName || 'гүйцэтгэгч'},\n\n`
                    + `Таны илгээсэн актын е-баримтын төлбөр төлөгдөөгүй тул гэрээний нийт дүнгээс ${EBR_DEDUCT_PERCENT}% хасагдлаа.\n\n`
                    + `АКТ: ${a.actId}\n`
                    + `Компани: ${a.company}\n`
                    + `Ажил: ${a.work}\n\n`
                    + `═══════════════════════════════════\n`
                    + breakdown + `\n`
                    + `═══════════════════════════════════\n\n`
                    + `Нягтлан: ${cu.displayName || cu.email}`;
                await sendMail(a.submittedBy, a.submittedByName || 'Гүйцэтгэгч',
                    { ...a, amount: String(newAmount) },
                    cu.displayName || cu.email,
                    { subject, message, type: 'ebr_unpaid' });
            } catch (e) { console.error('Е-баримт mail:', e); }
        }

        const savedId = currentNotaryActId;
        // ★ Local acts массивыг шинэчилнэ — approve доторх гэрээ хасалт зөв дүн ашиглахын тулд
        const localAct = acts.find(x => x.id === savedId);
        if (localAct) {
            localAct.amount = String(newAmount);
            localAct.ebrStatus = 'unpaid';
            localAct.ebrDeductedAmount = String(deduction);
            localAct.originalAmountBeforeEbr = String(currentAmt);
        }
        toast(`⚠ ${EBR_DEDUCT_PERCENT}% хасагдлаа (-₮${fmtN(deduction)}). Батлаж байна...`);
        closeEbrModal();
        // ★ Шууд эцэслэн батлах
        await approve(savedId, true);
    } catch (err) {
        console.error('Е-баримт unpaid error:', err);
        toast('Алдаа: ' + err.message, 'err');
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

// ════════════════════════════════════════════════════════════
// APPROVE / REJECT
// ════════════════════════════════════════════════════════════

async function approve(docId, ebrAlreadyChecked) {
    const a = acts.find(x => x.id === docId);
    if (!a || (a.status !== 'pending' && a.status !== 'partial')) { toast('Батлах боломжгүй!', 'err'); return; }
    if (RSTEP[role] !== a.step) { toast('Та энэ актыг батлах эрхгүй!', 'err'); return; }

    if (role === 'Нягтлан' && (a.step || 0) === 4 && !a.ebrStatus && !ebrAlreadyChecked) {
        toast('Эхлээд "Е-баримт шалгах" товч дээр дарна уу!', 'err');
        return;
    }

    const isPartialAct = a.status === 'partial' || a.approvedPercent;
    const isRemainingAct = !!a.parentDocId;

    const newEvs = [...(a.evs || []), {
        type: 'approve', who: cu.displayName || cu.email, whoEmail: cu.email,
        title: role + ' батлав ✓',
        detail: cu.email + ' · Google нэвтрэлтээр баталгаажсан'
            + (isPartialAct ? ` · Хэсэгчилсэн дүн ₮${fmtN(a.approvedAmount || a.amount)} (${a.approvedPercent}%)` : '')
            + (isRemainingAct ? ` · Үлдэгдэл ₮${fmtN(a.amount)} (${100 - (a.parentApprovedPercent || 0)}%)` : ''),
        time: ts(), hash: gh()
    }];
    const ns = (a.step || 0) + 1;
    const finishedAllSteps = ns >= 5;
    const upd = { step: ns, evs: newEvs };
    let finalEvs = newEvs;

    if (finishedAllSteps) {
        if (isPartialAct) {
            upd.status = 'partial_done';
            finalEvs = [...newEvs, {
                type: 'partial_done', who: 'Систем',
                title: `⚠ Хэсэгчлэн дууссан (${a.approvedPercent}%)`,
                detail: `${a.approvedPercent}% (₮${fmtN(a.approvedAmount)}) бүрэн батлагдсан · Үлдэгдэл (${100 - a.approvedPercent}%) гүйцээгдэхийг хүлээж байна`,
                time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;
        } else if (isRemainingAct) {
            upd.status = 'done';
            finalEvs = [...newEvs, {
                type: 'done', who: 'Систем',
                title: '🎉 Үлдэгдэл бүрэн батлагдсан',
                detail: `Үлдэгдэл ажил гүйцээгдэж бүрэн батлагдлаа · Эх акт ${a.parentActId} 100% болж дууссан`,
                time: ts(), hash: gh()
            }];
            upd.evs = finalEvs;

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
            // ★ ГЭРЭЭНИЙ ҮЛДЭГДЭЛ ХАСАХ — эцэст нь батлагдсан дүнгээр
            await applyContractDeduction(a, isPartialAct, isRemainingAct);

            await sendMail(CHAIN[3].email, CHAIN[3].name, a, cu.displayName || cu.email);

            if (isPartialAct) {
                toast(`⚠ Хэсэгчлэн батлагдлаа (${a.approvedPercent}%)! PDF бэлдэж байна...`);
                // ★ 80% хэсэг батлагдмагц тэр даруй PDF хэвлэнэ (мөнгө шилжсэн учир)
                try {
                    const partialActFinal = { ...a, ...upd, evs: finalEvs };
                    await generateFinalPdf(partialActFinal);
                    toast(`✅ ${a.approvedPercent}% хэсгийн PDF бэлэн! Үлдэгдэл ${100 - a.approvedPercent}% хүлээгдэж байна.`);
                } catch (pdfErr) {
                    console.error('Хэсэгчилсэн PDF алдаа:', pdfErr);
                    toast('⚠️ PDF алдаа: ' + pdfErr.message, 'err');
                }
            } else if (isRemainingAct) {
                toast('🎉 Үлдэгдэл батлагдлаа! PDF бэлдэж байна...');
                try {
                    // ★ Зөвхөн ҮЛДЭГДЛИЙН (20%) тусдаа PDF хэвлэнэ — нэгдсэн биш
                    const remainingActFinal = { ...a, ...upd, evs: finalEvs };
                    await generateFinalPdf(remainingActFinal);
                    const remPct = a.remainingPercent || (100 - (a.parentApprovedPercent || 0));
                    toast(`✅ Үлдэгдэл ${remPct}% хэсгийн PDF бэлэн!`);
                } catch (pdfErr) {
                    console.error('Үлдэгдэл PDF алдаа:', pdfErr);
                    toast('⚠️ PDF алдаа: ' + pdfErr.message, 'err');
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
        // Local-д шууд тэмдэглэнэ (snapshot ирэхээс өмнө жагсаалтад харагдуулна)
        const localAct = acts.find(x => x.id === docId);
        if (localAct) { localAct.status = 'rejected'; localAct.rejectedAt = Date.now(); }
        toast('❌ Акт буцаагдлаа. Бүх хүнд имэйл илгээж байна...');
        try {
            await sendRejectionMail(a, reason, cu.displayName || cu.email, role);
            toast('✅ Буцаалт дууслаа. Имэйл илгээгдсэн.');
        } catch (mailErr) {
            console.error('❌ Rejection email алдаа:', mailErr);
            toast('Акт буцаагдсан ч имэйл илгээхэд алдаа гарлаа', 'err');
        }
        // ★ "Актууд" таб руу аваачаад "Буцаагдсан" хэсгийг харуулна
        e('pd').style.display = 'none';
        go(2);
        listFilter = 'rejected';
        rL();
    } catch (err) { toast('Алдаа: ' + err.message, 'err'); }
}

// ════════════════════════════════════════════════════════════
// PARTIAL APPROVAL MODAL
// ════════════════════════════════════════════════════════════

function openPartialModal(docId, opts = {}) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (role !== 'Координатор') { toast('Зөвхөн Координатор хэсэгчлэн батлах эрхтэй', 'err'); return; }
    if (a.status !== 'pending' || (a.step || 0) !== 0) { toast('Зөвхөн анхны шалгалтын үед хэсэгчлэн батлах боломжтой', 'err'); return; }

    currentPartialActId = docId;

    const notaryWarn = e('pmNotaryWarn');
    if (notaryWarn) notaryWarn.style.display = 'none';
    const originalLabel = e('pmOriginalLabel');
    const originalSub = e('pmOriginalSub');
    if (originalLabel) originalLabel.textContent = 'Нийт ажлын дүн';
    if (originalSub) originalSub.style.display = 'none';

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
    const pctV = parseInt(e('pmSlider').value);
    const total = parseInt(a.amount);
    const approved = Math.round(total * pctV / 100);
    const remaining = total - approved;

    e('pmPercentVal').textContent = pctV + '%';
    e('pmApprovedAmt').textContent = '₮' + fmtN(approved);
    e('pmApprovedPct').textContent = pctV + '% батлагдана';
    e('pmRemainingAmt').textContent = '₮' + fmtN(remaining);
    e('pmRemainingPct').textContent = (100 - pctV) + '% гүйцэтгэгчид буцна';
    e('pmInfoApproved').textContent = '₮' + fmtN(approved);
    e('pmInfoRemaining').textContent = '₮' + fmtN(remaining);

    const slider = e('pmSlider');
    slider.style.background = `linear-gradient(to right, #f59e0b 0%, #f59e0b ${pctV}%, #e2e8f0 ${pctV}%, #e2e8f0 100%)`;
}

async function confirmPartialApprove() {
    const a = acts.find(x => x.id === currentPartialActId);
    if (!a) return;
    const pctV = parseInt(e('pmSlider').value);
    const reason = e('pmReason').value.trim();

    if (!reason) {
        toast('Шалтгаан заавал бичих ёстой!', 'err');
        e('pmReason').focus();
        return;
    }
    if (pctV < 1 || pctV > 99) {
        toast('Хувь 1-99 хооронд байх ёстой', 'err');
        return;
    }

    const total = parseInt(a.amount);
    const approvedAmount = Math.round(total * pctV / 100);
    const remainingAmount = total - approvedAmount;

    const btn = e('pmConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Боловсруулж байна...';

    try {
        const notaryNote = (a.ebrStatus === 'unpaid')
            ? ` [Е-баримт төлөгдөөгүй — нийт дүнгээс ${EBR_DEDUCT_PERCENT}% (₮${fmtN(a.ebrDeductedAmount)}) хасагдсан]`
            : '';

        const newEvs = [...(a.evs || []), {
            type: 'partial', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: 'Координатор хэсэгчлэн батлав ⚠',
            detail: `${pctV}% батлагдсан · ₮${fmtN(approvedAmount)} → Инженер уруу · ₮${fmtN(remainingAmount)} гүйцэтгэгчид буцсан · Шалтгаан: ${reason}${notaryNote}`,
            time: ts(), hash: gh()
        }];

        const partialUpd = {
            status: 'partial',
            step: 1,
            approvedPercent: pctV,
            approvedAmount: approvedAmount,
            partialReason: reason,
            evs: newEvs
        };
        await updateDoc(doc(db, 'acts', currentPartialActId), partialUpd);

        const remainingActId = a.actId + '-Б';
        const remainingActData = {
            actId: remainingActId,
            date: todayYMD(),
            company: a.company,
            contract: a.contract,
            work: a.work + ' (Үлдэгдэл ' + (100 - pctV) + '%)',
            dateFrom: a.dateFrom || '',
            dateTo: a.dateTo || '',
            amount: String(remainingAmount),
            originalAmount: String(total),
            parentActId: a.actId,
            parentDocId: currentPartialActId,
            parentApprovedPercent: pctV,
            remainingPercent: 100 - pctV,
            partialReason: reason,
            pdfs: [],
            pdfCount: 0,
            ebrPdfs: [],
            ebrPdfCount: 0,
            hasEbrAttachment: false,
            ebrStatus: null,
            step: 0,
            status: 'remaining',
            submittedBy: a.submittedBy,
            submittedByName: a.submittedByName,
            createdAt: serverTimestamp(),
            evs: [{
                type: 'remaining_created', who: cu.displayName || cu.email, whoEmail: cu.email,
                title: '⏳ Үлдэгдэл үүсгэв (' + (100 - pctV) + '%)',
                detail: `Эх акт: ${a.actId} · Үлдэгдэл дүн: ₮${fmtN(remainingAmount)} (${100 - pctV}%) · Шалтгаан: ${reason}`,
                time: ts(), hash: gh()
            }]
        };
        await addDoc(collection(db, 'acts'), remainingActData);

        try {
            await sendMail(CHAIN[1].email, CHAIN[1].name,
                { ...a, amount: String(approvedAmount) },
                cu.displayName || cu.email);
        } catch (e) { console.error('Engineer email:', e); }

        try {
            await sendPartialMail(a, pctV, approvedAmount, remainingAmount, reason, cu.displayName || cu.email);
        } catch (mailErr) {
            console.error('❌ Partial email алдаа:', mailErr);
        }

        toast('✅ Хэсэгчлэн батлагдлаа! ' + pctV + '% Инженер уруу, ' + (100 - pctV) + '% гүйцэтгэгчид буцлаа.');
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
// REMAINING MODAL
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
// ★ БУЦААГДСАН АКТ ЗАСААД ДАХИН ИЛГЭЭХ
// ════════════════════════════════════════════════════════════

function addResubmitPdfs(input) {
    const files = Array.from(input.files);
    if (!files.length) return;
    (async () => {
        for (const f of files) {
            if (f.type !== 'application/pdf') { toast('Зөвхөн PDF: ' + f.name, 'err'); continue; }
            resubmitPdfList.push(await readPdfAsBase64(f));
        }
        renderResubmitPdfList();
        input.value = '';
    })();
}

function rmResubmitPdf(i) {
    resubmitPdfList.splice(i, 1);
    renderResubmitPdfList();
}

// Е-баримт нэмэх/устгах (resubmit)
function addResubmitEbr(input) {
    const files = Array.from(input.files);
    if (!files.length) return;
    (async () => {
        for (const f of files) {
            if (f.type !== 'application/pdf') { toast('Зөвхөн PDF: ' + f.name, 'err'); continue; }
            resubmitEbrList.push(await readPdfAsBase64(f));
        }
        renderResubmitEbrList();
        input.value = '';
    })();
}

function rmResubmitEbr(i) {
    resubmitEbrList.splice(i, 1);
    renderResubmitEbrList();
}

function renderResubmitEbrList() {
    const el = e('rsEbrList');
    if (!el) return;
    el.innerHTML = resubmitEbrList.map((d, i) => `
    <div class="pdf-item pdf-item-notary">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmResubmitEbr(${i})">✕</div>
    </div>`).join('');
}

function renderResubmitPdfList() {
    const el = e('rsPdfList');
    if (!el) return;
    el.innerHTML = resubmitPdfList.map((d, i) => `
    <div class="pdf-item">
      <div class="pdf-info"><span class="pdf-icon">📄</span>
        <span class="pdf-name" title="${esc(d.name)}">${esc(d.name)}</span>
      </div>
      <span class="pdf-size">${d.sizeKb}KB</span>
      <div class="pdf-rm" onclick="rmResubmitPdf(${i})">✕</div>
    </div>`).join('');
}

function openResubmitModal(docId) {
    const a = acts.find(x => x.id === docId);
    if (!a) return;
    if (a.status !== 'rejected') { toast('Энэ акт буцаагдаагүй байна', 'err'); return; }
    if (a.submittedBy !== cu.email) { toast('Зөвхөн өөрийн актыг засах боломжтой', 'err'); return; }

    currentResubmitActId = docId;
    // ★ Хуучин PDF/е-баримтыг засварлаж болохуйц жагсаалтад ачаална
    resubmitPdfList = (a.pdfs || []).map(p => ({ name: p.name, base64: p.base64, sizeKb: p.sizeKb }));
    resubmitEbrList = (a.ebrPdfs || []).map(p => ({ name: p.name, base64: p.base64, sizeKb: p.sizeKb }));

    // Буцаасан шалтгааныг олох
    const rejectEv = (a.evs || []).slice().reverse().find(ev => ev.type === 'reject');
    const reasonText = rejectEv ? rejectEv.detail.replace(/^Шалтгаан:\s*/, '') : 'Тодорхойгүй';
    const rejectorName = rejectEv ? rejectEv.who : '';

    e('rsActId').textContent = a.actId;
    e('rsRejectReason').textContent = reasonText + (rejectorName ? ` — ${rejectorName}` : '');
    e('rsCompany').value = a.company || '';
    e('rsWork').value = a.work || '';
    e('rsAmount').value = a.amount || '';
    e('rsNote').value = '';
    // ★ Хуучин файлуудыг жагсаалтад харуулна (устгаж/нэмж болно)
    renderResubmitPdfList();
    renderResubmitEbrList();
    const oldPdfInfo = e('rsOldPdfInfo');
    if (oldPdfInfo) {
        oldPdfInfo.textContent = resubmitPdfList.length
            ? `Доорх ${resubmitPdfList.length} файл хадгалагдсан. ✕ дарж устгаж, шинээр нэмж болно.`
            : 'Файл байхгүй. Шаардлагатай бол нэмнэ үү.';
    }
    const oldEbrInfo = e('rsOldEbrInfo');
    if (oldEbrInfo) {
        oldEbrInfo.textContent = resubmitEbrList.length
            ? `Доорх ${resubmitEbrList.length} е-баримт хадгалагдсан. ✕ дарж устгаж, шинээр нэмж болно.`
            : 'Е-баримт байхгүй. Шаардлагатай бол нэмнэ үү.';
    }

    e('resubmitModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeResubmitModal() {
    e('resubmitModal').classList.remove('open');
    document.body.style.overflow = '';
    currentResubmitActId = null;
    resubmitPdfList = [];
    resubmitEbrList = [];
}

async function confirmResubmit() {
    const a = acts.find(x => x.id === currentResubmitActId);
    if (!a) return;

    const company = e('rsCompany').value.trim();
    const work = e('rsWork').value.trim();
    const amount = e('rsAmount').value.trim();
    const note = e('rsNote').value.trim();

    if (!company || !work || !amount) {
        toast('Компани, ажил, дүн заавал бөглөнө үү', 'err');
        return;
    }
    if (isNaN(amount) || parseInt(amount) <= 0) {
        toast('Дүн зөв оруулна уу', 'err');
        return;
    }

    const totalKb = resubmitPdfList.reduce((s, x) => s + x.sizeKb, 0)
        + resubmitEbrList.reduce((s, x) => s + x.sizeKb, 0);
    if (totalKb > 4096) { toast(`PDF нийт ${totalKb}KB — 4MB-аас бага байх ёстой`, 'err'); return; }

    const btn = e('rsConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Илгээж байн...';

    try {
        // ★ Жагсаалт дахь файлууд = хуучин (устгаагүй) + шинэ. Давхарлахгүй.
        const finalPdfs = resubmitPdfList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb }));
        const finalEbr = resubmitEbrList.map(d => ({ name: d.name, base64: d.base64, sizeKb: d.sizeKb }));

        const newEvs = [...(a.evs || []), {
            type: 'submit', who: cu.displayName || cu.email, whoEmail: cu.email,
            title: '🔄 Засаад дахин илгээв',
            detail: `Гүйцэтгэгч буцаалтын дараа засаж дахин илгээв.`
                + (note ? ` Тайлбар: ${note}.` : '')
                + ` Дүн: ₮${fmtN(amount)}`
                + ` · ${finalPdfs.length} ажлын PDF`
                + ` · ${finalEbr.length} е-баримт`,
            time: ts(), hash: gh()
        }];

        const upd = {
            status: 'pending',
            step: 0,
            company: company,
            work: work,
            amount: String(amount),
            pdfs: finalPdfs,
            pdfCount: finalPdfs.length,
            ebrPdfs: finalEbr,
            ebrPdfCount: finalEbr.length,
            hasEbrAttachment: finalEbr.length > 0,
            ebrStatus: null, // ★ Е-баримтын шалгалтыг дахин шинэчилнэ (Нягтлан дахин шалгана)
            resubmittedAt: serverTimestamp(),
            rejectedAt: null, // ★ Буцаалтын устгах таймерыг цуцлана
            evs: newEvs
        };
        await updateDoc(doc(db, 'acts', currentResubmitActId), upd);

        // Local-д тэмдэглэнэ
        const localAct = acts.find(x => x.id === currentResubmitActId);
        if (localAct) { localAct.status = 'pending'; localAct.step = 0; localAct.rejectedAt = null; }

        // Координаторт мэдэгдэнэ
        try {
            await sendMail(CHAIN[0].email, CHAIN[0].name,
                { ...a, company, work, amount: String(amount) },
                cu.displayName || cu.email, {
                    subject: `🔄 Засаж дахин илгээсэн акт: ${a.actId}`,
                    message: `Хүндэт ${CHAIN[0].name},\n\n`
                        + `Буцаагдсан актыг гүйцэтгэгч засаж дахин илгээлээ.\n\n`
                        + `АКТ: ${a.actId}\n`
                        + `Компани: ${company}\n`
                        + `Ажил: ${work}\n`
                        + `Дүн: ₮${fmtN(amount)}\n\n`
                        + (note ? `Гүйцэтгэгчийн тайлбар: ${note}\n\n` : '')
                        + `Дахин шалгаж батлуулна уу.`,
                    type: 'resubmit'
                });
        } catch (e) { console.error('Resubmit mail error:', e); }

        toast('✅ Засаж дахин илгээгдлээ! Координаторт мэдэгдэл очлоо.');
        closeResubmitModal();
        // Актууд таб руу буцаана
        e('pd').style.display = 'none';
        go(2);
    } catch (err) {
        console.error('Resubmit error:', err);
        toast('Алдаа: ' + err.message, 'err');
    }
    btn.disabled = false;
    btn.textContent = '🔄 Дахин илгээх';
}

async function submitComment(docId) {
    if (!isViewer(role)) { toast('Зөвхөн CEO/CFO тэмдэглэл бичих эрхтэй', 'err'); return; }
    const a = acts.find(x => x.id === docId);
    if (!a) { toast('Акт олдсонгүй', 'err'); return; }

    const inputEl = e('commentInput-' + docId);
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) {
        toast('Тэмдэглэл бичнэ үү', 'err');
        inputEl.focus();
        return;
    }
    if (text.length > 500) {
        toast('Тэмдэглэл 500 тэмдэгтээс хэтрэхгүй байх', 'err');
        return;
    }

    inputEl.disabled = true;

    try {
        const newEvs = [...(a.evs || []), {
            type: 'viewer_comment',
            who: cu.displayName || cu.email,
            whoEmail: cu.email,
            whoRole: role,
            title: `💬 ${role}-ийн тэмдэглэл`,
            detail: text,
            time: ts(),
            hash: gh()
        }];

        await updateDoc(doc(db, 'acts', docId), { evs: newEvs });

        if (a.submittedBy) {
            try {
                const subject = `💬 ${role} таны акт дээр тэмдэглэл нэмлээ: ${a.actId}`;
                const message = `Хүндэт ${a.submittedByName || 'гүйцэтгэгч'},\n\n`
                    + `${role} (${cu.displayName || cu.email}) таны актад хяналтын тэмдэглэл нэмэв.\n\n`
                    + `АКТ: ${a.actId}\n`
                    + `Компани: ${a.company}\n`
                    + `Ажил: ${a.work}\n\n`
                    + `═══════════════════════════════════\n`
                    + `${role}-ИЙН ТЭМДЭГЛЭЛ:\n`
                    + `${text}\n`
                    + `═══════════════════════════════════`;
                await sendMail(a.submittedBy, a.submittedByName || 'Гүйцэтгэгч', a, cu.displayName || cu.email, {
                    subject, message, type: 'viewer_comment', reason: text,
                });
            } catch (mailErr) {
                console.error('Comment email алдаа:', mailErr);
            }
        }

        toast(`✅ ${role} тэмдэглэл нэмэгдлээ!`);
    } catch (err) {
        console.error('Comment error:', err);
        toast('Алдаа: ' + err.message, 'err');
        inputEl.disabled = false;
    }
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

    drawText('TALST · ACT', margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    y -= 4;
    page.drawLine({
        start: { x: margin, y: y - 2 },
        end: { x: margin + 50, y: y - 2 },
        thickness: 1.5,
        color: rgb(0.06, 0.73, 0.51)
    });
    y -= 24;

    drawText(act.actId, margin, y, { size: 26, color: rgb(0.06, 0.09, 0.16) });
    y -= 22;

    const subtitleParts = [act.date];
    if (act.company) subtitleParts.push(act.company);
    drawText(subtitleParts.join('  ·  '), margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    y -= 14;

    const isPartial = act.approvedPercent && act.approvedPercent < 100;
    const isMerged = act.completedViaRemaining;
    const isRemaining = act.parentApprovedPercent && act.originalAmount; // ★ үлдэгдэл акт
    const remPct = isRemaining ? (act.remainingPercent || (100 - act.parentApprovedPercent)) : 0;
    const statusText = isPartial
        ? `ХЭСЭГЧЛЭН ${act.approvedPercent}%`
        : isRemaining
            ? `ҮЛДЭГДЭЛ ${remPct}%`
            : isMerged
                ? '100% БҮРЭН (НЭГДСЭН)'
                : 'БҮРЭН БАТЛАГДСАН';
    const statusColor = (isPartial || isRemaining)
        ? rgb(0.96, 0.62, 0.04)
        : rgb(0.06, 0.73, 0.51);

    const badgeWidth = statusText.length * 5.5 + 16;
    page.drawRectangle({
        x: margin,
        y: y - 4,
        width: badgeWidth,
        height: 18,
        color: (isPartial || isRemaining) ? rgb(1, 0.95, 0.85) : rgb(0.86, 0.96, 0.91),
        borderColor: statusColor,
        borderWidth: 0.8,
    });
    drawText(statusText, margin + 8, y + 1, { size: 9, color: statusColor });
    y -= 28;

    drawLine(y, rgb(0.9, 0.92, 0.94));
    y -= 18;

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

    drawMetaRow('Гэрээний дугаар', act.contract);
    drawMetaRow('Ажлын хугацаа', (act.dateFrom || '—') + ' — ' + (act.dateTo || '—'));
    drawMetaRow('Илгээсэн', act.submittedByName || act.submittedBy);

    if (act.ebrStatus) {
        drawMetaSeparator();
        if (act.ebrStatus === 'paid') {
            drawMetaRow('Е-баримт', '✓ Төлөгдсөн', rgb(0.06, 0.4, 0.27), 10.5);
        } else if (act.ebrStatus === 'unpaid') {
            drawMetaRow('Е-баримт', `✗ Төлөгдөөгүй (-${EBR_DEDUCT_PERCENT}%)`, rgb(0.85, 0.18, 0.18), 10.5);
            if (act.originalAmountBeforeEbr) {
                drawMetaRow('Анхны дүн (хасалт өмнө)', '₮ ' + fmtN(act.originalAmountBeforeEbr), rgb(0.42, 0.45, 0.5), 10.5);
                drawMetaRow(`Хасагдсан ${EBR_DEDUCT_PERCENT}%`, '-₮ ' + fmtN(act.ebrDeductedAmount), rgb(0.85, 0.18, 0.18), 10.5);
            }
        }
    }

    drawMetaSeparator();
    y -= 4;

    if (isMerged) {
        const approvedPart = parseInt(act.approvedAmount || 0);
        const remainingPart = parseInt(act.amount) - approvedPart;
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.amount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Эхний цикл (${act.approvedPercent}%)`, '₮ ' + fmtN(approvedPart), rgb(0.06, 0.4, 0.27), 11);
        drawMetaRow(`Үлдэгдэл цикл (${100 - act.approvedPercent}%)`, '₮ ' + fmtN(remainingPart), rgb(0.06, 0.4, 0.27), 11);
        drawMetaSeparator();
        drawMetaRow('Нийт батлагдсан', '₮ ' + fmtN(act.amount), rgb(0.06, 0.4, 0.27), 14);
    } else if (isPartial) {
        const remainingPart = parseInt(act.amount) - parseInt(act.approvedAmount);
        drawMetaRow('Үндсэн дүн', '₮ ' + fmtN(act.amount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Батлагдсан дүн (${act.approvedPercent}%)`, '₮ ' + fmtN(act.approvedAmount), rgb(0.06, 0.4, 0.27), 13);
        drawMetaRow(`Үлдэгдэл (${100 - act.approvedPercent}%)`, '₮ ' + fmtN(remainingPart), rgb(0.85, 0.55, 0.04), 11);
    } else if (act.parentApprovedPercent && act.originalAmount) {
        const approvedPart = parseInt(act.originalAmount) - parseInt(act.amount);
        drawMetaRow('Анхны нийт дүн', '₮ ' + fmtN(act.originalAmount), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Өмнө батлагдсан (${act.parentApprovedPercent}%)`, '₮ ' + fmtN(approvedPart), rgb(0.42, 0.45, 0.5), 10.5);
        drawMetaRow(`Үлдэгдэл дүн (${act.remainingPercent || (100 - act.parentApprovedPercent)}%)`, '₮ ' + fmtN(act.amount), rgb(0.06, 0.4, 0.27), 13);
    } else {
        drawMetaRow('Батлагдсан дүн', '₮ ' + fmtN(act.approvedAmount || act.amount), rgb(0.06, 0.4, 0.27), 13);
    }

    drawMetaSeparator();
    y -= 4;

    if (act.work) {
        drawText('Ажил', margin, y, { size: 9, color: rgb(0.55, 0.6, 0.65) });
        y -= 12;
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
        drawMetaRow('Хавсралт', act.pdfCount + ' ажлын PDF', rgb(0.42, 0.45, 0.5));
    }
    if (act.ebrPdfCount) {
        drawMetaRow('Е-баримт', act.ebrPdfCount + ' PDF', rgb(0.42, 0.45, 0.5));
    }

    if (act.parentActId) {
        drawMetaRow('Эх акт', act.parentActId, rgb(0.42, 0.45, 0.5));
    }

    if (act.partialReason) {
        y -= 6;
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

    drawText('ЯВЦЫН ТҮҮХ', margin, y, { size: 11, color: rgb(0.42, 0.45, 0.5) });
    drawText('АУДИТ ЛОГ', pageWidth - margin - 60, y, { size: 9, color: rgb(0.65, 0.7, 0.75) });
    y -= 22;

    const events = act.evs || [];
    events.forEach((ev, i) => {
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
        const isPartialEv = ev.type === 'partial' || ev.type === 'remaining_created';
        const isNotary = ev.type === 'ebr_check';
        const dotColor = isApprove ? rgb(0.11, 0.62, 0.46)
            : isReject ? rgb(0.88, 0.29, 0.29)
                : isPartialEv ? rgb(0.96, 0.62, 0.04)
                    : isNotary ? rgb(0.4, 0.4, 0.85)
                        : rgb(0.5, 0.5, 0.5);
        const icon = isApprove ? '✓' : isReject ? '✕' : isPartialEv ? '⚠' : isNotary ? '§' : '→';
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
    const totalPdfCount = (act.pdfCount || 0) + (act.ebrPdfCount || 0);
    drawText(`Нийт ${events.length} арга хэмжээ · ${totalPdfCount} хавсралт`, margin, y, { size: 9, color: rgb(0.5, 0.5, 0.5) });

    const allPdfs = [...(act.pdfs || []), ...(act.ebrPdfs || [])];
    if (allPdfs.length) {
        for (const pdf of allPdfs) {
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
    if (a.status !== 'done' && a.status !== 'partial_done') { toast('Зөвхөн батлагдсан актыг татах боломжтой', 'err'); return; }
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
    if (ev.type === 'cycle_separator') {
        return `<div class="cycle-sep">
            <div class="cycle-sep-line"></div>
            <div class="cycle-sep-text">${esc(ev.title)}</div>
            <div class="cycle-sep-detail">${esc(ev.detail)}</div>
            <div class="cycle-sep-line"></div>
        </div>`;
    }

    if (ev.type === 'viewer_comment') {
        const roleColor = ev.whoRole === 'CEO' ? '#0f172a' : '#1e293b';
        return `<div class="tli">
            <div class="tll"><div class="dot dcomment">💬</div>${!isLast ? '<div class="dline lcomment"></div>' : ''}</div>
            <div class="tlr"><div class="tlcard tlcard-comment">
                <div class="tlch">
                    <div>
                        <div class="tlwho" style="color:${roleColor};font-weight:700">
                            ${esc(ev.whoRole || 'Хяналт')} · ${esc(ev.who)}
                        </div>
                        <div class="tltitle">${esc(ev.title)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px">
                        <span style="font-size:12px">📋</span>
                        <div class="tltime">${ev.time || ''}</div>
                    </div>
                </div>
                <div class="tlcb tlcb-comment">
                    <div class="tldtl tldtl-comment">${esc(ev.detail)}</div>
                </div>
            </div></div>
        </div>`;
    }

    let dc, ic, lk;
    if (ev.type === 'partial' || ev.type === 'remaining_created') {
        dc = 'dpartial'; ic = '⚠'; lk = '🔓';
    } else if (ev.type === 'ebr_check') {
        dc = 'dnotary'; ic = '📄'; lk = '🔒';
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

    const canApprove = (a.status === 'pending' || a.status === 'partial')
        && role !== 'Гүйцэтгэгч'
        && !isViewer(role)
        && RSTEP[role] === step;
    const canPartial = a.status === 'pending' && role === 'Координатор' && step === 0;
    const canComplete = a.status === 'remaining' && a.submittedBy === cu?.email;
    const canComment = isViewer(role);
    // ★ Буцаагдсан актыг гүйцэтгэгч засаж дахин илгээх боломж
    const canResubmit = a.status === 'rejected' && a.submittedBy === cu?.email;

    const needsNotaryCheck = (a.status === 'pending' || a.status === 'partial')
        && role === 'Нягтлан'
        && step === 4
        && !a.ebrStatus;

    const showEbrInlineReadonly = a.ebrPdfs && a.ebrPdfs.length
        && (role === 'Координатор' || role === 'Инженер' || role === 'Захирал')
        && (a.step || 0) < 4;

    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : a.dateFrom || a.dateTo || '—';

    let notaryPreviewHtml = '';
    if (needsNotaryCheck && a.ebrPdfs && a.ebrPdfs.length) {
        notaryPreviewHtml = `<div class="det-notary-preview">
            <div class="det-notary-header">
                <span style="font-size:18px">📄</span>
                <div>
                    <div class="det-notary-title">Е-баримт (${a.ebrPdfs.length})</div>
                    <div class="det-notary-sub">Доороос харж шалгана уу — татах шаардлагагүй</div>
                </div>
            </div>
            ${a.ebrPdfs.map((pdf, i) => `
                <div class="det-notary-doc">
                    <div class="det-notary-doc-head">
                        <span class="det-notary-doc-name">📄 ${esc(pdf.name)}</span>
                        <span class="det-notary-doc-size">${pdf.sizeKb}KB</span>
                    </div>
                    <iframe src="${pdf.base64}#toolbar=0&navpanes=0&view=FitH"
                            class="det-notary-iframe"
                            title="${esc(pdf.name)}"></iframe>
                </div>
            `).join('')}
        </div>`;
    } else if (needsNotaryCheck && (!a.ebrPdfs || !a.ebrPdfs.length)) {
        notaryPreviewHtml = `<div class="det-notary-preview det-notary-empty">
            <div class="det-notary-empty-icon">📭</div>
            <div class="det-notary-empty-title">Е-баримт хавсраагүй</div>
            <div class="det-notary-empty-text">Гүйцэтгэгч е-баримт ороогүй байна. Та өөрөө шалгаж, "Төлсөн" эсвэл "Төлөөгүй" гэж сонгоно уу.</div>
        </div>`;
    } else if (showEbrInlineReadonly) {
        notaryPreviewHtml = `<div class="det-notary-preview det-notary-readonly">
            <div class="det-notary-header">
                <span style="font-size:18px">📄</span>
                <div>
                    <div class="det-notary-title">Е-баримт (${a.ebrPdfs.length}) <span class="det-notary-badge">Зөвхөн харах</span></div>
                    <div class="det-notary-sub">Нягтлан шалгана</div>
                </div>
            </div>
            ${a.ebrPdfs.map((pdf, i) => `
                <div class="det-notary-doc">
                    <div class="det-notary-doc-head">
                        <span class="det-notary-doc-name">📄 ${esc(pdf.name)}</span>
                        <span class="det-notary-doc-size">${pdf.sizeKb}KB</span>
                    </div>
                    <iframe src="${pdf.base64}#toolbar=0&navpanes=0&view=FitH"
                            class="det-notary-iframe"
                            title="${esc(pdf.name)}"></iframe>
                </div>
            `).join('')}
        </div>`;
    }

    let notaryActionHtml = '';
    if (needsNotaryCheck) {
        notaryActionHtml = `<div class="abtns" style="border-bottom:1px solid var(--border-subtle)">
            <button class="bnotary-check" onclick="openEbrModal('${a.id}')">
                📄 Е-баримт шалгах
            </button>
        </div>`;
    }

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

    let notaryDocsHtml = '';
    if (!needsNotaryCheck && !showEbrInlineReadonly && a.ebrPdfs && a.ebrPdfs.length) {
        notaryDocsHtml = '<div class="det-pdfs det-pdfs-notary">' + a.ebrPdfs.map(pdf => `
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
      </div>` : a.status === 'partial_done' ? `
      <div class="abtns" style="margin-top:10px">
        <button class="bok" onclick="downloadFinalPdf('${a.id}')" style="background:#d97706">
          📥 ${a.approvedPercent}% хэсгийн PDF татах
        </button>
      </div>` : '';

    const partialReasonHtml = (a.status === 'partial' || a.status === 'remaining' || a.partialReason) && a.partialReason ? `
      <div class="partial-reason-card">
        <div class="partial-reason-label">⚠ Хэсэгчлэн батлах шалтгаан</div>
        <div class="partial-reason-text">${esc(a.partialReason)}</div>
      </div>` : '';

    const statusBadge = `<span class="badge ${bc(a)}">${bt(a)}</span>`;

    let ebrStatusBadge = '';
    if (a.ebrStatus === 'paid') {
        ebrStatusBadge = `<div class="notary-status-pill notary-paid">📄 ✓ Е-баримт төлөгдсөн</div>`;
    } else if (a.ebrStatus === 'unpaid') {
        ebrStatusBadge = `<div class="notary-status-pill notary-unpaid">📄 ✗ Е-баримт төлөгдөөгүй · ${EBR_DEDUCT_PERCENT}% хасагдсан (-₮${fmtN(a.ebrDeductedAmount)})</div>`;
    }

    // ★ Гэрээний үлдэгдэл badge (detail дээр)
    let contractBalanceHtml = '';
    const matchedC = findContract(a.contract);
    if (matchedC) {
        const total = parseInt(matchedC.totalAmount || 0);
        const used = parseInt(matchedC.usedAmount || 0);
        const bal = total - used;
        contractBalanceHtml = `<div class="notary-status-pill ${bal <= 0 ? 'notary-unpaid' : 'notary-paid'}">
            📋 Гэрээ "${esc(matchedC.contractNo)}" · Үлдэгдэл ₮${fmtN(bal)} / ₮${fmtN(total)}
        </div>`;
    }

    let actionBtns = '';
    if (canApprove && canPartial && !needsNotaryCheck) {
        actionBtns = `<div class="abtns">
            <button class="bok" onclick="approve('${a.id}')">✓ Бүтэн батлах</button>
            <button class="bpartial-btn" onclick="openPartialModal('${a.id}')">⚠ Хэсэгчлэн</button>
            <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
        </div>`;
    } else if (canApprove && !needsNotaryCheck) {
        actionBtns = `<div class="abtns">
            <button class="bok" onclick="approve('${a.id}')">✓ Батлах</button>
            <button class="bno" onclick="reject('${a.id}')">✕ Буцаах</button>
        </div>`;
    } else if (canComplete) {
        actionBtns = `<div class="abtns">
            <button class="bcomplete" onclick="openRemainingModal('${a.id}')">+ Гүйцээх ажил илгээх</button>
        </div>`;
    } else if (canResubmit) {
        actionBtns = `<div class="abtns">
            <button class="bcomplete" onclick="openResubmitModal('${a.id}')">✎ Засаад дахин илгээх</button>
        </div>`;
    }

    let amountDisplay;
    if (a.originalAmount && a.parentApprovedPercent) {
        const approvedPart = parseInt(a.originalAmount) - parseInt(a.amount);
        amountDisplay = `<div class="row"><span class="rl">Анхны нийт дүн</span><span class="rv amt">₮ ${fmtN(a.originalAmount)}</span></div>
           <div class="row"><span class="rl">Батлагдсан (${a.parentApprovedPercent}%)</span><span class="rv" style="color:#059669;font-weight:700">₮ ${fmtN(approvedPart)}</span></div>
           <div class="row"><span class="rl">Үлдэгдэл (${a.remainingPercent || (100 - a.parentApprovedPercent)}%)</span><span class="rv" style="color:#d97706;font-weight:700">₮ ${fmtN(a.amount)}</span></div>`;
    } else if (a.approvedAmount && a.approvedAmount !== a.amount) {
        const remainingPart = parseInt(a.amount) - parseInt(a.approvedAmount);
        amountDisplay = `<div class="row"><span class="rl">Үндсэн дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>
           <div class="row"><span class="rl">Батлагдсан дүн (${a.approvedPercent}%)</span><span class="rv" style="color:#059669;font-weight:700">₮ ${fmtN(a.approvedAmount)}</span></div>
           <div class="row"><span class="rl">Үлдэгдэл (${100 - a.approvedPercent}%)</span><span class="rv" style="color:#d97706;font-weight:600">₮ ${fmtN(remainingPart)}</span></div>`;
    } else if (a.ebrStatus === 'unpaid' && a.originalAmountBeforeEbr) {
        amountDisplay = `<div class="row"><span class="rl">Анхны дүн</span><span class="rv" style="text-decoration:line-through;color:var(--text-tertiary)">₮ ${fmtN(a.originalAmountBeforeEbr)}</span></div>
           <div class="row"><span class="rl">Е-баримт -${EBR_DEDUCT_PERCENT}%</span><span class="rv" style="color:#dc2626;font-weight:600">-₮ ${fmtN(a.ebrDeductedAmount)}</span></div>
           <div class="row"><span class="rl">Үндсэн дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>`;
    } else {
        amountDisplay = `<div class="row"><span class="rl">Дүн</span><span class="rv amt">₮ ${fmtN(a.amount)}</span></div>`;
    }

    const commentSection = canComment ? `
    <div class="comment-section">
      <div class="comment-header">
        <div class="comment-icon">${ROLE_AVATAR_ICONS[role] || ''}</div>
        <div>
          <div class="comment-title">Хяналтын тэмдэглэл нэмэх</div>
          <div class="comment-subtitle">${esc(role)} — Энэ тэмдэглэлийг бүх хэрэглэгч харна</div>
        </div>
      </div>
      <textarea id="commentInput-${a.id}" class="comment-input"
                placeholder="Хяналтын тэмдэглэл, асуулт, эсвэл сонор хүлээж байгаа зүйлээ бичнэ үү..."
                rows="3"></textarea>
      <button class="comment-submit-btn" onclick="submitComment('${a.id}')">
        💬 Тэмдэглэл нэмэх
      </button>
    </div>` : '';

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
      ${a.pdfCount ? `<div class="row"><span class="rl">Ажлын баримт</span><span class="rv">${a.pdfCount} PDF файл</span></div>` : ''}
      ${a.ebrPdfCount ? `<div class="row"><span class="rl">Е-баримт</span><span class="rv">${a.ebrPdfCount} PDF файл</span></div>` : ''}
    </div>
    ${contractBalanceHtml}
    ${ebrStatusBadge}
    ${partialReasonHtml}
    ${notaryPreviewHtml}
    ${pdfsHtml}
    ${notaryDocsHtml}
    <div class="pbwrap"><div class="pb" style="width:${p}%"></div></div>
    <div class="plabel"><span>${p}% дууссан</span><span>${step}/4 батлалт</span></div>
    ${notaryActionHtml}
    ${actionBtns}
    ${finalBtn}
    <div class="tl"><div class="tll-label">ЯВЦЫН ТҮҮХ · АУДИТ ЛОГ</div>${tl}</div>
    ${commentSection}
  </div>`;
}

function liH(a, idx, from) {
    const p = pct(a); const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const cls = a.status === 'partial' ? 'li partial' : 'li';

    const needsCheck = role === 'Нягтлан'
        && (a.status === 'pending' || a.status === 'partial')
        && (a.step || 0) === 3
        && !a.ebrStatus;
    const notaryFlag = needsCheck ? '<span class="li-notary-flag" title="Е-баримт шалгах">📄</span>' : '';

    return `<div class="${cls}" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)} ${notaryFlag}</div><div class="li-title">${esc(a.work)}</div></div>
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

function liHRejected(a, idx, from) {
    const dr = a.dateFrom && a.dateTo ? a.dateFrom + ' — ' + a.dateTo : '';
    const now = Date.now();
    const rejTime = a.rejectedAt ? (typeof a.rejectedAt.toMillis === 'function' ? a.rejectedAt.toMillis() : a.rejectedAt) : null;

    let timerHtml = '';
    let timerColor = '#e74c3c';
    if (rejTime) {
        const remaining = EIGHT_HOURS - (now - rejTime);
        if (remaining > 0) {
            const h = Math.floor(remaining / 3600000);
            const m = Math.floor((remaining % 3600000) / 60000);
            if (remaining < 60 * 60 * 1000) timerColor = '#dc2626';
            timerHtml = `<div class="reject-timer" style="color:${timerColor};font-weight:600">
                🗑 <strong>${h}ц ${m}мин</strong>-ын дараа автоматаар устах болно
            </div>`;
        } else {
            timerHtml = '<div class="reject-timer">🗑 Удахгүй устах гэж байна...</div>';
        }
    }

    const rejectEv = (a.evs || []).slice().reverse().find(ev => ev.type === 'reject');
    const reasonText = rejectEv ? rejectEv.detail.replace(/^Шалтгаан:\s*/, '') : '';
    const rejectorName = rejectEv ? rejectEv.who : '';

    return `<div class="li rejected" onclick="opd(${idx},${from})">
    <div class="li-top">
      <div><div class="li-id">${esc(a.actId)} · ${esc(a.date)}</div><div class="li-title">${esc(a.work)}</div></div>
      <span class="badge br">✕ Буцаагдсан</span>
    </div>
    <div class="li-sub">${esc(a.company)} · ₮${fmtN(a.amount)}${dr ? ' · ' + esc(dr) : ''}</div>
    ${reasonText ? `<div class="remaining-reason" style="background:rgba(254,226,226,0.6);border-left-color:#dc2626;color:#7f1d1d">📝 ${esc(reasonText)}${rejectorName ? ` <span style="opacity:0.7">— ${esc(rejectorName)}</span>` : ''}</div>` : ''}
    <div style="display:flex;align-items:center;gap:7px;margin-top:8px">
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
    if (isViewer(role)) { el.innerHTML = '<div class="empty">Хяналт хэрэглэгч батлах эрхгүй</div>'; return; }

    let list;
    if (role === 'Нягтлан') {
        list = acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === 3
        );
    } else if (role === 'Координатор') {
        list = acts.filter(a =>
            (a.status === 'pending' && (a.step || 0) === 0)
        );
    } else if (role === 'Б.Инженер') {
        list = acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === 1
        );
    } else {
        list = acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === RSTEP[role]
        );
    }
    el.innerHTML = list.length ? list.map(a => liH(a, acts.indexOf(a), 1)).join('') : '<div class="empty">Таны батлах акт байхгүй байна</div>';
}

// ════════════════════════════════════════════════════════════
// АКТУУД ТАБ
// ════════════════════════════════════════════════════════════

let listFilter = null;
let listSearch = '';
let listLimit = 10;

const ICONS = {
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    arrowLeft: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
    coordinator: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M3 21v-2a7 7 0 0 1 14 0v2"></path><circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="none" opacity="0.4"></circle></svg>',
    barilga: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    engineer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    director: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 11l-3 3-3-3"></path><path d="M19 14V6"></path></svg>',
    accountant: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',
    rejected: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
};

window.setListFilter = (f) => {
    listFilter = f;
    listLimit = 10;
    rL();
    setTimeout(() => {
        const inp = e('listSearchInput');
        if (inp && document.activeElement !== inp && listSearch) inp.focus();
    }, 0);
};

window.clearListSearch = () => {
    listSearch = '';
    listLimit = 10;
    const inp = e('listSearchInput');
    if (inp) {
        inp.value = '';
        inp.focus();
    }
    rL();
};

window.showMoreActs = () => {
    listLimit += 10;
    rL();
};

let searchDebounceTimer = null;
window.handleSearchInput = (val) => {
    listSearch = (val || '').toLowerCase().trim();
    listLimit = 10;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        renderListBody();
    }, 150);
};

function rL() {
    const el = e('ll');
    el.innerHTML = renderListHeader() + '<div id="listBody">' + renderListBodyHtml() + '</div>';
}

function renderListHeader() {
    return `
        <div class="list-header">
            <div class="list-search-wrap">
                <input type="text" id="listSearchInput" class="list-search-input"
                    value="${esc(listSearch)}"
                    autocomplete="off"
                    oninput="handleSearchInput(this.value)">
                ${listSearch
        ? `<button class="list-search-clear" onclick="clearListSearch()">${ICONS.close}</button>`
        : `<span class="list-search-icon">${ICONS.search}</span>`}
            </div>
        </div>
    `;
}

function renderListBody() {
    const body = e('listBody');
    if (body) body.innerHTML = renderListBodyHtml();
}

function renderListBodyHtml() {
    function actsAtStep(step) {
        return acts.filter(a =>
            (a.status === 'pending' || a.status === 'partial') &&
            (a.step || 0) === step
        );
    }

    function actsRejected() {
        const now = Date.now();
        return acts.filter(a => {
            if (a.status !== 'rejected') return false;
            const rejTime = a.rejectedAt ? (typeof a.rejectedAt.toMillis === 'function' ? a.rejectedAt.toMillis() : a.rejectedAt) : null;
            if (!rejTime) return true;
            return (now - rejTime) <= EIGHT_HOURS;
        });
    }

    const stepLists = {
        coordinator: actsAtStep(0),
        barilga:     actsAtStep(1),   // ★ НЭМЭХ
        engineer:    actsAtStep(2),
        director:    actsAtStep(3),
        accountant:  actsAtStep(4),
        rejected:    actsRejected(),
    };

    const stepLabels = {
        coordinator: 'Координатор',
        barilga:     'Б.Инженер',
        engineer:    'Инженер',
        director:    'Захирал',
        accountant:  'Нягтлан',
        rejected:    'Буцаагдсан',
    };

    const stepDescriptions = {
        coordinator: 'Анхны шалгалт хийгдэж байгаа',
        barilga:     'Б.Инженерийн баталгаажуулалт',
        engineer:    'Инженерийн баталгаажуулалт',
        director:    'Захирлын батламж',
        accountant:  'Гүйлгээ хийгдэх гэж байгаа',
        rejected:    '48 цагийн дотор автоматаар устана',
    };

    function matchSearch(a) {
        if (!listSearch) return true;
        return (a.contract || '').toLowerCase().includes(listSearch);
    }

    if (listSearch) {
        const found = acts.filter(matchSearch);
        if (found.length === 0) {
            return `<div class="empty" style="padding: 40px 20px">
                ${ICONS.search} "<strong>${esc(listSearch)}</strong>" гэрээний дугаараар олдсонгүй
            </div>`;
        }
        const shown = found.slice(0, listLimit);
        const remaining = found.length - shown.length;
        let html = `<div class="search-result-hint">"${esc(listSearch)}" — ${found.length}ш олдов</div>`;
        html += shown.map(a => {
            if (a.status === 'rejected') return liHRejected(a, acts.indexOf(a), 2);
            return liH(a, acts.indexOf(a), 2);
        }).join('');
        if (remaining > 0) {
            html += `<button class="show-more-btn" onclick="showMoreActs()">
                Дараагийн ${Math.min(remaining, 10)} акт <span style="opacity:0.7">(${remaining} үлдсэн)</span>
            </button>`;
        }
        return html;
    }

    if (!listFilter) {
        const cards = ['coordinator', 'barilga', 'engineer', 'director', 'accountant', 'rejected'];
        const colors = {
            coordinator: { bg: 'rgba(239, 68, 68, 0.06)',   border: 'rgba(239, 68, 68, 0.2)',   accent: '#dc2626' },
            barilga:     { bg: 'rgba(245, 158, 11, 0.06)',  border: 'rgba(245, 158, 11, 0.2)',  accent: '#d97706' },  // ★ НЭМЭХ
            engineer:    { bg: 'rgba(59, 130, 246, 0.06)',  border: 'rgba(59, 130, 246, 0.2)',  accent: '#2563eb' },
            director:    { bg: 'rgba(139, 92, 246, 0.06)',  border: 'rgba(139, 92, 246, 0.2)',  accent: '#7c3aed' },
            accountant:  { bg: 'rgba(16, 185, 129, 0.06)',  border: 'rgba(16, 185, 129, 0.2)',  accent: '#059669' },
            rejected:    { bg: 'rgba(220, 38, 38, 0.08)',   border: 'rgba(220, 38, 38, 0.3)',   accent: '#b91c1c' },
        };

        return `<div class="role-cards">
            ${cards.map(key => {
            const list = stepLists[key];
            const c = colors[key];
            const isEmpty = list.length === 0;
            const isRejected = key === 'rejected';
            return `<div class="role-card ${isEmpty ? 'empty' : ''}${isRejected ? ' role-card-rejected' : ''}" 
                    style="--c-bg: ${c.bg}; --c-border: ${c.border}; --c-accent: ${c.accent}"
                    onclick="${isEmpty ? '' : `setListFilter('${key}')`}">
                    <div class="role-card-icon" style="color: ${c.accent}">${ICONS[key]}</div>
                    <div class="role-card-body">
                        <div class="role-card-title">${stepLabels[key]}</div>
                        <div class="role-card-desc">${stepDescriptions[key]}</div>
                    </div>
                    <div class="role-card-count" style="color: ${c.accent}">${list.length}</div>
                </div>`;
        }).join('')}
        </div>`;
    }

    const list = stepLists[listFilter] || [];

    let html = `<div class="role-detail-header">
        <button class="back-to-roles" onclick="setListFilter(null)">
            ${ICONS.arrowLeft} <span>Бүх үүрэг</span>
        </button>
        <div class="role-detail-title">${stepLabels[listFilter]} <span class="role-detail-count">${list.length}</span></div>
    </div>`;

    if (list.length === 0) {
        html += `<div class="empty" style="padding: 40px 20px">
            <div style="font-size: 14px;">${stepLabels[listFilter]} дээр хүлээгдэж буй акт байхгүй</div>
        </div>`;
        return html;
    }

    const shown = list.slice(0, listLimit);
    const remaining = list.length - shown.length;

    if (listFilter === 'rejected') {
        html += shown.map(a => liHRejected(a, acts.indexOf(a), 2)).join('');
    } else {
        html += shown.map(a => liH(a, acts.indexOf(a), 2)).join('');
    }

    if (remaining > 0) {
        html += `<button class="show-more-btn" onclick="showMoreActs()">
            Дараагийн ${Math.min(remaining, 10)} акт <span style="opacity:0.7">(${remaining} үлдсэн)</span>
        </button>`;
    }

    return html;
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

    const allActiveActs = [...pending, ...partial];
    const steps = [0, 1, 2, 3, 4].map(i => allActiveActs.filter(a => (a.step || 0) === i).length);
    const partialCount = partial.length;
    const maxS = Math.max(...steps, done.length, partialCount, remainingActs.length, 1);

    [0, 1, 2, 3, 4].forEach(i => {
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

    // ★ Гэрээний үлдэгдэл хэсгийг render
    renderContractBalances();

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

    const dayCounts = days.map(day => actsOfDay(day).length);
    const maxCount = Math.max(...dayCounts, 1);
    const displayCounts = dayCounts;

    const dayColors = dayCounts.map(count => {
        if (count === 0) return '#ebebeb';
        const ratio = count / maxCount;
        if (ratio >= 0.75) return '#1d4ed8';
        if (ratio >= 0.5) return '#2563eb';
        if (ratio >= 0.25) return '#3b82f6';
        return '#60a5fa';
    });

    if (dbBarChart) { dbBarChart.destroy(); dbBarChart = null; }
    const ctx = e('dbBarChart'); if (!ctx) return;
    dbBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days.map(d => d.label),
            datasets: [{
                label: 'Хүсэлтийн тоо',
                data: displayCounts,
                backgroundColor: dayColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const day = days[ctx.dataIndex];
                            const da = actsOfDay(day);
                            if (!da.length) return 'Хүсэлт байхгүй';
                            const total = da.reduce((s, a) => s + parseInt(a.amount || 0), 0);
                            return `${da.length}ш хүсэлт · ₮${parseInt(total).toLocaleString('mn-MN')}`;
                        },
                        title: ctx => {
                            const day = days[ctx[0].dataIndex];
                            return `${day.label} · ${dayCounts[ctx[0].dataIndex]}ш хүсэлт`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#888', autoSkip: false, maxRotation: 0 }
                },
                y: {
                    beginAtZero: true,
                    min: 0,
                    ticks: {
                        font: { size: 10 },
                        color: '#888',
                        stepSize: 1,
                        precision: 0,
                        callback: v => Number.isInteger(v) ? v : null
                    },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                }
            },
        }
    });
}