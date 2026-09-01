const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");

const Photo = require("../models/Photo");
const User = require("../models/User");

const router = express.Router();

const uploadRoot = process.env.UPLOAD_ROOT || path.resolve(__dirname, "../uploads");
const uploadPath = path.join(uploadRoot, "photos");

// Ensure upload directory exists
fs.mkdirSync(uploadPath, {
    recursive: true
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9) +
            (ext || ".jpg");

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB per photo
    },
    fileFilter: function (req, file, cb) {
        const allowedExtensions = [
            ".jpg", ".jpeg", ".png", ".webp", ".gif",
            ".bmp", ".svg", ".heic", ".heif", ".jfif", ".avif"
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        const isImageMime = file.mimetype && file.mimetype.startsWith("image/");

        if (isImageMime || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files (JPEG, PNG, WebP, GIF, HEIC, AVIF) are allowed."));
        }
    }
});


// ============================================
// GET ALL PHOTOS FOR A CLIENT
// ============================================

router.get("/client/:clientId", async (req, res) => {
    try {
        const photos = await Photo.find({
            client: req.params.clientId
        }).sort({
            createdAt: -1
        });

        return res.json({
            success: true,
            photos: photos
        });

    } catch (error) {
        console.error("GET PHOTOS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load photos: " + error.message
        });
    }
});


// ============================================
// UPLOAD PHOTOS FOR A CLIENT
// ============================================

router.post(
    "/upload/:clientId",
    upload.array("photos", 100),
    async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No photos selected for upload."
                });
            }

            const photos = req.files.map(file => ({
                client: req.params.clientId,
                fileName: file.originalname,
                fileUrl: `/uploads/photos/${file.filename}`
            }));

            const savedPhotos = await Photo.insertMany(photos);

            return res.json({
                success: true,
                message: `${photos.length} photo(s) uploaded successfully!`,
                photos: savedPhotos
            });

        } catch (error) {
            console.error("UPLOAD PHOTOS ERROR:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Photo upload failed."
            });
        }
    }
);


// ============================================
// DOWNLOAD SINGLE PHOTO (FORCES DIRECT DOWNLOAD)
// ============================================

router.get("/:photoId/download", async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.photoId);

        if (!photo) {
            return res.status(404).json({
                success: false,
                message: "Photo not found."
            });
        }

        const fileName = path.basename(photo.fileUrl);
        const filePath = path.join(uploadPath, fileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: "Photo file not found on disk."
            });
        }

        const downloadName = photo.fileName || fileName;
        return res.download(filePath, downloadName);

    } catch (error) {
        console.error("DOWNLOAD PHOTO ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to download photo: " + error.message
        });
    }
});


function createZipArchive(options) {
    if (typeof archiver === "function") {
        return archiver("zip", options);
    }
    if (archiver && archiver.ZipArchive) {
        return new archiver.ZipArchive(options);
    }
    throw new Error("Unable to initialize ZIP archiver");
}

// ============================================
// DOWNLOAD ALL PHOTOS AS ZIP ARCHIVE
// ============================================

router.get("/download-all/:clientId", async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const photos = await Photo.find({ client: clientId });

        if (!photos || photos.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No photos found to download for this client."
            });
        }

        const client = await User.findById(clientId);
        const rawClientName = client ? client.name : "client";
        const safeClientName = rawClientName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const zipFileName = `${safeClientName}_Photos_${Date.now()}.zip`;

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

        const archive = createZipArchive({
            zlib: { level: 6 } // Good compression balance
        });

        archive.on("error", (err) => {
            console.error("ARCHIVE ERROR:", err);
            if (!res.headersSent) {
                res.status(500).send({ error: err.message });
            }
        });

        archive.pipe(res);

        // Keep track of names to avoid collisions inside ZIP
        const usedNames = new Set();

        for (const photo of photos) {
            const diskFileName = path.basename(photo.fileUrl);
            const diskFilePath = path.join(uploadPath, diskFileName);

            if (fs.existsSync(diskFilePath)) {
                let entryName = photo.fileName || diskFileName;
                
                // Disambiguate duplicate original filenames
                if (usedNames.has(entryName)) {
                    const ext = path.extname(entryName);
                    const base = path.basename(entryName, ext);
                    let counter = 1;
                    while (usedNames.has(`${base}_${counter}${ext}`)) {
                        counter++;
                    }
                    entryName = `${base}_${counter}${ext}`;
                }
                usedNames.add(entryName);

                archive.file(diskFilePath, { name: entryName });
            }
        }

        await archive.finalize();

    } catch (error) {
        console.error("DOWNLOAD ALL PHOTOS ERROR:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Failed to create photo ZIP download: " + error.message
            });
        }
    }
});


// ============================================
// DELETE PHOTO
// ============================================

router.delete("/:photoId", async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.photoId);

        if (!photo) {
            return res.status(404).json({
                success: false,
                message: "Photo not found."
            });
        }

        const fileName = path.basename(photo.fileUrl);
        const filePath = path.join(uploadPath, fileName);

        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (fsErr) {
                console.warn("Could not delete file from disk:", fsErr.message);
            }
        }

        await Photo.findByIdAndDelete(req.params.photoId);

        return res.json({
            success: true,
            message: "Photo deleted successfully."
        });

    } catch (error) {
        console.error("DELETE PHOTO ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete photo: " + error.message
        });
    }
});

module.exports = router;