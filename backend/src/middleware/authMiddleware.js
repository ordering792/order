const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.userId).select(
      "_id role status phone name invitationCode",
    );

    if (!user || user.status === "burned") {
      return res.status(401).json({
        message: "Account unavailable",
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
}

function ownerOnly(req, res, next) {
  if (req.user?.role !== "owner" && req.user?.role !== "admin") {
    return res.status(403).json({
      message: "Owner access required",
    });
  }

  next();
}

function adminOrOwner(req, res, next) {
  if (!["admin", "owner"].includes(req.user?.role)) {
    return res.status(403).json({
      message: "Owner or admin access required",
    });
  }

  next();
}

module.exports = { auth, adminOnly, ownerOnly, adminOrOwner };
