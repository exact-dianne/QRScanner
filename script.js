let db, employees = [];
let html5QrCode;
let lastScan = ""; // prevent rapid duplicates

initDB();

function initDB() {
    const req = indexedDB.open("localQRDB", 9);
    req.onupgradeneeded = e => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("employees"))
            db.createObjectStore("employees", { keyPath: "id" });
        if (!db.objectStoreNames.contains("scans"))
            db.createObjectStore("scans", { keyPath: "employee_id" }); // one per employee
    };
    req.onsuccess = e => {
        db = e.target.result;
        loadEmployees();
        showLogs();
        startScanner();
    };
}

function loadEmployees() {
    const tx = db.transaction("employees", "readonly");
    tx.objectStore("employees").getAll().onsuccess = e => {
        employees = e.target.result;
        updateCounter();
    };
}

function startScanner() {
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async decodedText => {
            const id = parseQR(decodedText);
            // ignore exact same QR repeating quickly
            if (id === lastScan) return;
            lastScan = id;
            await processScan(id);
            setTimeout(() => { lastScan = ""; }, 2000);
        }
    ).catch(() => {
        document.getElementById("result").innerText = "Camera failed.";
    });
}

async function processScan(id) {
    const emp = employees.find(e => e.id === id);
    const resultEl = document.getElementById("result");
    if (!emp) {
        resultEl.innerHTML = `❌ Not found: ${id}`;
        return;
    }

    const already = await getScanRecord(id);
    if (already) {
        resultEl.innerHTML = `⚠️ Already scanned: ${emp.name} (${emp.department || ""})`;
        return;
    }

    await saveScanRecord(emp);
    resultEl.innerHTML = `✅ Verified: ${emp.name} (${emp.department || ""})`;
    showLogs();
}

function getScanRecord(id) {
    return new Promise(res => {
        const tx = db.transaction("scans", "readonly");
        const store = tx.objectStore("scans");
        const req = store.get(id);
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
    });
}

function saveScanRecord(emp) {
    return new Promise(res => {
        const tx = db.transaction("scans", "readwrite");
        const store = tx.objectStore("scans");
        store.put({
            employee_id: emp.id,
            name: emp.name,
            department: emp.department,
            timestamp: new Date().toISOString(),
            result: "VERIFIED"
        }).onsuccess = res;
    });
}

function showLogs() {
    const tx = db.transaction("scans", "readonly");
    tx.objectStore("scans").getAll().onsuccess = e => {
        const logs = e.target.result;
        const logsDiv = document.getElementById("logs");
        logsDiv.innerHTML = logs.map(r =>
            `<div class="log-entry"><strong>${r.timestamp}</strong> — ${r.employee_id} - ${r.name}</div>`
        ).join("");
        updateCounter(logs.length);
    };
}

function updateCounter(scanned = null) {
    const tx = db.transaction("scans", "readonly");
    tx.objectStore("scans").count().onsuccess = e => {
        const total = e.target.result;
        document.getElementById("counter").innerText =
            `Total Scanned: ${scanned ?? total} / ${employees.length} Employees`;
    };
}

function parseQR(txt) {
    try {
        if (txt.startsWith("EMP:")) return txt.slice(4);
        const o = JSON.parse(txt);
        if (o.id) return o.id;
    } catch { }
    return txt.trim();
}

document.getElementById("btnImport").onclick = () =>
    document.getElementById("fileInput").click();

document.getElementById("fileInput").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const list = JSON.parse(ev.target.result);
            const tx = db.transaction("employees", "readwrite");
            const store = tx.objectStore("employees");
            store.clear();
            list.forEach(emp => store.put(emp));
            tx.oncomplete = () => {
                employees = list;
                alert(`✅ Imported ${list.length} employees`);
                updateCounter();
            };
        } catch {
            alert("Invalid file");
        }
    };
    reader.readAsText(f);
};

document.getElementById("btnClear").onclick = () => {
    const tx = db.transaction("scans", "readwrite");
    tx.objectStore("scans").clear().onsuccess = showLogs;
};

document.getElementById("btnDownload").onclick = () => {
    const tx = db.transaction("scans", "readonly");
    tx.objectStore("scans").getAll().onsuccess = e => {
        const data = e.target.result;
        if (!data.length) return alert("No logs.");
        const header = ["timestamp", "employee_id", "name", "department"];
        const rows = data.map(r =>
            [r.timestamp, r.employee_id, `"${r.name}"`, `"${r.department}"`].join(",")
        );
        const csv = [header.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `scan_logs_${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
    };
};