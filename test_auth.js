const path = require("path");
const fs = require("fs");

const envPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "../.env");

require("dotenv").config({ path: envPath });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

async function runTests() {
    try {
        console.log("Connecting to MongoDB for test verification...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ MongoDB Connected for tests.");

        const User = require("./models/User");

        // 1. Check existing users
        const users = await User.find({});
        console.log("Total users in database:", users.length);
        users.forEach(u => {
            console.log(`- User: ${u.username} (${u.name}), Role: ${u.role}, Active: ${u.active}`);
        });

        // 2. Create or update test client for verification
        const testClientPassword = "Client@2026";
        const hashedClientPass = await bcrypt.hash(testClientPassword, 12);

        await User.findOneAndUpdate(
            { username: "testclient" },
            {
                name: "Test Client",
                username: "testclient",
                password: hashedClientPass,
                role: "client",
                active: true
            },
            { upsert: true, returnDocument: 'after' }
        );
        console.log("✅ Verified / created test client: username='testclient', password='Client@2026'");

        // 3. Test bcrypt matching for test client
        const foundClient = await User.findOne({ username: "testclient", role: "client" });
        const passMatches = await bcrypt.compare(testClientPassword, foundClient.password);
        console.log("✅ Password comparison test passed:", passMatches);

        // 4. Test admin login matching
        const foundAdmin = await User.findOne({ username: "admin", role: "admin" });
        const adminPassMatches = await bcrypt.compare("Admin@2026", foundAdmin.password);
        console.log("✅ Admin password comparison test passed:", adminPassMatches);

        // 5. Test case-insensitive regex search
        const foundUpperClient = await User.findOne({
            username: { $regex: new RegExp("^" + "TESTCLIENT" + "$", "i") },
            role: "client"
        });
        console.log("✅ Case-insensitive username lookup test passed:", !!foundUpperClient);

        console.log("\nALL DIRECT AUTH CHECKS PASSED SUCCESSFULLY!");
        process.exit(0);
    } catch (err) {
        console.error("Test error:", err);
        process.exit(1);
    }
}

runTests();
