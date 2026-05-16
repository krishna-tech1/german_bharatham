const express = require("express");
const router = express.Router();
const controller = require("./subscriptionController");

router.get("/", controller.listAllSubscriptions);

router.get("/plans", controller.listPlansAdmin);
router.put("/plans", controller.upsertPlansAdmin);
router.post("/plans", controller.createPlanAdmin);
router.delete("/plans/:id", controller.deletePlanAdmin);

module.exports = router;