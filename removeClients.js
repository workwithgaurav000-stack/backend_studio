const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "../.env");

require("dotenv").config({ path: envPath });

const User = require("./models/User");
const Photo = require("./models/Photo");
const Video = require("./models/Video");

async function removeAllClients() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined.");
        }

        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB Connected");

        const clients = await User.find({ role: "client" });
        console.log(`Found ${clients.length} client(s) to remove.`);

        for (const client of clients) {
            // Remove photos
            const photos = await Photo.find({ client: client._id });
            for (const p of photos) {
                if (p.fileUrl) {
                    const filePath = path.join(__dirname, "uploads/photos", path.basename(p.fileUrl));
                    if (fs.existsSync(filePath)) {
                        try { fs.unlinkSync(filePath); } catch(e) {}
                    }
                }
            }
            await Photo.deleteMany({ client: client._id });

            // Remove videos
            const videos = await Video.find({ client: client._id });
            for (const v of videos) {
                if (v.fileUrl) {
                    const filePath = path.join(__dirname, "uploads/videos", path.basename(v.fileUrl));
                    if (fs.existsSync(filePath)) {
                        try { fs.unlinkSync(filePath); } catch(e) {}
                    }
                }
            }
            await Video.deleteMany({ client: client._id });

            // Delete client user document
            await User.findByIdAndDelete(client._id);
            console.log(`✓ Deleted client: ${client.name} (${client.username})`);
        }

        console.log("\n==========================================");
        console.log("✅ ALL CLIENTS & ASSOCIATED MEDIA REMOVED");
        console.log("==========================================");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

removeAllClients();
