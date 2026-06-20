import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import webhooksRouter from "./webhooks.js";
import servicesRouter from "./services.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(servicesRouter);

export default router;
