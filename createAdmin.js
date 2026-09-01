const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "../.env");

require("dotenv").config({ path: envPath });

const User = require("./models/User");

async function createAdmin() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined. Check backend/.env");
        }

        await mongoose.connect(mongoUri);

        console.log("✅ MongoDB Connected");

        const existingAdmin = await User.findOne({
            role: "admin"
        });

        if (existingAdmin) {
            console.log("⚠️ Admin account already exists (username:", existingAdmin.username, ")");
            process.exit(0);
        }

        const username = "admin";
        const password = "Admin@2026";

        const hashedPassword = await bcrypt.hash(password, 12);

        await User.create({
            name: "Studio Admin",
            username: username,
            password: hashedPassword,
            role: "admin",
            active: true
        });

        console.log("================================");
        console.log("✅ ADMIN ACCOUNT CREATED");
        console.log("Username:", username);
        console.log("Password:", password);
        console.log("================================");

        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

createAdmin();