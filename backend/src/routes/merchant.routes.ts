import { Router } from "express";
import {
    createMerchant,
    getMerchant,
} from "../controllers/merchant.controller";

const router = Router();

router.post("/", createMerchant);
router.get("/:id", getMerchant);

export default router;