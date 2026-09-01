const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const User = require("../models/User");
const Photo = require("../models/Photo");
const Video = require("../models/Video");

const router = express.Router();

// Helper to escape regex special characters
function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}


// =====================================================
// ADMIN LOGIN
// =====================================================

router.post("/admin-login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const cleanUsername = username.trim();

        const user = await User.findOne({
            username: { $regex: new RegExp("^" + escapeRegex(cleanUsername) + "$", "i") },
            role: "admin",
            active: true
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        return res.json({
            success: true,
            message: "Admin login successful.",
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error("ADMIN LOGIN ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred during login: " + error.message
        });
    }
});


// =====================================================
// GET ADMIN PROFILE
// =====================================================

router.get("/admin/profile", async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers["x-admin-id"];

        let admin;
        if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
            admin = await User.findOne({ _id: adminId, role: "admin" }).select("-password");
        } else {
            admin = await User.findOne({ role: "admin" }).select("-password");
        }

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin profile not found."
            });
        }

        return res.json({
            success: true,
            admin: {
                id: admin._id,
                name: admin.name,
                username: admin.username,
                role: admin.role
            }
        });

    } catch (error) {
        console.error("GET ADMIN PROFILE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error: " + error.message
        });
    }
});


// =====================================================
// UPDATE ADMIN PROFILE & CHANGE PASSWORD
// =====================================================

router.put("/admin/profile", async (req, res) => {
    try {
        const { adminId, name, username, currentPassword, newPassword } = req.body;

        let admin;
        if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
            admin = await User.findOne({ _id: adminId, role: "admin" });
        } else {
            admin = await User.findOne({ role: "admin" });
        }

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin account not found."
            });
        }

        // 1. Verify Current Password if provided
        if (newPassword && newPassword.trim().length > 0) {
            if (currentPassword && currentPassword.trim().length > 0) {
                const isMatch = await bcrypt.compare(currentPassword, admin.password);
                if (!isMatch) {
                    return res.status(400).json({
                        success: false,
                        message: "Current password does not match. Please enter your correct current password."
                    });
                }
            }

            if (newPassword.trim().length < 4) {
                return res.status(400).json({
                    success: false,
                    message: "New password must be at least 4 characters long."
                });
            }

            admin.password = await bcrypt.hash(newPassword.trim(), 12);
        }

        // 2. Update Username if changed & check uniqueness
        if (username && typeof username === "string" && username.trim().length > 0) {
            const cleanUsername = username.trim();

            const existingUser = await User.findOne({
                _id: { $ne: admin._id },
                username: { $regex: new RegExp("^" + escapeRegex(cleanUsername) + "$", "i") }
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: `Username "${cleanUsername}" is already taken. Please choose a different username.`
                });
            }

            admin.username = cleanUsername;
        }

        // 3. Update Name if provided
        if (name && typeof name === "string" && name.trim().length > 0) {
            admin.name = name.trim();
        }

        await admin.save();

        return res.json({
            success: true,
            message: "Admin profile and credentials updated successfully!",
            user: {
                id: admin._id,
                name: admin.name,
                username: admin.username,
                role: admin.role
            }
        });

    } catch (error) {
        console.error("UPDATE ADMIN PROFILE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred while updating admin: " + error.message
        });
    }
});


// =====================================================
// GET STUDIO STATS
// =====================================================

router.get("/stats", async (req, res) => {
    try {
        const [clientsCount, photosCount, videosCount] = await Promise.all([
            User.countDocuments({ role: "client" }),
            Photo.countDocuments(),
            Video.countDocuments()
        ]);

        return res.json({
            success: true,
            stats: {
                clientsCount,
                photosCount,
                videosCount
            }
        });
    } catch (error) {
        console.error("GET STATS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch studio statistics."
        });
    }
});


// =====================================================
// CLIENT LOGIN
// =====================================================

router.post("/client-login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const cleanUsername = username.trim();

        const client = await User.findOne({
            username: { $regex: new RegExp("^" + escapeRegex(cleanUsername) + "$", "i") },
            role: "client"
        });

        if (!client) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        if (client.active === false) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated. Please contact the studio."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            client.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        return res.json({
            success: true,
            message: "Client login successful.",
            client: {
                id: client._id,
                name: client.name,
                username: client.username,
                role: client.role
            }
        });

    } catch (error) {
        console.error("CLIENT LOGIN ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred during login: " + error.message
        });
    }
});


// =====================================================
// CREATE CLIENT
// =====================================================

router.post("/create-client", async (req, res) => {
    try {
        const { name, username, password } = req.body;

        if (!name || !username || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, username, and password are required."
            });
        }

        const cleanUsername = username.trim();
        const cleanName = name.trim();

        const existingUser = await User.findOne({
            username: { $regex: new RegExp("^" + escapeRegex(cleanUsername) + "$", "i") }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Username already exists. Please choose a different username."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const client = await User.create({
            name: cleanName,
            username: cleanUsername,
            password: hashedPassword,
            role: "client",
            active: true
        });

        return res.json({
            success: true,
            message: "Client created successfully.",
            client: {
                id: client._id,
                name: client.name,
                username: client.username
            }
        });

    } catch (error) {
        console.error("CREATE CLIENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred while creating client: " + error.message
        });
    }
});


// =====================================================
// GET ALL CLIENTS
// =====================================================

router.get("/clients", async (req, res) => {
    try {
        const clients = await User.find({
            role: "client"
        })
        .select("-password")
        .sort({ createdAt: -1 });

        return res.json({
            success: true,
            clients
        });

    } catch (error) {
        console.error("LOAD CLIENTS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load clients: " + error.message
        });
    }
});


// =====================================================
// GET SINGLE CLIENT
// =====================================================

router.get("/clients/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid client ID."
            });
        }

        const client = await User.findOne({
            _id: req.params.id,
            role: "client"
        }).select("-password");

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found."
            });
        }

        return res.json({
            success: true,
            client: {
                id: client._id,
                name: client.name,
                username: client.username,
                active: client.active
            }
        });

    } catch (error) {
        console.error("LOAD CLIENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load client: " + error.message
        });
    }
});


// =====================================================
// UPDATE CLIENT (Name, Username, Password, Active)
// =====================================================

async function handleUpdateClient(req, res) {
    try {
        const clientId = req.params.id || req.body.id;

        if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid client ID."
            });
        }

        const client = await User.findOne({
            _id: clientId,
            role: "client"
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found."
            });
        }

        const { name, username, password, active } = req.body;

        // 1. Update Name if provided
        if (name && typeof name === "string" && name.trim().length > 0) {
            client.name = name.trim();
        }

        // 2. Update Username if provided and check for duplicates
        if (username && typeof username === "string" && username.trim().length > 0) {
            const cleanUsername = username.trim();

            const existingUser = await User.findOne({
                _id: { $ne: clientId },
                username: { $regex: new RegExp("^" + escapeRegex(cleanUsername) + "$", "i") }
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: `Username "${cleanUsername}" is already in use by another user.`
                });
            }

            client.username = cleanUsername;
        }

        // 3. Update Password if provided
        if (password && typeof password === "string" && password.trim().length > 0) {
            client.password = await bcrypt.hash(password, 12);
        }

        // 4. Update Active status if provided
        if (typeof active === "boolean") {
            client.active = active;
        }

        await client.save();

        return res.json({
            success: true,
            message: "Client updated successfully.",
            client: {
                id: client._id,
                name: client.name,
                username: client.username,
                active: client.active
            }
        });

    } catch (error) {
        console.error("UPDATE CLIENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred while updating client: " + error.message
        });
    }
}

router.put("/clients/:id", handleUpdateClient);
router.post("/clients/:id/update", handleUpdateClient);
router.post("/update-client/:id", handleUpdateClient);


// =====================================================
// DELETE CLIENT (And cascade delete photos & videos)
// =====================================================

async function handleDeleteClient(req, res) {
    try {
        const clientId = req.params.id || req.body.id;

        if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid client ID."
            });
        }

        const client = await User.findOne({
            _id: clientId,
            role: "client"
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found in database."
            });
        }

        // 1. Delete associated Photos from disk and DB
        const photos = await Photo.find({ client: clientId });
        const photosUploadPath = path.join(__dirname, "../uploads/photos");

        for (const photo of photos) {
            if (photo.fileUrl) {
                const fileName = path.basename(photo.fileUrl);
                const filePath = path.join(photosUploadPath, fileName);
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        console.warn("Could not delete photo file from disk:", e.message);
                    }
                }
            }
        }
        await Photo.deleteMany({ client: clientId });

        // 2. Delete associated Videos from disk and DB
        const videos = await Video.find({ client: clientId });
        const videosUploadPath = path.join(__dirname, "../uploads/videos");

        for (const video of videos) {
            if (video.fileUrl) {
                const fileName = path.basename(video.fileUrl);
                const filePath = path.join(videosUploadPath, fileName);
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        console.warn("Could not delete video file from disk:", e.message);
                    }
                }
            }
        }
        await Video.deleteMany({ client: clientId });

        // 3. Delete the Client user document
        await User.findByIdAndDelete(clientId);

        return res.json({
            success: true,
            message: `Client "${client.name}" and all associated galleries were deleted successfully.`
        });

    } catch (error) {
        console.error("DELETE CLIENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred while deleting client: " + error.message
        });
    }
}

router.delete("/clients/:id", handleDeleteClient);
router.post("/clients/:id/delete", handleDeleteClient);
router.post("/delete-client/:id", handleDeleteClient);

module.exports = router;
