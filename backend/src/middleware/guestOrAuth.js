const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function guestOrAuth(req, res, next) {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.userId).select(
        "_id role status name phone",
      );

      if (user && user.status !== "burned") {
        req.customer = { userId: user._id, user };
        return next();
      }
    } catch {
      // fall through to guest
    }
  }

  const guestId = req.body?.guestId || req.query?.guestId;

  if (typeof guestId === "string" && guestId.trim() && guestId.length <= 64) {
    req.customer = { guestId: guestId.trim() };
    return next();
  }

  return res.status(401).json({
    message: "Authentication or guestId required",
  });
}

module.exports = { guestOrAuth };
