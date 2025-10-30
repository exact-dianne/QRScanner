import { ref, get, set, child } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

let employees = [];

async function loadEmployees() {
    // Load shared employee list from Firebase
    const dbRef = ref(sharedDB);
    const snapshot = await get(child(dbRef, "employees"));
    if (snapshot.exists()) {
        employees = Object.values(snapshot.val());
        console.log("Loaded", employees.length, "employees from Firebase");
    } else {
        console.warn("No employees found in Firebase");
    }
}

async function processScan(id) {
    const emp = employees.find(e => e.id === id);
    const resultEl = document.getElementById("result");
    if (!emp) {
        resultEl.innerHTML = `❌ Not found: ${id}`;
        return;
    }

    const dbRef = ref(sharedDB, "scans/" + id);
    const existing = await get(dbRef);

    if (existing.exists()) {
        resultEl.innerHTML = `⚠️ Already scanned: ${emp.name} (${emp.department})`;
        return;
    }

    // Save new scan record to Firebase
    await set(dbRef, {
        employee_id: id,
        name: emp.name,
        department: emp.department,
        timestamp: new Date().toISOString(),
        result: "VERIFIED"
    });

    resultEl.innerHTML = `✅ Verified: ${emp.name} (${emp.department})`;
    showLogs();
}

async function showLogs() {
    const snapshot = await get(ref(sharedDB, "scans"));
    const logs = snapshot.exists() ? Object.values(snapshot.val()) : [];
    const logsDiv = document.getElementById("logs");
    logsDiv.innerHTML = logs.map(r =>
        `<div class="log-entry"><strong>${r.timestamp}</strong> — ${r.employee_id} - ${r.name}</div>`
    ).join("");
    document.getElementById("counter").innerText =
        `Total Scanned: ${logs.length} / ${employees.length} Employees`;
}