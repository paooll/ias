/*
 * Billing Portal API — demo invoice lookup.
 *
 * Serves fictional invoice data for the Billing Portal page. Data is held
 * in memory for the lifetime of the process; no database is required.
 */

const INVOICES = {
  'INV-2024-0912': {
    invoiceId: 'INV-2024-0912',
    patientName: 'Maria Dela Cruz',
    patientId: 'P-002',
    service: 'Endocrinology Consultation',
    amount: '₱ 2,400.00',
    status: 'PAID',
    date: '2024-09-12',
    insurer: 'PhilCare',
    notes: 'Follow-up consult. HbA1c review.',
  },
  'INV-2024-1043': {
    invoiceId: 'INV-2024-1043',
    patientName: 'Juan Dela Cruz',
    patientId: 'P-003',
    service: 'Chest X-Ray + Radiologist Read',
    amount: '₱ 1,150.00',
    status: 'PENDING',
    date: '2024-10-03',
    insurer: 'Maxicare',
    notes: 'Pre-operative clearance imaging.',
  },
  'INV-2024-1107': {
    invoiceId: 'INV-2024-1107',
    patientName: 'Ana Reyes',
    patientId: 'P-004',
    service: 'Psychiatric Evaluation (Initial)',
    amount: '₱ 3,800.00',
    status: 'PENDING',
    date: '2024-11-07',
    insurer: 'Self-pay',
    notes: 'CONFIDENTIAL — behavioral health record. Do not disclose without patient consent.',
  },
  'INV-2024-1152': {
    invoiceId: 'INV-2024-1152',
    patientName: 'Ramon Villanueva',
    patientId: 'P-005',
    service: 'Chemotherapy Session (Cycle 3)',
    amount: '₱ 48,200.00',
    status: 'INSURANCE REVIEW',
    date: '2024-11-15',
    insurer: 'Intellicare',
    notes: 'Oncology ward, Room 502. Attending: Dr. E. Santos.',
  },
};

module.exports = async function handler(req, res) {
  const id = String((req.method === 'GET' ? req.query.id : (req.body || {}).id) || '').trim();
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Missing invoice id.' });
  }

  const invoice = INVOICES[id];
  if (!invoice) {
    return res.status(404).json({ ok: false, message: `No invoice found for ${id}.` });
  }

  // Returns the full record for any known invoice id.
  return res.status(200).json({ ok: true, invoice });
};
