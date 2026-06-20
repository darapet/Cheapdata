import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import profileRouter from "./profile.js";
import dataPlansRouter from "./data-plans.js";
import servicesRouter from "./services.js";
import walletRouter from "./wallet.js";
import webhooksRouter from "./webhooks.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(dataPlansRouter);
router.use(servicesRouter);
router.use(walletRouter);
router.use(webhooksRouter);
router.use(adminRouter);

export default router;
