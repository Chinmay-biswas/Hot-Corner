import express from "express";
import { getFavorites, getUserBookings, UpdateFavorite } from "../controllers/userController.js";

const userRouter = express.Router();
userRouter.get('/bookings', getUserBookings)
userRouter.get('/update-favorite', UpdateFavorite)
userRouter.get('/favorite', getFavorites)


export default userRouter;