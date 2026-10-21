const router = require("express").Router();
const controller = require("../controllers/productController");
const { auth, adminOnly } = require("../middleware/authMiddleware");

router.get("/", auth, controller.list);
router.post("/bulk", auth, adminOnly, controller.bulkCreate);
router.post("/", auth, adminOnly, controller.create);
router.put("/:id", auth, adminOnly, controller.update);
router.delete("/:id", auth, adminOnly, controller.remove);

module.exports = router;
