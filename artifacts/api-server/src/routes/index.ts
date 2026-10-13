import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nexoraRouter from "./nexora";
import tournamentRouter from "./nexora-tournaments";
import eventRouter from "./nexora-events";
import rewardRouter from "./nexora-rewards";
import billingRouter from "./nexora-billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(billingRouter);
router.use(eventRouter);
router.use(rewardRouter);
router.use(tournamentRouter);
router.use(nexoraRouter);

export default router;
