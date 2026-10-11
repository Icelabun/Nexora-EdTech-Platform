import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nexoraRouter from "./nexora";
import tournamentRouter from "./nexora-tournaments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tournamentRouter);
router.use(nexoraRouter);

export default router;
