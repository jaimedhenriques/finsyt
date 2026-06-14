import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import researchRouter from "./research";
import auditRouter from "./audit";
import retentionRouter from "./retention";
import accountRouter from "./account";
import meRouter from "./me";
import { actorContext } from "../lib/actor";
import teamRouter from "./team";

const router: IRouter = Router();

// Public, non-cookie-authenticated endpoints
router.use(healthRouter);
router.use(leadsRouter);

// Authenticated routes — all protected routes use Clerk session cookie
// verification via requireAuth (middlewares/requireAuth.ts).
// actorContext() additionally exposes req.actor (org/user) used by the
// audit/retention/account routes, verified via HMAC-signed headers.
router.use(actorContext());
router.use(researchRouter);
router.use(meRouter);
router.use(auditRouter);
router.use(retentionRouter);
router.use(accountRouter);
router.use(teamRouter);

export default router;
