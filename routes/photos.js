const express = require("express");
const path = require("path");
const archiver = require("archiver");
const fetch = require("node-fetch");
const { photoUpload, uploadToCloudinary } = require("../config/cloudinary");

const Photo = require("../models/Photo");
const User = require("../models/User");

const router = express.Router();


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
    photoUpload.array("photos", 100),
    async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No photos selected for upload."
                });
            }

            const uploadedPhotos = [];

            // Upload each file to Cloudinary
            for (const file of req.files) {
                try {
                    const cloudinaryResult = await uploadToCloudinary(file, "photography-studio/photos", "auto");
                    uploadedPhotos.push({
                        client: req.params.clientId,
                        fileName: file.originalname,
                        fileUrl: cloudinaryResult.secure_url
                    });
                } catch (uploadErr) {
                    console.error(`Error uploading ${file.originalname}:`, uploadErr);
                }
            }

            if (uploadedPhotos.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Failed to upload any photos. Please try again."
                });
            }

            const savedPhotos = await Photo.insertMany(uploadedPhotos);

            return res.json({
                success: true,
                message: `${uploadedPhotos.length} photo(s) uploaded successfully!`,
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
// DOWNLOAD SINGLE PHOTO (REDIRECT TO CLOUDINARY)
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

        // Redirect to Cloudinary URL with download parameter
        const downloadUrl = photo.fileUrl + "?attachment=true";
        res.redirect(downloadUrl);

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
            zlib: { level: 6 }
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
            try {
                // Fetch file from Cloudinary URL
                const response = await fetch(photo.fileUrl);
                if (response.ok) {
                    let entryName = photo.fileName || `photo_${photo._id}`;
                    
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

                    archive.append(response.body, { name: entryName });
                }
            } catch (err) {
                console.warn(`Could not download photo ${photo._id}:`, err.message);
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

        // Delete from MongoDB only
        // Cloudinary handles cleanup automatically
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