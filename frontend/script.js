// UniShare - Code Authentication & File Sharing Engine (Connected to Backend API & MongoDB)

const API_BASE_URL = "http://localhost:5000/api";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB Limit
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 2 * 60 * 1000; // 2 Minutes lockout

// STATE
let selectedFile = null;
let currentAccessedCode = null;

// DOM ELEMENTS
const tabShare = document.getElementById("tabShare");
const tabReceive = document.getElementById("tabReceive");
const shareView = document.getElementById("shareView");
const receiveView = document.getElementById("receiveView");

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileButton = document.getElementById("fileButton");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileIcon = document.getElementById("fileIcon");
const reuploadBtn = document.getElementById("reuploadBtn");

const securityOptions = document.getElementById("securityOptions");
const expirationSelect = document.getElementById("expirationSelect");
const maxDownloadsSelect = document.getElementById("maxDownloadsSelect");
const autoDeleteToggle = document.getElementById("autoDeleteToggle");
const generateCodeBtn = document.getElementById("generateCodeBtn");

const codeResultCard = document.getElementById("codeResultCard");
const displayShareCode = document.getElementById("displayShareCode");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const createNewShareBtn = document.getElementById("createNewShareBtn");
const metaExpiration = document.getElementById("metaExpiration");
const metaDownloads = document.getElementById("metaDownloads");

const sharesHistoryCard = document.getElementById("sharesHistoryCard");
const sharesList = document.getElementById("sharesList");

const codeInput = document.getElementById("codeInput");
const accessFileBtn = document.getElementById("accessFileBtn");
const receiveAlert = document.getElementById("receiveAlert");
const fileAccessCard = document.getElementById("fileAccessCard");
const accessFileIcon = document.getElementById("accessFileIcon");
const accessFileName = document.getElementById("accessFileName");
const accessFileSize = document.getElementById("accessFileSize");
const accessExpTime = document.getElementById("accessExpTime");
const accessDownloadsLeft = document.getElementById("accessDownloadsLeft");
const downloadFileBtn = document.getElementById("downloadFileBtn");

const toast = document.getElementById("toast");

// --- 1. TAB NAVIGATION ---
function switchTab(targetTab) {
    if (targetTab === "share") {
        tabShare.classList.add("active");
        tabReceive.classList.remove("active");
        shareView.classList.remove("hidden");
        receiveView.classList.add("hidden");
    } else {
        tabReceive.classList.add("active");
        tabShare.classList.remove("active");
        receiveView.classList.remove("hidden");
        shareView.classList.add("hidden");
    }
}

tabShare.addEventListener("click", () => switchTab("share"));
tabReceive.addEventListener("click", () => switchTab("receive"));

// --- 2. FILE SELECTION & DROPZONE ---
fileButton.addEventListener("click", () => fileInput.click());
reuploadBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
        handleFileSelected(fileInput.files[0]);
    }
});

// Drag & Drop
dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
    }
});

function handleFileSelected(file) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
        showToast("File size exceeds 50MB limit!", true);
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileIcon.textContent = getFileIconEmoji(file.name);

    dropzone.classList.add("hidden");
    fileInfo.classList.remove("hidden");
    securityOptions.classList.remove("hidden");
    codeResultCard.classList.add("hidden");
}

function getFileIconEmoji(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return '🖼️';
    if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return '🎥';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵';
    if (['pdf'].includes(ext)) return '📕';
    if (['zip', 'rar', '7z', 'tar'].includes(ext)) return '📦';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return '📄';
    return '📁';
}

// --- 3. GENERATE SHARE CODE (BACKEND API) ---
generateCodeBtn.addEventListener("click", async () => {
    if (!selectedFile) {
        showToast("Please select a file first", true);
        return;
    }

    generateCodeBtn.disabled = true;
    generateCodeBtn.textContent = "⌛ Uploading to Server & MongoDB...";

    try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("expirationSeconds", expirationSelect.value);
        formData.append("maxDownloads", maxDownloadsSelect.value);
        formData.append("autoDelete", autoDeleteToggle.checked);

        const response = await fetch(`${API_BASE_URL}/share`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to generate share code");
        }

        displayGeneratedCode(data);
        saveToLocalHistory(data);
        showToast("Share code generated & saved to MongoDB!");

    } catch (err) {
        console.error(err);
        showToast(err.message || "Error connecting to server. Is Node.js running?", true);
    } finally {
        generateCodeBtn.disabled = false;
        generateCodeBtn.textContent = "🔐 Generate Share Code";
    }
});

function displayGeneratedCode(shareData) {
    displayShareCode.textContent = shareData.rawCode;
    const expiresAtMs = new Date(shareData.expiresAt).getTime();
    metaExpiration.textContent = `⏳ Expires: ${formatRemainingTime(expiresAtMs)}`;
    metaDownloads.textContent = `🔢 Downloads left: ${shareData.maxDownloads === 0 ? "Unlimited" : shareData.maxDownloads}`;

    securityOptions.classList.add("hidden");
    codeResultCard.classList.remove("hidden");
}

createNewShareBtn.addEventListener("click", () => {
    selectedFile = null;
    fileInput.value = "";
    fileInfo.classList.add("hidden");
    securityOptions.classList.add("hidden");
    codeResultCard.classList.add("hidden");
    dropzone.classList.remove("hidden");
});

// Copy Buttons
copyCodeBtn.addEventListener("click", () => {
    const code = displayShareCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast("Share code copied to clipboard!");
    });
});

copyLinkBtn.addEventListener("click", () => {
    const code = displayShareCode.textContent;
    const shareUrl = `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Share link copied to clipboard!");
    });
});

// --- 4. ACCESS FILE (VERIFY WITH BACKEND) ---
accessFileBtn.addEventListener("click", handleAccessFile);
codeInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAccessFile();
});

async function handleAccessFile() {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
        showReceiveAlert("Please enter a share code", "error");
        return;
    }

    // Rate Limiting Check
    const lockoutStatus = checkRateLimit();
    if (lockoutStatus.locked) {
        showReceiveAlert(`🚫 Too many failed attempts. Try again in ${lockoutStatus.remainingSeconds} seconds.`, "warning");
        return;
    }

    accessFileBtn.disabled = true;
    accessFileBtn.textContent = "⌛ Verifying Code...";

    try {
        const response = await fetch(`${API_BASE_URL}/access`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            recordFailedAttempt();
            showReceiveAlert(data.error || "Invalid share code", "error");
            fileAccessCard.classList.add("hidden");
            return;
        }

        // Code Verified! Reset Failed Attempts
        resetFailedAttempts();
        hideReceiveAlert();

        currentAccessedCode = code;
        displayAccessFile(data);

    } catch (err) {
        console.error(err);
        showReceiveAlert("Could not connect to server. Ensure Node.js server is running.", "error");
    } finally {
        accessFileBtn.disabled = false;
        accessFileBtn.textContent = "🔓 Access File";
    }
}

function displayAccessFile(share) {
    accessFileName.textContent = share.fileName;
    accessFileSize.textContent = formatFileSize(share.fileSize);
    accessFileIcon.textContent = getFileIconEmoji(share.fileName);

    const expiresAtMs = new Date(share.expiresAt).getTime();
    accessExpTime.textContent = formatRemainingTime(expiresAtMs);
    
    const downloadsLeft = share.maxDownloads === 0 ? "Unlimited" : (share.maxDownloads - share.downloadsCount);
    accessDownloadsLeft.textContent = downloadsLeft;

    fileAccessCard.classList.remove("hidden");
}

// DOWNLOAD FILE (FROM SERVER / MONGODB)
downloadFileBtn.addEventListener("click", async () => {
    if (!currentAccessedCode) return;

    downloadFileBtn.disabled = true;
    downloadFileBtn.textContent = "⬇️ Downloading...";

    try {
        const response = await fetch(`${API_BASE_URL}/download/${encodeURIComponent(currentAccessedCode)}`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Download failed");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = accessFileName.textContent || "downloaded-file";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("File downloaded successfully!");
        fileAccessCard.classList.add("hidden");
        clearCurrentActiveCode();
    } catch (err) {
        console.error(err);
        showToast(err.message || "Download failed", true);
    } finally {
        downloadFileBtn.disabled = false;
        downloadFileBtn.textContent = "⬇️ Download File Now";
    }
});

// --- 5. RATE LIMITING & SECURITY HELPERS ---
function getAttemptData() {
    const raw = localStorage.getItem("unishare_attempts");
    if (!raw) return { attempts: [], lockoutUntil: 0 };
    try {
        return JSON.parse(raw);
    } catch {
        return { attempts: [], lockoutUntil: 0 };
    }
}

function checkRateLimit() {
    const data = getAttemptData();
    const now = Date.now();

    if (data.lockoutUntil && now < data.lockoutUntil) {
        const remaining = Math.ceil((data.lockoutUntil - now) / 1000);
        return { locked: true, remainingSeconds: remaining };
    }

    return { locked: false, remainingSeconds: 0 };
}

function recordFailedAttempt() {
    const now = Date.now();
    let data = getAttemptData();
    data.attempts = data.attempts.filter(ts => now - ts < 5 * 60 * 1000);
    data.attempts.push(now);

    if (data.attempts.length >= MAX_FAILED_ATTEMPTS) {
        data.lockoutUntil = now + LOCKOUT_DURATION_MS;
        data.attempts = [];
    }

    localStorage.setItem("unishare_attempts", JSON.stringify(data));
}

function resetFailedAttempts() {
    localStorage.removeItem("unishare_attempts");
}

function showReceiveAlert(msg, type = "error") {
    receiveAlert.textContent = msg;
    receiveAlert.className = `alert-box ${type}`;
    receiveAlert.classList.remove("hidden");
}

function hideReceiveAlert() {
    receiveAlert.classList.add("hidden");
}

// --- 6. LOCAL SENDER HISTORY (CURRENT CODE ONLY) ---
function saveToLocalHistory(shareData) {
    localStorage.setItem("unishare_current_code", JSON.stringify(shareData));
    renderLocalHistory();
}

function renderLocalHistory() {
    const raw = localStorage.getItem("unishare_current_code");
    if (!raw) {
        sharesHistoryCard.classList.add("hidden");
        return;
    }

    try {
        const share = JSON.parse(raw);
        const now = Date.now();
        const expiresAtMs = new Date(share.expiresAt).getTime();

        if (expiresAtMs <= now) {
            localStorage.removeItem("unishare_current_code");
            sharesHistoryCard.classList.add("hidden");
            return;
        }

        sharesHistoryCard.classList.remove("hidden");
        sharesList.innerHTML = "";

        const item = document.createElement("div");
        item.className = "share-item";
        
        const downloadsText = share.maxDownloads === 0 ? "∞" : `${share.maxDownloads} max`;

        item.innerHTML = `
            <div>
                <span class="share-item-code">${share.rawCode}</span>
                <p class="share-item-file" title="${share.fileName}">${share.fileName}</p>
            </div>
            <div class="share-item-actions">
                <span style="font-size:12px; color:#94a3b8;">${downloadsText}</span>
                <button class="revoke-btn" onclick="clearCurrentActiveCode()">Clear</button>
            </div>
        `;
        sharesList.appendChild(item);
    } catch {
        sharesHistoryCard.classList.add("hidden");
    }
}

function clearCurrentActiveCode() {
    localStorage.removeItem("unishare_current_code");
    sharesHistoryCard.classList.add("hidden");
}

// --- 7. UTILITIES ---
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    if (bytes < 1024) return bytes + " Bytes";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatRemainingTime(expiresAtMs) {
    const diff = expiresAtMs - Date.now();
    if (diff <= 0) return "Expired";

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
    return `${minutes} min${minutes > 1 ? 's' : ''}`;
}

let toastTimeout;
function showToast(message, isError = false) {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.style.borderColor = isError ? "#ef4444" : "#10b981";
    toast.classList.remove("hidden");

    toastTimeout = setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

// INIT
window.addEventListener("DOMContentLoaded", () => {
    renderLocalHistory();

    // Check URL parameter (?code=UNI-8X92K4)
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get("code");
    if (codeParam) {
        switchTab("receive");
        codeInput.value = codeParam;
        handleAccessFile();
    }
});