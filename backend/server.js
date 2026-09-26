require('dotenv').config();
const dns = require('dns');
// Set public DNS to resolve MongoDB Atlas SRV records on Windows
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// Memory Storage for Multer File Uploads (up to 50MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// 1. MONGODB CONNECTION
// Replace with your MongoDB Atlas URI or keep localhost
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/unishare_db';

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000
})
    .then(() => console.log('✅ Connected to MongoDB Database successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// 2. MONGODB SCHEMA & MODEL
const shareSchema = new mongoose.Schema({
    codeHash: { type: String, required: true, unique: true },
    rawCode: { type: String, required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, default: 'application/octet-stream' },
    fileData: { type: Buffer, required: true }, // Binary Payload
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    maxDownloads: { type: Number, default: 1 },
    downloadsCount: { type: Number, default: 0 },
    autoDelete: { type: Boolean, default: true }
});

const Share = mongoose.model('Share', shareSchema);

// Helper function: SHA-256 Hashing
function hashShareCode(code) {
    return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

// Helper function: Random Code Generator (e.g. UNI-8X92K4)
function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'UNI-';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// 3. API ENDPOINTS

// Upload File & Create Share Code
app.post('/api/share', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const rawCode = generateRandomCode();
        const codeHash = hashShareCode(rawCode);

        const expSeconds = parseInt(req.body.expirationSeconds || 3600, 10);
        const expiresAt = new Date(Date.now() + expSeconds * 1000);
        const maxDownloads = parseInt(req.body.maxDownloads || 1, 10);
        const autoDelete = req.body.autoDelete === 'true' || req.body.autoDelete === true;

        const newShare = new Share({
            codeHash,
            rawCode,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            fileData: req.file.buffer,
            expiresAt,
            maxDownloads,
            autoDelete
        });

        await newShare.save();

        res.json({
            success: true,
            rawCode: rawCode,
            fileName: newShare.fileName,
            fileSize: newShare.fileSize,
            expiresAt: newShare.expiresAt,
            maxDownloads: newShare.maxDownloads
        });
    } catch (err) {
        console.error('Share error:', err);
        res.status(500).json({ error: 'Server error saving file to database' });
    }
});

// Verify Share Code & Get Metadata
app.post('/api/access', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Share code is required' });
        }

        const codeHash = hashShareCode(code);
        const share = await Share.findOne({ codeHash });

        if (!share) {
            return res.status(444).json({ error: 'Invalid share code or file has been deleted' });
        }

        // Check Expiration
        if (new Date() > share.expiresAt) {
            await Share.deleteOne({ _id: share._id });
            return res.status(410).json({ error: 'Share code has expired' });
        }

        // Check Download Limit
        if (share.maxDownloads > 0 && share.downloadsCount >= share.maxDownloads) {
            await Share.deleteOne({ _id: share._id });
            return res.status(410).json({ error: 'Maximum download limit reached' });
        }

        res.json({
            success: true,
            fileName: share.fileName,
            fileSize: share.fileSize,
            fileType: share.fileType,
            expiresAt: share.expiresAt,
            maxDownloads: share.maxDownloads,
            downloadsCount: share.downloadsCount
        });
    } catch (err) {
        console.error('Access error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Download File Endpoint
app.get('/api/download/:code', async (req, res) => {
    try {
        const code = req.params.code;
        const codeHash = hashShareCode(code);
        const share = await Share.findOne({ codeHash });

        if (!share) {
            return res.status(404).send('File not found or link expired.');
        }

        if (new Date() > share.expiresAt) {
            await Share.deleteOne({ _id: share._id });
            return res.status(410).send('File link has expired.');
        }

        // Increment Download Count
        share.downloadsCount += 1;

        // Check if payload should be self-destructed
        const shouldDelete = share.autoDelete || (share.maxDownloads > 0 && share.downloadsCount >= share.maxDownloads);

        // Send File Buffer as Download
        res.setHeader('Content-Type', share.fileType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.fileName)}"`);
        res.send(share.fileData);

        if (shouldDelete) {
            await Share.deleteOne({ _id: share._id });
            console.log(`🗑️ File payload ${share.fileName} self-destructed after download.`);
        } else {
            await share.save();
        }
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).send('Server error');
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 UniShare Node.js Server running at http://localhost:${PORT}`);
});
