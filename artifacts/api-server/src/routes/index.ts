import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inquiriesRouter from "./inquiries";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inquiriesRouter);
router.use(adminRouter);

export default router;
