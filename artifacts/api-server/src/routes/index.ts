import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import webhooksRouter from "./webhooks.js";
import servicesRouter from "./services.js";
import adminRouter from "./admin.js";
import walletRouter from "./wallet.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(servicesRouter);
router.use(adminRouter);
router.use(walletRouter);

export default router;
