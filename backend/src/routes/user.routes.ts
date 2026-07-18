import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { validateBody } from "../middleware/validate";
import { createUserSchema, updateUserSchema } from "../validators/auth.validators";
import { authenticate, requireRole } from "../middleware/auth";

export const userRouter = Router();

userRouter.use(authenticate, requireRole("admin"));

userRouter.get("/", userController.listUsers);
userRouter.post("/", validateBody(createUserSchema), userController.createUser);
userRouter.patch("/:id", validateBody(updateUserSchema), userController.updateUser);
