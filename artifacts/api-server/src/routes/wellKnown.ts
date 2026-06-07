import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/.well-known/security.txt", (_req, res) => {
  const oneYear = new Date();
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  const body = [
    "Contact: mailto:security@finsyt.com",
    "Expires: " + oneYear.toISOString(),
    "Preferred-Languages: en",
    "Policy: https://finsyt.com/security",
    "Canonical: https://finsyt.com/.well-known/security.txt",
  ].join("\n") + "\n";
  res.type("text/plain").send(body);
});

export default router;
