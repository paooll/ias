/* MediCare Pro — Firebase client helper
 * ---------------------------------------------------------------------------
 * Loaded on pages that use Firestore. Fetches the public web config from
 * /api/firebase-config, initializes the Firebase SDK (compat), and exposes
 * small data helpers. Every helper returns `null` when Firebase is not
 * configured or the user is not signed in, so pages fall back to their
 * existing simulated/local behavior (graceful degradation).
 *
 * Requires the compat SDK scripts to be loaded first:
 *   firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
 */

(function () {
  'use strict';

  // Promise that resolves once Firebase is configured and auth state is known.
  window.mproFirebase = (async function init() {
    try {
      if (typeof firebase === 'undefined') {
        return { configured: false, error: new Error('Firebase SDK not loaded') };
      }

      const res = await fetch('/api/firebase-config', { cache: 'no-store' });
      if (!res.ok) return { configured: false, error: new Error('config endpoint unavailable') };
      const cfg = await res.json();
      if (!cfg || !cfg.configured) return { configured: false, error: new Error('Firebase not configured') };

      firebase.initializeApp(cfg);
      const db = firebase.firestore();
      const auth = firebase.auth();

      // Wait until the persisted session is restored (fast when logged in).
      await new Promise((resolve) => {
        const unsub = auth.onAuthStateChanged(() => { unsub(); resolve(); });
      });

      // Keep the topnav indicator in sync with sign-in/sign-out changes.
      auth.onAuthStateChanged(() => renderDbStatus({ configured: true, db, auth }));

      return { configured: true, db, auth, user: auth.currentUser };
    } catch (e) {
      return { configured: false, error: e };
    }
  })();

  async function fb() {
    const ctx = await window.mproFirebase;
    return ctx && ctx.configured && ctx.auth.currentUser ? ctx : null;
  }

  // Shows on each page's topnav whether the page is backed by the live
  // hospital database (Firestore). The indicator is intentionally hidden
  // while signed out or in demo mode so it never shows an awkward state
  // (only a positive "connected" confirmation is displayed).
  function renderDbStatus(ctx) {
    const mount = document.getElementById('dbStatusMount');
    if (!mount) return;
    if (ctx.configured && ctx.auth.currentUser) {
      mount.innerHTML = '<span class="db-chip db-ok">Hospital database connected</span>';
    } else {
      mount.innerHTML = '';
    }
  }

  // Fill the indicator once init settles (configured or not).
  (async () => {
    try {
      const ctx = await window.mproFirebase;
      renderDbStatus(ctx);
    } catch (e) { /* page without a mount */ }
  })();

  function timeAgo(date) {
    if (!date) return '';
    const diff = Math.max(0, Date.now() - new Date(date).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function patientToRecord(p) {
    const d = p.data ? p.data() : p;
    return {
      id: d.id,
      patientId: d.patientId || p.id,
      name: d.name || 'Unknown',
      diagnosis: d.diagnosis || '',
      department: d.department || '',
      room: d.room || '',
      status: d.status || '',
      ssn: d.ssn || '',
      notes: d.notes || '',
      dob: d.dob || '',
      gender: d.gender || '',
      bloodType: d.bloodType || '',
      physician: d.physician || '',
      ward: d.ward || '',
      allergies: d.allergies || [],
      medications: d.medications || '',
    };
  }

  function noteToRecord(n) {
    const d = n.data ? n.data() : n;
    const ts = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : new Date());
    return {
      id: n.id,
      patient: d.patient || '',
      author: d.author || 'Anonymous',
      authorUid: d.authorUid || '',
      content: d.content || '',
      time: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: ts,
    };
  }

  const api = {
    timeAgo,

    /** All patients (used by Patient Records lab + dashboard). */
    async getPatients() {
      const ctx = await fb();
      if (!ctx) return null;
      const snap = await ctx.db.collection('patients').get();
      return snap.docs.map(patientToRecord);
    },

    /** Case-insensitive search over patient name / id / department. */
    async searchPatients(term) {
      const all = await api.getPatients();
      if (!all) return null;
      const q = (term || '').toLowerCase().trim();
      if (!q) return all.slice(0, 20);
      return all.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.patientId || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q)
      );
    },

    /** Notes, newest first. */
    async getNotes() {
      const ctx = await fb();
      if (!ctx) return null;
      const snap = await ctx.db.collection('notes').orderBy('createdAt', 'desc').get();
      return snap.docs.map(noteToRecord);
    },

    async watchNotes(callback) {
      const ctx = await fb();
      if (!ctx) return null;
      return ctx.db.collection('notes').orderBy('createdAt', 'desc').onSnapshot(
        (snap) => callback(snap.docs.map(noteToRecord)),
        (error) => console.warn('Live notes subscription failed:', error.message)
      );
    },

    /** Add a note (author = signed-in user) and log an activity entry. */
    async addNote({ patient, content, author }) {
      const ctx = await fb();
      if (!ctx) return null;
      const docRef = await ctx.db.collection('notes').add({
        patient: patient || 'P-001',
        author: author || 'Anonymous',
        authorUid: ctx.auth.currentUser.uid,
        content,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      // Log it to the dashboard activity feed too.
      try {
        await ctx.db.collection('activity').add({
          type: 'note',
          text: `Clinical note added for patient ${patient || 'P-001'}`,
          dept: author || 'Staff',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) { /* non-fatal */ }
      return docRef.id;
    },

    /** Delete notes authored by the signed-in user ("Clear All" only affects your own notes). */
    async clearMyNotes() {
      const ctx = await fb();
      if (!ctx) return null;
      const uid = ctx.auth.currentUser.uid;
      const snap = await ctx.db.collection('notes').where('authorUid', '==', uid).get();
      const del = snap.docs.map((d) => ctx.db.collection('notes').doc(d.id).delete());
      await Promise.all(del);
      return del.length;
    },

    /** Dashboard data: patients, pending lab count, recent activity. */
    async getDashboard() {
      const ctx = await fb();
      if (!ctx) return null;
      const [patientsSnap, labsSnap, activitySnap] = await Promise.all([
        ctx.db.collection('patients').get(),
        ctx.db.collection('lab_reports').get(),
        ctx.db.collection('activity').orderBy('createdAt', 'desc').limit(6).get(),
      ]);
      const patients = patientsSnap.docs.map(patientToRecord);
      const pendingLabs = labsSnap.docs.filter((d) => (d.data().status || '') === 'pending').length;
      const activity = activitySnap.docs.map((d) => {
        const x = d.data();
        const ts = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date();
        return { id: d.id, type: x.type || 'system', text: x.text || '', dept: x.dept || '', createdAt: ts };
      });
      return { patients, pendingLabs, activity };
    },

    async watchDashboard(callback) {
      const ctx = await fb();
      if (!ctx) return null;
      let patients = null, labs = null, activity = null;
      const publish = () => {
        if (!patients || !labs || !activity) return;
        callback({
          patients: patients.docs.map(patientToRecord),
          pendingLabs: labs.docs.filter((d) => (d.data().status || '') === 'pending').length,
          activity: activity.docs.map((d) => {
            const x = d.data();
            const createdAt = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date();
            return { id: d.id, type: x.type || 'system', text: x.text || '', dept: x.dept || '', createdAt };
          }),
        });
      };
      const unsubs = [
        ctx.db.collection('patients').onSnapshot((snap) => { patients = snap; publish(); }),
        ctx.db.collection('lab_reports').onSnapshot((snap) => { labs = snap; publish(); }),
        ctx.db.collection('activity').orderBy('createdAt', 'desc').limit(6).onSnapshot((snap) => { activity = snap; publish(); }),
      ];
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    },

    /** Signed-in user's own staff profile. */
    async getOwnProfile() {
      const ctx = await fb();
      if (!ctx) return null;
      const uid = ctx.auth.currentUser.uid;
      const doc = await ctx.db.collection('staff').doc(uid).get();
      return doc.exists ? doc.data() : null;
    },

    /** Update the signed-in user's own staff profile (name / email / department). */
    async updateOwnProfile({ name, email, department }) {
      const ctx = await fb();
      if (!ctx) return null;
      const uid = ctx.auth.currentUser.uid;
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (email !== undefined) patch.email = email;
      if (department !== undefined) patch.department = department;
      await ctx.db.collection('staff').doc(uid).update(patch);
      return patch;
    },

    /** Lab reports (used by the Lab Reports page). */
    async getLabReports() {
      const ctx = await fb();
      if (!ctx) return null;
      const snap = await ctx.db.collection('lab_reports').get();
      return snap.docs.map((d) => {
        const x = d.data();
        const ts = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : null;
        return { id: d.id, ...x, createdAt: ts };
      });
    },

    /** Uploaded documents (Documents page), newest first. */
    async getDocuments() {
      const ctx = await fb();
      if (!ctx) return null;
      const snap = await ctx.db.collection('documents').orderBy('createdAt', 'desc').get();
      return snap.docs.map((d) => {
        const x = d.data();
        const ts = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date();
        return { id: d.id, name: x.name || 'Untitled', size: x.size || 0, type: x.type || '', ext: x.ext || '', uploadedBy: x.uploadedBy || '', uploader: x.uploader || '', dataUrl: x.dataUrl || '', createdAt: ts };
      });
    },

    async watchDocuments(callback) {
      const ctx = await fb();
      if (!ctx) return null;
      return ctx.db.collection('documents').orderBy('createdAt', 'desc').onSnapshot(
        (snap) => callback(snap.docs.map((d) => {
          const x = d.data();
          const ts = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date();
          return { id: d.id, name: x.name || 'Untitled', size: x.size || 0, type: x.type || '', ext: x.ext || '', uploadedBy: x.uploadedBy || '', uploader: x.uploader || '', dataUrl: x.dataUrl || '', createdAt: ts };
        })),
        (error) => console.warn('Live documents subscription failed:', error.message)
      );
    },

    /** Store an uploaded document (metadata + inline content for small files). */
    async addDocument({ name, size, type, ext, dataUrl, uploader }) {
      const ctx = await fb();
      if (!ctx) return null;
      const ref = await ctx.db.collection('documents').add({
        name,
        size: size || 0,
        type: type || '',
        ext: ext || '',
        dataUrl: dataUrl || '',
        uploader: uploader || 'Staff',
        uploadedBy: ctx.auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return ref.id;
    },

    /** Delete a document the signed-in user uploaded. */
    async deleteDocument(docId) {
      const ctx = await fb();
      if (!ctx) return null;
      await ctx.db.collection('documents').doc(docId).delete();
      return true;
    },

    /** Current signed-in Firebase user (or null). */
    async currentUser() {
      const ctx = await fb();
      return ctx ? ctx.auth.currentUser : null;
    },
  };

  window.mproDb = api;
})();
