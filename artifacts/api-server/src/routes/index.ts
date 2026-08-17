import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inquiriesRouter from "./inquiries";
import adminRouter from "./admin";
import adminCmsRouter from "./admin-cms";
import siteRouter from "./site";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inquiriesRouter);
router.use(adminRouter);
router.use(adminCmsRouter);
router.use(siteRouter);

export default router;
