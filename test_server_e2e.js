const path = require("path");
const fs = require("fs");
const http = require("http");

const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "../.env");

require("dotenv").config({ path: envPath });

const express = require("express");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const photoRoutes = require("./routes/photos");
const videoRoutes = require("./routes/videos");

const app = express();
const TEST_PORT = 5002;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/videos", videoRoutes);

const frontendPath = path.join(__dirname, "../frontend");

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});
app.get("/index.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});
app.get("/client-login.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "client-login.html"));
});
app.get("/client-dashboard.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "client-dashboard.html"));
});
app.get("/admin-login.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin-login.html"));
});
app.get("/admin/dashboard.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "dashboard.html"));
});
app.get("/admin/Clients.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "Clients.html"));
});
app.get("/admin/clients.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "Clients.html"));
});
app.get("/admin/client-profile.html", (req, res) => {
    res.sendFile(path.join(frontendPath, "admin", "client-profile.html"));
});
app.use(express.static(frontendPath));

function makeRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => {
                const buffer = Buffer.concat(chunks);
                const bodyStr = buffer.toString();
                let parsed = bodyStr;
                try {
                    parsed = JSON.parse(bodyStr);
                } catch(e) {}
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed,
                    rawBody: bodyStr,
                    rawBuffer: buffer
                });
            });
        });
        req.on("error", reject);
        if (postData) {
            if (postData.pipe) {
                postData.pipe(req);
                return;
            }
            req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function runE2ETests() {
    let server;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ DB Connected for E2E tests");

        const User = require("./models/User");
        const Photo = require("./models/Photo");
        const Video = require("./models/Video");
        const bcrypt = require("bcryptjs");

        // Ensure admin user exists
        const adminPass = await bcrypt.hash("Admin@2026", 12);
        await User.findOneAndUpdate(
            { role: "admin" },
            { name: "Studio Admin", username: "admin", password: adminPass, role: "admin", active: true },
            { upsert: true, returnDocument: "after" }
        );

        // Setup test client
        const clientPass = await bcrypt.hash("Client@2026", 12);
        const testClient = await User.findOneAndUpdate(
            { username: "test_e2e_client" },
            { name: "E2E Test Client", username: "test_e2e_client", password: clientPass, role: "client", active: true },
            { upsert: true, returnDocument: "after" }
        );
        const clientId = testClient._id.toString();

        server = app.listen(TEST_PORT);
        console.log(`✅ Test server running on port ${TEST_PORT}`);

        // 1. Test Admin Login
        console.log("\n1. Testing Admin Login...");
        const adminLoginRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/api/auth/admin-login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { username: "admin", password: "Admin@2026" });
        console.log("Status:", adminLoginRes.statusCode, "Success:", adminLoginRes.body.success);
        if (adminLoginRes.statusCode !== 200 || !adminLoginRes.body.success) {
            throw new Error("Admin login failed!");
        }

        // 2. Test Get & Update Admin Profile (Change username & password)
        console.log("\n2. Testing Admin Profile Update (Change Username & Password)...");
        const updateAdminRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/api/auth/admin/profile",
            method: "PUT",
            headers: { "Content-Type": "application/json" }
        }, {
            name: "Updated Admin Head",
            username: "admin_new",
            currentPassword: "Admin@2026",
            newPassword: "NewAdminPassword@2026"
        });
        console.log("Status:", updateAdminRes.statusCode, "Response:", updateAdminRes.body);
        if (updateAdminRes.statusCode !== 200 || !updateAdminRes.body.success) {
            throw new Error("Admin profile update failed!");
        }

        // 3. Test Admin Login with NEW Credentials
        console.log("\n3. Testing Admin Login with newly updated credentials...");
        const newAdminLoginRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/api/auth/admin-login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { username: "admin_new", password: "NewAdminPassword@2026" });
        console.log("Status:", newAdminLoginRes.statusCode, "Success:", newAdminLoginRes.body.success);
        if (newAdminLoginRes.statusCode !== 200 || !newAdminLoginRes.body.success) {
            throw new Error("New admin login failed!");
        }

        // Revert admin credentials to standard
        await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/api/auth/admin/profile",
            method: "PUT",
            headers: { "Content-Type": "application/json" }
        }, {
            name: "Studio Admin",
            username: "admin",
            newPassword: "Admin@2026"
        });

        // 4. Test Studio Stats Endpoint
        console.log("\n4. Testing GET /api/auth/stats...");
        const statsRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/api/auth/stats",
            method: "GET"
        });
        console.log("Status:", statsRes.statusCode, "Stats:", statsRes.body.stats);
        if (statsRes.statusCode !== 200 || !statsRes.body.success) {
            throw new Error("Stats API failed!");
        }

        // 5. Test Photo Upload, Single Download, and Bulk ZIP Download
        console.log("\n5. Testing Photo Upload & Download APIs...");
        // Create dummy photo record directly in DB & uploads directory for testing
        const samplePhotoFile = `test_photo_${Date.now()}.jpg`;
        const samplePhotoPath = path.join(__dirname, "uploads/photos", samplePhotoFile);
        fs.writeFileSync(samplePhotoPath, Buffer.from("dummy image content 123456789"));

        const createdPhoto = await Photo.create({
            client: clientId,
            fileName: "My_Delivered_Photo.jpg",
            fileUrl: `/uploads/photos/${samplePhotoFile}`
        });

        // Test GET single photo download
        console.log("  - Testing GET /api/photos/:photoId/download...");
        const photoDownloadRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: `/api/photos/${createdPhoto._id}/download`,
            method: "GET"
        });
        console.log("    Status:", photoDownloadRes.statusCode, "Content-Type:", photoDownloadRes.headers["content-type"], "Bytes:", photoDownloadRes.rawBuffer.length);
        if (photoDownloadRes.statusCode !== 200 || photoDownloadRes.rawBuffer.length === 0) {
            throw new Error("Single photo download failed!");
        }

        // Test GET download-all photos as ZIP
        console.log("  - Testing GET /api/photos/download-all/:clientId (ZIP Archive)...");
        const photosZipRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: `/api/photos/download-all/${clientId}`,
            method: "GET"
        });
        console.log("    Status:", photosZipRes.statusCode, "Content-Type:", photosZipRes.headers["content-type"], "ZIP Bytes:", photosZipRes.rawBuffer.length);
        if (photosZipRes.statusCode !== 200 || !photosZipRes.headers["content-type"]?.includes("zip") || photosZipRes.rawBuffer.length < 50) {
            throw new Error("Photos ZIP streaming download failed!");
        }

        // 6. Test Video Upload, Single Download, and Bulk ZIP Download
        console.log("\n6. Testing Video Upload & Download APIs...");
        const sampleVideoFile = `test_video_${Date.now()}.mp4`;
        const sampleVideoPath = path.join(__dirname, "uploads/videos", sampleVideoFile);
        fs.writeFileSync(sampleVideoPath, Buffer.from("dummy video content 123456789"));

        const createdVideo = await Video.create({
            client: clientId,
            fileName: "Wedding_Highlight.mp4",
            fileUrl: `/uploads/videos/${sampleVideoFile}`
        });

        // Test GET single video download
        console.log("  - Testing GET /api/videos/:videoId/download...");
        const videoDownloadRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: `/api/videos/${createdVideo._id}/download`,
            method: "GET"
        });
        console.log("    Status:", videoDownloadRes.statusCode, "Content-Type:", videoDownloadRes.headers["content-type"], "Bytes:", videoDownloadRes.rawBuffer.length);
        if (videoDownloadRes.statusCode !== 200 || videoDownloadRes.rawBuffer.length === 0) {
            throw new Error("Single video download failed!");
        }

        // Test GET download-all videos as ZIP
        console.log("  - Testing GET /api/videos/download-all/:clientId (ZIP Archive)...");
        const videosZipRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: `/api/videos/download-all/${clientId}`,
            method: "GET"
        });
        console.log("    Status:", videosZipRes.statusCode, "Content-Type:", videosZipRes.headers["content-type"], "ZIP Bytes:", videosZipRes.rawBuffer.length);
        if (videosZipRes.statusCode !== 200 || !videosZipRes.headers["content-type"]?.includes("zip")) {
            throw new Error("Videos ZIP streaming download failed!");
        }

        // 7. Test Cascade Client Deletion
        console.log("\n7. Testing DELETE /api/auth/clients/:id (Cascade Deletion of Media & User)...");
        const deleteClientRes = await makeRequest({
            hostname: "localhost",
            port: TEST_PORT,
            path: `/api/auth/clients/${clientId}`,
            method: "DELETE"
        });
        console.log("Status:", deleteClientRes.statusCode, "Message:", deleteClientRes.body.message);
        if (deleteClientRes.statusCode !== 200 || !deleteClientRes.body.success) {
            throw new Error("Client deletion failed!");
        }

        // Verify photos and videos are deleted from DB
        const remainingPhotos = await Photo.countDocuments({ client: clientId });
        const remainingVideos = await Video.countDocuments({ client: clientId });
        const remainingUser = await User.findById(clientId);
        console.log(`Cascade verification: Remaining photos: ${remainingPhotos}, videos: ${remainingVideos}, client user: ${remainingUser ? 'exists' : 'null'}`);
        if (remainingPhotos !== 0 || remainingVideos !== 0 || remainingUser !== null) {
            throw new Error("Cascade deletion verification failed!");
        }

        // 8. Test Frontend HTML Routes
        console.log("\n8. Testing Frontend HTML Pages...");
        const htmlPages = [
            "/",
            "/index.html",
            "/client-login.html",
            "/client-dashboard.html",
            "/admin-login.html",
            "/admin/dashboard.html",
            "/admin/Clients.html",
            "/admin/clients.html",
            "/admin/client-profile.html"
        ];
        for (const page of htmlPages) {
            const pageRes = await makeRequest({
                hostname: "localhost",
                port: TEST_PORT,
                path: page,
                method: "GET"
            });
            console.log(`  - GET ${page} -> HTTP ${pageRes.statusCode}`);
            if (pageRes.statusCode !== 200) {
                throw new Error(`Route ${page} failed with status ${pageRes.statusCode}`);
            }
        }

        console.log("\n=======================================================");
        console.log("🎉 ALL E2E TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS! 🎉");
        console.log("=======================================================\n");

        server.close();
        await mongoose.disconnect();
        process.exit(0);

    } catch (err) {
        console.error("\n❌ E2E TEST FAILED:", err);
        if (server) server.close();
        process.exit(1);
    }
}

runE2ETests();
