const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

jest.mock("../../src/socket", () => ({
  setupSocket: jest.fn(),
  getIO: jest.fn(),
  emitToConversation: jest.fn(),
  emitToAdmins: jest.fn(),
  isUserOnline: jest.fn(() => false),
  isGuestOnline: jest.fn(() => false),
  onlineUsers: new Map(),
  onlineGuests: new Map(),
}));

const app = require("../../src/app");
const User = require("../../src/models/User");
const Product = require("../../src/models/Product");

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

beforeAll(async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

async function createUser(role = "user") {
  const passwordHash = await bcrypt.hash("password123", 10);
  return User.create({
    name: `${role} user`,
    phone: `09${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`,
    passwordHash,
    invitationCode: `CODE${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`,
    role,
  });
}

function makeToken(user) {
  return jwt.sign({ userId: user._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

describe("Product catalog endpoints", () => {
  describe("POST /api/products", () => {
    it("admin can create a product", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({
          name: "Wireless Earbuds",
          description: "Noise cancelling earbuds",
          imageUrl: "https://example.com/earbuds.jpg",
          price: "199.00",
        });

      expect(res.status).toBe(201);
      expect(res.body.product.name).toBe("Wireless Earbuds");

      const saved = await Product.findOne({ name: "Wireless Earbuds" });
      expect(saved).not.toBeNull();
      expect(parseFloat(saved.price.toString())).toBeCloseTo(199, 2);
    });

    it("stores all six product fields (image, code, category, usage, price, title)", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({
          name: "Titanium Watch",
          code: "P0007",
          category: "Accessories",
          usage: "Wipe with a soft cloth.",
          imageUrl: "https://example.com/watch.png",
          price: "120.00",
        });

      expect(res.status).toBe(201);
      expect(res.body.product.code).toBe("P0007");
      expect(res.body.product.category).toBe("Accessories");
      expect(res.body.product.usage).toBe("Wipe with a soft cloth.");
      expect(res.body.product.imageUrl).toBe("https://example.com/watch.png");

      const saved = await Product.findOne({ code: "P0007" });
      expect(saved).not.toBeNull();
      expect(saved.category).toBe("Accessories");
    });

    it("non-admin cannot create a product", async () => {
      const user = await createUser("user");

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${makeToken(user)}`)
        .send({ name: "X", price: "10.00" });

      expect(res.status).toBe(403);
    });

    it("rejects price above 5000", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ name: "Too pricey", price: "5000.01" });

      expect(res.status).toBe(400);
    });

    it("rejects invalid price", async () => {
      const admin = await createUser("admin");

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ name: "Bad", price: "-5.00" });

      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/products")
        .send({ name: "X", price: "10.00" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/products", () => {
    it("authenticated user can list products sorted by price", async () => {
      const user = await createUser();
      await Product.create([
        { name: "Expensive", price: "900.00" },
        { name: "Cheap", price: "100.00" },
        { name: "Mid", price: "500.00" },
      ]);

      const res = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(3);
      const prices = res.body.products.map((p) =>
        parseFloat(p.price.toString()),
      );
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it("filters by price range", async () => {
      const admin = await createUser("admin");
      await Product.create([
        { name: "A", price: "100.00" },
        { name: "B", price: "450.00" },
        { name: "C", price: "900.00" },
      ]);

      const res = await request(app)
        .get("/api/products?minPrice=400&maxPrice=500")
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.products[0].name).toBe("B");
    });
  });

  describe("PUT /api/products/:id", () => {
    it("admin can update a product", async () => {
      const admin = await createUser("admin");
      const product = await Product.create({ name: "Old", price: "50.00" });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ name: "New name", price: "60.00" });

      expect(res.status).toBe(200);

      const updated = await Product.findById(product._id);
      expect(updated.name).toBe("New name");
      expect(parseFloat(updated.price.toString())).toBeCloseTo(60, 2);
    });

    it("rejects invalid price on update", async () => {
      const admin = await createUser("admin");
      const product = await Product.create({ name: "Old", price: "50.00" });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ price: "99999.00" });

      expect(res.status).toBe(400);
    });

    it("updates code, category and usage", async () => {
      const admin = await createUser("admin");
      const product = await Product.create({ name: "Old", price: "50.00" });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ code: "P0099", category: "Office", usage: "Use on a desk." });

      expect(res.status).toBe(200);

      const updated = await Product.findById(product._id);
      expect(updated.code).toBe("P0099");
      expect(updated.category).toBe("Office");
      expect(updated.usage).toBe("Use on a desk.");
    });

    it("returns 404 for missing product", async () => {
      const admin = await createUser("admin");
      const mongooseId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .put(`/api/products/${mongooseId}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`)
        .send({ name: "Ghost" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/products/:id", () => {
    it("admin can delete a product", async () => {
      const admin = await createUser("admin");
      const product = await Product.create({ name: "Gone", price: "10.00" });

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${makeToken(admin)}`);

      expect(res.status).toBe(200);

      const found = await Product.findById(product._id);
      expect(found).toBeNull();
    });

    it("non-admin cannot delete a product", async () => {
      const user = await createUser("user");
      const product = await Product.create({ name: "Safe", price: "10.00" });

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${makeToken(user)}`);

      expect(res.status).toBe(403);

      const found = await Product.findById(product._id);
      expect(found).not.toBeNull();
    });
  });
});
