#!/usr/bin/env python3
"""
Build: MediCare_Pro_Red_Blue_Team_Report.docx
APA-style red team / blue team report covering:
  1) SQL Injection (Patient Records)
  2) Reflected XSS (Patient Search)
  3) SSTI (Patient Feedback) — the out-of-ordinary / special attack
Each attack: Red Team (how to attack) then Blue Team (code changes / fix).
"""
import os
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = "documentation write/MediCare_Pro_Red_Blue_Team_Report.docx"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def set_default_font(doc, name="Times New Roman", size=12):
    style = doc.styles["Normal"]
    style.font.name = name
    style.font.size = Pt(size)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:ascii'), name)
    rfonts.set(qn('w:hAnsi'), name)
    rfonts.set(qn('w:cs'), name)


def set_line_spacing(paragraph, line=2.0, before=0, after=0):
    pf = paragraph.paragraph_format
    pf.line_spacing = line
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)


def add_par(doc, text="", bold=False, italic=False, size=12, align=None,
            line=2.0, before=0, after=0, indent=None, first_line=None,
            font=None):
    p = doc.add_paragraph()
    set_line_spacing(p, line=line, before=before, after=after)
    if align is not None:
        p.alignment = align
    if indent is not None:
        p.paragraph_format.left_indent = Inches(indent)
    if first_line is not None:
        p.paragraph_format.first_line_indent = Inches(first_line)
    if text:
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(size)
        if font:
            run.font.name = font
    return p


def add_runs(doc, segments, size=12, align=None, line=2.0, before=0, after=0,
             indent=None, first_line=None):
    """segments: list of (text, bold, italic) tuples."""
    p = doc.add_paragraph()
    set_line_spacing(p, line=line, before=before, after=after)
    if align is not None:
        p.alignment = align
    if indent is not None:
        p.paragraph_format.left_indent = Inches(indent)
    if first_line is not None:
        p.paragraph_format.first_line_indent = Inches(first_line)
    for seg in segments:
        text = seg[0]
        bold = seg[1] if len(seg) > 1 else False
        italic = seg[2] if len(seg) > 2 else False
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(size)
    return p


def add_heading_centered(doc, text, size=14, bold=True, line=2.0, before=0, after=0):
    return add_par(doc, text, bold=bold, size=size, align=WD_ALIGN_PARAGRAPH.CENTER,
                  line=line, before=before, after=after)


def add_page_number_field(paragraph):
    run = paragraph.add_run()
    fldChar1 = OxmlElement('w:fldChar')
    fldChar1.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = 'PAGE'
    fldChar2 = OxmlElement('w:fldChar')
    fldChar2.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar1)
    run._r.append(instrText)
    run._r.append(fldChar2)
    return run


def add_footer(doc, left_text):
    section = doc.sections[0]
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.text = ""
    # tab stops: left text, right page number
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run_left = p.add_run(left_text)
    run_left.font.size = Pt(10)
    # add tab + page number
    run_tab = p.add_run("\t\t")
    run_tab.font.size = Pt(10)
    run_page_label = p.add_run("Page ")
    run_page_label.font.size = Pt(10)
    add_page_number_field(p)
    # set a right tab stop so the page number sits at the right margin
    pPr = p._p.get_or_add_pPr()
    tabs = OxmlElement('w:tabs')
    tab = OxmlElement('w:tab')
    tab.set(qn('w:val'), 'right')
    tab.set(qn('w:pos'), '9360')  # 1 inch from right edge for 6.5" text width
    tabs.append(tab)
    pPr.append(tabs)


def add_header(doc, left_text, right_text):
    section = doc.sections[0]
    header = section.header
    header.is_linked_to_previous = False
    p = header.paragraphs[0]
    p.text = ""
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run_left = p.add_run(left_text)
    run_left.font.size = Pt(10)
    run_tab = p.add_run("\t\t")
    run_tab.font.size = Pt(10)
    run_right = p.add_run(right_text)
    run_right.font.size = Pt(10)
    pPr = p._p.get_or_add_pPr()
    tabs = OxmlElement('w:tabs')
    tab = OxmlElement('w:tab')
    tab.set(qn('w:val'), 'right')
    tab.set(qn('w:pos'), '9360')
    tabs.append(tab)
    pPr.append(tabs)


def add_code_block(doc, code, size=10, line=1.0):
    """Monospaced, single-spaced, indented code paragraph(s)."""
    for i, line_text in enumerate(code.split("\n")):
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.left_indent = Inches(0.5)
        pf.line_spacing = line
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        run = p.add_run(line_text if line_text else " ")
        run.font.name = "Courier New"
        run.font.size = Pt(size)
        # ensure east-asian/cs font too
        rpr = run._r.get_or_add_rPr()
        rfonts = rpr.find(qn('w:rFonts'))
        if rfonts is None:
            rfonts = OxmlElement('w:rFonts')
            rpr.append(rfonts)
        rfonts.set(qn('w:ascii'), 'Courier New')
        rfonts.set(qn('w:hAnsi'), 'Courier New')
        rfonts.set(qn('w:cs'), 'Courier New')
    # blank line after block
    add_par(doc, "", line=1.0, before=0, after=0)
    return


def add_bullet(doc, text, level=0, size=12):
    p = doc.add_paragraph(style="List Bullet")
    pf = p.paragraph_format
    pf.left_indent = Inches(0.5 + level * 0.25)
    pf.line_spacing = 2.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    run = p.add_run(text)
    run.font.size = Pt(size)
    return p


def add_numbered(doc, text, size=12):
    p = doc.add_paragraph(style="List Number")
    pf = p.paragraph_format
    pf.left_indent = Inches(0.5)
    pf.line_spacing = 2.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    run = p.add_run(text)
    run.font.size = Pt(size)
    return p


def hrule(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '000000')
    pbdr.append(bottom)
    pPr.append(pbdr)
    return p


# ---------------------------------------------------------------------------
# Document setup
# ---------------------------------------------------------------------------

doc = Document()

# Page: 8.5 x 11, 1" margins all around (APA + course template agree)
sec = doc.sections[0]
sec.page_width = Inches(8.5)
sec.page_height = Inches(11)
sec.left_margin = Inches(1)
sec.right_margin = Inches(1)
sec.top_margin = Inches(1)
sec.bottom_margin = Inches(1)

set_default_font(doc, "Times New Roman", 12)

# Header / footer per course template pattern
add_header(doc, "MediCare Pro — Red Team / Blue Team Report", "Cyber Threat Modeling (IT024)")
add_footer(doc, "MediCare Pro — Red Team / Blue Team Report")

# ---------------------------------------------------------------------------
# TITLE PAGE  (APA-style title block; course header/footer already on every page)
# ---------------------------------------------------------------------------

add_par(doc, "", line=2.0, before=0, after=0)  # top spacing

add_par(doc, "MediCare Pro Hospital Management System", bold=True, size=14,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)
add_par(doc, "Red Team and Blue Team Security Analysis of Selected Web Attacks",
        bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "SQL Injection · Reflected Cross-Site Scripting · Server-Side Template Injection",
        italic=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "IT024 — Cyber Threat Modeling", size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)
add_par(doc, "College of Information Technology Education", size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)
add_par(doc, "Bachelor of Science in Information Technology", size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Prepared by: Red Team / Blue Team", size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)
add_par(doc, "In Partial Fulfillment of the Requirements of the Course",
        size=12, align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "October 2026", size=12, align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0,
        before=0, after=0)

# Page break after title page
doc.add_page_break()

# ---------------------------------------------------------------------------
# ABSTRACT  (APA)
# ---------------------------------------------------------------------------

add_heading_centered(doc, "Abstract", size=12, bold=True, line=2.0, before=0, after=0)

add_par(doc,
        "MediCare Pro is an intentionally vulnerable hospital management system designed for "
        "security education and penetration-testing practice. This report documents three web "
        "attacks chosen for analysis: SQL injection against the Patient Records module, reflected "
        "cross-site scripting (XSS) against the Patient Search module, and server-side template "
        "injection (SSTI) against the Patient Feedback module. The SSTI attack is treated as the "
        "out-of-ordinary selection because it was the most severe exploit path in the original lab "
        "and because it is no longer present in the current codebase. For each attack, the report "
        "first presents the red-team perspective — the attack surface, the exploitation steps, and "
        "the observed impact — and then the blue-team perspective, which documents the code changes "
        "and secure patterns that remediate or contain the vulnerability. All observations are based "
        "on the MediCare Pro source tree and its accompanying attack documentation.",
        line=2.0, before=0, after=0, first_line=0.5)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Keywords: SQL injection, reflected XSS, server-side template injection, "
        "penetration testing, secure coding, MediCare Pro", italic=True, size=12,
        line=2.0, before=0, after=0)

doc.add_page_break()

# ---------------------------------------------------------------------------
# 1. INTRODUCTION — what the website is
# ---------------------------------------------------------------------------

add_heading_centered(doc, "Introduction", size=12, bold=True, line=2.0, before=0, after=0)

add_par(doc,
        "MediCare Pro is a demo hospital management platform built as a security-learning "
        "environment. It presents itself as a staff portal for a small hospital and exposes the "
        "typical modules of a healthcare information system: patient records, patient search, "
        "clinical notes, billing, bed management, lab reports, patient feedback, document upload, "
        "system diagnostics, staff login, and an embedded AI assistant. The application is "
        "deliberately seeded with vulnerable laboratory pages so that students and red teams can "
        "practice identifying and exploiting common web weaknesses in a controlled setting. Several "
        "of those pages keep their simulated, vulnerable behavior on purpose; the project documentation "
        "warns repeatedly that the vulnerable labs are for training only and must not be tested against "
        "any system the practitioner does not own.",
        first_line=0.5)

add_par(doc,
        "The application runs as a small Node.js/Express server on port 3000 and is deployable "
        "through a provided Dockerfile. Its browser-side pages are static HTML with inline JavaScript "
        "that calls the server APIs and, when Firebase is configured, talks directly to Firebase "
        "Authentication and Cloud Firestore. When Firebase environment variables are absent, the "
        "application degrades gracefully into a simulated local mode so that the labs still function "
        "as pure training targets. The Firestore-backed data model includes the patients, staff, notes, "
        "lab_reports, and activity collections described in the project README, and the seeded staff "
        "accounts — admin, doctor, nurse, radiologist, and labtech — carry weak, well-known "
        "credentials for lab use.",
        first_line=0.5)

add_par(doc, "Pages, tabs, and modules of the application", bold=True, size=12, line=2.0,
        before=6, after=0)

add_par(doc,
        "The application shell is a single-page app layout with a persistent sidebar and a top "
        "navigation bar. The sidebar groups features under three main sections. Patient Management "
        "contains Patient Records (the SQL injection lab), Patient Verification (the blind SQL "
        "injection lab), Patient Search (the reflected XSS lab), and Patient Notes (the stored XSS "
        "lab). Staff Portal contains Staff Login (the brute-force and user-enumeration lab), Profile "
        "Settings (the CSRF lab), Bed Management, Billing Portal (the IDOR lab), and Patient Feedback "
        "(the former SSTI lab). Administration contains Lab Reports (the path-traversal lab), System "
        "Diagnostics (the command-injection lab), Locations and Directions, and Documents (the "
        "unrestricted-upload lab). The dashboard aggregates occupancy and pending-lab statistics, and "
        "an AI chat widget is embedded on most pages for hospital-operations questions.",
        first_line=0.5)

add_par(doc, "Technology stack", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc,
        "The server stack is Node.js with Express. The single server entry point, server.js, mounts "
        "the public Firebase web configuration, a login endpoint backed by Firebase Authentication, a "
        "forgot-password endpoint, and a router that dispatches every /api/:route request to a dedicated "
        "handler. The API handlers live in the api/ directory and include login, forgot-password, "
        "firebase-config, google-login, csrf-update, execute, file, sql, sql-blind, upload, billing, "
        "xss-stored, feedback, chat, and drug-info. The drug-info handler acts as a server-side proxy to "
        "the public U.S. FDA openFDA APIs. The browser stack is plain HTML, CSS, and JavaScript, with "
        "the Firebase SDK loaded for authenticated pages. The project ships a Dockerfile and supports "
        "deployment to a container host such as Render. The database is Cloud Firestore when Firebase is "
        "configured; otherwise the labs fall back to in-memory simulated data. Importantly for this report, "
        "the project contains no production SQL driver — the SQL injection lab simulates SQL behavior in "
        "process memory, which the documentation stresses must be stated honestly during any presentation.",
        first_line=0.5)

add_par(doc, "Scope and organization of this report", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc,
        "This report focuses on three attacks selected from the lab catalogue: SQL injection, reflected "
        "XSS, and SSTI. Each attack is presented in two parts. The red-team part describes the targeted "
        "page, the vulnerable endpoint, the exploitation method, and the observed effect. The blue-team "
        "part describes the remediation — the code changes, the secure coding pattern, and the defense-in-depth "
        "measures that address the weakness. Where an attack has already been fixed in the current source tree, "
        "that status is stated explicitly and the fixed code is shown. Where the lab simulates rather than truly "
        "executes the attack, that distinction is stated clearly, as the project itself requires.",
        first_line=0.5)

doc.add_page_break()

# ---------------------------------------------------------------------------
# 2. SQL INJECTION — RED TEAM then BLUE TEAM
# ---------------------------------------------------------------------------

add_heading_centered(doc, "Attack 1: SQL Injection", size=12, bold=True, line=2.0, before=0, after=0)
add_par(doc, "Patient Records — Patient Record Lookup", italic=True, size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Red Team Perspective", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Target page and endpoint", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The target is the Patient Records page, accessible from the sidebar under Patient Management. "
        "The page exposes a Patient ID field labeled Patient Record Lookup and a Search Records button. "
        "At the backend, the page ultimately consults the /api/sql endpoint with a query parameter id. "
        "In the vulnerable version of the lab, the server builds the SQL text by concatenating the raw "
        "user input directly into the query string, as shown below.",
        first_line=0.5)

add_code_block(doc,
    "// VULNERABLE PATTERN — user input concatenated into SQL text\n"
    "const query = `SELECT id, name, diagnosis FROM patients WHERE id = '${rawId}'`;")

add_par(doc,
        "Because the input lands inside single quotes, a carefully placed single quote in the payload "
        "closes the string literal and lets the rest of the input be interpreted as SQL syntax. Two "
        "mechanics make the wider attack possible: the sequence -- comments out the trailing quote the "
        "original query still expects, and the semicolon starts a new statement, which is what allows "
        "write operations in addition to reads in the vulnerable lab.",
        first_line=0.5)

add_par(doc, "Vulnerable behavior demonstrated", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc,
        "The vulnerable lab accepts the input as the id parameter and simulates the execution of the "
        "resulting SQL. The following payloads were documented in the project attack materials and "
        "produce the indicated teaching results against the vulnerable build.",
        first_line=0.5)

add_par(doc, "Table 1", bold=True, size=12, line=2.0, before=6, after=0, align=WD_ALIGN_PARAGRAPH.CENTER)
add_par(doc, "SQL injection payloads and results (vulnerable lab version)", italic=True, size=12,
        line=2.0, before=0, after=0, align=WD_ALIGN_PARAGRAPH.CENTER)

# Build a table
tbl = doc.add_table(rows=1, cols=3)
tbl.style = "Table Grid"
hdr = tbl.rows[0].cells
hdr[0].text = "Goal"
hdr[1].text = "Payload (id parameter)"
hdr[2].text = "Observed result"
for c in hdr:
    for p in c.paragraphs:
        for r in p.runs:
            r.bold = True
            r.font.size = Pt(11)

rows = [
    ("Baseline — normal use", "1", "One row returned: Maria Santos, Hypertension."),
    ("Tautology — dump the table", "1' OR '1'='1", "All patient rows returned; WHERE clause bypassed."),
    ("UNION — steal credentials", "0' UNION SELECT username, password, role FROM users --",
     "Plaintext usernames and passwords for admin, doctor, nurse, and radiologist."),
    ("Comment truncation", "1'--", "Trailing query portion ignored via comment."),
    ("Boolean false", "' AND 1=2", "Zero rows returned."),
    ("DDL", "1'; DROP TABLE patients; --", "Simulated DROP detected; table removed in lab state."),
    ("Write — insert a record", "0'; INSERT INTO patients (id,name,diagnosis) VALUES (99,'Injected','SQLi'); --",
     "Row added; persists across requests until reset."),
    ("Write — backdoor admin", "0'; INSERT INTO users (username,password,role) VALUES ('backdoor','pwned123','Administrator'); --",
     "New administrator row inserted in the lab users table."),
    ("Stacked query", "1; SELECT * FROM users", "Stacked-query warning emitted by the lab."),
]
for goal, payload, result in rows:
    cells = tbl.add_row().cells
    cells[0].text = goal
    cells[1].text = payload
    cells[2].text = result
    for c in cells:
        for p in c.paragraphs:
            for r in p.runs:
                r.font.size = Pt(11)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc,
        "Table 1 shows the teaching payloads documented for the vulnerable SQL injection lab. The "
        "most impactful payload is the UNION attack, which recovers plaintext passwords for every "
        "seeded staff account from the lab users table — admin/admin123, doctor/password1, "
        "nurse/nurse123, and radiologist/xray2024. The attack also supports write operations: an "
        "attacker can insert, update, or delete rows and even drop the table, all through the same "
        "Patient ID field. In the vulnerable lab, these changes persist across requests until the "
        "lab is reset.",
        first_line=0.5)

add_par(doc,
        "It is essential to state the scope honestly, as the project documentation requires. The SQL "
        "engine in this application is a simulation: there is no real database driver in the project, "
        "and the rows are held in process memory, which means they disappear on server restart. The "
        "patient data in this lab is not the hospital’s real records and does not touch the Firestore "
        "collection. The backdoor user inserted by the lab payload does not authenticate anyone through "
        "Firebase. The honest framing is that the attack logic is real and would write persistent, "
        "visible rows against an actual database, but the specific instance here is a simulated engine "
        "kept safe and repeatable for classroom use.",
        first_line=0.5)

add_par(doc, "Impact", bold=True, size=12, line=2.0, before=6, after=0)
add_bullet(doc, "Confidentiality: plaintext credentials for all seeded staff accounts are recoverable via UNION.")
add_bullet(doc, "Integrity: an attacker can insert, modify, and delete records in the lab tables, including planting a backdoor administrator.")
add_bullet(doc, "Availability: the table can be dropped, breaking the lab until it is reset.")
add_bullet(doc, "Secondary chain: because rendered results are inserted into the page markup, a payload that stores markup can produce a second-order SQL injection to stored XSS chain.")

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Blue Team Perspective", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Remediation principle", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The fundamental fix for SQL injection is to never build SQL by concatenating user input. "
        "Instead, the query text is a constant, and the user-supplied value is passed to the database "
        "driver separately as data, so the driver treats it as a literal value rather than as syntax. "
        "The project documentation recommends this parameterized approach and lists supporting measures "
        "such as least-privilege database accounts, disabling stacked queries, not returning driver "
        "errors to the client, and gating destructive operations behind authentication.",
        first_line=0.5)

add_par(doc, "Code change applied — server-side API (api/sql.js)", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The current version of api/sql.js in the repository is the secured version. The query text is "
        "a constant, the input is bound as a parameter, and the lookup matches the input as a literal "
        "value rather than parsing it as SQL syntax. The fixed file is shown below.",
        first_line=0.5)

add_code_block(doc,
    "const QUERY = 'SELECT id, patientId, name, diagnosis, department FROM patients WHERE id = ?';\n"
    "\n"
    "function findPatient(input) {\n"
    "  const term = String(input == null ? '' : input).trim();\n"
    "  if (!term) return null;\n"
    "  return DB.patients.find(\n"
    "    (p) => String(p.id) === term || String(p.patientId).toLowerCase() === term.toLowerCase()\n"
    "  ) || null;\n"
    "}\n"
    "\n"
    "module.exports = (req, res) => {\n"
    "  const rawId = req.query.id || '';\n"
    "  const params = [String(rawId)];\n"
    "  const match = findPatient(params[0]);\n"
    "  const results = match ? [match] : [];\n"
    "  return res.status(200).json({\n"
    "    query: QUERY,\n"
    "    params,\n"
    "    results,\n"
    "    tableName: 'patients',\n"
    "    note: results.length\n"
    "      ? 'Parameterized lookup — the value was bound as data, not executed as SQL.'\n"
    "      : 'No matching patient. The value is compared literally, so injection payloads match nothing.',\n"
    "    rowCount: results.length,\n"
    "  });\n"
    "};")

add_par(doc,
        "In the fixed code the query string is a constant declared once, the user input is wrapped in "
        "an array as a bound parameter, and the matching function compares the input against patient "
        "identifiers exactly rather than feeding it to a SQL parser. A payload such as 1' OR '1'='1 "
        "no longer matches any patient because it is treated as a literal string, not as SQL syntax. "
        "The read-only design of the file also eliminates the write paths that existed in the vulnerable "
        "version — there is no INSERT, UPDATE, DELETE, or DROP path in the secured file.",
        first_line=0.5)

add_par(doc, "Code change applied — client page (pages/sql-injection.html)", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The Patient Records page was updated in parallel so that its primary data path also uses exact "
        "matching instead of any parseable query construction. The page now searches its in-memory or "
        "Firestore patient list with a comparison function that tests equality on the patient id and "
        "patientId fields, and it renders every cell through an escapeHtml helper so that record fields "
        "are never parsed as markup.",
        first_line=0.5)

add_code_block(doc,
    "function findPatients(list, term) {\n"
    "  const needle = String(term == null ? '' : term).trim();\n"
    "  if (!needle) return [];\n"
    "  const lower = needle.toLowerCase();\n"
    "  return list.filter((p) =>\n"
    "    String(p.id) === needle ||\n"
    "    String(p.patientId || '').toLowerCase() === lower ||\n"
    "    String(p.docId || '').toLowerCase() === lower\n"
    "  );\n"
    "}\n"
    "\n"
    "function renderResults(results, log) {\n"
    "  ...\n"
    "  body.innerHTML = results.map((r, i) =>\n"
    "    '<tr>' +\n"
    "    COLUMNS.map(c => {\n"
    "      const v = r[c.key];\n"
    "      const text = v === undefined || v === null ? '' : String(v);\n"
    "      return `<td style=\"font-size:12px;\">${escapeHtml(text)}</td>`;\n"
    "    }).join('') + ...;\n"
    "  ).join('');\n"
    "}")

add_par(doc,
        "The page comments state explicitly that the search term is only ever compared, never parsed, "
        "and that each candidate must equal the term exactly. The rendering function applies escapeHtml "
        "to every cell, so even if a record field contained markup, it would display as text rather than "
        "execute. Together, the server-side parameterization and the client-side exact match and escaping "
        "close the injection and the markup-execution paths that the vulnerable lab exposed.",
        first_line=0.5)

add_par(doc, "Defense-in-depth measures", bold=True, size=12, line=2.0, before=6, after=0)
add_bullet(doc, "Parameterize every query; never concatenate user input into SQL text.")
add_bullet(doc, "Use an explicit column list and avoid selecting sensitive fields such as passwords or SSNs.")
add_bullet(doc, "Keep the lookup read-only; remove INSERT, UPDATE, DELETE, and DROP paths from the handler.")
add_bullet(doc, "Do not return database driver errors to the client; generic error messages reduce error-based enumeration.")
add_bullet(doc, "Restrict database privileges to the minimum the application needs; an account without DROP cannot be forced to drop a table.")
add_bullet(doc, "Gate the endpoint behind authentication and authorization so that unauthenticated users cannot reach the lookup at all.")

add_par(doc,
        "Status note: as of the current source tree, the Patient Records SQL injection lab is fixed on "
        "this branch. The vulnerable behavior is documented historically in the project’s SQLI-ATTACK-INSTRUCTIONS.md "
        "and SQLI-DEMO-SCRIPT.md files, which describe the payloads against the earlier vulnerable build and warn "
        "that those scripts target the vulnerable version, not the current patched code.",
        italic=True, size=12, line=2.0, before=6, after=0)

doc.add_page_break()

# ---------------------------------------------------------------------------
# 3. REFLECTED XSS — RED TEAM then BLUE TEAM
# ---------------------------------------------------------------------------

add_heading_centered(doc, "Attack 2: Reflected Cross-Site Scripting", size=12, bold=True, line=2.0, before=0, after=0)
add_par(doc, "Patient Search — Patient Search", italic=True, size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Red Team Perspective", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Target page and sink", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The target is the Patient Search page, accessible from the sidebar under Patient Management. "
        "The page contains a Search Patient Name field and a Search button. The reflected XSS sink is "
        "on the client side: when the user searches, the application displays the search term back in "
        "the page under the label Showing results for, and it does so by assigning the raw input to "
        "innerHTML. The page also reads a name parameter from the URL on load and auto-searches, which "
        "means a crafted link can fire the payload without any typing.",
        first_line=0.5)

add_code_block(doc,
    "// VULNERABLE SINK — intentional lab\n"
    "const input = document.getElementById('searchInput').value;\n"
    "reflected.innerHTML = input;   // scripts and HTML execute")

add_par(doc,
        "Because the input is written into the DOM with innerHTML, any HTML or script markup in the "
        "search term is parsed and executed in the victim’s browser. The attack does not require a "
        "server-side injection point; the vulnerability is the client-side rendering choice.",
        first_line=0.5)

add_par(doc, "Exploitation", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The attack can be executed directly in the search box or by loading a crafted URL. The "
        "following payloads were documented in the project attack materials for the reflected XSS lab.",
        first_line=0.5)

add_numbered(doc,
    "Open Patient Search and type into the Search Patient Name field: <img src=x onerror=alert(document.domain)>, then click Search. The alert fires and the payload appears inside the Showing results for label.")

add_numbered(doc,
    "Alternatively, load the crafted URL directly, which triggers the auto-search on page load: http://localhost:3000/pages/xss-reflected.html?name=<img src=x onerror=alert(document.domain)>.")

add_numbered(doc,
    "Variant payloads that also work include <script>alert('XSS')</script> and \"><svg/onload=alert(1)>, both of which execute in the victim’s browser context.")

add_numbered(doc,
    "A more damaging variant chains reflected XSS into the CSRF endpoint because that API trusts any origin: <img src=x onerror=fetch('/api/csrf-update',{method:'POST',headers:{'Content-Type':'application/json'},body:'{\"name\":\"hacked\"}'})>. This turns a reflected XSS popup into an account-modification action without a separate CSRF form.")

add_par(doc,
        "The URL-based variant is the phishing-relevant form of the bug: an attacker sends a link, the "
        "victim opens it, and the payload executes in the victim’s session. The chained variant shows "
        "why reflected XSS is more than a nuisance — it can be used to call trusted APIs on the victim’s "
        "behalf when those APIs lack proper CSRF protection.",
        first_line=0.5)

add_par(doc, "Impact", bold=True, size=12, line=2.0, before=6, after=0)
add_bullet(doc, "Execution of arbitrary JavaScript in the victim’s browser within the application’s origin.")
add_bullet(doc, "Theft or manipulation of session material and in-page data accessible to the script.")
add_bullet(doc, "Chaining into trusted API endpoints to perform actions the victim did not intend, when CORS and CSRF protections are absent.")
add_bullet(doc, "Phishing feasibility via a crafted link that executes on load.")

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Blue Team Perspective", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Remediation principle", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The core fix is to treat untrusted input as text, not as markup. The reflected term should be "
        "written to the page with textContent rather than innerHTML, so the browser displays the characters "
        "without parsing any HTML or script. As a defense-in-depth measure, a Content Security Policy should "
        "be set to restrict where scripts can load from, typically default-src 'self' and script-src 'self' "
        "for an application that does not need inline scripts or third-party script hosts.",
        first_line=0.5)

add_par(doc, "Code change — rendering the reflected term safely", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The fix is a one-line change in the search handler: write the input to textContent instead of "
        "innerHTML. The vulnerable assignment shown earlier is replaced by the line below.",
        first_line=0.5)

add_code_block(doc,
    "// SECURE — treat input as text, never as markup\n"
    "reflected.textContent = input;")

add_par(doc,
        "With textContent, the browser inserts the string as plain text, so <script>alert('XSS')</script> "
        "and <img src=x onerror=...> both render as visible text and do not execute. The URL-based variant "
        "is neutralized at the same sink because the same assignment is used for the auto-searched name "
        "parameter.",
        first_line=0.5)

add_par(doc, "Code change — Content Security Policy", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "A CSP header should be sent on responses so that even if a markup sink were reintroduced, the "
        "browser would refuse to execute inline or unauthorized scripts. The project documentation shows "
        "the secure header as a commented-out line in the stored-XSS API, and the same pattern applies to "
        "the reflected-XSS page and to the API responses generally.",
        first_line=0.5)

add_code_block(doc,
    "res.setHeader('Content-Security-Policy',\n"
    "  \"default-src 'self'; script-src 'self'\");")

add_par(doc,
        "This policy tells the browser to load resources only from the application’s own origin and to "
        "refuse inline script execution unless an explicit nonce or hash is used. For an application that "
        "does not rely on inline scripts from untrusted sources, this substantially reduces the blast radius "
        "of any markup-injection bug that survives the textContent fix.",
        first_line=0.5)

add_par(doc, "Defense-in-depth measures", bold=True, size=12, line=2.0, before=6, after=0)
add_bullet(doc, "Use textContent for any place where untrusted input is reflected into the page.")
add_bullet(doc, "Apply context-appropriate escaping whenever dynamic markup must be generated, and keep markup generation to small, reviewed helpers.")
add_bullet(doc, "Deploy a strict Content Security Policy that restricts script sources and disallows unauthorized inline scripts.")
add_bullet(doc, "Avoid putting sensitive actions behind endpoints that trust any origin; pair XSS fixes with proper CSRF protection so a script cannot abuse the victim’s session against trusted APIs.")
add_bullet(doc, "Keep the reflected term short and bounded where practical, and validate or normalize input at the boundary so that unexpected characters do not reach the renderer.")

add_par(doc,
        "Status note: the Patient Search page in the current source tree still contains the reflected XSS "
        "sink by design, because it is an intentional security-learning lab. The fix documented here is the "
        "remediation the project itself recommends; applying it converts the lab from a vulnerable demonstration "
        "into the secure pattern. If the page is intended to remain a live vulnerable lab for classroom use, "
        "the secure version should live on a separate route or branch rather than silently replacing the teaching "
        "target.",
        italic=True, size=12, line=2.0, before=6, after=0)

doc.add_page_break()

# ---------------------------------------------------------------------------
# 4. SSTI — RED TEAM then BLUE TEAM
# ---------------------------------------------------------------------------

add_heading_centered(doc, "Attack 3: Server-Side Template Injection (SSTI)", size=12, bold=True, line=2.0, before=0, after=0)
add_par(doc, "Patient Feedback — Comments field (special / out-of-ordinary selection)", italic=True, size=12,
        align=WD_ALIGN_PARAGRAPH.CENTER, line=2.0, before=0, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Why this attack is the out-of-ordinary selection", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc,
        "Of the three attacks in this report, server-side template injection is the special selection. "
        "The first two — SQL injection and reflected XSS — are among the most commonly taught web "
        "vulnerabilities and appear directly in the current lab catalogue. The SSTI attack is different "
        "in two ways. First, it was the most severe exploit path in the original MediCare Pro lab: a "
        "single comment-box payload could escalate from arithmetic confirmation to server-side code "
        "execution, environment-variable reconnaissance, credential theft, file read, and a remote shell. "
        "Second, it is no longer present in the current codebase — the project’s attack map and runbook "
        "both state plainly that the SSTI lab was patched out and that the Patient Feedback endpoint now "
        "builds its report as plain text with ordinary string interpolation, not as an evaluated template. "
        "That makes SSTI both the most dramatic attack in the original material and the one that has already "
        "been closed, which is exactly why it is worth documenting as the out-of-ordinary case: it shows the "
        "upper bound of what the lab could do and the clean state it now occupies.",
        first_line=0.5)

add_par(doc,
        "For accuracy, this section documents the SSTI attack as it existed in the original vulnerable lab, "
        "using the payload sequence recorded in the project’s SSTI presentation script and attack map. It "
        "then documents the current clean state of the endpoint and the fix that removed the evaluation sink. "
        "The report does not claim that the current Patient Feedback page is exploitable by SSTI; the documented "
        "attack applies to the earlier lab version, and the blue-team section describes the code that replaced it.",
        first_line=0.5)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Red Team Perspective", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Target page and endpoint", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The target is the Patient Feedback page, accessible from the sidebar under Staff Portal. The page "
        "lets a staff member submit a patient satisfaction survey: a Patient ID, a satisfaction rating, and "
        "a Comments field. On submission, the server generates a formatted report that includes the comment "
        "text. In the vulnerable lab version, the server did not treat the comment as plain data; it built the "
        "report as a template and evaluated every ${...} expression it found in the assembled string using "
        "JavaScript’s new Function, which compiles real, unsandboxed code on the server.",
        first_line=0.5)

add_par(doc, "Vulnerable pattern (original lab version)", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The report was assembled by concatenating the user’s comment into a template string, and a "
        "hand-rolled engine then evaluated each ${...} placeholder it found. The vulnerable assembly is "
        "shown below, followed by the evaluation engine.",
        first_line=0.5)

add_code_block(doc,
    "// VULNERABLE TEMPLATE ASSEMBLY — user comment enters a template\n"
    "'Comments: ' + review.comments,   // raw input concatenated into template\n"
    "\n"
    "// VULNERABLE TEMPLATE ENGINE — evaluates ${...} as code\n"
    "function renderTemplate(tpl) {\n"
    "  return tpl.replace(/\\$\\{([^}]*)\\}/g, (_, expr) => {\n"
    "    const evalFn = new Function(`return (${expr});`);   // unsandboxed\n"
    "    return String(evalFn());\n"
    "  });\n"
    "}")

add_par(doc,
        "Two details make exploitation straightforward. First, the extractor stops at the first closing "
        "brace, so payloads must be a single flat expression between ${ and }. Second, errors are returned "
        "in the report as a template-error message, which gives the attacker an oracle that makes crafting "
        "payloads trivial. The escaping function above the engine looked like sanitization but was only "
        "String(), which is security theater rather than a real defense.",
        first_line=0.5)

add_par(doc, "Exploitation sequence (original lab, from project materials)", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Step 1 — Probe and confirm", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The attacker submits a math expression in the Comments field: ${7*7}. The report returns "
        "Comments: 49. A normal comment box would echo the literal text ${7*7}; seeing 49 proves that the "
        "input landed inside something that evaluates code. That single probe confirms SSTI.",
        first_line=0.5)

add_par(doc, "Step 2 — Reconnaissance", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "With code execution confirmed, the attacker probes the Node.js runtime. The documented payloads "
        "and their purposes are:",
        first_line=0.5)

add_bullet(doc, "${typeof process} — confirms the process global exists (response: object).")
add_bullet(doc, "${process.version} — reveals the Node.js runtime version.")
add_bullet(doc, "${Object.keys(process.env).join(', ')} — lists every environment variable name on the server, which is the recon goldmine because it tells the attacker exactly which secrets exist without guessing.")

add_par(doc, "Step 3 — Credential exfiltration", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The attacker reads a secret directly from the environment. The documented payload is "
        "${process.env.FIREBASE_SERVICE_ACCOUNT}, which returns the hospital’s Firebase admin service "
        "account credential if it is configured. That credential bypasses every Firestore security rule, "
        "so an attacker does not need to log in — they effectively become the database. If the local "
        "environment does not define that variable, the same technique works for any other secret in the "
        "environment, for example by stringifying a slice of process.env.",
        first_line=0.5)

add_par(doc, "Step 4 — Full remote code execution", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The attacker escalates from reading secrets to executing operating-system commands and reading "
        "server files. The documented payloads are:",
        first_line=0.5)

add_bullet(doc, "${process.mainModule.require('fs').readFileSync('/etc/passwd','utf8')} — reads a system file off the server’s disk.")
add_bullet(doc, "${process.mainModule.require('child_process').execSync('whoami').toString()} — executes an OS command; the lab report shows root.")

add_par(doc,
        "Plain require does not work directly inside the template scope, but process is available and "
        "carries the module loader through mainModule.require, which is how the attacker reaches the fs and "
        "child_process modules. The full chain is therefore probe, confirm, recon, steal, and shell — from a "
        "comment box to the operating system.",
        first_line=0.5)

add_par(doc, "Impact", bold=True, size=12, line=2.0, before=6, after=0)
add_bullet(doc, "Server-side code execution in the Node.js runtime, with no sandbox.")
add_bullet(doc, "Read access to any file the server process can read, including configuration and credential files.")
add_bullet(doc, "Exfiltration of any environment variable, including service-account credentials that bypass database security rules.")
add_bullet(doc, "Remote shell via execSync or equivalent, giving the attacker OS-level command execution.")
add_bullet(doc, "Because the attack runs on the server, it is not limited to the victim’s browser session — it compromises the application host itself.")

add_par(doc,
        "Scope honesty reminder, per the project documentation: the SSTI attack described here is the "
        "original vulnerable lab behavior. The current Patient Feedback endpoint does not evaluate templates "
        "and does not contain new Function, eval, or vm in the current source tree. Do not present the live "
        "Patient Feedback page as exploitable by SSTI; present the documented chain as the historical attack "
        "and the fix as the current state.",
        italic=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "", line=2.0, before=0, after=0)
add_par(doc, "Blue Team Perspective", bold=True, size=12, line=2.0, before=6, after=0)

add_par(doc, "Remediation principle", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The core fix is to keep user input as data and never let it become code. A report or any other "
        "rendered output should be assembled from the user’s text by interpolation or concatenation as plain "
        "text, not by evaluating the text as a template. If a template engine is genuinely required, user text "
        "must be passed to the renderer as data, the template delimiters in user text must be escaped before "
        "the text can touch a template string, and a hardened, maintained template engine should be used rather "
        "than a hand-rolled evaluator built on new Function, eval, or vm. The same rule applies to every "
        "evaluation sink: if user text can become code, assume it eventually will.",
        first_line=0.5)

add_par(doc, "Code change — current clean endpoint (api/feedback.js)", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The current api/feedback.js in the repository no longer evaluates templates. It stores the review "
        "and builds the report as a plain-text array joined with newlines, using ordinary string interpolation "
        "that inserts the comment text as literal characters. The relevant part of the current handler is shown "
        "below.",
        first_line=0.5)

add_code_block(doc,
    "const report = [\n"
    "  '=== Patient Feedback Report ===',\n"
    "  `Patient: ${patientId}`,\n"
    "  `Rating: ${review.rating}/5`,\n"
    "  `Reviewer: ${review.reviewer}`,\n"
    "  `Comments: ${review.comments}`,\n"
    "  `Reference: ${review.id}`,\n"
    "  `Generated: ${review.submittedAt}`,\n"
    "].join('\\n');")

add_par(doc,
        "In the current code the comment text appears only as a substituted value inside a plain string; "
        "there is no template engine searching for ${...} and evaluating it. If the comment contains "
        "${7*7}, the report returns the literal text Comments: ${7*7}, not 49. The feedback endpoint in the "
        "current tree is clean and is not an SSTI sink.",
        first_line=0.5)

add_par(doc, "Code change — the fix that removed the evaluation sink", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "The fix that closed the lab was to remove the evaluation step entirely and to treat the comment as "
        "data throughout. Concretely, that means: do not concatenate user input into a template string that is "
        "then evaluated; do not build or keep a hand-rolled engine around new Function, eval, or vm; do not "
        "rely on a no-op escape function as a defense; and if any templating is needed, use a real template "
        "engine and pass user text in as data. The current feedback handler reflects exactly that approach — the "
        "report is plain text assembled from data fields, with the user comment included only as a literal value.",
        first_line=0.5)

add_par(doc, "Verification that the lab is gone", bold=True, size=12, line=2.0, before=6, after=0)
add_par(doc,
        "A repository-wide search for the evaluation sinks returns no matches in the current source tree: "
        "there is no new Function, no eval(, no vm., and no renderTemplate in api/, js/, pages/, or "
        "server.js. Submitting ${7*7} to the current /api/feedback endpoint returns the literal text rather "
        "than 49, which confirms that the template-evaluation path is no longer present. The project’s attack "
        "map and runbook both document this as a patched-out lab and advise not to demo Patient Feedback as "
        "exploitable.",
        first_line=0.5)

add_par(doc, "Defense-in-depth measures", bold=True, size=12, line=2.0, before=6, after=0)
add_bullet(doc, "Never concatenate user input into a template string that is subsequently evaluated; pass user text to the renderer as data.")
add_bullet(doc, "If a template engine is used, escape or remove the engine’s delimiters in user text before the text can reach a template, or use an engine that treats substitution values as data by default.")
add_bullet(doc, "Do not build custom evaluators on new Function, eval, or vm for user-influenced text; use a maintained template library and keep its configuration restrictive.")
add_bullet(doc, "Treat any apparent escaping function with suspicion; a function that only calls String() is not sanitization.")
add_bullet(doc, "Run a code search for eval(, new Function, and vm. as part of regular review so that evaluation sinks cannot reappear silently.")
add_bullet(doc, "Keep server-side secrets out of the environment that a template engine or evaluator could reach, and scope any server-side data access to authenticated, authorized callers rather than to a text box.")

add_par(doc,
        "Status note: the SSTI lab documented in this section is the original vulnerable version described in "
        "the project’s SSTI-PRESENTATION-SCRIPT.md and ATTACK-MAP.md. It is the out-of-ordinary selection in "
        "this report because it was the most severe exploit path in the original lab and because it is no longer "
        "present in the current codebase. The current Patient Feedback endpoint is clean and should not be "
        "presented as an SSTI target.",
        italic=True, size=12, line=2.0, before=6, after=0)

doc.add_page_break()

# ---------------------------------------------------------------------------
# 5. CONCLUSION
# ---------------------------------------------------------------------------

add_heading_centered(doc, "Conclusion", size=12, bold=True, line=2.0, before=0, after=0)

add_par(doc,
        "The three attacks documented in this report illustrate a progression of severity and of remediation "
        "style. SQL injection in the Patient Records lab demonstrates how string concatenation into a query "
        "turns a simple lookup field into a credential-stealing, data-altering, and availability-destroying "
        "primitive, and it is remediated by parameterizing the query and matching input as data. Reflected XSS "
        "in the Patient Search lab demonstrates how a client-side rendering choice can execute an attacker’s "
        "script in a victim’s browser and can be chained into trusted API actions when CSRF protection is "
        "absent, and it is remediated by writing untrusted input as text and by adding a strict Content Security "
        "Policy. Server-side template injection in the Patient Feedback lab, the out-of-ordinary selection, "
        "demonstrates the most severe path of the three — a single comment-box payload escalating to server-side "
        "code execution, credential theft, file read, and a remote shell — and it is remediated by removing the "
        "evaluation sink entirely and treating user text as data, which is the state the endpoint now occupies.",
        first_line=0.5)

add_par(doc,
        "A common thread runs through all three: in each case the root cause is treating untrusted input as "
        "something more powerful than text — as SQL syntax, as markup, or as template code. The fixes share the "
        "same shape as well: confine the input to the least powerful interpretation that still serves the feature, "
        "remove or neutralize the evaluation sink, and add defense-in-depth controls so that a single mistake does "
        "not become a full compromise. The MediCare Pro project documents these attacks and fixes as training "
        "material, and it is explicit that the vulnerable labs are for controlled practice only and that the "
        "distinction between simulated and real behavior must be stated honestly whenever the material is presented.",
        first_line=0.5)

doc.add_page_break()

# ---------------------------------------------------------------------------
# REFERENCES  (APA)
# ---------------------------------------------------------------------------

add_heading_centered(doc, "References", size=12, bold=True, line=2.0, before=0, after=0)

refs = [
    "MediCare Pro. (2026). ATTACK-MAP.md — MediCare Pro attack map (lab reference) [Project documentation]. In MediCare Pro repository.",
    "MediCare Pro. (2026). ATTACK-LAB-RUNBOOK.md — MediCare Pro attack lab runbook [Project documentation]. In MediCare Pro repository.",
    "MediCare Pro. (2026). API feedback handler — api/feedback.js [Source code]. In MediCare Pro repository.",
    "MediCare Pro. (2026). API patient lookup — api/sql.js [Source code]. In MediCare Pro repository.",
    "MediCare Pro. (2026). Patient feedback page — pages/feedback.html [Source code]. In MediCare Pro repository.",
    "MediCare Pro. (2026). Patient Records page — pages/sql-injection.html [Source code]. In MediCare Pro repository.",
    "MediCare Pro. (2026). Patient Search page — pages/xss-reflected.html [Source code]. In MediCare Pro repository.",
    "MediCare Pro. (2026). README.md — MediCare Pro hospital management system [Project documentation]. In MediCare Pro repository.",
    "MediCare Pro. (2026). Server entry point — server.js [Source code]. In MediCare Pro repository.",
    "MediCare Pro. (2026). SSTI-PRESENTATION-SCRIPT.md — MediCare Pro SSTI live demo script [Project documentation]. In MediCare Pro repository.",
    "MediCare Pro. (2026). SQLI-ATTACK-INSTRUCTIONS.md — SQL injection attack walkthrough [Project documentation]. In MediCare Pro repository.",
    "MediCare Pro. (2026). SQLI-DEMO-SCRIPT.md — SQL injection step-by-step and live demo script [Project documentation]. In MediCare Pro repository.",
    " OWASP Foundation. (n.d.). Cross-site scripting (XSS). In OWASP Top Ten. Retrieved October 2026, from https://owasp.org/www-community/attacks/xss/",
    " OWASP Foundation. (n.d.). SQL injection. In OWASP Top Ten. Retrieved October 2026, from https://owasp.org/www-community/attacks/SQL_Injection/",
    " OWASP Foundation. (n.d.). Server-side template injection. In OWASP Top Ten. Retrieved October 2026, from https://owasp.org/www-project-web-security-testing-guide/",
]

for r in refs:
    add_par(doc, r, line=2.0, before=0, after=0, indent=0.5, first_line=-0.5)

assert os.path.exists(OUT[:-len(os.path.basename(OUT))] + "dummy") or True
# ensure directory exists
os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.save(OUT)
print("Saved:", OUT)
