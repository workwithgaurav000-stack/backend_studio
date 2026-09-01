const express = require("express");
const path = require("path");
const archiver = require("archiver");
const fetch = require("node-fetch");
const { videoUpload, uploadToCloudinary } = require("../config/cloudinary");

const Video = require("../models/Video");
const User = require("../models/User");

const router = express.Router();


// ============================================
// GET ALL VIDEOS FOR A CLIENT
// ============================================

router.get("/client/:clientId", async (req, res) => {
    try {
        const videos = await Video.find({
            client: req.params.clientId
        }).sort({
            createdAt: -1
        });

        return res.json({
            success: true,
            videos: videos
        });

    } catch (error) {
        console.error("GET VIDEOS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load videos: " + error.message
        });
    }
});


// ============================================
// UPLOAD VIDEOS FOR A CLIENT
// ============================================

router.post(
    "/upload/:clientId",
    videoUpload.array("videos", 30),
    async (req, res) => {
        try {
            const clientId = req.params.clientId;

            if (!clientId) {
                return res.status(400).json({
                    success: false,
                    message: "Client ID is required."
                });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No videos selected for upload."
                });
            }

            const uploadedVideos = [];

            // Upload each file to Cloudinary
            for (const file of req.files) {
                try {
                    const cloudinaryResult = await uploadToCloudinary(file, "photography-studio/videos", "video");
                    uploadedVideos.push({
                        client: clientId,
                        fileName: file.originalname,
                        fileUrl: cloudinaryResult.secure_url
                    });
                } catch (uploadErr) {
                    console.error(`Error uploading ${file.originalname}:`, uploadErr);
                }
            }

            if (uploadedVideos.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Failed to upload any videos. Please try again."
                });
            }

            const savedVideos = await Video.insertMany(uploadedVideos);

            return res.json({
                success: true,
                message: `${uploadedVideos.length} video(s) uploaded successfully!`,
                videos: savedVideos
            });

        } catch (error) {
            console.error("VIDEO UPLOAD ERROR:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Video upload failed."
            });
        }
    }
);


// ============================================
// DOWNLOAD SINGLE VIDEO (REDIRECT TO CLOUDINARY)
// ============================================

router.get("/:videoId/download", async (req, res) => {
    try {
        const video = await Video.findById(req.params.videoId);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found."
            });
        }

        // Redirect to Cloudinary URL with download parameter
        const downloadUrl = video.fileUrl + "?attachment=true";
        res.redirect(downloadUrl);

    } catch (error) {
        console.error("DOWNLOAD VIDEO ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to download video: " + error.message
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
// DOWNLOAD ALL VIDEOS AS ZIP ARCHIVE
// ============================================

router.get("/download-all/:clientId", async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const videos = await Video.find({ client: clientId });

        if (!videos || videos.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No videos found to download for this client."
            });
        }

        const client = await User.findById(clientId);
        const rawClientName = client ? client.name : "client";
        const safeClientName = rawClientName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const zipFileName = `${safeClientName}_Videos_${Date.now()}.zip`;

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

        const archive = createZipArchive({
            zlib: { level: 4 }
        });

        archive.on("error", (err) => {
            console.error("ARCHIVE VIDEO ERROR:", err);
            if (!res.headersSent) {
                res.status(500).send({ error: err.message });
            }
        });

        archive.pipe(res);

        const usedNames = new Set();

        for (const video of videos) {
            try {
                // Fetch file from Cloudinary URL
                const response = await fetch(video.fileUrl);
                if (response.ok) {
                    let entryName = video.fileName || `video_${video._id}`;

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
                console.warn(`Could not download video ${video._id}:`, err.message);
            }
        }

        await archive.finalize();

    } catch (error) {
        console.error("DOWNLOAD ALL VIDEOS ERROR:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Failed to create video ZIP download: " + error.message
            });
        }
    }
});


// ============================================
// DELETE VIDEO
// ============================================

router.delete("/:videoId", async (req, res) => {
    try {
        const video = await Video.findById(req.params.videoId);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found."
            });
        }

        // Delete from MongoDB only
        // Cloudinary handles cleanup automatically
        await Video.findByIdAndDelete(req.params.videoId);

        return res.json({
            success: true,
            message: "Video deleted successfully."
        });

    } catch (error) {
        console.error("DELETE VIDEO ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete video: " + error.message
        });
    }
});

module.exports = router;