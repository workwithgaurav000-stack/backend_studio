const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "../.env");

require("dotenv").config({ path: envPath });

const User = require("./models/User");

async function resetAdmin() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined. Check backend/.env");
        }

        await mongoose.connect(mongoUri);

        console.log("✅ MongoDB Connected");

        const newPassword = "Admin@2026";
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        const admin = await User.findOneAndUpdate(
            {
                username: "admin",
                role: "admin"
            },
            {
                password: hashedPassword,
                active: true
            },
            {
                new: true
            }
        );

        if (!admin) {
            console.log("❌ Admin user not found.");
        } else {
            console.log("================================");
            console.log("✅ ADMIN PASSWORD RESET");
            console.log("Username: admin");
            console.log("Password: Admin@2026");
            console.log("================================");
        }

        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

resetAdmin();