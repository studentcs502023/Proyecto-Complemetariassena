import request from "supertest";
import mongoose from "mongoose";
import app from "../index.js";
import User from "../src/models/User.model.js";
import ProductiveStage from "../src/models/ProductiveStage.model.js";
import Novelty from "../src/models/Novelty.model.js";
import { env } from "../src/config/env.js";
import jwt from "jsonwebtoken";

describe("Novelties Module", () => {
  let adminToken, instructorToken, apprenticeToken;
  let adminUser, instructorUser, apprenticeUser;
  let ep;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const uri = env.MONGODB_URI || "mongodb://127.0.0.1:27017/repfora_test";
      await mongoose.connect(uri);
    }

    // Clean up
    await User.deleteMany({ email: /test_novelty/ });
    await ProductiveStage.deleteMany({});
    await Novelty.deleteMany({});

    // Create users
    adminUser = await User.create({
      nationalId: "ADMIN1",
      fullName: "Admin Novelty",
      email: "admin_novelty@repfora.com",
      password: "password123",
      role: "ADMIN",
      firstLogin: false
    });

    instructorUser = await User.create({
      nationalId: "INST1",
      fullName: "Instructor Novelty",
      email: "inst_novelty@repfora.com",
      password: "password123",
      role: "INSTRUCTOR",
      firstLogin: false,
      instructorType: "FOLLOWUP"
    });

    apprenticeUser = await User.create({
      nationalId: "APP1",
      fullName: "Apprentice Novelty",
      email: "app_novelty@repfora.com",
      password: "password123",
      role: "APPRENTICE",
      firstLogin: false
    });

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, env.JWT_SECRET);
    instructorToken = jwt.sign({ id: instructorUser._id, role: instructorUser.role }, env.JWT_SECRET);
    apprenticeToken = jwt.sign({ id: apprenticeUser._id, role: apprenticeUser.role }, env.JWT_SECRET);

    // Create Productive Stage
    ep = await ProductiveStage.create({
      apprentice: apprenticeUser._id,
      followupInstructor: instructorUser._id,
      modality: "INTERNSHIP",
      status: "ACTIVE"
    });
  });

  afterAll(async () => {
    await User.deleteMany({ email: /test_novelty/ });
    await ProductiveStage.deleteMany({});
    await Novelty.deleteMany({});
    await mongoose.connection.close();
  });

  describe("POST /api/novelties", () => {
    it("✅ should allow instructor to create a novelty", async () => {
      const res = await request(app)
        .post("/api/novelties")
        .set("Authorization", `Bearer ${instructorToken}`)
        .send({
          productiveStageId: ep._id,
          type: "DESERTION",
          description: "Apprentice has not been seen for 3 days. Tried to contact via phone and email with no response. This is a very long description to pass the 50 characters validation requirement.",
          occurrenceDate: new Date()
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe("DESERTION");
      expect(res.body.data.status).toBe("PENDING");
    });

    it("❌ should not allow apprentice to create a novelty", async () => {
      const res = await request(app)
        .post("/api/novelties")
        .set("Authorization", `Bearer ${apprenticeToken}`)
        .send({
          productiveStageId: ep._id,
          type: "OTHER",
          description: "Something happened.",
          occurrenceDate: new Date()
        });

      expect(res.statusCode).toBe(403);
    });

    it("❌ should fail validation if description is too short", async () => {
      const res = await request(app)
        .post("/api/novelties")
        .set("Authorization", `Bearer ${instructorToken}`)
        .send({
          productiveStageId: ep._id,
          type: "DESERTION",
          description: "Too short",
          occurrenceDate: new Date()
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/novelties", () => {
    it("✅ should allow admin to see all novelties", async () => {
      const res = await request(app)
        .get("/api/novelties")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.novelties.length).toBeGreaterThan(0);
    });

    it("✅ should allow instructor to see their own novelties", async () => {
      const res = await request(app)
        .get("/api/novelties")
        .set("Authorization", `Bearer ${instructorToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.novelties.length).toBeGreaterThan(0);
    });
  });

  describe("PATCH /api/novelties/:id/status", () => {
    it("✅ should allow admin to update status to IN_PROGRESS", async () => {
      const novelty = await Novelty.findOne();
      const res = await request(app)
        .patch(`/api/novelties/${novelty._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "IN_PROGRESS",
          actionsTaken: "Contacted the company. They confirmed the apprentice is missing. We are following the protocol."
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe("IN_PROGRESS");
    });

    it("❌ should not allow instructor to update status", async () => {
      const novelty = await Novelty.findOne();
      const res = await request(app)
        .patch(`/api/novelties/${novelty._id}/status`)
        .set("Authorization", `Bearer ${instructorToken}`)
        .send({
          status: "RESOLVED",
          actionsTaken: "Instructor trying to resolve."
        });

      expect(res.statusCode).toBe(403);
    });

    it("❌ should fail on invalid transition", async () => {
      const novelty = await Novelty.findOne();
      // Reopening is not allowed (RESOLVED -> any)
      novelty.status = "RESOLVED";
      await novelty.save();

      const res = await request(app)
        .patch(`/api/novelties/${novelty._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          status: "IN_PROGRESS",
          actionsTaken: "Trying to reopen."
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("Resolved novelties cannot be reopened");
    });
  });
});
