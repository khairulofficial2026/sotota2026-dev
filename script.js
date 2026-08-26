// ---- কনফিগ ----
// META_COLUMNS: এগুলো বিষয় (subject) হিসেবে গণ্য হবে না, বাকি সব কলাম বিষয় হিসেবে দেখানো হবে
const META_COLUMNS = [
  "class", "roll", "name",
  "father", "father name", "father's name", "fathers name",
  "session", "dob", "date of birth",
  "attendance",
  "mt2",
  "remarks", "gpa", "result",
  "percentage", "total", "grand total", "average", "merit", "rank"
];

let allRows = [];
let isAdminLoggedIn = false;
let currentRow = null;
let studentMeritData = {}; // মেরিট ডেটা স্টোর করবে: "Class" -> { roll: { rank, totalObtained, merit } }

const classSelect      = document.getElementById("classSelect");
const rollInput        = document.getElementById("rollInput");
const searchBtn        = document.getElementById("searchBtn");
const statusMsg        = document.getElementById("statusMsg");
const printBtn          = document.getElementById("printBtn");
const downloadBtn       = document.getElementById("downloadBtn");
const downloadStatus    = document.getElementById("downloadStatus");
const reportContainer   = document.getElementById("reportContainer");

const viewRoutineBtn    = document.getElementById("viewRoutineBtn");
const routineBackBtn    = document.getElementById("routineBackBtn");
const routinePrintBtn   = document.getElementById("routinePrintBtn");
const routineContainer  = document.getElementById("routineContainer");

const adminBackBtn     = document.getElementById("adminBackBtn");
const adminLogin       = document.getElementById("adminLogin");
const adminControls    = document.getElementById("adminControls");
const adminPassword    = document.getElementById("adminPassword");
const adminLoginBtn    = document.getElementById("adminLoginBtn");
const adminLoginMsg    = document.getElementById("adminLoginMsg");
const adminClassSelect = document.getElementById("adminClassSelect");
const adminPrintBtn    = document.getElementById("adminPrintBtn");
const adminStatusMsg   = document.getElementById("adminStatusMsg");
const adminPrintArea   = document.getElementById("adminPrintArea");

const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];

// ফন্ট ম্যাপিং - বাংলা সংখ্যার জন্য কাস্টম ফন্ট
const FONT_CLASS_MAP = {
  "tiro-bangla": "tiro-bangla-font",
  "hind-siliguri": "hind-siliguri-font",
  "baloo-da-2": "baloo-da-2-font",
  "default": "tiro-bangla-font"
};

function toBnDigits(str){
  const fontClass = FONT_CLASS_MAP[typeof BENGALI_NUMBER_FONT !== 'undefined' ? BENGALI_NUMBER_FONT : 'tiro-bangla'] || FONT_CLASS_MAP["default"];
  const bnStr = String(str).replace(/[0-9]/g, d => BN_DIGITS[d]);
  return `<span class="bn-number ${fontClass}">${bnStr}</span>`;
}

function norm(key){
  return String(key || "").trim().toLowerCase();
}

// র‍্যাঙ্ক থেকে মেরিট লেবেল তৈরি করা (1 → 1st, 2 → 2nd, 3 → 3rd, ইত্যাদি)
function generateMeritLabel(rank) {
  if (!rank) return null;

  const lastDigit = rank % 10;
  const lastTwoDigits = rank % 100;

  // 11, 12, 13 এর জন্য বিশেষ ক্ষেত্রে "th" ব্যবহার হবে
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return rank + "th Merit";
  }

  switch (lastDigit) {
    case 1: return rank + "st Merit";
    case 2: return rank + "nd Merit";
    case 3: return rank + "rd Merit";
    default: return rank + "th Merit";
  }
}

// বাংলাদেশ গ্রেডিং সিস্টেম অনুযায়ী গ্রেড হিসাব
function gradeFromPercent(pct){
  if(pct >= 80) return {grade:"A+", point:5.00};
  if(pct >= 70) return {grade:"A",  point:4.00};
  if(pct >= 60) return {grade:"A-", point:3.50};
  if(pct >= 50) return {grade:"B",  point:3.00};
  if(pct >= 40) return {grade:"C",  point:2.00};
  if(pct >= 33) return {grade:"D",  point:1.00};
  return {grade:"F", point:0.00};
}

function issueTimestamp(){
  const now = new Date();
  const dateStr = `${toBnDigits(now.getDate())}-${toBnDigits(String(now.getMonth()+1).padStart(2,"0"))}-${toBnDigits(now.getFullYear())}`;
  let hours = now.getHours();
  hours = hours % 12 || 12;
  const timeStr = `${toBnDigits(String(hours).padStart(2,"0"))}:${toBnDigits(String(now.getMinutes()).padStart(2,"0"))}`;
  return `ইস্যুর তারিখ: ${dateStr} সময়: ${timeStr}`;
}

// একটি বিষয়ের জন্য কলাম-কী গুলো বের করা (SUBJECT_LABELS ভিত্তিক)
function getSubjectKeys(){
  return Object.keys(SUBJECT_LABELS);
}

// একটি স্টুডেন্ট রো থেকে একটি বিষয়ের সব তথ্য বের করা: OBTAINED, MT2, MAX,
// এবং TOTAL/%/GRADE/RESULT — এগুলো Sheet-এ দেওয়া থাকলে সরাসরি সেটাই ব্যবহার
// হবে (তুমি সূত্র দিয়ে বসালে), না থাকলে ওয়েবসাইট নিজে হিসাব করে দেবে।
function getSubjectMarks(row, subjectKey){
  const mt2Suffix     = typeof MT2_COLUMN_SUFFIX !== "undefined" ? MT2_COLUMN_SUFFIX : " mt2";
  const maxSuffix      = typeof MAX_COLUMN_SUFFIX !== "undefined" ? MAX_COLUMN_SUFFIX : " max";
  const totalSuffix    = typeof TOTAL_COLUMN_SUFFIX !== "undefined" ? TOTAL_COLUMN_SUFFIX : " total";
  const percentSuffix  = typeof PERCENT_COLUMN_SUFFIX !== "undefined" ? PERCENT_COLUMN_SUFFIX : " %";
  const gradeSuffix    = typeof GRADE_COLUMN_SUFFIX !== "undefined" ? GRADE_COLUMN_SUFFIX : " grade";
  const resultSuffix   = typeof RESULT_COLUMN_SUFFIX !== "undefined" ? RESULT_COLUMN_SUFFIX : " result";
  const defaultMax     = typeof DEFAULT_MAX_MARKS !== "undefined" ? DEFAULT_MAX_MARKS : 100;

  const obtained = parseFloat(row[subjectKey]);
  const mt2 = parseFloat(row[subjectKey + mt2Suffix]);
  const maxFromSheet = parseFloat(row[subjectKey + maxSuffix]);
  const hasAny = !isNaN(obtained) || !isNaN(mt2);

  const max = isNaN(maxFromSheet) ? defaultMax : maxFromSheet;
  const cleanObtained = isNaN(obtained) ? 0 : obtained;
  const cleanMt2 = isNaN(mt2) ? 0 : mt2;

  // TOTAL: Sheet-এ দেওয়া থাকলে সেটাই, নাহলে OBTAINED+MT2
  const totalFromSheet = parseFloat(row[subjectKey + totalSuffix]);
  const total = isNaN(totalFromSheet) ? (cleanObtained + cleanMt2) : totalFromSheet;

  // %: Sheet-এ দেওয়া থাকলে সেটাই, নাহলে TOTAL/MAX*100
  const pctFromSheet = parseFloat(row[subjectKey + percentSuffix]);
  const pct = isNaN(pctFromSheet) ? (max ? (total / max) * 100 : 0) : pctFromSheet;

  // GRADE: Sheet-এ দেওয়া থাকলে সেটাই, নাহলে পার্সেন্টেজ অনুযায়ী হিসাব
  const gradeFromSheet = (row[subjectKey + gradeSuffix] || "").trim();
  const grade = gradeFromSheet ? gradeFromSheet : gradeFromPercent(pct).grade;

  // RESULT: Sheet-এ দেওয়া থাকলে সেটাই, নাহলে পার্সেন্টেজ অনুযায়ী হিসাব
  const resultFromSheet = (row[subjectKey + resultSuffix] || "").trim();
  let result;
  if(resultFromSheet){
    const rNorm = resultFromSheet.toLowerCase();
    result = (rNorm === "fail" || rNorm === "ফেল") ? "FAIL" : "PASS";
  } else {
    result = pct >= 33 ? "PASS" : "FAIL";
  }

  return {
    obtained: cleanObtained,
    mt2: cleanMt2,
    max,
    total,
    pct,
    grade,
    result,
    hasAny
  };
}

// একজন স্টুডেন্টের Attendance নম্বর বের করা (টোটালে যোগ হওয়ার জন্য)
function getCombinedAttendance(row){
  if(typeof ATTENDANCE_ADD_TO_TOTAL === "undefined" || !ATTENDANCE_ADD_TO_TOTAL) return null;
  const val = parseFloat(row["attendance"]);
  if(isNaN(val)) return null;
  const max = typeof ATTENDANCE_MAX_MARKS !== "undefined" ? ATTENDANCE_MAX_MARKS : 10;
  return { obtained: val, max: max };
}

// ============ মেরিট সিস্টেম: সব শিক্ষার্থীকে র‍্যাঙ্ক অনুযায়ী মেরিট দেওয়া ============
function calculateMeritForAllClasses(){
  studentMeritData = {};

  if(!ENABLE_MERIT_SYSTEM) return;

  const classesList = [...new Set(allRows.map(r => r["class"]).filter(Boolean))];
  const subjectKeys = getSubjectKeys();

  classesList.forEach(cls => {
    const classStudents = allRows.filter(r => norm(r["class"]) === norm(cls));

    const studentsWithTotal = classStudents.map(row => {
      let totalObtained = 0;
      subjectKeys.forEach(key => {
        const marks = getSubjectMarks(row, key);
        if(marks.hasAny) totalObtained += marks.total;
      });
      const attendance = getCombinedAttendance(row);
      if(attendance) totalObtained += attendance.obtained;
      return { row, totalObtained };
    });

    studentsWithTotal.sort((a, b) => b.totalObtained - a.totalObtained);

    studentMeritData[norm(cls)] = {};
    studentsWithTotal.forEach((item, index) => {
      const roll = item.row["roll"];
      const rank = index + 1;
      const meritLabel = generateMeritLabel(rank);
      studentMeritData[norm(cls)][roll] = {
        rank: rank,
        totalObtained: item.totalObtained,
        merit: rank <= MERIT_POSITION_LIMIT ? meritLabel : null
      };
    });
  });
}

// র‍্যাঙ্ক অনুযায়ী রিমার্কস বের করা
function getRemarksForStudent(rank, anyFail){
  if(anyFail){
    return REMARKS_BY_RANK["fail"] || "আরও পরিশ্রম করে পরবর্তী পরীক্ষায় ভালো ফলাফল করতে হবে।";
  }
  if(rank && REMARKS_BY_RANK[String(rank)]){
    return REMARKS_BY_RANK[String(rank)];
  }
  return REMARKS_BY_RANK["pass"] || "নিয়মিত ক্লাসে উপস্থিত থাকবে। আরও ভালো করার চেষ্টা করবে।";
}

// ---- একজন স্টুডেন্টের জন্য প্রো রিপোর্ট কার্ডের HTML তৈরি করে ----
function buildReportCardHTML(row){
  const subjectKeys = getSubjectKeys();
  let totalObtained = 0, totalMax = 0, subjectCount = 0, anyFail = false;
  let subjectRowsHTML = "";

  subjectKeys.forEach(key => {
    const marks = getSubjectMarks(row, key);
    if(!marks.hasAny) return;

    if(marks.result === "FAIL") anyFail = true;

    totalObtained += marks.total;
    totalMax += marks.max;
    subjectCount++;

    subjectRowsHTML += `
      <tr>
        <td class="subj-name">${SUBJECT_LABELS[key] || key}</td>
        <td>${toBnDigits(marks.max)}</td>
        <td>${toBnDigits(marks.obtained)}</td>
        <td>${toBnDigits(marks.mt2)}</td>
        <td><b>${toBnDigits(marks.total)}</b></td>
        <td>${toBnDigits(marks.pct.toFixed(0))}%</td>
        <td>${marks.grade}</td>
        <td class="${marks.result === 'PASS' ? 'cell-pass' : 'cell-fail'}">${marks.result}</td>
      </tr>`;
  });

  // Attendance (উপস্থিতি) — টোটালে যোগ হওয়া আরেকটা আলাদা লাইন
  const attendanceMarks = getCombinedAttendance(row);
  if(attendanceMarks){
    const attPct = (attendanceMarks.obtained / attendanceMarks.max) * 100;
    const { grade: attGrade } = gradeFromPercent(attPct);
    const attResult = attPct >= 33 ? "PASS" : "FAIL";
    if(attResult === "FAIL") anyFail = true;

    totalObtained += attendanceMarks.obtained;
    totalMax += attendanceMarks.max;
    subjectCount++;

    subjectRowsHTML += `
      <tr>
        <td class="subj-name">${ATTENDANCE_LABEL}</td>
        <td>${toBnDigits(attendanceMarks.max)}</td>
        <td>${toBnDigits(attendanceMarks.obtained)}</td>
        <td>-</td>
        <td><b>${toBnDigits(attendanceMarks.obtained)}</b></td>
        <td>${toBnDigits(attPct.toFixed(0))}%</td>
        <td>${attGrade}</td>
        <td class="${attResult === 'PASS' ? 'cell-pass' : 'cell-fail'}">${attResult}</td>
      </tr>`;
  }

  const overallPct = subjectCount ? (totalObtained / totalMax) * 100 : 0;
  const overallGradeObj = gradeFromPercent(overallPct);
  const overallResult = anyFail ? "FAILED" : "PASSED";

  // মেরিট ইনফরমেশন বের করা
  const classNorm = norm(row["class"]);
  const roll = row["roll"];
  let meritInfo = null;
  let rank = null;

  if(ENABLE_MERIT_SYSTEM && studentMeritData[classNorm] && studentMeritData[classNorm][roll]){
    meritInfo = studentMeritData[classNorm][roll];
    rank = meritInfo.rank;
  }

  let remarks = row["remarks"];
  if(!remarks){
    remarks = getRemarksForStudent(rank, anyFail);
  }

  const studentName = row["name"] || "-";
  const fatherName = row["father's name"] || row["fathers name"] || row["father name"] || row["father"] || "-";
  const attendance = row["attendance"] || "-";

  return `
    <div class="report-outer">
      <div class="report-inner">

        <div class="report-topbar">
          <div class="photo-box"><img src="logo.png" alt="${SCHOOL_INFO.name} Logo" onerror="this.style.display='none'"></div>
          <div class="report-header">
            <h2>${SCHOOL_INFO.name}</h2>
            <p class="report-address">${SCHOOL_INFO.address} &nbsp;|&nbsp; ${SCHOOL_INFO.email}</p>
            <p class="report-meta">স্থাপিতঃ${toBnDigits(SCHOOL_INFO.established)}ইং &nbsp;|&nbsp; ${SCHOOL_INFO.examLabel}</p>
          </div>
          <div class="stamp-combo ${overallResult === 'PASSED' ? 'pass' : 'fail'}">
            <span>RESULT</span>
            <strong>${overallResult === 'PASSED' ? 'PASSED' : 'FAILED'}</strong>
            ${meritInfo && meritInfo.merit ? `<em>${meritInfo.merit.toUpperCase()}</em>` : ''}
          </div>
        </div>

        <div class="section-title">Student Information</div>
        <table class="info-table">
          <tr>
            <td><span class="info-label">Student's Name:</span> <span class="info-value">${studentName}</span></td>
            <td><span class="info-label">Father's Name:</span> <span class="info-value">${fatherName}</span></td>
          </tr>
          <tr>
            <td><span class="info-label">Date Of Birth:</span> <span class="info-value">${row["dob"] || row["date of birth"] || "-"}</span></td>
            <td><span class="info-label">Academic Year:</span> <span class="info-value">${row["session"] || "-"}</span></td>
          </tr>
          <tr>
            <td><span class="info-label">Class:</span> <span class="info-value">${row["class"] || "-"}</span></td>
            <td><span class="info-label">Attendance:</span> <span class="info-value">${attendance}</span></td>
          </tr>
          <tr>
            <td><span class="info-label">Class Roll:</span> <span class="info-value">${toBnDigits(row["roll"] || "-")}</span></td>
            <td><span class="info-label">Merit Position:</span> <span class="info-value">${meritInfo && meritInfo.merit ? meritInfo.merit : '-'}</span></td>
          </tr>
        </table>

        <div class="section-title">Grade Sheet</div>
        <div class="table-scroll">
        <table class="marks-table">
          <thead>
            <tr><th>SUBJECT</th><th>MAX MARKS</th><th>OBTAINED</th><th>MT2</th><th>TOTAL</th><th>%</th><th>GRADE</th><th>RESULT</th></tr>
          </thead>
          <tbody>${subjectRowsHTML}</tbody>
          <tfoot>
            <tr>
              <td>GRAND TOTAL:</td>
              <td>${toBnDigits(totalMax)}</td>
              <td colspan="2">${toBnDigits(totalObtained)}</td>
              <td><b>${toBnDigits(totalObtained)}</b></td>
              <td>${toBnDigits(overallPct.toFixed(0))}%</td>
              <td>${overallGradeObj.grade}</td>
              <td class="${overallResult === 'PASSED' ? 'cell-pass' : 'cell-fail'}">${overallResult === 'PASSED' ? 'PASS' : 'FAIL'}</td>
            </tr>
          </tfoot>
        </table>
        </div>

        <p class="grade-scale">Grade Scale: A+ (৮০-১০০), A (৭০-৭৯), A- (৬০-৬৯), B (৫০-৫৯), C (৪০-৪৯), D (৩৩-৩৯), F (০-৩২)</p>

        <div class="remarks-box">
          <span>মন্তব্য (Remarks):</span> <em>${remarks}</em>
        </div>

        <div class="sign-row">
          <div><span class="sign-line"></span>অভিভাবকের স্বাক্ষর</div>
          <div><span class="sign-line"></span>শ্রেণী শিক্ষকের স্বাক্ষর</div>
          <div><span class="sign-line"></span>অধ্যক্ষের স্বাক্ষর</div>
        </div>

        <div class="report-footer">
          <span>এই রিপোর্ট কার্ডটি ডিজিটালভাবে তৈরি করা হয়েছে।</span>
          <span>${issueTimestamp()}</span>
        </div>
      </div>
    </div>`;
}

// ============ ডেটা লোড (একাধিক শীট থেকে) ============
function parseOneSheet(url){
  return new Promise((resolve) => {
    let done = false;

    // নেটওয়ার্ক স্লো/আটকে গেলে যাতে চিরকাল "লোড হচ্ছে..." দেখিয়ে না থাকে,
    // তাই একটি টাইমআউট (২৫ সেকেন্ড) রাখা হলো
    const timer = setTimeout(() => {
      if(done) return;
      done = true;
      resolve([]);
    }, 25000);

    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function(results){
        if(done) return;
        done = true;
        clearTimeout(timer);
        console.log("✅ Sheet loaded successfully:", url, "Rows found:", results.data.length);
        const rows = results.data.map(row => {
          const clean = {};
          Object.keys(row).forEach(k => clean[norm(k)] = String(row[k] || "").trim());
          return clean;
        });
        resolve(rows);
      },
      error: function(error){
        if(done) return;
        done = true;
        clearTimeout(timer);
        console.error("❌ Sheet load error:", url, error);
        resolve([]); // এই শীটে সমস্যা হলে বাকিগুলো লোড হতে থাকুক
      }
    });
  });
}

async function loadData(){
  const validUrls = (SHEET_CSV_URLS || []).filter(u => u && !u.includes("PASTE_"));
  console.log("🔍 Starting data load. Valid sheet URLs:", validUrls.length);

  if(validUrls.length === 0){
    console.error("❌ No valid sheet URLs found!");
    classSelect.innerHTML = `<option value="">⚠️ config.js এ শীট লিংক বসান</option>`;
    return;
  }

  classSelect.innerHTML = `<option value="">লোড হচ্ছে...</option>`;

  const results = await Promise.all(validUrls.map(parseOneSheet));
  allRows = results.flat();
  
  console.log("📊 Total rows loaded:", allRows.length);
  console.log("📝 Sample data:", allRows.slice(0, 2));

  if(allRows.length === 0){
    console.error("❌ No data loaded from sheets!");
    classSelect.innerHTML = `<option value="">⚠️ লোড ব্যর্থ হয়েছে, নিচে ক্লিক করুন</option><option value="__retry__">🔄 আবার চেষ্টা করুন</option>`;
    return;
  }

  calculateMeritForAllClasses();

  populateClasses(classSelect);
  populateClasses(adminClassSelect, true);
  console.log("✨ Data load complete!");
}

classSelect.addEventListener("change", () => {
  if(classSelect.value === "__retry__"){
    loadData();
  }
});

function populateClasses(selectEl, includeAllOption){
  const classes = [...new Set(allRows.map(r => r["class"]).filter(Boolean))];
  if(classes.length === 0){
    selectEl.innerHTML = `<option value="">কোনো ক্লাস পাওয়া যায়নি</option>`;
    return;
  }
  let optionsHTML = classes.map(c => `<option value="${c}">${c}</option>`).join("");
  if(includeAllOption){
    optionsHTML = `<option value="__all__">সব ক্লাস</option>` + optionsHTML;
  }
  selectEl.innerHTML = optionsHTML;
}

function showStatus(msg){
  statusMsg.textContent = msg;
}

// ============ একক শিক্ষার্থী সার্চ ============
function searchResult(){
  const cls = classSelect.value;
  const roll = rollInput.value.trim();

  showStatus("");

  if(!cls){ showStatus("অনুগ্রহ করে শ্রেণী নির্বাচন করুন"); return; }
  if(!roll){ showStatus("অনুগ্রহ করে রোল নম্বর দিন"); return; }

  const match = allRows.find(r => norm(r["class"]) === norm(cls) && r["roll"] === roll);

  if(!match){
    showStatus("এই রোল নম্বরের কোনো ফলাফল পাওয়া যায়নি");
    return;
  }

  currentRow = match;
  reportContainer.innerHTML = buildReportCardHTML(match);
  goToPage("resultPage");
}

// ============ পেইজ নেভিগেশন ============
function goToPage(pageId){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  window.scrollTo(0, 0);
}

// ============ পরীক্ষার রুটিন ============
function buildRoutineHTML(){
  if(typeof ROUTINE_INFO === "undefined"){
    return `<p class="status-msg">রুটিন এখনো যোগ করা হয়নি।</p>`;
  }

  const theadHTML = `<th>শ্রেণি</th><th>সময়</th>` +
    ROUTINE_INFO.dates.map(d => `<th>${d.date}<br>${d.day}</th>`).join("");

  const rowsHTML = ROUTINE_INFO.classes.map(cls => {
    const cells = cls.subjects.map(s => `<td>${s ? s : "-"}</td>`).join("");
    return `<tr><td class="subj-name">${cls.name}</td><td>${cls.time}</td>${cells}</tr>`;
  }).join("");

  const rulesHTML = ROUTINE_INFO.rules.map(r => `<li>${r}</li>`).join("");

  return `
    <div class="routine-header">
      <h2>${SCHOOL_INFO.name}</h2>
      <p class="routine-title">${ROUTINE_INFO.title}</p>
    </div>
    <div class="table-scroll">
      <table class="routine-table">
        <thead><tr>${theadHTML}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="routine-rules">
      <h3>নিয়মাবলীঃ</h3>
      <ol>${rulesHTML}</ol>
    </div>
  `;
}

function showRoutine(){
  routineContainer.innerHTML = buildRoutineHTML();
  goToPage("routinePage");
}

// ============ এডমিন প্যানেল ============
function adminLogin_check(){
  const entered = adminPassword.value.trim();
  if(entered === ADMIN_PASSWORD){
    isAdminLoggedIn = true;
    adminLogin.classList.add("hidden");
    adminControls.classList.remove("hidden");
    adminLoginMsg.textContent = "";
  } else {
    adminLoginMsg.textContent = "ভুল পাসওয়ার্ড";
  }
}

function adminPrintAll(){
  const cls = adminClassSelect.value;
  if(!cls){ adminStatusMsg.textContent = "অনুগ্রহ করে শ্রেণী নির্বাচন করুন"; return; }

  const rows = cls === "__all__"
    ? allRows
    : allRows.filter(r => norm(r["class"]) === norm(cls));

  if(rows.length === 0){
    adminStatusMsg.textContent = "এই ক্লাসে কোনো শিক্ষার্থী পাওয়া যায়নি";
    adminPrintArea.innerHTML = "";
    return;
  }

  adminStatusMsg.textContent = `${toBnDigits(rows.length)} টি রেজাল্ট কার্ড তৈরি হয়েছে — প্রিন্ট ডায়ালগ খুলছে...`;
  adminPrintArea.innerHTML = rows.map(row => `<div class="print-page">${buildReportCardHTML(row)}</div>`).join("");

  setTimeout(() => window.print(), 300);
}

// ============ নিজের রেজাল্ট কার্ড PDF ডাউনলোড ============
async function downloadCurrentReportPDF(){
  if(!currentRow){ return; }

  downloadBtn.disabled = true;
  downloadStatus.style.color = "var(--muted)";
  downloadStatus.textContent = "PDF তৈরি হচ্ছে, একটু অপেক্ষা করুন...";

  try{
    const target = reportContainer.querySelector(".report-outer");

    // পেইজ স্ক্রল করা অবস্থায় html2canvas প্রায়ই কনটেন্ট কেটে/ফাঁকা রেখে ক্যাপচার করে,
    // তাই ক্যাপচারের আগে টপে স্ক্রল করে নেওয়া হচ্ছে
    window.scrollTo(0, 0);

    // ফন্ট ও ছবি সম্পূর্ণ লোড না হলে অংশবিশেষ ফাঁকা/অসম্পূর্ণ আসতে পারে
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const imgs = target.querySelectorAll("img");
    await Promise.all(Array.from(imgs).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }));

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: true,
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: target.scrollHeight,
      width: target.scrollWidth,
      height: target.scrollHeight
    });

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgRatio = canvas.height / canvas.width;

    // ছবি A4 পেইজের চেয়ে লম্বা হলে একের বেশি পেইজে ভাগ করে বসানো হচ্ছে,
    // যাতে নিচের অংশ কেটে বাদ না যায়
    const fullRenderWidth = pageWidth;
    const fullRenderHeight = pageWidth * imgRatio;

    if (fullRenderHeight <= pageHeight) {
      const y = (pageHeight - fullRenderHeight) / 2;
      pdf.addImage(imgData, "PNG", 0, y, fullRenderWidth, fullRenderHeight);
    } else {
      // মাল্টি-পেইজ স্প্লিট
      const pxPerMm = canvas.width / fullRenderWidth;
      const pageHeightPx = pageHeight * pxPerMm;
      let renderedPx = 0;
      let pageIndex = 0;

      while (renderedPx < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0, renderedPx, canvas.width, sliceHeightPx,
          0, 0, canvas.width, sliceHeightPx
        );

        const sliceImgData = pageCanvas.toDataURL("image/png");
        const sliceRenderHeight = sliceHeightPx / pxPerMm;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(sliceImgData, "PNG", 0, 0, fullRenderWidth, sliceRenderHeight);

        renderedPx += sliceHeightPx;
        pageIndex++;
      }
    }

    const name = (currentRow["name"] || "student").replace(/[^\w\u0980-\u09FF]+/g, "_");
    const roll = currentRow["roll"] || "";
    pdf.save(`${name}_Roll-${roll}_Result.pdf`);

    downloadStatus.style.color = "#0a8a4a";
    downloadStatus.textContent = "✅ ডাউনলোড সম্পন্ন হয়েছে!";
  } catch(err){
    downloadStatus.style.color = "var(--red)";
    downloadStatus.textContent = "দুঃখিত, PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।";
  } finally {
    downloadBtn.disabled = false;
  }
}

// ============ ইভেন্ট লিসেনার ============
searchBtn.addEventListener("click", searchResult);
rollInput.addEventListener("keydown", e => { if(e.key === "Enter") searchResult(); });
printBtn.addEventListener("click", () => window.print());
downloadBtn.addEventListener("click", downloadCurrentReportPDF);
document.getElementById("backBtn").addEventListener("click", () => goToPage("searchPage"));

if (viewRoutineBtn) viewRoutineBtn.addEventListener("click", showRoutine);
if (routineBackBtn) routineBackBtn.addEventListener("click", () => goToPage("searchPage"));
routinePrintBtn.addEventListener("click", () => window.print());

adminBackBtn.addEventListener("click", () => {
  history.replaceState(null, "", window.location.pathname);
  goToPage("searchPage");
});
adminLoginBtn.addEventListener("click", adminLogin_check);
adminPassword.addEventListener("keydown", e => { if(e.key === "Enter") adminLogin_check(); });
adminPrintBtn.addEventListener("click", adminPrintAll);

// গোপন এডমিন এন্ট্রি: ইউআরএল এর শেষে #admin জুড়ে দিলে এডমিন পেইজ খুলবে
// কোনো দৃশ্যমান বাটন বা লিংক নেই
function checkSecretAdminEntry(){
  if(window.location.hash === "#admin"){
    goToPage("adminPage");
  }
}
window.addEventListener("hashchange", checkSecretAdminEntry);
checkSecretAdminEntry();

// #routine দিয়ে সরাসরি রুটিন পেইজ খোলার জন্য (যেমনঃ index.html থেকে "পরীক্ষার রুটিন" বাটনে চাপ দিলে)
function checkRoutineEntry(){
  if(window.location.hash === "#routine"){
    showRoutine();
  }
}
window.addEventListener("hashchange", checkRoutineEntry);
checkRoutineEntry();

loadData();
