const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Load .env explicitly from backend folder or root
const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "../.env");

require("dotenv").config({ path: envPath });

const authRoutes = require("./routes/auth");
const photoRoutes = require("./routes/photos");
const videoRoutes = require("./routes/videos");

const app = express();
const PORT = process.env.PORT || 5000;

const uploadRoot = process.env.UPLOAD_ROOT || path.join(__dirname, "uploads");

// Ensure upload directories exist
fs.mkdirSync(path.join(uploadRoot, "photos"), { recursive: true });
fs.mkdirSync(path.join(uploadRoot, "videos"), { recursive: true });


// ==========================================
// MIDDLEWARE & CORS
// ==========================================

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-id");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));


// ==========================================
// API ROUTES
// ==========================================

app.use("/api/auth", authRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/videos", videoRoutes);


// ==========================================
// STATIC UPLOADS
// ==========================================

app.use(
    "/uploads",
    express.static(uploadRoot)
);

app.use(express.static(path.join(__dirname, '../frontend')));

// ==========================================
// FRONTEND STATIC FILES & ROUTES
// ==========================================

const frontendPath = path.join(__dirname, "../frontend");

// Specific HTML Page Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/client-login", (req, res) => {
    res.sendFile(path.join(frontendPath, "client-login.html"));
});

app.get("/client-login.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "client-login.html"));
});

app.get("/client-dashboard", (req, res) => {
    res.sendFile(path.join(frontendPath, "client-dashboard.html"));
});

app.get("/client-dashboard.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "client-dashboard.html"));
});

// Fallback redirect for nested client paths
app.get("/client/client-dashboard.html", (req, res) => {
    res.redirect("/client-dashboard.html");
});

app.get("/client/client-login.html", (req, res) => {
    res.redirect("/client-login.html");
});

app.get("/admin-login", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin-login.html"));
});

app.get("/admin-login.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin-login.html"));
});

app.get("/admin/dashboard", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "dashboard.html"));
});

app.get("/admin/dashboard.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "dashboard.html"));
});

// Support both lowercase and uppercase Clients.html
app.get("/admin/clients", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "Clients.html"));
});

app.get("/admin/clients.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "Clients.html"));
});

app.get("/admin/Clients.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "Clients.html"));
});

app.get("/admin/client-profile", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "client-profile.html"));
});

app.get("/admin/client-profile.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "client-profile.html"));
});

// Serve rest of frontend directory as static files
app.use(express.static(frontendPath));


// ==========================================
// START SERVER
// ==========================================

async function startServer() {
    try {
        const mongoUri = process.env.MONGODB_URI;

        if (!mongoUri) {
            throw new Error(
                "MONGODB_URI is not defined! Please check that backend/.env exists with a valid MONGODB_URI."
            );
        }

        await mongoose.connect(mongoUri);

        console.log("✅ MongoDB Connected Successfully!");

        app.listen(PORT, () => {
            console.log(`🚀 Server running at https://studio-gaurav-1.onrender.com:`);
        });

    } catch (error) {
        console.error("❌ MongoDB Connection Failed!");
        console.error(error.message);
    }
}

// Only auto-start if this file is run directly
if (require.main === module) {
    startServer();
}

module.exports = app;